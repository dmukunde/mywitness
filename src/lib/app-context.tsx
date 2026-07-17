"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  Conversation,
  ConversationFormData,
  MinistrySession,
  Person,
  Profile,
  Reminder,
  ReturnVisit,
  UserSettings,
} from "@/lib/types";
import { emptyToNull, minutesBetween, parseScriptures, sanitizeDisplayName, todayISO } from "@/lib/utils";
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
  saveConversation: (
    form: ConversationFormData
  ) => Promise<{ person: Person; conversation: Conversation; returnVisit?: ReturnVisit }>;
  savePerson: (person: Partial<Person> & { name: string }) => Promise<Person>;
  archivePerson: (id: string) => Promise<void>;
  updateReturnVisit: (
    id: string,
    patch: Partial<ReturnVisit>
  ) => Promise<void>;
  createReturnVisit: (
    visit: Omit<ReturnVisit, "id" | "user_id" | "created_at" | "updated_at" | "is_demo">
  ) => Promise<ReturnVisit>;
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
  const [scripturesMap, setScripturesMap] = useState<
    Record<string, { id: string; scripture_reference: string }[]>
  >({});

  const applyDemo = useCallback((data: DemoData) => {
    setPeople(data.people.filter((p) => !p.archived_at));
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

      setPeople((peopleRes.data as Person[]) || []);
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
      setSettings((settingsRes.data as UserSettings) || defaultSettings(uid));
      setScripturesMap(scriptureByConv);
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
    await refreshFromSupabase(user.id, user.email);
  }, [applyDemo, demoMode, refreshFromSupabase, user]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const demo = isDemoMode();
      if (demo) {
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
        return;
      }

      if (!isSupabaseConfigured()) {
        setLoading(false);
        return;
      }

      const savedName =
        typeof window !== "undefined"
          ? localStorage.getItem(DISPLAY_NAME_KEY) || ""
          : "";
      // Don't seed from localStorage until we know the email (avoids email usernames)

      const supabase = createClient();
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();
      if (!mounted) return;
      if (authError) {
        console.error(authError);
      }
      setUser(authUser);
      if (authUser) {
        const safeSaved = sanitizeDisplayName(savedName, authUser.email);
        if (safeSaved) setDisplayName(safeSaved);
        try {
          await refreshFromSupabase(authUser.id, authUser.email);
        } catch (err) {
          console.error(err);
        }
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
          setSettings(null);
          setDisplayName("");
          if (typeof window !== "undefined") {
            localStorage.removeItem(DISPLAY_NAME_KEY);
          }
        }
      });

      return () => subscription.unsubscribe();
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

      const existing = sessions
        .filter((s) => s.session_date === date)
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );

      if (demoMode) {
        const data = loadDemoData();
        const keepId = existing[0]?.id || crypto.randomUUID();
        const row: MinistrySession = {
          id: keepId,
          user_id: "demo-user",
          start_time: startIso,
          end_time: endIso,
          duration_minutes: duration,
          session_date: date,
          ministry_type: null,
          companion: null,
          area: null,
          personal_reflection: notes,
          is_demo: true,
          created_at: existing[0]?.created_at || now,
          updated_at: now,
        };
        data.sessions = [
          row,
          ...data.sessions.filter((s) => s.session_date !== date),
        ];
        saveDemoData(data);
        applyDemo(data);
        return row;
      }

      const supabase = createClient();
      const keep = existing[0];
      const extras = existing.slice(1);

      if (extras.length > 0) {
        await supabase
          .from("ministry_sessions")
          .delete()
          .in(
            "id",
            extras.map((s) => s.id)
          );
      }

      if (keep) {
        const { data, error } = await supabase
          .from("ministry_sessions")
          .update({
            start_time: startIso,
            end_time: endIso,
            duration_minutes: duration,
            session_date: date,
            personal_reflection: notes,
            updated_at: now,
          })
          .eq("id", keep.id)
          .select()
          .single();
        if (error) throw error;
        await refresh();
        return data as MinistrySession;
      }

      const { data, error } = await supabase
        .from("ministry_sessions")
        .insert({
          user_id: user!.id,
          start_time: startIso,
          end_time: endIso,
          duration_minutes: duration,
          session_date: date,
          personal_reflection: notes,
        })
        .select()
        .single();
      if (error) throw error;
      await refresh();
      return data as MinistrySession;
    },
    [applyDemo, demoMode, refresh, sessions, user]
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
        if (start && end) {
          out.duration_minutes = minutesBetween(start, end);
        } else if (nextPatch.end_time === null) {
          out.duration_minutes = null;
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

  const savePerson = useCallback(
    async (person: Partial<Person> & { name: string }) => {
      const now = new Date().toISOString();
      if (demoMode) {
        const data = loadDemoData();
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
          id: crypto.randomUUID(),
          user_id: "demo-user",
          name: person.name,
          general_location: person.general_location ?? null,
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
          user_id: user!.id,
          name: person.name,
          general_location: person.general_location ?? null,
          preferred_contact_time: person.preferred_contact_time ?? null,
          first_met_date: person.first_met_date ?? todayISO(),
          interest_level: person.interest_level || "unknown",
          current_discussion_theme: person.current_discussion_theme ?? null,
          key_questions: person.key_questions ?? null,
          private_notes: person.private_notes ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      await refresh();
      return data as Person;
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

  const createReturnVisit = useCallback(
    async (
      visit: Omit<
        ReturnVisit,
        "id" | "user_id" | "created_at" | "updated_at" | "is_demo"
      >
    ) => {
      const now = new Date().toISOString();
      if (demoMode) {
        const data = loadDemoData();
        const created: ReturnVisit = {
          ...visit,
          id: crypto.randomUUID(),
          user_id: "demo-user",
          is_demo: true,
          created_at: now,
          updated_at: now,
        };
        data.returnVisits = [created, ...data.returnVisits];
        saveDemoData(data);
        applyDemo(data);
        return created;
      }
      const supabase = createClient();
      const { data, error } = await supabase
        .from("return_visits")
        .insert({ ...visit, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      await refresh();
      return data as ReturnVisit;
    },
    [applyDemo, demoMode, refresh, user]
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
        saveDemoData(data);
        applyDemo(data);
        return;
      }
      const supabase = createClient();
      const { error } = await supabase
        .from("return_visits")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
      await refresh();
    },
    [applyDemo, demoMode, refresh]
  );

  const saveConversation = useCallback(
    async (form: ConversationFormData) => {
      let person: Person;
      if (form.person_id) {
        const personPatch: Partial<Person> & { id: string; name: string } = {
          id: form.person_id,
          name: form.person_name || "Unknown",
          general_location: form.general_location || null,
          current_discussion_theme: form.main_topic || null,
          key_questions: form.questions_asked || null,
        };
        if (form.interest_level) {
          personPatch.interest_level = form.interest_level;
        }
        person = await savePerson(personPatch);
      } else {
        person = await savePerson({
          name: form.person_name || "Unknown",
          general_location: form.general_location || null,
          first_met_date: form.conversation_date || todayISO(),
          interest_level: form.interest_level || "unknown",
          current_discussion_theme: form.main_topic || null,
          key_questions: form.questions_asked || null,
          preferred_contact_time: form.promised_follow_up_time || null,
        });
      }

      // Person profile is the single source of truth.
      const interestForConversation = person.interest_level;

      const now = new Date().toISOString();
      const scriptureList = parseScriptures(form.scriptures);

      if (demoMode) {
        const data = loadDemoData();
        const conversation: Conversation = {
          id: crypto.randomUUID(),
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

        let returnVisit: ReturnVisit | undefined;
        if (form.schedule_return_visit && form.promised_follow_up_date) {
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

      const { data: conversation, error } = await supabase
        .from("conversations")
        .insert({
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

      if (scriptureList.length) {
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

      // Schedule return visit when the form requests it
      let returnVisit: ReturnVisit | undefined;
      if (form.schedule_return_visit && form.promised_follow_up_date) {
        returnVisit = await createReturnVisit({
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
        });
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
    [applyDemo, createReturnVisit, demoMode, refresh, savePerson, user]
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
    refresh,
    enableDemoMode,
    disableDemoMode,
    resetDemo,
    updateDisplayName,
    updateEmail,
    updatePassword,
    saveDailyMinistryTime,
    updateSession,
    saveConversation,
    savePerson,
    archivePerson,
    updateReturnVisit,
    createReturnVisit,
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
