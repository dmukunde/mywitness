"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  isDemoMode,
  loadDemoData,
  resetDemoData,
  saveDemoData,
  setDemoMode as persistDemoMode,
} from "@/lib/demo-store";
import type { DemoData } from "@/lib/demo-data";
import type {
  Area,
  BibleStudy,
  BibleStudyFormData,
  BibleStudySession,
  BibleStudySessionFormData,
  Conversation,
  ConversationFormData,
  MinistrySession,
  Person,
  PersonPhoto,
  Profile,
  Reminder,
  ReturnVisit,
  ScheduledMinistryEvent,
  StudyNote,
  StudyNoteFormData,
  UserSettings,
} from "@/lib/types";
import { emptyToNull, minutesBetween, parseScriptures, sanitizeDisplayName, todayISO } from "@/lib/utils";
import {
  saveBibleStudyDemo,
  saveBibleStudyRemote,
  saveStudySessionDemo,
  saveStudySessionRemote,
  setReturnVisitStatusDemo,
  setReturnVisitStatusRemote,
  syncReturnVisitEventDemo,
  upsertReturnVisitEventSupabase,
} from "@/lib/ministry-api";
import { findDuplicateMinistryEvent } from "@/lib/ministry-scheduling";
import {
  buildActivities,
  findPlannedVisitInSlot,
  returnVisitsToComplete,
  returnVisitsToSupersede,
  type ScheduledActivity,
} from "@/lib/schedule";
import { addMinutes, format, parseISO } from "date-fns";

const DISPLAY_NAME_KEY = "mywitness-display-name";

