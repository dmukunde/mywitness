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
  created_at: string;
  updated_at: string;
}

export interface Person {
  id: string;
  user_id: string;
  name: string;
  general_location: string | null;
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

export const EMPTY_CONVERSATION_FORM: ConversationFormData = {
  person_name: "",
  person_id: "",
  conversation_date: new Date().toISOString().slice(0, 10),
  approximate_time: "",
  general_location: "",
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
