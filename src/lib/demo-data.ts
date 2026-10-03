import type {
  Area,
  BibleStudy,
  BibleStudySession,
  Conversation,
  ConversationScripture,
  MinistrySession,
  Person,
  PersonPhoto,
  Reminder,
  ReturnVisit,
  ScheduledMinistryEvent,
  StudyNote,
} from "./types";
import { todayISO, getNextSaturdayAfternoon } from "./utils";

const DEMO_USER = "demo-user";

function eventsFromReturnVisits(
  returnVisits: ReturnVisit[]
): ScheduledMinistryEvent[] {
  return returnVisits.map((rv) => ({
    id: `demo-event-rv-${rv.id}`,
    user_id: DEMO_USER,
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
    is_demo: true,
    created_at: rv.created_at,
    updated_at: rv.updated_at,
  }));
}

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

  // Next Tuesday 10:00 for Mary conversion testing
  const tuesday = new Date();
  const day = tuesday.getDay();
  const daysUntilTue = (2 - day + 7) % 7 || 7;
  tuesday.setDate(tuesday.getDate() + daysUntilTue);
  const tuesdayISO = tuesday.toISOString().slice(0, 10);

  const people: Person[] = [
    {
      id: "demo-person-joan",
      user_id: DEMO_USER,
      name: "Joan",
      general_location: "Near the pharmacy",
      location_lat: null,
      location_lng: null,
      area_id: "demo-area-kiwatule",
      phone_number: "0772123456",
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
      location_lat: null,
      location_lng: null,
      area_id: "demo-area-ntinda",
      phone_number: null,
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
      location_lat: null,
      location_lng: null,
      area_id: "demo-area-naalya",
      phone_number: "+256701234567",
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
    {
      id: "demo-person-mary",
      user_id: DEMO_USER,
      name: "Mary",
      general_location: "Oak Street apartments",
      location_lat: null,
      location_lng: null,
      area_id: "demo-area-kiwatule",
      phone_number: null,
      preferred_contact_time: "Tuesday mornings",
      first_met_date: lastWeekISO,
      interest_level: "very_high",
      current_discussion_theme: "What the Bible teaches",
      key_questions: "Can we study the Bible together?",
      private_notes: "Ready to begin a regular Bible study.",
      is_demo: true,
      archived_at: null,
      created_at: lastWeek.toISOString(),
      updated_at: yesterday.toISOString(),
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

  const maryConversation: Conversation = {
    id: "demo-conv-mary-1",
    user_id: DEMO_USER,
    person_id: "demo-person-mary",
    session_id: null,
    conversation_date: yesterdayISO,
    approximate_time: "Morning",
    general_location: "Oak Street apartments",
    how_met: "Return visit",
    main_topic: "What the Bible teaches",
    questions_asked: "Can we study the Bible together?",
    concerns_circumstances: null,
    publications_shared: "Enjoy Life Forever! brochure",
    interest_level: "very_high",
    promised_follow_up_date: tuesdayISO,
    promised_follow_up_time: "10:00 AM",
    next_topic: "Starting Lesson 1",
    action_required: "Bring study publication",
    additional_notes: "",
    summary:
      "Visited Mary. She asked if we can study the Bible together and is ready to begin Enjoy Life Forever!",
    next_visit_preparation: "Prepare Lesson 1 and confirm Tuesday 10:00 AM.",
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
    {
      id: "demo-rv-mary",
      user_id: DEMO_USER,
      person_id: "demo-person-mary",
      conversation_id: "demo-conv-mary-1",
      scheduled_date: tuesdayISO,
      scheduled_time: "10:00 AM",
      status: "planned",
      last_topic: "What the Bible teaches",
      question_to_answer: "Can we study the Bible together?",
      next_planned_topic: "Starting Lesson 1",
      general_location: "Oak Street apartments",
      preparation_notes: "Bring Enjoy Life Forever! and prepare Lesson 1.",
      completed_at: null,
      is_demo: true,
      created_at: yesterday.toISOString(),
      updated_at: yesterday.toISOString(),
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
      source: "manual",
      is_demo: true,
      created_at: yesterday.toISOString(),
      updated_at: yesterday.toISOString(),
    },
  ];

  const areas: Area[] = [
    {
      id: "demo-area-kiwatule",
      user_id: DEMO_USER,
      name: "Kiwatule",
      landmark_notes: null,
      map_link: null,
      location_lat: null,
      location_lng: null,
      created_at: lastWeek.toISOString(),
      updated_at: lastWeek.toISOString(),
    },
    {
      id: "demo-area-ntinda",
      user_id: DEMO_USER,
      name: "Ntinda",
      landmark_notes: null,
      map_link: null,
      location_lat: null,
      location_lng: null,
      created_at: lastWeek.toISOString(),
      updated_at: lastWeek.toISOString(),
    },
    {
      id: "demo-area-naalya",
      user_id: DEMO_USER,
      name: "Naalya",
      landmark_notes: null,
      map_link: null,
      location_lat: null,
      location_lng: null,
      created_at: lastWeek.toISOString(),
      updated_at: lastWeek.toISOString(),
    },
  ];

  const personPhotos: PersonPhoto[] = [];

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

  const bibleStudies: BibleStudy[] = [];
  const studySessions: BibleStudySession[] = [];
  const ministryEvents = eventsFromReturnVisits(returnVisits);

  const studyNotes: StudyNote[] = [
    {
      id: "demo-note-family-worship",
      user_id: DEMO_USER,
      note_type: "family_worship",
      title: "What can we learn from Paul's example?",
      session_label: null,
      note_date: lastWeekISO,
      scripture_refs: "Acts 20:20\n1 Corinthians 9:22, 23",
      references_text: "https://www.jw.org",
      body: "Paul adapted his approach for each audience while staying focused on the good news.\n\nThings we want to discuss:\n- How can we do this in our own ministry?\n\nPersonal application:\n- Be more flexible in how we start conversations.",
      is_comment: false,
      archived_at: null,
      created_at: lastWeek.toISOString(),
      updated_at: lastWeek.toISOString(),
    },
    {
      id: "demo-note-weekend-comment",
      user_id: DEMO_USER,
      note_type: "weekend_meeting",
      title: "Watchtower Study",
      session_label: "Paragraph 7",
      note_date: yesterdayISO,
      scripture_refs: "Romans 12:12",
      references_text: null,
      body: "Key point: endurance comes from hope.\n\nMy comment: sharing how staying hopeful helped during a hard week at work.",
      is_comment: true,
      archived_at: null,
      created_at: yesterday.toISOString(),
      updated_at: yesterday.toISOString(),
    },
  ];

  return {
    people,
    conversations: [joanConversation, marcusConversation, maryConversation],
    scriptures,
    returnVisits,
    sessions,
    reminders,
    bibleStudies,
    studySessions,
    ministryEvents,
    areas,
    personPhotos,
    studyNotes,
  };
}

export type DemoData = ReturnType<typeof createDemoData>;

/** Upgrade older localStorage demo payloads that predate Bible Studies / Areas / Photos. */
export function normalizeDemoData(raw: Partial<DemoData> | null | undefined): DemoData {
  const fresh = createDemoData();
  if (!raw) return fresh;
  const returnVisits = raw.returnVisits || fresh.returnVisits;
  return {
    people: raw.people?.length ? raw.people : fresh.people,
    conversations: raw.conversations || fresh.conversations,
    scriptures: raw.scriptures || fresh.scriptures,
    returnVisits,
    sessions: raw.sessions || fresh.sessions,
    reminders: raw.reminders || fresh.reminders,
    bibleStudies: raw.bibleStudies || [],
    studySessions: raw.studySessions || [],
    ministryEvents:
      raw.ministryEvents?.length
        ? raw.ministryEvents
        : eventsFromReturnVisits(returnVisits),
    areas: raw.areas || fresh.areas,
    personPhotos: raw.personPhotos || [],
    studyNotes: raw.studyNotes || [],
  };
}