interface AppContextValue {
  user: User | null;
  loading: boolean;
  demoMode: boolean;
  displayName: string;
  settings: UserSettings | null;
  people: Person[];
  conversations: Conversation[];
  returnVisits: ReturnVisit[];
  sessions: MinistrySession[];
  reminders: Reminder[];
  bibleStudies: BibleStudy[];
  studySessions: BibleStudySession[];
  ministryEvents: ScheduledMinistryEvent[];
  /**
   * Every scheduled return visit / Bible study with its derived lifecycle
   * state (upcoming, due, overdue, completed). The one place screens should
   * read "what's scheduled" from — see lib/schedule.ts.
   */
  activities: ScheduledActivity[];
  areas: Area[];
  personPhotos: PersonPhoto[];
  studyNotes: StudyNote[];
  /** The one open (end_time null) ministry session for this user, if any. */
  activeMinistrySession: MinistrySession | null;
  refresh: () => Promise<void>;
  enableDemoMode: () => void;
  disableDemoMode: () => void;
  resetDemo: () => void;
  updateDisplayName: (name: string) => Promise<void>;
  updateEmail: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  /** Upsert a day's ministry time — manual entry only, no live timer. */
  saveDailyMinistryTime: (input: {
    date?: string;
    hours: number;
    minutes: number;
    notes?: string;
  }) => Promise<MinistrySession>;
  updateSession: (
    id: string,
    patch: Partial<MinistrySession>
  ) => Promise<void>;
  /** Deletes a single saved ministry-time entry (timer or manual). */
  deleteMinistrySession: (id: string) => Promise<void>;
  /** Starts a live timer session; throws if one is already running. */
  startMinistryTimer: () => Promise<MinistrySession>;
  /** Ends the active timer, applying an optionally edited final duration. */
  endMinistryTimer: (input: {
    durationMinutesOverride?: number;
    notes?: string;
  }) => Promise<void>;
  /** Deletes the active timer session entirely — for an accidental start. */
  discardMinistryTimer: () => Promise<void>;
  findOrCreateArea: (name: string) => Promise<string | null>;
  saveArea: (id: string, patch: Partial<Area>) => Promise<Area>;
  /** Create (no id) or update (existingId) a Study Notebook entry. */
  saveStudyNote: (
    form: StudyNoteFormData,
    existingId?: string
  ) => Promise<StudyNote>;
  /** Soft-delete: hides the note from the notebook but never destroys it. */
  archiveStudyNote: (id: string) => Promise<void>;
  addPersonPhoto: (
    personId: string,
    photoPath: string,
    caption?: string | null
  ) => Promise<PersonPhoto>;
  updatePersonPhotoCaption: (
    photoId: string,
    caption: string | null
  ) => Promise<void>;
  deletePersonPhoto: (photoId: string) => Promise<void>;
  reorderPersonPhotos: (
    personId: string,
    orderedIds: string[]
  ) => Promise<void>;
  saveConversation: (
    form: ConversationFormData
  ) => Promise<{ person: Person; conversation: Conversation; returnVisit?: ReturnVisit }>;
  /**
   * Create (no id) or update (id) a person. Pass `clientId` when creating so
   * the same user action is idempotent: a retry or double tap returns the
   * person already created instead of inserting a second one.
   */
  savePerson: (
    person: Partial<Person> & { name: string },
    opts?: { clientId?: string }
  ) => Promise<Person>;
  archivePerson: (id: string) => Promise<void>;
  updateReturnVisit: (
    id: string,
    patch: Partial<ReturnVisit>
  ) => Promise<void>;
  createReturnVisit: (
    visit: Omit<ReturnVisit, "id" | "user_id" | "created_at" | "updated_at" | "is_demo">,
    opts?: { allowDuplicate?: boolean; clientId?: string }
  ) => Promise<ReturnVisit>;
  saveBibleStudy: (
    form: BibleStudyFormData,
    existingId?: string,
    opts?: { allowDuplicate?: boolean; clientId?: string }
  ) => Promise<BibleStudy>;
  saveStudySession: (
    form: BibleStudySessionFormData
  ) => Promise<{ session: BibleStudySession; study: BibleStudy }>;
  updateBibleStudyStatus: (
    id: string,
    status: BibleStudy["status"]
  ) => Promise<void>;
  /** Soft-delete: hides the study and cancels its future scheduled event, but keeps all session history. */
  archiveBibleStudy: (id: string) => Promise<void>;
  /** Soft-delete: marks the return visit cancelled and cancels its scheduled event. */
  deleteReturnVisit: (id: string) => Promise<void>;
  findDuplicateEvent: (candidate: {
    person_id: string;
    event_type: ScheduledMinistryEvent["event_type"];
    scheduled_date: string;
    scheduled_time?: string | null;
  }) => ScheduledMinistryEvent | undefined;
  dismissReminder: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const defaultSettings = (userId: string): UserSettings => ({
  id: "local-settings",
  user_id: userId,
  keep_audio_after_transcription: false,
  browser_notifications_enabled: true,
  reminder_minutes_before: 60,
  demo_mode_enabled: true,
  service_year_start_month: 9,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoModeState] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [returnVisits, setReturnVisits] = useState<ReturnVisit[]>([]);
  const [sessions, setSessions] = useState<MinistrySession[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [bibleStudies, setBibleStudies] = useState<BibleStudy[]>([]);
  const [studySessions, setStudySessions] = useState<BibleStudySession[]>([]);
  const [ministryEvents, setMinistryEvents] = useState<ScheduledMinistryEvent[]>(
    []
  );
  const [areas, setAreas] = useState<Area[]>([]);
  const [personPhotos, setPersonPhotos] = useState<PersonPhoto[]>([]);
  const [studyNotes, setStudyNotes] = useState<StudyNote[]>([]);
  const [scripturesMap, setScripturesMap] = useState<
    Record<string, { id: string; scripture_reference: string }[]>
  >({});

  const applyDemo = useCallback((data: DemoData) => {
    const areaById = new Map((data.areas || []).map((a) => [a.id, a]));
    setPeople(
      data.people
        .filter((p) => !p.archived_at)
        .map((p) => ({
          ...p,
          area: p.area_id ? areaById.get(p.area_id) ?? null : null,
          photos: (data.personPhotos || [])
            .filter((ph) => ph.person_id === p.id)
            .sort((a, b) => a.sort_order - b.sort_order),
        }))
    );
    setAreas(data.areas || []);
    setPersonPhotos(data.personPhotos || []);
    const convs = data.conversations.map((c) => ({
      ...c,
      scriptures: data.scriptures
        .filter((s) => s.conversation_id === c.id)
        .map((s) => ({
          id: s.id,
          conversation_id: s.conversation_id,
          user_id: s.user_id,
          scripture_reference: s.scripture_reference,
          created_at: s.created_at,
        })),
      person: data.people.find((p) => p.id === c.person_id) ?? null,
    }));
    setConversations(convs);
    setReturnVisits(
      data.returnVisits.map((rv) => ({
        ...rv,
        person: data.people.find((p) => p.id === rv.person_id) ?? null,
        conversation:
          data.conversations.find((c) => c.id === rv.conversation_id) ?? null,
      }))
    );
    setSessions(data.sessions);
    setReminders(data.reminders.filter((r) => !r.dismissed_at));
    setBibleStudies(
      (data.bibleStudies || [])
        .filter((s) => !s.archived_at)
        .map((s) => ({
          ...s,
          person: data.people.find((p) => p.id === s.person_id) ?? null,
        }))
    );
    setStudySessions(data.studySessions || []);
    setStudyNotes((data.studyNotes || []).filter((n) => !n.archived_at));
    setMinistryEvents(
      (data.ministryEvents || []).map((e) => ({
        ...e,
        person: data.people.find((p) => p.id === e.person_id) ?? null,
      }))
    );
    setScripturesMap(
      data.scriptures.reduce<Record<string, { id: string; scripture_reference: string }[]>>(
        (acc, s) => {
          acc[s.conversation_id] = acc[s.conversation_id] || [];
          acc[s.conversation_id].push({
            id: s.id,
            scripture_reference: s.scripture_reference,
          });
          return acc;
        },
        {}
      )
    );
  }, []);

  const refreshFromSupabase = useCallback(
    async (uid: string, email?: string | null) => {
      const supabase = createClient();
      const [
        profileRes,
        peopleRes,
        convRes,
        rvRes,
        sessionsRes,
        remindersRes,
        settingsRes,
        scripturesRes,
        studiesRes,
        studySessionsRes,
        eventsRes,
        areasRes,
        photosRes,
        studyNotesRes,
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
        supabase
          .from("people")
          .select("*")
          .eq("user_id", uid)
          .is("archived_at", null)
          .order("updated_at", { ascending: false }),
        supabase
          .from("conversations")
          .select("*, person:people(*)")
          .eq("user_id", uid)
          .order("conversation_date", { ascending: false }),
        supabase
          .from("return_visits")
          .select("*, person:people(*), conversation:conversations(*)")
          .eq("user_id", uid)
          .order("scheduled_date", { ascending: true }),
        supabase
          .from("ministry_sessions")
          .select("*")
          .eq("user_id", uid)
          .order("start_time", { ascending: false }),
        supabase
          .from("reminders")
          .select("*")
          .eq("user_id", uid)
          .is("dismissed_at", null)
          .order("due_at", { ascending: true }),
        supabase
          .from("user_settings")
          .select("*")
          .eq("user_id", uid)
          .maybeSingle(),
        supabase.from("conversation_scriptures").select("*").eq("user_id", uid),
        supabase
          .from("bible_studies")
          .select("*, person:people(*)")
          .eq("user_id", uid)
          .is("archived_at", null)
          .order("updated_at", { ascending: false }),
        supabase
          .from("bible_study_sessions")
          .select("*")
          .eq("user_id", uid)
          .order("session_date", { ascending: false }),
        supabase
          .from("scheduled_ministry_events")
          .select("*, person:people(*)")
          .eq("user_id", uid)
          .order("scheduled_date", { ascending: true }),
        supabase
          .from("areas")
          .select("*")
          .eq("user_id", uid)
          .order("name", { ascending: true }),
        supabase
          .from("person_photos")
          .select("*")
          .eq("user_id", uid)
          .order("sort_order", { ascending: true }),
        supabase
          .from("study_notes")
          .select("*")
          .eq("user_id", uid)
          .is("archived_at", null)
          .order("note_date", { ascending: false }),
      ]);

      const firstError =
        profileRes.error ||
        peopleRes.error ||
        convRes.error ||
        rvRes.error ||
        sessionsRes.error ||
        remindersRes.error ||
        settingsRes.error ||
        scripturesRes.error;

      if (firstError) {
        console.error("Supabase load error:", firstError);
        throw new Error(
          firstError.message.includes("schema cache") ||
            firstError.message.includes("does not exist")
            ? "Database tables not found. Run supabase/migrations/001_initial_schema.sql in the Supabase SQL Editor."
            : firstError.message
        );
      }

      const bibleTablesMissing =
        studiesRes.error?.message?.includes("does not exist") ||
        studySessionsRes.error?.message?.includes("does not exist") ||
        eventsRes.error?.message?.includes("does not exist") ||
        studiesRes.error?.code === "42P01" ||
        studySessionsRes.error?.code === "42P01" ||
        eventsRes.error?.code === "42P01";

      if (
        (studiesRes.error || studySessionsRes.error || eventsRes.error) &&
        !bibleTablesMissing
      ) {
        console.error("Bible Studies load error:", {
          studiesRes: studiesRes.error,
          studySessionsRes: studySessionsRes.error,
          eventsRes: eventsRes.error,
        });
      }

      const areaPhotoTablesMissing =
        areasRes.error?.message?.includes("does not exist") ||
        photosRes.error?.message?.includes("does not exist") ||
        areasRes.error?.code === "42P01" ||
        photosRes.error?.code === "42P01";

      if ((areasRes.error || photosRes.error) && !areaPhotoTablesMissing) {
        console.error("Areas/Photos load error:", {
          areasRes: areasRes.error,
          photosRes: photosRes.error,
        });
      }

      const studyNotesTableMissing =
        studyNotesRes.error?.message?.includes("does not exist") ||
        studyNotesRes.error?.code === "42P01";
      if (studyNotesRes.error && !studyNotesTableMissing) {
        console.error("Study Notebook load error:", studyNotesRes.error);
      }

      const scriptureByConv =
        scripturesRes.data?.reduce<
          Record<string, { id: string; scripture_reference: string }[]>
        >((acc, s) => {
          acc[s.conversation_id] = acc[s.conversation_id] || [];
          acc[s.conversation_id].push({
            id: s.id,
            scripture_reference: s.scripture_reference,
          });
          return acc;
        }, {}) ?? {};

      const areasList = areaPhotoTablesMissing
        ? []
        : (areasRes.data as Area[]) || [];
      const photosList = areaPhotoTablesMissing
        ? []
        : (photosRes.data as PersonPhoto[]) || [];
      const areaById = new Map(areasList.map((a) => [a.id, a]));
      setPeople(
        ((peopleRes.data as Person[]) || []).map((p) => ({
          ...p,
          area: p.area_id ? areaById.get(p.area_id) ?? null : null,
          photos: photosList.filter((ph) => ph.person_id === p.id),
        }))
      );
      setAreas(areasList);
      setPersonPhotos(photosList);
      const profile = profileRes.data as Profile | null;
      const nameFromProfile = sanitizeDisplayName(
        profile?.display_name,
        email
      );
      setDisplayName(nameFromProfile);
      if (typeof window !== "undefined") {
        if (nameFromProfile) {
          localStorage.setItem(DISPLAY_NAME_KEY, nameFromProfile);
        } else {
          localStorage.removeItem(DISPLAY_NAME_KEY);
        }
      }
      setConversations(
        ((convRes.data as Conversation[]) || []).map((c) => ({
          ...c,
          scriptures: (scriptureByConv[c.id] || []).map((s) => ({
            id: s.id,
            conversation_id: c.id,
            user_id: uid,
            scripture_reference: s.scripture_reference,
            created_at: "",
          })),
        }))
      );
      setReturnVisits((rvRes.data as ReturnVisit[]) || []);
      setSessions((sessionsRes.data as MinistrySession[]) || []);
      setReminders((remindersRes.data as Reminder[]) || []);
      setBibleStudies(
        bibleTablesMissing ? [] : (studiesRes.data as BibleStudy[]) || []
      );
      setStudySessions(
        bibleTablesMissing
          ? []
          : (studySessionsRes.data as BibleStudySession[]) || []
      );
      setMinistryEvents(
        bibleTablesMissing
          ? []
          : (eventsRes.data as ScheduledMinistryEvent[]) || []
      );
      setSettings((settingsRes.data as UserSettings) || defaultSettings(uid));
      setScripturesMap(scriptureByConv);
      setStudyNotes(
        studyNotesTableMissing ? [] : (studyNotesRes.data as StudyNote[]) || []
      );
    },
    []
  );

  const refresh = useCallback(async () => {
    if (demoMode || isDemoMode()) {
      applyDemo(loadDemoData());
      setSettings(defaultSettings("demo-user"));
      return;
    }
    if (!user || !isSupabaseConfigured()) return;
    // A failed re-fetch after a save that already succeeded must not be
    // reported as "could not save" — the user would retry and create a
    // duplicate. Log it; the next refresh catches the screen up.
    try {
      await refreshFromSupabase(user.id, user.email);
    } catch (err) {
      console.error("[MyWitness refresh after save]", err);
    }
  }, [applyDemo, demoMode, refreshFromSupabase, user]);

  useEffect(() => {
    let mounted = true;

    async function enterDemoMode() {
      if (!mounted) return;
      setDemoModeState(true);
      setUser({
        id: "demo-user",
        email: "demo@mywitness.app",
        aud: "authenticated",
        app_metadata: {},
        user_metadata: { display_name: "Doreen" },
        created_at: new Date().toISOString(),
      } as User);
      setDisplayName("Doreen");
      applyDemo(loadDemoData());
      setSettings(defaultSettings("demo-user"));
      setLoading(false);
    }

    async function init() {
      if (!isSupabaseConfigured()) {
        // No real backend to check — demo mode (if set) is all we can offer.
        if (isDemoMode()) {
          await enterDemoMode();
        } else {
          setLoading(false);
        }
        return;
      }

      const supabase = createClient();
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();
      if (!mounted) return;

      // A real signed-in session always takes precedence over a stale
      // "Try with demo data" flag left over from before this sign-in —
      // otherwise a user who demoed the app and then created/signed into a
      // real account would keep seeing fictional demo data indefinitely.
      if (authUser) {
        if (isDemoMode()) persistDemoMode(false);
        setDemoModeState(false);

        const savedName =
          typeof window !== "undefined"
            ? localStorage.getItem(DISPLAY_NAME_KEY) || ""
            : "";
        setUser(authUser);
        const safeSaved = sanitizeDisplayName(savedName, authUser.email);
        if (safeSaved) setDisplayName(safeSaved);
        try {
          await refreshFromSupabase(authUser.id, authUser.email);
        } catch (err) {
          console.error(err);
        }
        setLoading(false);

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(async (event, session) => {
          setUser(session?.user ?? null);
          if (
            session?.user &&
            (event === "SIGNED_IN" ||
              event === "TOKEN_REFRESHED" ||
              event === "INITIAL_SESSION")
          ) {
            try {
              await refreshFromSupabase(session.user.id, session.user.email);
            } catch (err) {
              console.error(err);
            }
          }
          if (event === "SIGNED_OUT") {
            setPeople([]);
            setConversations([]);
            setReturnVisits([]);
            setSessions([]);
            setReminders([]);
            setBibleStudies([]);
            setStudySessions([]);
            setMinistryEvents([]);
            setAreas([]);
            setPersonPhotos([]);
            setSettings(null);
            setDisplayName("");
            if (typeof window !== "undefined") {
              localStorage.removeItem(DISPLAY_NAME_KEY);
            }
          }
        });

        return () => subscription.unsubscribe();
      }

      // No real session. `getUser()` reports an expected
      // AuthSessionMissingError for every anonymous visit — that's normal,
      // not a bug, so only surface genuinely unexpected auth errors.
      if (authError && authError.name !== "AuthSessionMissingError") {
        console.error(authError);
      }

      if (isDemoMode()) {
        await enterDemoMode();
      } else {
        setUser(null);
        setLoading(false);
      }
    }

    const cleanup = init();
    return () => {
      mounted = false;
      cleanup.then((unsub) => unsub?.());
    };
  }, [applyDemo, refreshFromSupabase]);

  const enableDemoMode = useCallback(() => {
    persistDemoMode(true);
    setDemoModeState(true);
    setUser({
      id: "demo-user",
      email: "demo@mywitness.app",
      aud: "authenticated",
      app_metadata: {},
      user_metadata: { display_name: "Doreen" },
      created_at: new Date().toISOString(),
    } as User);
    setDisplayName("Doreen");
    applyDemo(loadDemoData());
    setSettings(defaultSettings("demo-user"));
  }, [applyDemo]);

  const disableDemoMode = useCallback(() => {
    persistDemoMode(false);
    setDemoModeState(false);
    setUser(null);
    setDisplayName("");
    setPeople([]);
    setConversations([]);
    setReturnVisits([]);
    setSessions([]);
    setReminders([]);
    setBibleStudies([]);
    setStudySessions([]);
    setMinistryEvents([]);
    setAreas([]);
    setPersonPhotos([]);
  }, []);

  const resetDemo = useCallback(() => {
    applyDemo(resetDemoData());
  }, [applyDemo]);

  const updateDisplayName = useCallback(
    async (name: string) => {
      const trimmed = sanitizeDisplayName(name, user?.email);
      if (!name.trim()) {
        throw new Error("Please enter a display name.");
      }
      if (!trimmed) {
        throw new Error(
          "Please choose a name that is not your email address."
        );
      }
      setDisplayName(trimmed);
      if (typeof window !== "undefined") {
        localStorage.setItem(DISPLAY_NAME_KEY, trimmed);
      }

      if (demoMode) return;

      if (!user || !isSupabaseConfigured()) return;

      const supabase = createClient();
      await supabase.auth.updateUser({
        data: { display_name: trimmed },
      });
      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        display_name: trimmed,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    [demoMode, user]
  );

  const updateEmail = useCallback(
    async (email: string) => {
      const trimmed = email.trim();
      if (!trimmed) throw new Error("Please enter an email address.");
      if (demoMode) {
        throw new Error("Email cannot be changed in demo mode.");
      }
      if (!user || !isSupabaseConfigured()) {
        throw new Error("Please sign in again.");
      }
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) throw error;
    },
    [demoMode, user]
  );

  const updatePassword = useCallback(
    async (password: string) => {
      if (!password || password.length < 6) {
        throw new Error("Password must be at least 6 characters.");
      }
      if (demoMode) {
        throw new Error("Password cannot be changed in demo mode.");
      }
      if (!user || !isSupabaseConfigured()) {
        throw new Error("Please sign in again.");
      }
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
    [demoMode, user]
  );

  /**
   * Adds a new manual ministry-time entry (its own row) for a date. Does NOT
   * merge into an existing same-day row — each Start/End timer and each
   * manual save is its own session; Today/Activity/Calendar sum same-day
   * rows for a total rather than relying on one blended row per day. This
   * also removes the previous overwrite bug, where adding manual time on a
   * day that already had a timer session silently replaced its duration
   * instead of adding to it.
   */
  const saveDailyMinistryTime = useCallback(
    async (input: {
      date?: string;
      hours: number;
      minutes: number;
      notes?: string;
    }) => {
      if (!demoMode && !user) {
        throw new Error("Please sign in to save ministry time.");
      }

      const date = input.date || todayISO();
      const now = new Date().toISOString();
      const duration = Math.max(0, input.hours * 60 + input.minutes);
      if (duration <= 0) {
        throw new Error("Enter at least a few minutes of ministry time.");
      }

      // Anchor times so duration is End − Start (schema requires start_time).
      const startIso = new Date(`${date}T09:00:00`).toISOString();
      const endIso = addMinutes(parseISO(startIso), duration).toISOString();
      const notes = input.notes?.trim() || null;

      if (demoMode) {
        const data = loadDemoData();
        const row: MinistrySession = {
          id: crypto.randomUUID(),
          user_id: "demo-user",
          start_time: startIso,
          end_time: endIso,
          duration_minutes: duration,
          session_date: date,
          ministry_type: null,
          companion: null,
          area: null,
          personal_reflection: notes,
          source: "manual",
          is_demo: true,
          created_at: now,
          updated_at: now,
        };
        data.sessions = [row, ...data.sessions];
        saveDemoData(data);
        applyDemo(data);
        return row;
      }

      const supabase = createClient();
      const { data, error } = await supabase
        .from("ministry_sessions")
        .insert({
          user_id: user!.id,
          start_time: startIso,
          end_time: endIso,
          duration_minutes: duration,
          session_date: date,
          personal_reflection: notes,
          source: "manual",
        })
        .select()
        .single();
      if (error) throw error;
      await refresh();
      return data as MinistrySession;
    },
    [applyDemo, demoMode, refresh, user]
  );

  const deleteMinistrySession = useCallback(
    async (id: string) => {
      if (demoMode) {
        const data = loadDemoData();
        data.sessions = data.sessions.filter((s) => s.id !== id);
        saveDemoData(data);
        applyDemo(data);
        return;
      }
      const supabase = createClient();
      const { error } = await supabase
        .from("ministry_sessions")
        .delete()
        .eq("id", id);
      if (error) throw error;
      await refresh();
    },
    [applyDemo, demoMode, refresh]
  );

  const updateSession = useCallback(
    async (id: string, patch: Partial<MinistrySession>) => {
      const now = new Date().toISOString();

      const applyDuration = (
        current: Pick<MinistrySession, "start_time" | "end_time"> | null,
        nextPatch: Partial<MinistrySession>
      ): Partial<MinistrySession> => {
        const start = nextPatch.start_time ?? current?.start_time;
        const end =
          nextPatch.end_time !== undefined
            ? nextPatch.end_time
            : current?.end_time ?? null;
        const out: Partial<MinistrySession> = { ...nextPatch, updated_at: now };
        if (start) {
          out.session_date = format(parseISO(start), "yyyy-MM-dd");
        }
        // An explicit duration (e.g. a timer's user-edited final duration,
        // which may be less than raw wall-clock time because of a pause)
        // always wins over the auto-computed one.
        if (nextPatch.duration_minutes === undefined) {
          if (start && end) {
            out.duration_minutes = minutesBetween(start, end);
          } else if (nextPatch.end_time === null) {
            out.duration_minutes = null;
          }
        }
        return out;
      };

      if (demoMode) {
        const data = loadDemoData();
        data.sessions = data.sessions.map((s) => {
          if (s.id !== id) return s;
          return { ...s, ...applyDuration(s, patch) };
        });
        saveDemoData(data);
        applyDemo(data);
        return;
      }

      const supabase = createClient();
      const current = sessions.find((s) => s.id === id) || null;
      // Prefer patch times so callers can update right after creating a session
      // before React state has refreshed.
      const payload = applyDuration(current, patch);
      if (!payload.start_time && !current?.start_time) {
        throw new Error("Ministry session not found.");
      }
      const { error } = await supabase
        .from("ministry_sessions")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
      await refresh();
    },
    [applyDemo, demoMode, refresh, sessions]
  );

  const activeMinistrySession = useMemo(
    () => sessions.find((s) => s.end_time == null) || null,
    [sessions]
  );

  const startMinistryTimer = useCallback(async () => {
    if (activeMinistrySession) {
      throw new Error("A ministry timer is already running.");
    }
    const now = new Date().toISOString();
    if (demoMode) {
      const data = loadDemoData();
      const row: MinistrySession = {
        id: crypto.randomUUID(),
        user_id: "demo-user",
        start_time: now,
        end_time: null,
        duration_minutes: null,
        session_date: todayISO(),
        ministry_type: null,
        companion: null,
        area: null,
        personal_reflection: null,
        source: "timer",
        is_demo: true,
        created_at: now,
        updated_at: now,
      };
      data.sessions = [row, ...data.sessions];
      saveDemoData(data);
      applyDemo(data);
      return row;
    }
    if (!user) throw new Error("Please sign in to start a timer.");
    const supabase = createClient();
    const { data, error } = await supabase
      .from("ministry_sessions")
      .insert({
        user_id: user.id,
        start_time: now,
        end_time: null,
        duration_minutes: null,
        session_date: todayISO(),
        source: "timer",
      })
      .select()
      .single();
    if (error) throw error;
    await refresh();
    return data as MinistrySession;
  }, [activeMinistrySession, applyDemo, demoMode, refresh, user]);

  /**
   * Ends the active timer by updating its own row only — it no longer
   * searches for and merges into a different same-day session. Each timer
   * run and each manual entry stays its own row; totals are summed at
   * display time (see lib/ministry-time.ts), which is what actually
   * prevents double-counting without risking the previous bug where ending
   * a timer (or saving manual time) could silently overwrite a different
   * session's duration.
   */
  const endMinistryTimer = useCallback(
    async (input: { durationMinutesOverride?: number; notes?: string }) => {
      if (!activeMinistrySession) {
        throw new Error("No ministry timer is running.");
      }
      const now = new Date().toISOString();
      const rawMinutes = minutesBetween(activeMinistrySession.start_time, now);
      const timerDuration = Math.max(
        0,
        input.durationMinutesOverride ?? rawMinutes
      );

      if (demoMode) {
        const data = loadDemoData();
        data.sessions = data.sessions.map((s) =>
          s.id === activeMinistrySession.id
            ? {
                ...s,
                end_time: now,
                duration_minutes: timerDuration,
                personal_reflection: input.notes || s.personal_reflection,
                updated_at: now,
              }
            : s
        );
        saveDemoData(data);
        applyDemo(data);
        return;
      }

      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("ministry_sessions")
        .update({
          end_time: now,
          duration_minutes: timerDuration,
          personal_reflection:
            input.notes || activeMinistrySession.personal_reflection,
          updated_at: now,
        })
        .eq("id", activeMinistrySession.id);
      if (updateError) throw updateError;
      await refresh();
    },
    [activeMinistrySession, applyDemo, demoMode, refresh]
  );

  const discardMinistryTimer = useCallback(async () => {
    if (!activeMinistrySession) return;
    const id = activeMinistrySession.id;
    if (demoMode) {
      const data = loadDemoData();
      data.sessions = data.sessions.filter((s) => s.id !== id);
      saveDemoData(data);
      applyDemo(data);
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("ministry_sessions")
      .delete()
      .eq("id", id);
    if (error) throw error;
    await refresh();
  }, [activeMinistrySession, applyDemo, demoMode, refresh]);

  const savePerson = useCallback(
    async (
      person: Partial<Person> & { name: string },
      opts?: { clientId?: string }
    ) => {
      const now = new Date().toISOString();
      if (demoMode) {
        const data = loadDemoData();
        const already =
          !person.id && opts?.clientId
            ? data.people.find((p) => p.id === opts.clientId)
            : undefined;
        if (already) return already;
        if (person.id) {
          data.people = data.people.map((p) =>
            p.id === person.id ? { ...p, ...person, updated_at: now } : p
          );
          // Keep denormalized conversation interest in sync with person (source of truth).
          if (person.interest_level != null) {
            data.conversations = data.conversations.map((c) =>
              c.person_id === person.id
                ? { ...c, interest_level: person.interest_level! }
                : c
            );
          }
          saveDemoData(data);
          applyDemo(data);
          return data.people.find((p) => p.id === person.id)!;
        }
        const created: Person = {
          id: opts?.clientId || crypto.randomUUID(),
          user_id: "demo-user",
          name: person.name,
          general_location: person.general_location ?? null,
          location_lat: person.location_lat ?? null,
          location_lng: person.location_lng ?? null,
          area_id: person.area_id ?? null,
          phone_number: person.phone_number ?? null,
          preferred_contact_time: person.preferred_contact_time ?? null,
          first_met_date: person.first_met_date ?? todayISO(),
          interest_level: person.interest_level ?? "unknown",
          current_discussion_theme: person.current_discussion_theme ?? null,
          key_questions: person.key_questions ?? null,
          private_notes: person.private_notes ?? null,
          is_demo: true,
          archived_at: null,
          created_at: now,
          updated_at: now,
        };
        data.people = [created, ...data.people];
        saveDemoData(data);
        applyDemo(data);
        return created;
      }

      const supabase = createClient();
      if (person.id) {
        const { data, error } = await supabase
          .from("people")
          .update(person)
          .eq("id", person.id)
          .select()
          .single();
        if (error) throw error;
        const updated = data as Person;
        setPeople((prev) =>
          prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
        );
        // Mirror person interest onto conversations so list UIs stay consistent.
        if (updated.interest_level != null) {
          await supabase
            .from("conversations")
            .update({ interest_level: updated.interest_level })
            .eq("person_id", updated.id);
          setConversations((prev) =>
            prev.map((c) =>
              c.person_id === updated.id
                ? { ...c, interest_level: updated.interest_level }
                : c
            )
          );
        }
        await refresh();
        return updated;
      }
      const { data, error } = await supabase
        .from("people")
        .insert({
          ...(opts?.clientId ? { id: opts.clientId } : {}),
          user_id: user!.id,
          name: person.name,
          general_location: person.general_location ?? null,
          location_lat: person.location_lat ?? null,
          location_lng: person.location_lng ?? null,
          area_id: person.area_id ?? null,
          phone_number: person.phone_number ?? null,
          preferred_contact_time: person.preferred_contact_time ?? null,
          first_met_date: person.first_met_date ?? todayISO(),
          interest_level: person.interest_level || "unknown",
          current_discussion_theme: person.current_discussion_theme ?? null,
          key_questions: person.key_questions ?? null,
          private_notes: person.private_notes ?? null,
        })
        .select()
        .single();
      if (error) {
        // Same user action seen twice (retry / double tap): the person from
        // the first attempt is the one — return it rather than failing.
        if (error.code === "23505" && opts?.clientId) {
          const { data: existing } = await supabase
            .from("people")
            .select("*")
            .eq("id", opts.clientId)
            .maybeSingle();
          if (existing) return existing as Person;
        }
        throw error;
      }
      const createdPerson = data as Person;
      // Show it immediately, so a slow or failed refresh can't make a saved
      // person look missing (and tempt a second save).
      setPeople((prev) =>
        prev.some((p) => p.id === createdPerson.id) ? prev : [createdPerson, ...prev]
      );
      await refresh();
      return createdPerson;
    },
    [applyDemo, demoMode, refresh, user]
  );

  const archivePerson = useCallback(
    async (id: string) => {
      const now = new Date().toISOString();
      if (demoMode) {
        const data = loadDemoData();
        data.people = data.people.map((p) =>
          p.id === id ? { ...p, archived_at: now, updated_at: now } : p
        );
        saveDemoData(data);
        applyDemo(data);
        return;
      }
      const supabase = createClient();
      const { error } = await supabase
        .from("people")
        .update({ archived_at: now })
        .eq("id", id);
      if (error) throw error;
      await refresh();
    },
    [applyDemo, demoMode, refresh]
  );

  const findOrCreateArea = useCallback(
    async (rawName: string): Promise<string | null> => {
      const name = rawName.trim();
      if (!name) return null;
      // Case/whitespace-insensitive match so "kiwatule" and "Kiwatule " resolve
      // to the same area rather than creating a near-duplicate.
      const existing = areas.find(
        (a) => a.name.trim().toLowerCase() === name.toLowerCase()
      );
      if (existing) return existing.id;

      const now = new Date().toISOString();
      if (demoMode) {
        const data = loadDemoData();
        const created: Area = {
          id: crypto.randomUUID(),
          user_id: "demo-user",
          name,
          landmark_notes: null,
          map_link: null,
          location_lat: null,
          location_lng: null,
          created_at: now,
          updated_at: now,
        };
        data.areas = [...(data.areas || []), created];
        saveDemoData(data);
        applyDemo(data);
        return created.id;
      }

      if (!user) throw new Error("Please sign in to create an area.");
      const supabase = createClient();
      const { data, error } = await supabase
        .from("areas")
        .insert({ user_id: user.id, name })
        .select()
        .single();
      if (error) throw error;
      await refresh();
      return (data as Area).id;
    },
    [applyDemo, areas, demoMode, refresh, user]
  );

  const saveArea = useCallback(
    async (id: string, patch: Partial<Area>) => {
      const now = new Date().toISOString();
      if (demoMode) {
        const data = loadDemoData();
        data.areas = (data.areas || []).map((a) =>
          a.id === id ? { ...a, ...patch, updated_at: now } : a
        );
        saveDemoData(data);
        applyDemo(data);
        return data.areas.find((a) => a.id === id)!;
      }
      const supabase = createClient();
      const { data, error } = await supabase
        .from("areas")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      await refresh();
      return data as Area;
    },
    [applyDemo, demoMode, refresh]
  );

  const saveStudyNote = useCallback(
    async (form: StudyNoteFormData, existingId?: string) => {
      const now = new Date().toISOString();
      const payload = {
        note_type: form.note_type,
        title: form.title.trim(),
        session_label: emptyToNull(form.session_label.trim()),
        note_date: form.note_date || todayISO(),
        scripture_refs: emptyToNull(form.scripture_refs.trim()),
        references_text: emptyToNull(form.references_text.trim()),
        body: emptyToNull(form.body.trim()),
        is_comment: form.is_comment,
      };

      if (demoMode) {
        const data = loadDemoData();
        if (existingId) {
          data.studyNotes = (data.studyNotes || []).map((n) =>
            n.id === existingId ? { ...n, ...payload, updated_at: now } : n
          );
          saveDemoData(data);
          applyDemo(data);
          return data.studyNotes.find((n) => n.id === existingId)!;
        }
        const created: StudyNote = {
          id: crypto.randomUUID(),
          user_id: "demo-user",
          archived_at: null,
          created_at: now,
          updated_at: now,
          ...payload,
        };
        data.studyNotes = [created, ...(data.studyNotes || [])];
        saveDemoData(data);
        applyDemo(data);
        return created;
      }

      const supabase = createClient();
      if (existingId) {
        const { data, error } = await supabase
          .from("study_notes")
          .update(payload)
          .eq("id", existingId)
          .select()
          .single();
        if (error) throw error;
        await refresh();
        return data as StudyNote;
      }
      const { data, error } = await supabase
        .from("study_notes")
        .insert({ ...payload, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      await refresh();
      return data as StudyNote;
    },
    [applyDemo, demoMode, refresh, user]
  );

  const archiveStudyNote = useCallback(
    async (id: string) => {
      const now = new Date().toISOString();
      if (demoMode) {
        const data = loadDemoData();
        data.studyNotes = (data.studyNotes || []).map((n) =>
          n.id === id ? { ...n, archived_at: now, updated_at: now } : n
        );
        saveDemoData(data);
        applyDemo(data);
        return;
      }
      const supabase = createClient();
      const { error } = await supabase
        .from("study_notes")
        .update({ archived_at: now })
        .eq("id", id);
      if (error) throw error;
      await refresh();
    },
    [applyDemo, demoMode, refresh]
  );

  const addPersonPhoto = useCallback(
    async (personId: string, photoPath: string, caption?: string | null) => {
      const now = new Date().toISOString();
      const nextOrder =
        Math.max(
          -1,
          ...personPhotos
            .filter((p) => p.person_id === personId)
            .map((p) => p.sort_order)
        ) + 1;
      if (demoMode) {
        const data = loadDemoData();
        const created: PersonPhoto = {
          id: crypto.randomUUID(),
          user_id: "demo-user",
          person_id: personId,
          photo_path: photoPath,
          caption: caption || null,
          sort_order: nextOrder,
          created_at: now,
        };
        data.personPhotos = [...(data.personPhotos || []), created];
        saveDemoData(data);
        applyDemo(data);
        return created;
      }
      if (!user) throw new Error("Please sign in to add a photo.");
      const supabase = createClient();
      const { data, error } = await supabase
        .from("person_photos")
        .insert({
          user_id: user.id,
          person_id: personId,
          photo_path: photoPath,
          caption: caption || null,
          sort_order: nextOrder,
        })
        .select()
        .single();
      if (error) throw error;
      await refresh();
      return data as PersonPhoto;
    },
    [applyDemo, demoMode, personPhotos, refresh, user]
  );

  const updatePersonPhotoCaption = useCallback(
    async (photoId: string, caption: string | null) => {
      if (demoMode) {
        const data = loadDemoData();
        data.personPhotos = (data.personPhotos || []).map((p) =>
          p.id === photoId ? { ...p, caption } : p
        );
        saveDemoData(data);
        applyDemo(data);
        return;
      }
      const supabase = createClient();
      const { error } = await supabase
        .from("person_photos")
        .update({ caption })
        .eq("id", photoId);
      if (error) throw error;
      await refresh();
    },
    [applyDemo, demoMode, refresh]
  );

  const deletePersonPhoto = useCallback(
    async (photoId: string) => {
      const photo = personPhotos.find((p) => p.id === photoId);
      if (demoMode) {
        const data = loadDemoData();
        data.personPhotos = (data.personPhotos || []).filter(
          (p) => p.id !== photoId
        );
        saveDemoData(data);
        applyDemo(data);
        return;
      }
      const supabase = createClient();
      if (photo && !photo.photo_path.startsWith("data:")) {
        await supabase.storage.from("person-photos").remove([photo.photo_path]);
      }
      const { error } = await supabase
        .from("person_photos")
        .delete()
        .eq("id", photoId);
      if (error) throw error;
      await refresh();
    },
    [applyDemo, demoMode, personPhotos, refresh]
  );

  const reorderPersonPhotos = useCallback(
    async (personId: string, orderedIds: string[]) => {
      if (demoMode) {
        const data = loadDemoData();
        data.personPhotos = (data.personPhotos || []).map((p) => {
          if (p.person_id !== personId) return p;
          const idx = orderedIds.indexOf(p.id);
          return idx === -1 ? p : { ...p, sort_order: idx };
        });
        saveDemoData(data);
        applyDemo(data);
        return;
      }
      const supabase = createClient();
      await Promise.all(
        orderedIds.map((id, idx) =>
          supabase.from("person_photos").update({ sort_order: idx }).eq("id", id)
        )
      );
      await refresh();
    },
    [applyDemo, demoMode, refresh]
  );

  const findDuplicateEvent = useCallback(
    (candidate: {
      person_id: string;
      event_type: ScheduledMinistryEvent["event_type"];
      scheduled_date: string;
      scheduled_time?: string | null;
    }) => findDuplicateMinistryEvent(ministryEvents, candidate),
    [ministryEvents]
  );

  const createReturnVisit = useCallback(
    async (
      visit: Omit<
        ReturnVisit,
        "id" | "user_id" | "created_at" | "updated_at" | "is_demo"
      >,
      opts?: { allowDuplicate?: boolean; clientId?: string }
    ) => {
      if (demoMode && opts?.clientId) {
        const repeat = loadDemoData().returnVisits.find((r) => r.id === opts.clientId);
        if (repeat) return repeat;
      }
      if (!opts?.allowDuplicate) {
        const dup = findDuplicateMinistryEvent(ministryEvents, {
          person_id: visit.person_id,
          event_type: "return_visit",
          scheduled_date: visit.scheduled_date,
          scheduled_time: visit.scheduled_time,
        });
        if (dup) {
          throw new Error(
            "DUPLICATE_EVENT: A return visit is already scheduled for this person at the same date and time."
          );
        }
      }
      const now = new Date().toISOString();
      // Scheduling the next visit replaces an older one that was missed —
      // otherwise the person keeps showing the old overdue date. Future
      // visits are left alone (they may be intentional), and the replaced
      // visit stays in history as "rescheduled".
      const today = todayISO();
      const supersedeIds =
        visit.status === "planned" && visit.scheduled_date >= today
          ? returnVisitsToSupersede(returnVisits, visit.person_id, today).map(
              (rv) => rv.id
            )
          : [];
      if (demoMode) {
        const data = loadDemoData();
        const created: ReturnVisit = {
          ...visit,
          id: opts?.clientId || crypto.randomUUID(),
          user_id: "demo-user",
          is_demo: true,
          created_at: now,
          updated_at: now,
        };
        if (supersedeIds.length) {
          setReturnVisitStatusDemo(data, supersedeIds, "rescheduled");
        }
        data.returnVisits = [created, ...data.returnVisits];
        syncReturnVisitEventDemo(data, created);
        saveDemoData(data);
        applyDemo(data);
        return created;
      }
      const supabase = createClient();
      const { data, error } = await supabase
        .from("return_visits")
        .insert({
          ...(opts?.clientId ? { id: opts.clientId } : {}),
          ...visit,
          user_id: user!.id,
        })
        .select()
        .single();
      let created: ReturnVisit;
      let inserted = true;
      if (error) {
        // The same user action seen twice (retry / double tap), or the slot
        // is already taken: hand back the visit that exists instead of
        // creating a second identical one.
        if (error.code !== "23505") throw error;
        const byId = opts?.clientId
          ? (
              await supabase
                .from("return_visits")
                .select("*")
                .eq("id", opts.clientId)
                .maybeSingle()
            ).data
          : null;
        const { data: sameDay } = await supabase
          .from("return_visits")
          .select("*")
          .eq("person_id", visit.person_id)
          .eq("status", "planned")
          .eq("scheduled_date", visit.scheduled_date);
        const existing =
          (byId as ReturnVisit | null) ??
          findPlannedVisitInSlot(
            (sameDay ?? []) as ReturnVisit[],
            visit.person_id,
            visit.scheduled_date,
            visit.scheduled_time
          );
        if (!existing) throw error;
        created = existing;
        inserted = false;
      } else {
        created = data as ReturnVisit;
      }
      if (inserted) {
        await setReturnVisitStatusRemote(user!.id, supersedeIds, "rescheduled");
      }
      try {
        await upsertReturnVisitEventSupabase(user!.id, created);
      } catch (e) {
        console.warn("Calendar sync skipped (run migration 005?):", e);
      }
      setReturnVisits((prev) =>
        prev.some((r) => r.id === created.id) ? prev : [created, ...prev]
      );
      await refresh();
      return created;
    },
    [applyDemo, demoMode, ministryEvents, refresh, returnVisits, user]
  );

  const updateReturnVisit = useCallback(
    async (id: string, patch: Partial<ReturnVisit>) => {
      if (demoMode) {
        const data = loadDemoData();
        data.returnVisits = data.returnVisits.map((rv) =>
          rv.id === id
            ? { ...rv, ...patch, updated_at: new Date().toISOString() }
            : rv
        );
        const updated = data.returnVisits.find((rv) => rv.id === id);
        if (updated) syncReturnVisitEventDemo(data, updated);
        saveDemoData(data);
        applyDemo(data);
        return;
      }
      const supabase = createClient();
      const { data, error } = await supabase
        .from("return_visits")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      try {
        await upsertReturnVisitEventSupabase(user!.id, data as ReturnVisit);
      } catch (e) {
        console.warn("Calendar sync skipped (run migration 005?):", e);
      }
      await refresh();
    },
    [applyDemo, demoMode, refresh, user]
  );

  const saveBibleStudy = useCallback(
    async (
      form: BibleStudyFormData,
      existingId?: string,
      opts?: { allowDuplicate?: boolean; clientId?: string }
    ) => {
      if (!form.person_id) throw new Error("Select a person for this study.");
      if (!form.publication.trim()) {
        throw new Error("Enter the study publication or material.");
      }
      if (form.next_study_date && !opts?.allowDuplicate) {
        const dup = findDuplicateMinistryEvent(ministryEvents, {
          person_id: form.person_id,
          event_type: "bible_study",
          scheduled_date: form.next_study_date,
          scheduled_time: form.next_study_time,
        });
        if (dup && dup.bible_study_id !== existingId) {
          throw new Error(
            "DUPLICATE_EVENT: A Bible study is already scheduled for this person at the same date and time."
          );
        }
      }
      if (demoMode) {
        const study = saveBibleStudyDemo(form, existingId, opts?.clientId);
        applyDemo(loadDemoData());
        return study;
      }
      const study = await saveBibleStudyRemote(
        form,
        user!.id,
        existingId,
        opts?.clientId
      );
      await refresh();
      return study;
    },
    [applyDemo, demoMode, ministryEvents, refresh, user]
  );

  const saveStudySession = useCallback(
    async (form: BibleStudySessionFormData) => {
      if (demoMode) {
        const result = saveStudySessionDemo(form);
        applyDemo(loadDemoData());
        return result;
      }
      const result = await saveStudySessionRemote(form, user!.id);
      await refresh();
      return result;
    },
    [applyDemo, demoMode, refresh, user]
  );

  const updateBibleStudyStatus = useCallback(
    async (id: string, status: BibleStudy["status"]) => {
      if (demoMode) {
        const data = loadDemoData();
        const study = data.bibleStudies.find((s) => s.id === id);
        if (!study) return;
        const updated = {
          ...study,
          status,
          updated_at: new Date().toISOString(),
        };
        data.bibleStudies = data.bibleStudies.map((s) =>
          s.id === id ? updated : s
        );
        const { syncBibleStudyEventDemo } = await import("@/lib/ministry-api");
        syncBibleStudyEventDemo(data, updated);
        saveDemoData(data);
        applyDemo(data);
        return;
      }
      const supabase = createClient();
      const { data, error } = await supabase
        .from("bible_studies")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      const { upsertBibleStudyEventSupabase } = await import(
        "@/lib/ministry-api"
      );
      try {
        await upsertBibleStudyEventSupabase(user!.id, data as BibleStudy);
      } catch (e) {
        console.warn("Calendar sync skipped (run migration 005?):", e);
      }
      await refresh();
    },
    [applyDemo, demoMode, refresh, user]
  );

  const archiveBibleStudy = useCallback(
    async (id: string) => {
      const now = new Date().toISOString();
      if (demoMode) {
        const data = loadDemoData();
        const study = data.bibleStudies.find((s) => s.id === id);
        if (!study) return;
        data.bibleStudies = data.bibleStudies.map((s) =>
          s.id === id ? { ...s, archived_at: now, updated_at: now } : s
        );
        data.ministryEvents = data.ministryEvents.map((e) =>
          e.bible_study_id === id && e.status === "planned"
            ? { ...e, status: "cancelled" as const, updated_at: now }
            : e
        );
        saveDemoData(data);
        applyDemo(data);
        return;
      }
      const supabase = createClient();
      const { error } = await supabase
        .from("bible_studies")
        .update({ archived_at: now })
        .eq("id", id);
      if (error) throw error;
      try {
        await supabase
          .from("scheduled_ministry_events")
          .update({ status: "cancelled" })
          .eq("bible_study_id", id)
          .eq("status", "planned");
      } catch (e) {
        console.warn("Calendar event cleanup skipped:", e);
      }
      await refresh();
    },
    [applyDemo, demoMode, refresh]
  );

  const deleteReturnVisit = useCallback(
    async (id: string) => {
      const now = new Date().toISOString();
      if (demoMode) {
        const data = loadDemoData();
        const visit = data.returnVisits.find((rv) => rv.id === id);
        if (!visit) return;
        data.returnVisits = data.returnVisits.map((rv) =>
          rv.id === id ? { ...rv, status: "cancelled" as const, updated_at: now } : rv
        );
        data.ministryEvents = data.ministryEvents.map((e) =>
          e.return_visit_id === id && e.status === "planned"
            ? { ...e, status: "cancelled" as const, updated_at: now }
            : e
        );
        saveDemoData(data);
        applyDemo(data);
        return;
      }
      const supabase = createClient();
      const { error } = await supabase
        .from("return_visits")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;
      try {
        await supabase
          .from("scheduled_ministry_events")
          .update({ status: "cancelled" })
          .eq("return_visit_id", id)
          .eq("status", "planned");
      } catch (e) {
        console.warn("Calendar event cleanup skipped:", e);
      }
      await refresh();
    },
    [applyDemo, demoMode, refresh]
  );

  const saveConversation = useCallback(
    async (form: ConversationFormData) => {
      let person: Person;
      if (form.person_id) {
        // Recording a conversation updates what it actually captured — an
        // empty field must not blank what the person's profile already holds.
        const personPatch: Partial<Person> & { id: string; name: string } = {
          id: form.person_id,
          name: form.person_name || "Unknown",
        };
        // Keys are left OUT (not set to undefined) when empty, so neither the
        // database update nor the demo store's object merge can blank them.
        if (form.general_location) personPatch.general_location = form.general_location;
        if (form.main_topic) personPatch.current_discussion_theme = form.main_topic;
        if (form.questions_asked) personPatch.key_questions = form.questions_asked;
        if (form.interest_level) {
          personPatch.interest_level = form.interest_level;
        }
        // Only touch the pin when this form actually captured one —
        // never overwrite an existing pin with a blank one.
        if (form.location_lat != null || form.location_lng != null) {
          personPatch.location_lat = form.location_lat;
          personPatch.location_lng = form.location_lng;
        }
        person = await savePerson(personPatch);
      } else {
        // Ids are unique per table, so this form's one id can also name the
        // new person: saving the same form again returns that person.
        person = await savePerson(
          {
            name: form.person_name || "Unknown",
            general_location: form.general_location || null,
            location_lat: form.location_lat,
            location_lng: form.location_lng,
            first_met_date: form.conversation_date || todayISO(),
            interest_level: form.interest_level || "unknown",
            current_discussion_theme: form.main_topic || null,
            key_questions: form.questions_asked || null,
            preferred_contact_time: form.promised_follow_up_time || null,
          },
          { clientId: form.client_id }
        );
      }

      // Person profile is the single source of truth.
      const interestForConversation = person.interest_level;

      const now = new Date().toISOString();
      const scriptureList = parseScriptures(form.scriptures);

      if (demoMode) {
        const data = loadDemoData();
        const alreadySaved = form.client_id
          ? data.conversations.find((c) => c.id === form.client_id)
          : undefined;
        const built: Conversation = {
          id: form.client_id || crypto.randomUUID(),
          user_id: "demo-user",
          person_id: person.id,
          session_id: form.session_id || null,
          conversation_date: form.conversation_date || todayISO(),
          approximate_time: form.approximate_time || null,
          general_location: form.general_location || null,
          how_met: form.how_met || null,
          main_topic: form.main_topic || null,
          questions_asked: form.questions_asked || null,
          concerns_circumstances: form.concerns_circumstances || null,
          publications_shared: form.publications_shared || null,
          interest_level: interestForConversation,
          promised_follow_up_date: form.promised_follow_up_date || null,
          promised_follow_up_time: form.promised_follow_up_time || null,
          next_topic: form.next_topic || null,
          action_required: form.action_required || null,
          additional_notes: form.additional_notes || null,
          summary: form.summary || null,
          next_visit_preparation: form.next_visit_preparation || null,
          source: form.source,
          audio_path: form.audio_path || null,
          keep_audio: form.keep_audio,
          transcript: form.transcript || null,
          is_demo: true,
          created_at: now,
          updated_at: now,
        };
        const conversation = alreadySaved ?? built;
        if (!alreadySaved) {
          data.conversations = [conversation, ...data.conversations];
          for (const ref of scriptureList) {
            data.scriptures.push({
              id: crypto.randomUUID(),
              conversation_id: conversation.id,
              user_id: "demo-user",
              scripture_reference: ref,
              created_at: now,
            });
          }
        }

        // A visit already scheduled for that same person/date/time is the
        // one this form is planning — update it rather than duplicate it.
        const sameVisit =
          form.schedule_return_visit && form.promised_follow_up_date
            ? findPlannedVisitInSlot(
                data.returnVisits,
                person.id,
                form.promised_follow_up_date,
                form.promised_follow_up_time || null
              )
            : undefined;

        // Visiting someone resolves the return visits that were due or
        // overdue for them — before scheduling the next one.
        const resolveIds = returnVisitsToComplete(
          data.returnVisits,
          person.id,
          conversation.conversation_date,
          sameVisit ? [sameVisit.id] : []
        ).map((rv) => rv.id);
        if (resolveIds.length) {
          setReturnVisitStatusDemo(data, resolveIds, "completed");
        }

        let returnVisit: ReturnVisit | undefined;
        if (sameVisit) {
          returnVisit = {
            ...sameVisit,
            conversation_id: conversation.id,
            last_topic: form.main_topic || sameVisit.last_topic,
            question_to_answer: form.questions_asked || sameVisit.question_to_answer,
            next_planned_topic: form.next_topic || sameVisit.next_planned_topic,
            general_location: form.general_location || sameVisit.general_location,
            preparation_notes:
              form.next_visit_preparation || sameVisit.preparation_notes,
            updated_at: now,
          };
          data.returnVisits = data.returnVisits.map((rv) =>
            rv.id === sameVisit.id ? returnVisit! : rv
          );
          syncReturnVisitEventDemo(data, returnVisit);
        } else if (form.schedule_return_visit && form.promised_follow_up_date) {
          returnVisit = {
            id: crypto.randomUUID(),
            user_id: "demo-user",
            person_id: person.id,
            conversation_id: conversation.id,
            scheduled_date: form.promised_follow_up_date,
            scheduled_time: form.promised_follow_up_time || null,
            status: "planned",
            last_topic: form.main_topic || null,
            question_to_answer: form.questions_asked || null,
            next_planned_topic: form.next_topic || null,
            general_location: form.general_location || null,
            preparation_notes: form.next_visit_preparation || null,
            completed_at: null,
            is_demo: true,
            created_at: now,
            updated_at: now,
          };
          data.returnVisits = [returnVisit, ...data.returnVisits];
          syncReturnVisitEventDemo(data, returnVisit);
        }

        // Update person record in demo store
        data.people = data.people.map((p) =>
          p.id === person.id
            ? {
                ...p,
                name: person.name,
                general_location: person.general_location,
                interest_level: person.interest_level,
                current_discussion_theme: person.current_discussion_theme,
                key_questions: person.key_questions,
                preferred_contact_time: person.preferred_contact_time,
                updated_at: now,
              }
            : p
        );

        saveDemoData(data);
        applyDemo(data);
        return { person, conversation, returnVisit };
      }

      const supabase = createClient();
      const sessionId = emptyToNull(form.session_id);

      // Saving the same form again (a retry after a failure, or a double
      // tap) must update the one conversation, not insert a second.
      let conversation: Conversation | null = null;
      if (form.client_id) {
        const { data: found } = await supabase
          .from("conversations")
          .select("*")
          .eq("id", form.client_id)
          .maybeSingle();
        conversation = (found as Conversation | null) ?? null;
      }
      const alreadySaved = conversation !== null;
      if (!conversation) {
        const { data: inserted, error } = await supabase
        .from("conversations")
        .insert({
          ...(form.client_id ? { id: form.client_id } : {}),
          user_id: user!.id,
          person_id: person.id,
          session_id: sessionId,
          conversation_date: form.conversation_date || todayISO(),
          approximate_time: emptyToNull(form.approximate_time),
          general_location: emptyToNull(form.general_location),
          how_met: emptyToNull(form.how_met),
          main_topic: emptyToNull(form.main_topic),
          questions_asked: emptyToNull(form.questions_asked),
          concerns_circumstances: emptyToNull(form.concerns_circumstances),
          publications_shared: emptyToNull(form.publications_shared),
          interest_level: interestForConversation,
          promised_follow_up_date: emptyToNull(form.promised_follow_up_date),
          promised_follow_up_time: emptyToNull(form.promised_follow_up_time),
          next_topic: emptyToNull(form.next_topic),
          action_required: emptyToNull(form.action_required),
          additional_notes: emptyToNull(form.additional_notes),
          summary: emptyToNull(form.summary),
          next_visit_preparation: emptyToNull(form.next_visit_preparation),
          source: form.source,
          audio_path: emptyToNull(form.audio_path),
          keep_audio: form.keep_audio,
          transcript: emptyToNull(form.transcript),
        })
        .select()
        .single();
        if (error) throw error;
        conversation = inserted as Conversation;
      }

      if (scriptureList.length && !alreadySaved) {
        const { error: scriptureError } = await supabase
          .from("conversation_scriptures")
          .insert(
            scriptureList.map((ref) => ({
              conversation_id: conversation.id,
              user_id: user!.id,
              scripture_reference: ref,
            }))
          );
        if (scriptureError) throw scriptureError;
      }

      // A visit already scheduled for that same person/date/time is the one
      // this form is planning (scheduled earlier from the profile or
      // Calendar, or by a previous attempt of this same save) — update it
      // instead of failing after the conversation is already saved.
      let sameVisit: ReturnVisit | undefined;
      if (form.schedule_return_visit && form.promised_follow_up_date) {
        const { data: planned } = await supabase
          .from("return_visits")
          .select("*")
          .eq("person_id", person.id)
          .eq("status", "planned")
          .eq("scheduled_date", form.promised_follow_up_date);
        sameVisit = findPlannedVisitInSlot(
          (planned ?? []) as ReturnVisit[],
          person.id,
          form.promised_follow_up_date,
          emptyToNull(form.promised_follow_up_time)
        );
      }

      // Visiting someone resolves the return visits that were due or overdue
      // for them — before scheduling the next one.
      await setReturnVisitStatusRemote(
        user!.id,
        returnVisitsToComplete(
          returnVisits,
          person.id,
          conversation.conversation_date,
          sameVisit ? [sameVisit.id] : []
        ).map((rv) => rv.id),
        "completed"
      );

      // The next visit's date AND topic come from this form, stored on the
      // scheduled visit itself — that record is what People, Calendar and
      // Home all read.
      let returnVisit: ReturnVisit | undefined;
      if (sameVisit) {
        const patch = {
          conversation_id: conversation.id,
          last_topic: emptyToNull(form.main_topic) ?? sameVisit.last_topic,
          question_to_answer:
            emptyToNull(form.questions_asked) ?? sameVisit.question_to_answer,
          next_planned_topic:
            emptyToNull(form.next_topic) ?? sameVisit.next_planned_topic,
          general_location:
            emptyToNull(form.general_location) ?? sameVisit.general_location,
          preparation_notes:
            emptyToNull(form.next_visit_preparation) ?? sameVisit.preparation_notes,
        };
        await updateReturnVisit(sameVisit.id, patch);
        returnVisit = { ...sameVisit, ...patch };
      } else if (form.schedule_return_visit && form.promised_follow_up_date) {
        returnVisit = await createReturnVisit(
          {
            person_id: person.id,
            conversation_id: conversation.id,
            scheduled_date: form.promised_follow_up_date,
            scheduled_time: emptyToNull(form.promised_follow_up_time),
            status: "planned",
            last_topic: emptyToNull(form.main_topic),
            question_to_answer: emptyToNull(form.questions_asked),
            next_planned_topic: emptyToNull(form.next_topic),
            general_location: emptyToNull(form.general_location),
            preparation_notes: emptyToNull(form.next_visit_preparation),
            completed_at: null,
          },
          // Same-slot duplicates were handled above; a different time on
          // the same day is a genuinely separate appointment.
          { allowDuplicate: true, clientId: form.client_id }
        );
      }

      // Delete audio unless kept
      if (form.audio_path && !form.keep_audio) {
        await supabase.storage.from("conversation-audio").remove([form.audio_path]);
        await supabase
          .from("conversations")
          .update({ audio_path: null })
          .eq("id", conversation.id);
      }

      await refresh();
      return {
        person,
        conversation: conversation as Conversation,
        returnVisit,
      };
    },
    [
      applyDemo,
      createReturnVisit,
      demoMode,
      refresh,
      returnVisits,
      savePerson,
      updateReturnVisit,
      user,
    ]
  );

  const dismissReminder = useCallback(
    async (id: string) => {
      const now = new Date().toISOString();
      if (demoMode) {
        const data = loadDemoData();
        data.reminders = data.reminders.map((r) =>
          r.id === id ? { ...r, dismissed_at: now } : r
        );
        saveDemoData(data);
        applyDemo(data);
        return;
      }
      const supabase = createClient();
      await supabase
        .from("reminders")
        .update({ dismissed_at: now })
        .eq("id", id);
      await refresh();
    },
    [applyDemo, demoMode, refresh]
  );

  const updateSettings = useCallback(
    async (patch: Partial<UserSettings>) => {
      if (demoMode) {
        setSettings((prev) =>
          prev ? { ...prev, ...patch, updated_at: new Date().toISOString() } : prev
        );
        return;
      }
      const supabase = createClient();
      const { data, error } = await supabase
        .from("user_settings")
        .update(patch)
        .eq("user_id", user!.id)
        .select()
        .single();
      if (error) throw error;
      setSettings(data as UserSettings);
    },
    [demoMode, user]
  );

  const signOut = useCallback(async () => {
    if (demoMode) {
      disableDemoMode();
      return;
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
  }, [demoMode, disableDemoMode]);

  const today = todayISO();
  const activities = useMemo(
    () =>
      buildActivities({
        events: ministryEvents,
        returnVisits,
        bibleStudies,
        conversations,
        studySessions,
        today,
      }),
    [ministryEvents, returnVisits, bibleStudies, conversations, studySessions, today]
  );

  const value: AppContextValue = {
    user,
    loading,
    demoMode,
    displayName,
    settings,
    people,
    conversations: conversations.map((c) => ({
      ...c,
      scriptures: (scripturesMap[c.id] || []).map((s) => ({
        id: s.id,
        conversation_id: c.id,
        user_id: user?.id || "demo-user",
        scripture_reference: s.scripture_reference,
        created_at: "",
      })),
    })),
    returnVisits,
    sessions,
    reminders,
    bibleStudies,
    studySessions,
    ministryEvents,
    activities,
    areas,
    personPhotos,
    studyNotes,
    activeMinistrySession,
    refresh,
    enableDemoMode,
    disableDemoMode,
    resetDemo,
    updateDisplayName,
    updateEmail,
    updatePassword,
    saveDailyMinistryTime,
    updateSession,
    deleteMinistrySession,
    startMinistryTimer,
    endMinistryTimer,
    discardMinistryTimer,
    findOrCreateArea,
    saveArea,
    saveStudyNote,
    archiveStudyNote,
    addPersonPhoto,
    updatePersonPhotoCaption,
    deletePersonPhoto,
    reorderPersonPhotos,
    saveConversation,
    savePerson,
    archivePerson,
    updateReturnVisit,
    createReturnVisit,
    saveBibleStudy,
    saveStudySession,
    updateBibleStudyStatus,
    archiveBibleStudy,
    deleteReturnVisit,
    findDuplicateEvent,
    dismissReminder,
    updateSettings,
    signOut,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
