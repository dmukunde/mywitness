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
  Conversation,
  ConversationFormData,
  MinistrySession,
  MinistryType,
  Person,
  Reminder,
  ReturnVisit,
  UserSettings,
} from "@/lib/types";
import { minutesBetween, parseScriptures, todayISO } from "@/lib/utils";

interface AppContextValue {
  user: User | null;
  loading: boolean;
  demoMode: boolean;
  settings: UserSettings | null;
  people: Person[];
  conversations: Conversation[];
  returnVisits: ReturnVisit[];
  sessions: MinistrySession[];
  reminders: Reminder[];
  activeSession: MinistrySession | null;
  refresh: () => Promise<void>;
  enableDemoMode: () => void;
  disableDemoMode: () => void;
  resetDemo: () => void;
  startSession: (opts?: {
    ministry_type?: MinistryType;
    companion?: string;
    area?: string;
  }) => Promise<MinistrySession>;
  endSession: (reflection?: string) => Promise<void>;
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

  const refreshFromSupabase = useCallback(async (uid: string) => {
    const supabase = createClient();
    const [
      peopleRes,
      convRes,
      rvRes,
      sessionsRes,
      remindersRes,
      settingsRes,
      scripturesRes,
    ] = await Promise.all([
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
      supabase.from("user_settings").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("conversation_scriptures").select("*").eq("user_id", uid),
    ]);

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
  }, []);

