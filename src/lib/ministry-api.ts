/**
 * Bible Studies + calendar mutators shared by AppProvider (demo + Supabase).
 */
import { createClient } from "@/lib/supabase/client";
import type { DemoData } from "@/lib/demo-data";
import { loadDemoData, saveDemoData } from "@/lib/demo-store";
import { parseLessonNumber, statusAfterScheduling } from "@/lib/bible-study";
import { emptyToNull, todayISO } from "@/lib/utils";
import type {
  BibleStudy,
  BibleStudyFormData,
  BibleStudySession,
  BibleStudySessionFormData,
  Person,
  ReturnVisit,
  ScheduledMinistryEvent,
} from "@/lib/types";

export function syncReturnVisitEventDemo(
  data: DemoData,
  rv: ReturnVisit
): DemoData {
  const existing = data.ministryEvents.find((e) => e.return_visit_id === rv.id);
  const now = new Date().toISOString();
  const event: ScheduledMinistryEvent = {
    id: existing?.id || crypto.randomUUID(),
    user_id: rv.user_id,
    person_id: rv.person_id,
    event_type: "return_visit",
    return_visit_id: rv.id,
    bible_study_id: null,
    scheduled_date: rv.scheduled_date,
    scheduled_time: rv.scheduled_time,
    general_location: rv.general_location,
    topic_or_lesson: rv.next_planned_topic,
    preparation_notes: rv.preparation_notes,
    status: rv.status,
    is_demo: true,
    created_at: existing?.created_at || now,
    updated_at: now,
  };
  data.ministryEvents = existing
    ? data.ministryEvents.map((e) => (e.id === existing.id ? event : e))
    : [event, ...data.ministryEvents];
  return data;
}

