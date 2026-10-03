export type InterestLevel =
  | "unknown"
  | "very_low"
  | "low"
  | "moderate"
  | "high"
  | "very_high"
  | "bible_study";


export type MinistryType =
  | "house_to_house"
  | "public_witnessing"
  | "informal_witnessing"
  | "return_visits"
  | "bible_studies"
  | "letter_writing"
  | "telephone_witnessing"
  | "other";

export type ReturnVisitStatus = "planned" | "completed" | "cancelled" | "rescheduled";

export type BibleStudyStatus = "active" | "paused" | "completed";

export type StudyFrequency = "weekly" | "biweekly" | "monthly" | "custom";

export type MinistryEventType = "return_visit" | "bible_study";

export type MinistryEventStatus =
  | "planned"
  | "completed"
  | "cancelled"
  | "rescheduled";

export type StudyNoteType =
  | "family_worship"
  | "midweek_meeting"
  | "weekend_meeting"
  | "convention"
  | "personal_study"
  | "other";

export type ReminderType =
  | "return_visit"
  | "overdue"
  | "preparation"
  | "unsaved_recording"
  | "follow_up";

export interface Profile {
  id: string;
  display_name: string | null;
  timezone: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  keep_audio_after_transcription: boolean;
  browser_notifications_enabled: boolean;
  reminder_minutes_before: number;
  demo_mode_enabled: boolean;
  /** 1-12. Defaults to 9 (September, the JW service-year convention); 1 = ordinary calendar year. */
  service_year_start_month: number;
  created_at: string;
  updated_at: string;
}

export interface Person {
  id: string;
  user_id: string;
  name: string;
  general_location: string | null;
  /** Optional pin captured via "Use current location" — for reopening the spot later, never shown as raw numbers. */
  location_lat: number | null;
  location_lng: number | null;
  area_id: string | null;
  /** Raw as entered — normalized only at display/link time (see lib/phone.ts). */
  phone_number: string | null;
  preferred_contact_time: string | null;
  first_met_date: string | null;
  interest_level: InterestLevel | null;
  current_discussion_theme: string | null;
  key_questions: string | null;
  private_notes: string | null;
  is_demo: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  area?: Area | null;
  photos?: PersonPhoto[];
}

/** A neighbourhood/area a person can be grouped under — not tied to live GPS or maps for the MVP. */
export interface Area {
  id: string;
  user_id: string;
  name: string;
  landmark_notes: string | null;
  map_link: string | null;
  location_lat: number | null;
  location_lng: number | null;
  created_at: string;
  updated_at: string;
}

