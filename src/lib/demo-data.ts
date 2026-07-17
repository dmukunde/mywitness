import type {
  Conversation,
  ConversationScripture,
  MinistrySession,
  Person,
  Reminder,
  ReturnVisit,
} from "./types";
import { todayISO, getNextSaturdayAfternoon } from "./utils";

const DEMO_USER = "demo-user";

export function createDemoData() {
  const today = todayISO();
  const saturday = getNextSaturdayAfternoon();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayISO = yesterday.toISOString().slice(0, 10);
  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);
  const lastWeekISO = lastWeek.toISOString().slice(0, 10);
  const overdue = new Date();
  overdue.setDate(overdue.getDate() - 3);
  const overdueISO = overdue.toISOString().slice(0, 10);
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 5);
  const nextWeekISO = nextWeek.toISOString().slice(0, 10);

  const people: Person[] = [
    {
      id: "demo-person-joan",
      user_id: DEMO_USER,
      name: "Joan",
      general_location: "Near the pharmacy",
      preferred_contact_time: "Saturday afternoon",
      first_met_date: lastWeekISO,
      interest_level: "high",
      current_discussion_theme: "Why God allows suffering",
      key_questions: "Does everyone go to heaven?",
      private_notes: "Recently lost her mother. Soft-spoken and thoughtful.",
      is_demo: true,
      archived_at: null,
      created_at: lastWeek.toISOString(),
      updated_at: yesterday.toISOString(),
    },
    {
      id: "demo-person-marcus",
      user_id: DEMO_USER,
      name: "Marcus",
      general_location: "Park bench on Main Street",
      preferred_contact_time: "Weekday mornings",
      first_met_date: yesterdayISO,
      interest_level: "moderate",
      current_discussion_theme: "Hope for the future",
      key_questions: "Will the earth ever be peaceful?",
      private_notes: "Works nearby. Open to short conversations.",
      is_demo: true,
      archived_at: null,
      created_at: yesterday.toISOString(),
      updated_at: yesterday.toISOString(),
    },
    {
      id: "demo-person-elena",
      user_id: DEMO_USER,
      name: "Elena",
      general_location: "Apartment complex lobby",
      preferred_contact_time: "Tuesday evenings",
      first_met_date: lastWeekISO,
      interest_level: "very_high",
      current_discussion_theme: "God's Kingdom",
      key_questions: "How can I learn more from the Bible?",
      private_notes: "Interested in a regular Bible discussion.",
      is_demo: true,
      archived_at: null,
      created_at: lastWeek.toISOString(),
      updated_at: lastWeek.toISOString(),
    },
  ];

  const joanConversation: Conversation = {
    id: "demo-conv-joan-1",
    user_id: DEMO_USER,
    person_id: "demo-person-joan",
    session_id: null,
    conversation_date: yesterdayISO,
    approximate_time: "Afternoon",
    general_location: "Near the pharmacy",
    how_met: "Informal witnessing while shopping",
    main_topic: "Why God allows suffering",
    questions_asked: "Does everyone go to heaven?",
    concerns_circumstances: "Recently lost her mother",
    publications_shared: "Brochure on why God allows suffering",
    interest_level: "high",
    promised_follow_up_date: saturday.date,
    promised_follow_up_time: "Afternoon",
    next_topic: "God's Kingdom",
    action_required: "Prepare scriptures about God's Kingdom",
    additional_notes: "She listened carefully and asked thoughtful questions.",
    summary:
      "Met Joan near the pharmacy. She recently lost her mother and asked why God allows suffering. We discussed James 1:13 and Revelation 21:3, 4. She also asked whether everyone goes to heaven. A return visit was planned for Saturday afternoon to discuss God's Kingdom.",
    next_visit_preparation:
      "Review scriptures about God's Kingdom and be ready to gently address her question about heaven.",
    source: "manual",
    audio_path: null,
    keep_audio: false,
    transcript: null,
    is_demo: true,
    created_at: yesterday.toISOString(),
    updated_at: yesterday.toISOString(),
  };

  const scriptures: ConversationScripture[] = [
    {
      id: "demo-scripture-1",
      conversation_id: "demo-conv-joan-1",
      user_id: DEMO_USER,
      scripture_reference: "James 1:13",
      created_at: yesterday.toISOString(),
    },
    {
      id: "demo-scripture-2",
      conversation_id: "demo-conv-joan-1",
      user_id: DEMO_USER,
      scripture_reference: "Revelation 21:3, 4",
      created_at: yesterday.toISOString(),
    },
  ];

  const marcusConversation: Conversation = {
    id: "demo-conv-marcus-1",
    user_id: DEMO_USER,
    person_id: "demo-person-marcus",
    session_id: null,
    conversation_date: yesterdayISO,
    approximate_time: "Morning",
    general_location: "Park bench on Main Street",
    how_met: "Public witnessing",
    main_topic: "Hope for the future",
    questions_asked: "Will the earth ever be peaceful?",
    concerns_circumstances: "Worried about world conditions",
    publications_shared: "Short video on hope",
    interest_level: "moderate",
    promised_follow_up_date: nextWeekISO,
    promised_follow_up_time: "Morning",
    next_topic: "A peaceful new world",
    action_required: "",
    additional_notes: "",
    summary:
      "Spoke with Marcus at the park about hope for the future. He asked if the earth will ever be peaceful and watched a short video.",
    next_visit_preparation: "Share scriptures about earth becoming a paradise.",
    source: "manual",
    audio_path: null,
    keep_audio: false,
    transcript: null,
    is_demo: true,
    created_at: yesterday.toISOString(),
    updated_at: yesterday.toISOString(),
  };

  const returnVisits: ReturnVisit[] = [
    {
      id: "demo-rv-joan",
      user_id: DEMO_USER,
      person_id: "demo-person-joan",
      conversation_id: "demo-conv-joan-1",
      scheduled_date: saturday.date === today ? today : saturday.date,
      scheduled_time: "Afternoon",
      status: "planned",
      last_topic: "Why God allows suffering",
      question_to_answer: "Does everyone go to heaven?",
      next_planned_topic: "God's Kingdom",
      general_location: "Near the pharmacy",
      preparation_notes:
        "Review scriptures about God's Kingdom and be ready to gently address her question about heaven.",
      completed_at: null,
      is_demo: true,
      created_at: yesterday.toISOString(),
      updated_at: yesterday.toISOString(),
    },
    {
      id: "demo-rv-marcus",
      user_id: DEMO_USER,
      person_id: "demo-person-marcus",
      conversation_id: "demo-conv-marcus-1",
      scheduled_date: nextWeekISO,
      scheduled_time: "Morning",
      status: "planned",
      last_topic: "Hope for the future",
      question_to_answer: "Will the earth ever be peaceful?",
      next_planned_topic: "A peaceful new world",
      general_location: "Park bench on Main Street",
      preparation_notes: "Share scriptures about earth becoming a paradise.",
      completed_at: null,
      is_demo: true,
      created_at: yesterday.toISOString(),
      updated_at: yesterday.toISOString(),
    },
    {
      id: "demo-rv-elena-overdue",
      user_id: DEMO_USER,
      person_id: "demo-person-elena",
      conversation_id: null,
      scheduled_date: overdueISO,
      scheduled_time: "Evening",
      status: "planned",
      last_topic: "God's Kingdom",
      question_to_answer: "How can I learn more from the Bible?",
      next_planned_topic: "Starting a Bible study",
      general_location: "Apartment complex lobby",
      preparation_notes: "Bring study materials and confirm a regular time.",
      completed_at: null,
      is_demo: true,
      created_at: lastWeek.toISOString(),
      updated_at: lastWeek.toISOString(),
    },
  ];

  const sessions: MinistrySession[] = [
    {
      id: "demo-session-1",
      user_id: DEMO_USER,
      start_time: `${yesterdayISO}T09:00:00.000Z`,
      end_time: `${yesterdayISO}T11:15:00.000Z`,
      duration_minutes: 135,
      session_date: yesterdayISO,
      ministry_type: "public_witnessing",
      companion: null,
      area: "Downtown",
      personal_reflection: "Encouraging conversations. Joan seemed comforted.",
      is_demo: true,
      created_at: yesterday.toISOString(),
      updated_at: yesterday.toISOString(),
    },
  ];

  const reminders: Reminder[] = [
    {
      id: "demo-reminder-1",
      user_id: DEMO_USER,
      return_visit_id: "demo-rv-joan",
      reminder_type: "preparation",
      title: "Prepare for Joan",
      body: "Review God's Kingdom scriptures before Saturday afternoon.",
      due_at: new Date().toISOString(),
      read_at: null,
      dismissed_at: null,
      created_at: new Date().toISOString(),
    },
    {
      id: "demo-reminder-2",
      user_id: DEMO_USER,
      return_visit_id: "demo-rv-elena-overdue",
      reminder_type: "overdue",
      title: "Overdue: Elena",
      body: "Return visit was scheduled a few days ago.",
      due_at: overdue.toISOString(),
      read_at: null,
      dismissed_at: null,
      created_at: overdue.toISOString(),
    },
  ];

  return {
    people,
    conversations: [joanConversation, marcusConversation],
    scriptures,
    returnVisits,
    sessions,
    reminders,
  };
}

export type DemoData = ReturnType<typeof createDemoData>;