  const refresh = useCallback(async () => {
    if (demoMode || isDemoMode()) {
      applyDemo(loadDemoData());
      setSettings(defaultSettings("demo-user"));
      return;
    }
    if (!user || !isSupabaseConfigured()) return;
    await refreshFromSupabase(user.id);
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
          user_metadata: { display_name: "Publisher" },
          created_at: new Date().toISOString(),
        } as User);
        applyDemo(loadDemoData());
        setSettings(defaultSettings("demo-user"));
        setLoading(false);
        return;
      }

      if (!isSupabaseConfigured()) {
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!mounted) return;
      setUser(authUser);
      if (authUser) {
        await refreshFromSupabase(authUser.id);
      }
      setLoading(false);

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          await refreshFromSupabase(session.user.id);
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

  const activeSession = useMemo(
    () => sessions.find((s) => !s.end_time) ?? null,
    [sessions]
  );

  const enableDemoMode = useCallback(() => {
    persistDemoMode(true);
    setDemoModeState(true);
    setUser({
      id: "demo-user",
      email: "demo@mywitness.app",
      aud: "authenticated",
      app_metadata: {},
      user_metadata: { display_name: "Publisher" },
      created_at: new Date().toISOString(),
    } as User);
    applyDemo(loadDemoData());
    setSettings(defaultSettings("demo-user"));
  }, [applyDemo]);

  const disableDemoMode = useCallback(() => {
    persistDemoMode(false);
    setDemoModeState(false);
    setUser(null);
    setPeople([]);
    setConversations([]);
    setReturnVisits([]);
    setSessions([]);
    setReminders([]);
  }, []);

  const resetDemo = useCallback(() => {
    applyDemo(resetDemoData());
  }, [applyDemo]);

  const startSession = useCallback(
    async (opts?: {
      ministry_type?: MinistryType;
      companion?: string;
      area?: string;
    }) => {
      const now = new Date().toISOString();
      if (demoMode) {
        const data = loadDemoData();
        const session: MinistrySession = {
          id: crypto.randomUUID(),
          user_id: "demo-user",
          start_time: now,
          end_time: null,
          duration_minutes: null,
          session_date: todayISO(),
          ministry_type: opts?.ministry_type ?? null,
          companion: opts?.companion ?? null,
          area: opts?.area ?? null,
          personal_reflection: null,
          is_demo: true,
          created_at: now,
          updated_at: now,
        };
        data.sessions = [session, ...data.sessions.filter((s) => s.end_time)];
        saveDemoData(data);
        applyDemo(data);
        return session;
      }

      const supabase = createClient();
      // End any dangling open sessions first
      if (activeSession) {
        const end = now;
        await supabase
          .from("ministry_sessions")
          .update({
            end_time: end,
            duration_minutes: minutesBetween(activeSession.start_time, end),
          })
          .eq("id", activeSession.id);
      }

      const { data, error } = await supabase
        .from("ministry_sessions")
        .insert({
          user_id: user!.id,
          start_time: now,
          session_date: todayISO(),
          ministry_type: opts?.ministry_type ?? null,
          companion: opts?.companion ?? null,
          area: opts?.area ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      await refresh();
      return data as MinistrySession;
    },
    [activeSession, applyDemo, demoMode, refresh, user]
  );

  const endSession = useCallback(
    async (reflection?: string) => {
      if (!activeSession) return;
      const end = new Date().toISOString();
      const duration = minutesBetween(activeSession.start_time, end);

      if (demoMode) {
        const data = loadDemoData();
        data.sessions = data.sessions.map((s) =>
          s.id === activeSession.id
            ? {
                ...s,
                end_time: end,
                duration_minutes: duration,
                personal_reflection: reflection ?? s.personal_reflection,
                updated_at: end,
              }
            : s
        );
        saveDemoData(data);
        applyDemo(data);
        return;
      }

      const supabase = createClient();
      const { error } = await supabase
        .from("ministry_sessions")
        .update({
          end_time: end,
          duration_minutes: duration,
          personal_reflection: reflection ?? null,
        })
        .eq("id", activeSession.id);
      if (error) throw error;
      await refresh();
    },
    [activeSession, applyDemo, demoMode, refresh]
  );

  const updateSession = useCallback(
    async (id: string, patch: Partial<MinistrySession>) => {
      if (demoMode) {
        const data = loadDemoData();
        data.sessions = data.sessions.map((s) =>
          s.id === id ? { ...s, ...patch, updated_at: new Date().toISOString() } : s
        );
        saveDemoData(data);
        applyDemo(data);
        return;
      }
      const supabase = createClient();
      const { error } = await supabase
        .from("ministry_sessions")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
      await refresh();
    },
    [applyDemo, demoMode, refresh]
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
        await refresh();
        return data as Person;
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
        person = await savePerson({
          id: form.person_id,
          name: form.person_name || "Unknown",
          general_location: form.general_location || null,
          interest_level: form.interest_level || "unknown",
          current_discussion_theme: form.main_topic || null,
          key_questions: form.questions_asked || null,
        });
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

      const now = new Date().toISOString();
      const scriptureList = parseScriptures(form.scriptures);

      if (demoMode) {
        const data = loadDemoData();
        const conversation: Conversation = {
          id: crypto.randomUUID(),
          user_id: "demo-user",
          person_id: person.id,
          session_id: form.session_id || activeSession?.id || null,
          conversation_date: form.conversation_date || todayISO(),
          approximate_time: form.approximate_time || null,
          general_location: form.general_location || null,
          how_met: form.how_met || null,
          main_topic: form.main_topic || null,
          questions_asked: form.questions_asked || null,
          concerns_circumstances: form.concerns_circumstances || null,
          publications_shared: form.publications_shared || null,
          interest_level: form.interest_level || null,
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
      const { data: conversation, error } = await supabase
        .from("conversations")
        .insert({
          user_id: user!.id,
          person_id: person.id,
          session_id: form.session_id || activeSession?.id || null,
          conversation_date: form.conversation_date || todayISO(),
          approximate_time: form.approximate_time || null,
          general_location: form.general_location || null,
          how_met: form.how_met || null,
          main_topic: form.main_topic || null,
          questions_asked: form.questions_asked || null,
          concerns_circumstances: form.concerns_circumstances || null,
          publications_shared: form.publications_shared || null,
          interest_level: form.interest_level || null,
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
        })
        .select()
        .single();
      if (error) throw error;

      if (scriptureList.length) {
        await supabase.from("conversation_scriptures").insert(
          scriptureList.map((ref) => ({
            conversation_id: conversation.id,
            user_id: user!.id,
            scripture_reference: ref,
          }))
        );
      }

      let returnVisit: ReturnVisit | undefined;
      if (form.schedule_return_visit && form.promised_follow_up_date) {
        returnVisit = await createReturnVisit({
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
    [activeSession, applyDemo, createReturnVisit, demoMode, refresh, savePerson, user]
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
    activeSession,
    refresh,
    enableDemoMode,
    disableDemoMode,
    resetDemo,
    startSession,
    endSession,
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