/** One waypoint photo in a person's small, ordered "how to find this house" list. */
export interface PersonPhoto {
  id: string;
  user_id: string;
  person_id: string;
  photo_path: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

export interface MinistrySession {
  id: string;
  user_id: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  session_date: string;
  ministry_type: MinistryType | null;
  companion: string | null;
  area: string | null;
  personal_reflection: string | null;
  /** Labeling only — how this row was created, not load-bearing for duration math. */
  source: "timer" | "manual";
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  person_id: string | null;
  session_id: string | null;
  conversation_date: string;
  approximate_time: string | null;
  general_location: string | null;
  how_met: string | null;
  main_topic: string | null;
  questions_asked: string | null;
  concerns_circumstances: string | null;
  publications_shared: string | null;
  interest_level: InterestLevel | null;
  promised_follow_up_date: string | null;
  promised_follow_up_time: string | null;
  next_topic: string | null;
  action_required: string | null;
  additional_notes: string | null;
  summary: string | null;
  next_visit_preparation: string | null;
  source: "voice" | "manual";
  audio_path: string | null;
  keep_audio: boolean;
  transcript: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  scriptures?: ConversationScripture[];
  person?: Person | null;
}

export interface ConversationScripture {
  id: string;
  conversation_id: string;
  user_id: string;
  scripture_reference: string;
  created_at: string;
}

export interface ReturnVisit {
  id: string;
  user_id: string;
  person_id: string;
  conversation_id: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  status: ReturnVisitStatus;
  last_topic: string | null;
  question_to_answer: string | null;
  next_planned_topic: string | null;
  general_location: string | null;
  preparation_notes: string | null;
  completed_at: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  person?: Person | null;
  conversation?: Conversation | null;
}

export interface Reminder {
  id: string;
  user_id: string;
  return_visit_id: string | null;
  reminder_type: ReminderType;
  title: string;
  body: string | null;
  due_at: string;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
}

export interface BibleStudy {
  id: string;
  user_id: string;
  person_id: string;
  publication: string;
  starting_lesson: string | null;
  current_lesson: string | null;
  current_lesson_number: number;
  total_lessons: number;
  study_frequency: StudyFrequency;
  preferred_day: string | null;
  preferred_time: string | null;
  first_study_date: string | null;
  next_study_date: string | null;
  next_study_time: string | null;
  last_study_date: string | null;
  general_location: string | null;
  status: BibleStudyStatus;
  preparation_notes: string | null;
  private_notes: string | null;
  source_return_visit_id: string | null;
  /** Soft-delete — independent of `status`; null unless the user deleted the study. */
  archived_at: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  person?: Person | null;
  sessions?: BibleStudySession[];
}

export interface BibleStudySession {
  id: string;
  user_id: string;
  bible_study_id: string;
  person_id: string | null;
  session_date: string;
  start_lesson: string | null;
  end_lesson: string | null;
  topics_discussed: string | null;
  scriptures_discussed: string | null;
  questions_raised: string | null;
  material_completed: string | null;
  homework: string | null;
  next_lesson: string | null;
  next_scheduled_date: string | null;
  next_scheduled_time: string | null;
  preparation_notes: string | null;
  summary: string | null;
  source: "voice" | "manual";
  transcript: string | null;
  audio_path: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduledMinistryEvent {
  id: string;
  user_id: string;
  person_id: string;
  event_type: MinistryEventType;
  return_visit_id: string | null;
  bible_study_id: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  general_location: string | null;
  topic_or_lesson: string | null;
  preparation_notes: string | null;
  status: MinistryEventStatus;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  person?: Person | null;
}

/**
 * A personal Study Notebook entry — Family Worship, meeting preparation,
 * convention notes, or personal study. One shared shape for every type
 * (see PROJECT.md §8): the differences are just which fields get used, not
 * separate tables. Never stores JW.org/JW Library publication content —
 * only the user's own notes and pasted references.
 */
export interface StudyNote {
  id: string;
  user_id: string;
  note_type: StudyNoteType;
  title: string;
  /** Free text, meaning varies by type: "Watchtower, para 12", "Saturday — Symposium Part 2". */
  session_label: string | null;
  note_date: string;
  scripture_refs: string | null;
  /** Pasted JW.org links / publication mentions — never scraped or cached content. */
  references_text: string | null;
  body: string | null;
  /** The "comment I want to give" marker, mainly for meeting-prep notes. */
  is_comment: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudyNoteFormData {
  note_type: StudyNoteType;
  title: string;
  session_label: string;
  note_date: string;
  scripture_refs: string;
  references_text: string;
  body: string;
  is_comment: boolean;
}

export const STUDY_NOTE_TYPE_LABELS: Record<StudyNoteType, string> = {
  family_worship: "Family Worship",
  midweek_meeting: "Midweek Meeting",
  weekend_meeting: "Weekend Meeting",
  convention: "Convention / Assembly",
  personal_study: "Personal Study",
  other: "Other",
};

export const STUDY_NOTE_TYPES: StudyNoteType[] = [
  "family_worship",
  "midweek_meeting",
  "weekend_meeting",
  "convention",
  "personal_study",
  "other",
];

export const EMPTY_STUDY_NOTE_FORM: StudyNoteFormData = {
  note_type: "family_worship",
  title: "",
  session_label: "",
  note_date: new Date().toISOString().slice(0, 10),
  scripture_refs: "",
  references_text: "",
  body: "",
  is_comment: false,
};

export interface BibleStudyFormData {
  person_id: string;
  publication: string;
  starting_lesson: string;
  current_lesson: string;
  current_lesson_number: number;
  total_lessons: number;
  study_frequency: StudyFrequency;
  preferred_day: string;
  preferred_time: string;
  first_study_date: string;
  next_study_date: string;
  next_study_time: string;
  general_location: string;
  /** Not stored on bible_studies — passed through to update the person's pinned location. */
  location_lat: number | null;
  location_lng: number | null;
  status: BibleStudyStatus;
  preparation_notes: string;
  private_notes: string;
  source_return_visit_id: string;
}

export interface BibleStudySessionFormData {
  bible_study_id: string;
  session_date: string;
  start_lesson: string;
  end_lesson: string;
  topics_discussed: string;
  scriptures_discussed: string;
  questions_raised: string;
  material_completed: string;
  homework: string;
  next_lesson: string;
  next_scheduled_date: string;
  next_scheduled_time: string;
  preparation_notes: string;
  summary: string;
  source: "voice" | "manual";
  transcript: string;
  audio_path: string;
}

export interface StudySessionExtraction {
  start_lesson: string;
  end_lesson: string;
  topics_discussed: string;
  scriptures_discussed: string[];
  questions_raised: string[];
  material_completed: string;
  homework: string;
  next_lesson: string;
  next_scheduled_date: string | null;
  next_scheduled_time: string;
  preparation_notes: string;
  summary: string;
}

/** Canonical AI extraction shape — must match API / Zod schema keys. */
export interface ConversationExtraction {
  person_name: string;
  main_discussion_topic: string;
  scriptures_discussed: string[];
  questions_raised: string[];
  proposed_return_visit_date: string | null;
  proposed_return_visit_time: string;
  /** Original relative phrase (e.g. "next Friday") when resolved. */
  proposed_return_visit_date_phrase?: string;
  next_planned_topic: string;
  general_location: string;
  materials_shared: string[];
  interest_level: InterestLevel | "";
  additional_notes: string;
  summary: string;
}

export interface ConversationFormData {
  person_name: string;
  person_id: string;
  conversation_date: string;
  approximate_time: string;
  general_location: string;
  /** Not stored on conversations — passed through to update the person's pinned location. */
  location_lat: number | null;
  location_lng: number | null;
  how_met: string;
  main_topic: string;
  scriptures: string;
  questions_asked: string;
  concerns_circumstances: string;
  publications_shared: string;
  interest_level: InterestLevel | "";
  promised_follow_up_date: string;
  promised_follow_up_time: string;
  next_topic: string;
  action_required: string;
  additional_notes: string;
  summary: string;
  next_visit_preparation: string;
  schedule_return_visit: boolean;
  keep_audio: boolean;
  transcript: string;
  source: "voice" | "manual";
  session_id: string;
  audio_path: string;
  /**
   * Generated once per form, so saving the same form twice (a retry after a
   * failure, or a double tap) updates the one conversation instead of
   * inserting a duplicate.
   */
  client_id?: string;
}

export const INTEREST_LABELS: Record<InterestLevel, string> = {
  unknown: "Unknown",
  very_low: "Very Low",
  low: "Low",
  moderate: "Moderate",
  high: "High",
  very_high: "Very High",
  bible_study: "⭐ Bible Study",
};

export const MINISTRY_TYPE_LABELS: Record<MinistryType, string> = {
  house_to_house: "House-to-house",
  public_witnessing: "Public witnessing",
  informal_witnessing: "Informal witnessing",
  return_visits: "Return visits",
  bible_studies: "Bible studies",
  letter_writing: "Letter writing",
  telephone_witnessing: "Telephone witnessing",
  other: "Other",
};

export const BIBLE_STUDY_STATUS_LABELS: Record<BibleStudyStatus, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
};

export const STUDY_FREQUENCY_LABELS: Record<StudyFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
  custom: "Custom",
};

export const EMPTY_BIBLE_STUDY_FORM: BibleStudyFormData = {
  person_id: "",
  publication: "",
  starting_lesson: "Lesson 1",
  current_lesson: "Lesson 1",
  current_lesson_number: 1,
  total_lessons: 60,
  study_frequency: "weekly",
  preferred_day: "",
  preferred_time: "",
  first_study_date: "",
  next_study_date: "",
  next_study_time: "",
  general_location: "",
  location_lat: null,
  location_lng: null,
  status: "active",
  preparation_notes: "",
  private_notes: "",
  source_return_visit_id: "",
};

export const EMPTY_STUDY_SESSION_FORM: BibleStudySessionFormData = {
  bible_study_id: "",
  session_date: new Date().toISOString().slice(0, 10),
  start_lesson: "",
  end_lesson: "",
  topics_discussed: "",
  scriptures_discussed: "",
  questions_raised: "",
  material_completed: "",
  homework: "",
  next_lesson: "",
  next_scheduled_date: "",
  next_scheduled_time: "",
  preparation_notes: "",
  summary: "",
  source: "manual",
  transcript: "",
  audio_path: "",
};

export const EMPTY_CONVERSATION_FORM: ConversationFormData = {
  person_name: "",
  person_id: "",
  conversation_date: new Date().toISOString().slice(0, 10),
  approximate_time: "",
  general_location: "",
  location_lat: null,
  location_lng: null,
  how_met: "",
  main_topic: "",
  scriptures: "",
  questions_asked: "",
  concerns_circumstances: "",
  publications_shared: "",
  interest_level: "",
  promised_follow_up_date: "",
  promised_follow_up_time: "",
  next_topic: "",
  action_required: "",
  additional_notes: "",
  summary: "",
  next_visit_preparation: "",
  schedule_return_visit: false,
  keep_audio: false,
  transcript: "",
  source: "manual",
  session_id: "",
  audio_path: "",
};