export function syncBibleStudyEventDemo(
  data: DemoData,
  study: BibleStudy
): DemoData {
  const now = new Date().toISOString();
  const existing = data.ministryEvents.find(
    (e) => e.bible_study_id === study.id && e.status === "planned"
  );

  // No next date, paused, or finished → the future appointment no longer
  // exists. (Appointments that were actually held are completed explicitly
  // when the session is recorded — see completeStudyEventsDemo.)
  if (!study.next_study_date || study.status !== "active") {
    data.ministryEvents = data.ministryEvents.map((e) =>
      e.bible_study_id === study.id && e.status === "planned"
        ? { ...e, status: "cancelled" as const, updated_at: now }
        : e
    );
    return data;
  }

  const event: ScheduledMinistryEvent = {
    id: existing?.id || crypto.randomUUID(),
    user_id: study.user_id,
    person_id: study.person_id,
    event_type: "bible_study",
    return_visit_id: null,
    bible_study_id: study.id,
    scheduled_date: study.next_study_date,
    scheduled_time: study.next_study_time,
    general_location: study.general_location,
    topic_or_lesson: study.current_lesson,
    preparation_notes: study.preparation_notes,
    status: "planned",
    is_demo: true,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  data.ministryEvents = existing
    ? data.ministryEvents.map((e) => (e.id === existing.id ? event : e))
    : [event, ...data.ministryEvents];
  return data;
}

export async function upsertReturnVisitEventSupabase(
  userId: string,
  rv: ReturnVisit
) {
  const supabase = createClient();
  // A visit has exactly one calendar event. If extras ever exist (an old
  // double-tap or race), a single-row lookup used to fail silently and every
  // later change inserted yet another copy — so take the first and drop the
  // rest (they're only mirrors of this visit).
  const { data: rows } = await supabase
    .from("scheduled_ministry_events")
    .select("id")
    .eq("return_visit_id", rv.id)
    .order("created_at", { ascending: true });
  const existing = rows?.[0];
  const extraIds = (rows ?? []).slice(1).map((r) => r.id);
  if (extraIds.length) {
    await supabase.from("scheduled_ministry_events").delete().in("id", extraIds);
  }

  const payload = {
    user_id: userId,
    person_id: rv.person_id,
    event_type: "return_visit" as const,
    return_visit_id: rv.id,
    bible_study_id: null,
    scheduled_date: rv.scheduled_date,
    scheduled_time: rv.scheduled_time,
    general_location: rv.general_location,
    topic_or_lesson: rv.next_planned_topic,
    preparation_notes: rv.preparation_notes,
    status: rv.status,
  };

  if (existing?.id) {
    await supabase
      .from("scheduled_ministry_events")
      .update(payload)
      .eq("id", existing.id);
  } else {
    const { error } = await supabase
      .from("scheduled_ministry_events")
      .insert(payload);
    // Another save created this visit's event first (a race): update it.
    if (error?.code === "23505") {
      await supabase
        .from("scheduled_ministry_events")
        .update(payload)
        .eq("return_visit_id", rv.id);
    }
  }
}

export async function upsertBibleStudyEventSupabase(
  userId: string,
  study: BibleStudy
) {
  const supabase = createClient();
  // More than one planned event for a study used to make a single-row lookup
  // fail silently, leaving the calendar stale — take the first, drop extras.
  const { data: plannedRows } = await supabase
    .from("scheduled_ministry_events")
    .select("id")
    .eq("bible_study_id", study.id)
    .eq("status", "planned")
    .order("created_at", { ascending: true });
  const existing = plannedRows?.[0];
  const extraIds = (plannedRows ?? []).slice(1).map((r) => r.id);
  if (extraIds.length) {
    await supabase
      .from("scheduled_ministry_events")
      .update({ status: "cancelled" })
      .in("id", extraIds);
  }

  // No next date, paused, or finished → the future appointment no longer
  // exists. Appointments that were actually held are completed explicitly
  // when the session is recorded (completeStudyEventsSupabase).
  if (!study.next_study_date || study.status !== "active") {
    if (existing?.id) {
      await supabase
        .from("scheduled_ministry_events")
        .update({ status: "cancelled" })
        .eq("id", existing.id);
    }
    return;
  }

  const payload = {
    user_id: userId,
    person_id: study.person_id,
    event_type: "bible_study" as const,
    return_visit_id: null,
    bible_study_id: study.id,
    scheduled_date: study.next_study_date,
    scheduled_time: study.next_study_time,
    general_location: study.general_location,
    topic_or_lesson: study.current_lesson,
    preparation_notes: study.preparation_notes,
    status: "planned" as const,
  };

  if (existing?.id) {
    await supabase
      .from("scheduled_ministry_events")
      .update(payload)
      .eq("id", existing.id);
  } else {
    const { error } = await supabase
      .from("scheduled_ministry_events")
      .insert(payload);
    // Another save created this study's planned event first: update it.
    if (error?.code === "23505") {
      await supabase
        .from("scheduled_ministry_events")
        .update(payload)
        .eq("bible_study_id", study.id)
        .eq("status", "planned");
    }
  }
}

/** Marks a study's planned appointments on/before `throughDate` as held. */
export function completeStudyEventsDemo(
  data: DemoData,
  studyId: string,
  throughDate: string
): DemoData {
  const now = new Date().toISOString();
  data.ministryEvents = data.ministryEvents.map((e) =>
    e.bible_study_id === studyId &&
    e.status === "planned" &&
    e.scheduled_date <= throughDate
      ? { ...e, status: "completed" as const, updated_at: now }
      : e
  );
  return data;
}

export async function completeStudyEventsSupabase(
  studyId: string,
  throughDate: string
) {
  const supabase = createClient();
  await supabase
    .from("scheduled_ministry_events")
    .update({ status: "completed" })
    .eq("bible_study_id", studyId)
    .eq("status", "planned")
    .lte("scheduled_date", throughDate);
}

/** Sets the status of several return visits (e.g. completed / rescheduled) and mirrors it to the calendar. */
export function setReturnVisitStatusDemo(
  data: DemoData,
  ids: string[],
  status: "completed" | "rescheduled"
): DemoData {
  const now = new Date().toISOString();
  // Only still-planned visits change — never re-resolve one that's already
  // completed/cancelled (e.g. completed a moment ago, then "superseded").
  const changing = data.returnVisits
    .filter((rv) => ids.includes(rv.id) && rv.status === "planned")
    .map((rv) => rv.id);
  data.returnVisits = data.returnVisits.map((rv) =>
    changing.includes(rv.id)
      ? {
          ...rv,
          status,
          completed_at: status === "completed" ? now : rv.completed_at,
          updated_at: now,
        }
      : rv
  );
  for (const rv of data.returnVisits.filter((r) => changing.includes(r.id))) {
    syncReturnVisitEventDemo(data, rv);
  }
  // A resolved visit's seeded "overdue" reminder card is no longer true.
  data.reminders = data.reminders.map((r) =>
    r.return_visit_id && changing.includes(r.return_visit_id) && !r.dismissed_at
      ? { ...r, dismissed_at: now }
      : r
  );
  return data;
}

export async function setReturnVisitStatusRemote(
  userId: string,
  ids: string[],
  status: "completed" | "rescheduled"
) {
  if (!ids.length) return;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("return_visits")
    .update({
      status,
      ...(status === "completed" ? { completed_at: new Date().toISOString() } : {}),
    })
    .in("id", ids)
    .eq("status", "planned")
    .select();
  if (error) throw error;
  for (const rv of (data ?? []) as ReturnVisit[]) {
    await safeSync(() => upsertReturnVisitEventSupabase(userId, rv));
  }
}

export function buildStudyFromForm(
  form: BibleStudyFormData,
  userId: string,
  now: string,
  existing?: BibleStudy
): BibleStudy {
  const lessonNum =
    form.current_lesson_number ||
    parseLessonNumber(form.current_lesson) ||
    existing?.current_lesson_number ||
    1;
  return {
    id: existing?.id || crypto.randomUUID(),
    user_id: userId,
    person_id: form.person_id,
    publication: form.publication.trim(),
    starting_lesson: emptyToNull(form.starting_lesson),
    current_lesson: emptyToNull(form.current_lesson),
    current_lesson_number: lessonNum,
    total_lessons: Math.max(1, form.total_lessons || 60),
    study_frequency: form.study_frequency,
    preferred_day: emptyToNull(form.preferred_day),
    preferred_time: emptyToNull(form.preferred_time),
    first_study_date: emptyToNull(form.first_study_date),
    next_study_date: emptyToNull(form.next_study_date),
    next_study_time: emptyToNull(form.next_study_time),
    last_study_date: existing?.last_study_date ?? null,
    general_location: emptyToNull(form.general_location),
    status: form.status,
    preparation_notes: emptyToNull(form.preparation_notes),
    private_notes: emptyToNull(form.private_notes),
    source_return_visit_id: emptyToNull(form.source_return_visit_id),
    archived_at: existing?.archived_at ?? null,
    is_demo: userId === "demo-user",
    created_at: existing?.created_at || now,
    updated_at: now,
  };
}

export function saveBibleStudyDemo(
  form: BibleStudyFormData,
  existingId?: string,
  clientId?: string
): BibleStudy {
  const data = loadDemoData();
  const now = new Date().toISOString();
  if (!existingId && clientId) {
    // Same user action seen twice: return the study already created.
    const repeat = data.bibleStudies.find((s) => s.id === clientId);
    if (repeat) return repeat;
  }
  const existing = existingId
    ? data.bibleStudies.find((s) => s.id === existingId)
    : undefined;
  const study = buildStudyFromForm(form, "demo-user", now, existing);
  if (!existing && clientId) study.id = clientId;

  if (existing) {
    data.bibleStudies = data.bibleStudies.map((s) =>
      s.id === existing.id ? study : s
    );
  } else {
    data.bibleStudies = [study, ...data.bibleStudies];
  }

  // Mark person as Bible Study interest — no duplicate person
  data.people = data.people.map((p) =>
    p.id === study.person_id
      ? {
          ...p,
          interest_level: "bible_study",
          current_discussion_theme: study.publication,
          preferred_contact_time:
            study.preferred_time || p.preferred_contact_time,
          general_location: study.general_location || p.general_location,
          location_lat: form.location_lat ?? p.location_lat,
          location_lng: form.location_lng ?? p.location_lng,
          updated_at: now,
        }
      : p
  );

  // If converted from RV, cancel that planned visit (keep history)
  if (study.source_return_visit_id) {
    data.returnVisits = data.returnVisits.map((rv) =>
      rv.id === study.source_return_visit_id && rv.status === "planned"
        ? { ...rv, status: "completed", completed_at: now, updated_at: now }
        : rv
    );
    const src = data.returnVisits.find(
      (rv) => rv.id === study.source_return_visit_id
    );
    if (src) syncReturnVisitEventDemo(data, src);
  }

  syncBibleStudyEventDemo(data, study);
  saveDemoData(data);
  return study;
}

/**
 * The study's next appointment after a session is recorded: the date the
 * user entered, or a still-future date already on the study, or none —
 * never the old date that has just been held (that used to leave a held
 * study showing Overdue forever).
 */
function nextStudySchedule(
  study: BibleStudy,
  form: { next_scheduled_date: string; next_scheduled_time: string },
  sessionDate: string
): { date: string | null; time: string | null } {
  const date =
    emptyToNull(form.next_scheduled_date) ??
    (study.next_study_date && study.next_study_date > sessionDate
      ? study.next_study_date
      : null);
  const time = date
    ? emptyToNull(form.next_scheduled_time) ?? study.next_study_time
    : null;
  return { date, time };
}

export function saveStudySessionDemo(
  form: BibleStudySessionFormData
): { session: BibleStudySession; study: BibleStudy } {
  const data = loadDemoData();
  const now = new Date().toISOString();
  const study = data.bibleStudies.find((s) => s.id === form.bible_study_id);
  if (!study) throw new Error("Bible study not found");

  const session: BibleStudySession = {
    id: crypto.randomUUID(),
    user_id: "demo-user",
    bible_study_id: form.bible_study_id,
    person_id: study.person_id,
    session_date: form.session_date || todayISO(),
    start_lesson: emptyToNull(form.start_lesson),
    end_lesson: emptyToNull(form.end_lesson),
    topics_discussed: emptyToNull(form.topics_discussed),
    scriptures_discussed: emptyToNull(form.scriptures_discussed),
    questions_raised: emptyToNull(form.questions_raised),
    material_completed: emptyToNull(form.material_completed),
    homework: emptyToNull(form.homework),
    next_lesson: emptyToNull(form.next_lesson),
    next_scheduled_date: emptyToNull(form.next_scheduled_date),
    next_scheduled_time: emptyToNull(form.next_scheduled_time),
    preparation_notes: emptyToNull(form.preparation_notes),
    summary: emptyToNull(form.summary),
    source: form.source,
    transcript: emptyToNull(form.transcript),
    audio_path: emptyToNull(form.audio_path),
    is_demo: true,
    created_at: now,
    updated_at: now,
  };

  data.studySessions = [session, ...data.studySessions];

  // Holding the study resolves the appointment that was due.
  completeStudyEventsDemo(data, study.id, session.session_date);
  const next = nextStudySchedule(study, form, session.session_date);

  const endNum =
    parseLessonNumber(form.end_lesson || form.next_lesson || "") ||
    study.current_lesson_number;
  const updated: BibleStudy = {
    ...study,
    current_lesson: form.next_lesson || form.end_lesson || study.current_lesson,
    current_lesson_number: endNum,
    last_study_date: session.session_date,
    next_study_date: next.date,
    next_study_time: next.time,
    status: statusAfterScheduling(
      study.status,
      emptyToNull(form.next_scheduled_date)
    ),
    preparation_notes: form.preparation_notes || study.preparation_notes,
    updated_at: now,
  };
  data.bibleStudies = data.bibleStudies.map((s) =>
    s.id === study.id ? updated : s
  );
  syncBibleStudyEventDemo(data, updated);
  saveDemoData(data);
  return { session, study: updated };
}

export type ApplyDemoFn = (data: DemoData) => void;

export async function saveBibleStudyRemote(
  form: BibleStudyFormData,
  userId: string,
  existingId?: string,
  clientId?: string
): Promise<BibleStudy> {
  const supabase = createClient();
  const now = new Date().toISOString();
  const row = {
    person_id: form.person_id,
    publication: form.publication.trim(),
    starting_lesson: emptyToNull(form.starting_lesson),
    current_lesson: emptyToNull(form.current_lesson),
    current_lesson_number:
      form.current_lesson_number ||
      parseLessonNumber(form.current_lesson) ||
      1,
    total_lessons: Math.max(1, form.total_lessons || 60),
    study_frequency: form.study_frequency,
    preferred_day: emptyToNull(form.preferred_day),
    preferred_time: emptyToNull(form.preferred_time),
    first_study_date: emptyToNull(form.first_study_date),
    next_study_date: emptyToNull(form.next_study_date),
    next_study_time: emptyToNull(form.next_study_time),
    general_location: emptyToNull(form.general_location),
    status: form.status,
    preparation_notes: emptyToNull(form.preparation_notes),
    private_notes: emptyToNull(form.private_notes),
    source_return_visit_id: emptyToNull(form.source_return_visit_id),
  };

  let study: BibleStudy;
  if (existingId) {
    const { data, error } = await supabase
      .from("bible_studies")
      .update(row)
      .eq("id", existingId)
      .select()
      .single();
    if (error) throw error;
    study = data as BibleStudy;
  } else {
    const { data, error } = await supabase
      .from("bible_studies")
      .insert({
        ...(clientId ? { id: clientId } : {}),
        ...row,
        user_id: userId,
      })
      .select()
      .single();
    if (error) {
      // Same user action seen twice (retry / double tap): that study exists.
      if (error.code === "23505" && clientId) {
        const { data: existing } = await supabase
          .from("bible_studies")
          .select("*")
          .eq("id", clientId)
          .maybeSingle();
        if (existing) return existing as BibleStudy;
      }
      throw error;
    }
    study = data as BibleStudy;
  }

  await supabase
    .from("people")
    .update({
      interest_level: "bible_study",
      current_discussion_theme: study.publication,
      preferred_contact_time: study.preferred_time,
      general_location: study.general_location,
      location_lat: form.location_lat,
      location_lng: form.location_lng,
      updated_at: now,
    })
    .eq("id", study.person_id);

  if (study.source_return_visit_id) {
    const { data: rv } = await supabase
      .from("return_visits")
      .update({
        status: "completed",
        completed_at: now,
      })
      .eq("id", study.source_return_visit_id)
      .eq("status", "planned")
      .select()
      .maybeSingle();
    if (rv) {
      await safeSync(() => upsertReturnVisitEventSupabase(userId, rv as ReturnVisit));
    }
  }

  await safeSync(() => upsertBibleStudyEventSupabase(userId, study));
  return study;
}

export async function saveStudySessionRemote(
  form: BibleStudySessionFormData,
  userId: string
): Promise<{ session: BibleStudySession; study: BibleStudy }> {
  const supabase = createClient();
  const { data: studyRow, error: studyErr } = await supabase
    .from("bible_studies")
    .select("*")
    .eq("id", form.bible_study_id)
    .single();
  if (studyErr) throw studyErr;
  const study = studyRow as BibleStudy;

  const { data: session, error } = await supabase
    .from("bible_study_sessions")
    .insert({
      user_id: userId,
      bible_study_id: form.bible_study_id,
      person_id: study.person_id,
      session_date: form.session_date || todayISO(),
      start_lesson: emptyToNull(form.start_lesson),
      end_lesson: emptyToNull(form.end_lesson),
      topics_discussed: emptyToNull(form.topics_discussed),
      scriptures_discussed: emptyToNull(form.scriptures_discussed),
      questions_raised: emptyToNull(form.questions_raised),
      material_completed: emptyToNull(form.material_completed),
      homework: emptyToNull(form.homework),
      next_lesson: emptyToNull(form.next_lesson),
      next_scheduled_date: emptyToNull(form.next_scheduled_date),
      next_scheduled_time: emptyToNull(form.next_scheduled_time),
      preparation_notes: emptyToNull(form.preparation_notes),
      summary: emptyToNull(form.summary),
      source: form.source,
      transcript: emptyToNull(form.transcript),
      audio_path: emptyToNull(form.audio_path),
    })
    .select()
    .single();
  if (error) throw error;

  const sessionDate = form.session_date || todayISO();
  // Holding the study resolves the appointment that was due.
  await safeSync(() => completeStudyEventsSupabase(study.id, sessionDate));
  const next = nextStudySchedule(study, form, sessionDate);

  const endNum =
    parseLessonNumber(form.end_lesson || form.next_lesson || "") ||
    study.current_lesson_number;

  const { data: updated, error: updErr } = await supabase
    .from("bible_studies")
    .update({
      current_lesson: form.next_lesson || form.end_lesson || study.current_lesson,
      current_lesson_number: endNum,
      last_study_date: sessionDate,
      next_study_date: next.date,
      next_study_time: next.time,
      status: statusAfterScheduling(
        study.status,
        emptyToNull(form.next_scheduled_date)
      ),
      preparation_notes:
        emptyToNull(form.preparation_notes) || study.preparation_notes,
    })
    .eq("id", study.id)
    .select()
    .single();
  if (updErr) throw updErr;

  await safeSync(() => upsertBibleStudyEventSupabase(userId, updated as BibleStudy));
  return {
    session: session as BibleStudySession,
    study: updated as BibleStudy,
  };
}

export function personName(people: Person[], id: string) {
  return people.find((p) => p.id === id)?.name || "Person";
}

/** Calendar-event sync is best-effort — never let it block the underlying save. */
async function safeSync(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    console.warn("Calendar sync skipped (run migration 005?):", e);
  }
}
