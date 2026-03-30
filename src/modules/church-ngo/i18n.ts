/**
 * WebWaka Civic — Church/NGO Internationalisation
 * Blueprint Reference: Part 9.2 (Africa First — en, yo, ig, ha)
 *
 * Languages:
 * - en: English (default)
 * - yo: Yoruba
 * - ig: Igbo
 * - ha: Hausa
 */

export type Language = "en" | "yo" | "ig" | "ha";

export interface CivicTranslations {
  nav: {
    dashboard: string;
    members: string;
    donations: string;
    pledges: string;
    events: string;
    grants: string;
    announcements: string;
    settings: string;
    analytics: string;
  };
  dashboard: {
    title: string;
    totalMembers: string;
    totalDonations: string;
    activePledges: string;
    upcomingEvents: string;
    recentDonations: string;
    memberGrowth: string;
  };
  members: {
    title: string;
    addMember: string;
    editMember: string;
    memberNumber: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    status: string;
    discipleshipLevel: string;
    department: string;
    joinedDate: string;
    noMembers: string;
    searchPlaceholder: string;
  };
  donations: {
    title: string;
    recordDonation: string;
    amount: string;
    donationType: string;
    paymentMethod: string;
    receiptNumber: string;
    donationDate: string;
    member: string;
    anonymous: string;
    totalDonations: string;
    noDonations: string;
    tithe: string;
    offering: string;
    special: string;
    pledgePayment: string;
    grantIncome: string;
  };
  pledges: {
    title: string;
    createPledge: string;
    totalAmount: string;
    paidAmount: string;
    remainingAmount: string;
    progress: string;
    status: string;
    dueDate: string;
    recordPayment: string;
    noPledges: string;
    active: string;
    fulfilled: string;
    overdue: string;
    cancelled: string;
  };
  events: {
    title: string;
    createEvent: string;
    eventType: string;
    venue: string;
    startTime: string;
    endTime: string;
    attendance: string;
    checkIn: string;
    noEvents: string;
    sundayService: string;
    midweekService: string;
    prayerMeeting: string;
    outreach: string;
    conference: string;
    youthMeeting: string;
  };
  grants: {
    title: string;
    createGrant: string;
    grantor: string;
    totalAmount: string;
    disbursed: string;
    status: string;
    disburse: string;
    noGrants: string;
    draft: string;
    approved: string;
    active: string;
    completed: string;
  };
  common: {
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    view: string;
    search: string;
    filter: string;
    loading: string;
    error: string;
    success: string;
    confirm: string;
    back: string;
    next: string;
    submit: string;
    offline: string;
    syncing: string;
    synced: string;
    ndprConsent: string;
    language: string;
    currency: string;
    date: string;
    amount: string;
    description: string;
    notes: string;
    noData: string;
    required: string;
  };
}

const translations: Record<Language, CivicTranslations> = {
  en: {
    nav: {
      dashboard: "Dashboard",
      members: "Members",
      donations: "Donations",
      pledges: "Pledges",
      events: "Events",
      grants: "Grants",
      announcements: "Announcements",
      settings: "Settings",
      analytics: "Analytics",
    },
    dashboard: {
      title: "Church & NGO Dashboard",
      totalMembers: "Total Members",
      totalDonations: "Total Donations",
      activePledges: "Active Pledges",
      upcomingEvents: "Upcoming Events",
      recentDonations: "Recent Donations",
      memberGrowth: "Member Growth",
    },
    members: {
      title: "Members",
      addMember: "Add Member",
      editMember: "Edit Member",
      memberNumber: "Member No.",
      firstName: "First Name",
      lastName: "Last Name",
      email: "Email",
      phone: "Phone",
      status: "Status",
      discipleshipLevel: "Discipleship Level",
      department: "Department",
      joinedDate: "Joined Date",
      noMembers: "No members found",
      searchPlaceholder: "Search members...",
    },
    donations: {
      title: "Donations",
      recordDonation: "Record Donation",
      amount: "Amount (₦)",
      donationType: "Donation Type",
      paymentMethod: "Payment Method",
      receiptNumber: "Receipt No.",
      donationDate: "Date",
      member: "Member",
      anonymous: "Anonymous",
      totalDonations: "Total Donations",
      noDonations: "No donations recorded",
      tithe: "Tithe",
      offering: "Offering",
      special: "Special Offering",
      pledgePayment: "Pledge Payment",
      grantIncome: "Grant Income",
    },
    pledges: {
      title: "Pledges",
      createPledge: "Create Pledge",
      totalAmount: "Total Amount",
      paidAmount: "Paid",
      remainingAmount: "Remaining",
      progress: "Progress",
      status: "Status",
      dueDate: "Due Date",
      recordPayment: "Record Payment",
      noPledges: "No pledges found",
      active: "Active",
      fulfilled: "Fulfilled",
      overdue: "Overdue",
      cancelled: "Cancelled",
    },
    events: {
      title: "Events",
      createEvent: "Create Event",
      eventType: "Event Type",
      venue: "Venue",
      startTime: "Start Time",
      endTime: "End Time",
      attendance: "Attendance",
      checkIn: "Check In",
      noEvents: "No events scheduled",
      sundayService: "Sunday Service",
      midweekService: "Midweek Service",
      prayerMeeting: "Prayer Meeting",
      outreach: "Outreach",
      conference: "Conference",
      youthMeeting: "Youth Meeting",
    },
    grants: {
      title: "Grants",
      createGrant: "Create Grant",
      grantor: "Grantor",
      totalAmount: "Total Amount",
      disbursed: "Disbursed",
      status: "Status",
      disburse: "Disburse",
      noGrants: "No grants found",
      draft: "Draft",
      approved: "Approved",
      active: "Active",
      completed: "Completed",
    },
    common: {
      save: "Save",
      cancel: "Cancel",
      delete: "Delete",
      edit: "Edit",
      view: "View",
      search: "Search",
      filter: "Filter",
      loading: "Loading...",
      error: "An error occurred",
      success: "Success",
      confirm: "Confirm",
      back: "Back",
      next: "Next",
      submit: "Submit",
      offline: "You are offline. Changes will sync when connected.",
      syncing: "Syncing...",
      synced: "Synced",
      ndprConsent: "I consent to the collection and processing of my personal data in accordance with the Nigeria Data Protection Regulation (NDPR) 2019.",
      language: "Language",
      currency: "Currency",
      date: "Date",
      amount: "Amount",
      description: "Description",
      notes: "Notes",
      noData: "No data available",
      required: "Required",
    },
  },

  yo: {
    nav: {
      dashboard: "Pẹpẹ Iṣakoso",
      members: "Awọn Ọmọ ẹgbẹ",
      donations: "Ẹbọ",
      pledges: "Ileri",
      events: "Awọn Ìṣẹ̀lẹ̀",
      grants: "Àánù",
      announcements: "Àwọn Ìkéde",
      settings: "Ètò",
      analytics: "Ìtúpalẹ̀",
    },
    dashboard: {
      title: "Pẹpẹ Ṣọọṣì & NGO",
      totalMembers: "Àpapọ̀ Ọmọ ẹgbẹ",
      totalDonations: "Àpapọ̀ Ẹbọ",
      activePledges: "Ileri tó ń ṣiṣẹ́",
      upcomingEvents: "Àwọn Ìṣẹ̀lẹ̀ tó ń bọ̀",
      recentDonations: "Ẹbọ Àìpẹ́",
      memberGrowth: "Ìdàgbàsókè Ọmọ ẹgbẹ",
    },
    members: {
      title: "Àwọn Ọmọ ẹgbẹ",
      addMember: "Ṣàfikún Ọmọ ẹgbẹ",
      editMember: "Ṣàtúnṣe Ọmọ ẹgbẹ",
      memberNumber: "Nọ́mbà Ọmọ ẹgbẹ",
      firstName: "Orúkọ Àkọ́kọ́",
      lastName: "Orúkọ Ìdílé",
      email: "Ìmẹ́èlì",
      phone: "Fóònù",
      status: "Ipò",
      discipleshipLevel: "Ìpele Ẹ̀kọ́",
      department: "Ẹ̀ka",
      joinedDate: "Ọjọ́ Ẹgbẹ́",
      noMembers: "Kò sí ọmọ ẹgbẹ",
      searchPlaceholder: "Wá àwọn ọmọ ẹgbẹ...",
    },
    donations: {
      title: "Àwọn Ẹbọ",
      recordDonation: "Gbasilẹ Ẹbọ",
      amount: "Iye (₦)",
      donationType: "Irú Ẹbọ",
      paymentMethod: "Ọ̀nà Ìsanwó",
      receiptNumber: "Nọ́mbà Ìjẹ́rìísí",
      donationDate: "Ọjọ́",
      member: "Ọmọ ẹgbẹ",
      anonymous: "Àìmọ orúkọ",
      totalDonations: "Àpapọ̀ Ẹbọ",
      noDonations: "Kò sí ẹbọ tí a gbasilẹ",
      tithe: "Ìdẹ́wọ̀",
      offering: "Ẹbọ",
      special: "Ẹbọ Pàtàkì",
      pledgePayment: "Ìsanwó Ileri",
      grantIncome: "Owó Àánù",
    },
    pledges: {
      title: "Àwọn Ileri",
      createPledge: "Ṣẹ̀dá Ileri",
      totalAmount: "Iye Àpapọ̀",
      paidAmount: "Ti san",
      remainingAmount: "Tó kù",
      progress: "Ìlọsíwájú",
      status: "Ipò",
      dueDate: "Ọjọ́ Ìpẹ̀rẹ̀",
      recordPayment: "Gbasilẹ Ìsanwó",
      noPledges: "Kò sí ileri",
      active: "Ń ṣiṣẹ́",
      fulfilled: "Ti pé",
      overdue: "Kọjá ọjọ́",
      cancelled: "Fagilé",
    },
    events: {
      title: "Àwọn Ìṣẹ̀lẹ̀",
      createEvent: "Ṣẹ̀dá Ìṣẹ̀lẹ̀",
      eventType: "Irú Ìṣẹ̀lẹ̀",
      venue: "Ibi",
      startTime: "Àkókò Ìbẹ̀rẹ̀",
      endTime: "Àkókò Ìparí",
      attendance: "Ìwọ̀lé",
      checkIn: "Wọlé",
      noEvents: "Kò sí ìṣẹ̀lẹ̀",
      sundayService: "Ìsìn Ọjọ́ Àìkú",
      midweekService: "Ìsìn Àárọ̀ Ọ̀sẹ̀",
      prayerMeeting: "Ìpàdé Àdúrà",
      outreach: "Ìfọwọ́sowọ́pọ̀",
      conference: "Àpéjọpọ̀",
      youthMeeting: "Ìpàdé Ọ̀dọ́",
    },
    grants: {
      title: "Àwọn Àánù",
      createGrant: "Ṣẹ̀dá Àánù",
      grantor: "Olùfúnni",
      totalAmount: "Iye Àpapọ̀",
      disbursed: "Ti pín",
      status: "Ipò",
      disburse: "Pín",
      noGrants: "Kò sí àánù",
      draft: "Àkọ̀wé",
      approved: "Fọwọ́sí",
      active: "Ń ṣiṣẹ́",
      completed: "Parí",
    },
    common: {
      save: "Pamọ́",
      cancel: "Fagilé",
      delete: "Parẹ́",
      edit: "Ṣàtúnṣe",
      view: "Wo",
      search: "Wá",
      filter: "Àlẹ̀",
      loading: "Ń gbéru...",
      error: "Àṣìṣe wà",
      success: "Àṣeyọrí",
      confirm: "Jẹ́rìísí",
      back: "Padà",
      next: "Tẹ̀síwájú",
      submit: "Firanṣẹ́",
      offline: "O kò ní ìsopọ̀. Àwọn ìyípadà yóò fọwọ́sí nígbà tí o bá tún sopọ̀.",
      syncing: "Ń fọwọ́sí...",
      synced: "Ti fọwọ́sí",
      ndprConsent: "Mo gba pẹ̀lú gbígba àti ṣíṣe àlàyé data mi ti ara ẹni gẹ́gẹ́ bí NDPR 2019.",
      language: "Èdè",
      currency: "Owó",
      date: "Ọjọ́",
      amount: "Iye",
      description: "Àpèjúwe",
      notes: "Àwọn Àkọsílẹ̀",
      noData: "Kò sí data",
      required: "Pàtàkì",
    },
  },

  ig: {
    nav: {
      dashboard: "Ọdịdị Njikwa",
      members: "Ndị Otu",
      donations: "Onyinye",
      pledges: "Nkwa",
      events: "Mmemme",
      grants: "Enyemaka",
      announcements: "Mkọwapụta",
      settings: "Ntọala",
      analytics: "Nyocha",
    },
    dashboard: {
      title: "Ọdịdị Chọọchị & NGO",
      totalMembers: "Ọnụọgụ Ndị Otu",
      totalDonations: "Ọnụọgụ Onyinye",
      activePledges: "Nkwa Na-arụ Ọrụ",
      upcomingEvents: "Mmemme Na-abịa",
      recentDonations: "Onyinye Nso",
      memberGrowth: "Uto Ndị Otu",
    },
    members: {
      title: "Ndị Otu",
      addMember: "Tinye Onye Otu",
      editMember: "Dezie Onye Otu",
      memberNumber: "Nọmbà Onye Otu",
      firstName: "Aha Mbụ",
      lastName: "Aha Ezinụlọ",
      email: "Ozi-ozi",
      phone: "Ekwentị",
      status: "Ọnọdụ",
      discipleshipLevel: "Ọkwa Nkuzi",
      department: "Ngalaba",
      joinedDate: "Ụbọchị Ịbanye",
      noMembers: "Enweghị ndị otu",
      searchPlaceholder: "Chọọ ndị otu...",
    },
    donations: {
      title: "Onyinye",
      recordDonation: "Dee Onyinye",
      amount: "Ọnụ ego (₦)",
      donationType: "Ụdị Onyinye",
      paymentMethod: "Ụzọ Ịkwụ Ụgwọ",
      receiptNumber: "Nọmbà Nnata",
      donationDate: "Ụbọchị",
      member: "Onye Otu",
      anonymous: "Onye Amaghị Aha",
      totalDonations: "Ọnụọgụ Onyinye",
      noDonations: "Enweghị onyinye edere",
      tithe: "Ụzọ Iri",
      offering: "Onyinye",
      special: "Onyinye Pụrụ Iche",
      pledgePayment: "Ịkwụ Ụgwọ Nkwa",
      grantIncome: "Ego Enyemaka",
    },
    pledges: {
      title: "Nkwa",
      createPledge: "Mepụta Nkwa",
      totalAmount: "Ọnụọgụ Ego",
      paidAmount: "Akwụọla",
      remainingAmount: "Fọdụrụ",
      progress: "Ọganihu",
      status: "Ọnọdụ",
      dueDate: "Ụbọchị Njedebe",
      recordPayment: "Dee Ịkwụ Ụgwọ",
      noPledges: "Enweghị nkwa",
      active: "Na-arụ Ọrụ",
      fulfilled: "Mezuola",
      overdue: "Gafere Ụbọchị",
      cancelled: "Kagbuola",
    },
    events: {
      title: "Mmemme",
      createEvent: "Mepụta Mmemme",
      eventType: "Ụdị Mmemme",
      venue: "Ebe",
      startTime: "Oge Mmalite",
      endTime: "Oge Njedebe",
      attendance: "Ọbịbịa",
      checkIn: "Banye",
      noEvents: "Enweghị mmemme",
      sundayService: "Ọrụ Ụbọchị Ụka",
      midweekService: "Ọrụ Etiti Izu",
      prayerMeeting: "Nzukọ Ekpere",
      outreach: "Ọrụ Mpụga",
      conference: "Nzukọ Nnukwu",
      youthMeeting: "Nzukọ Ụmụ Okorọ",
    },
    grants: {
      title: "Enyemaka",
      createGrant: "Mepụta Enyemaka",
      grantor: "Onye Na-enye",
      totalAmount: "Ọnụọgụ Ego",
      disbursed: "Ekesela",
      status: "Ọnọdụ",
      disburse: "Kesa",
      noGrants: "Enweghị enyemaka",
      draft: "Ihe Edeputara",
      approved: "Kwenyesịrị",
      active: "Na-arụ Ọrụ",
      completed: "Mechara",
    },
    common: {
      save: "Chekwaa",
      cancel: "Kagbuo",
      delete: "Hichapụ",
      edit: "Dezie",
      view: "Lee",
      search: "Chọọ",
      filter: "Họpụta",
      loading: "Na-ebu...",
      error: "Nsogbu dị",
      success: "Ọ Dị Mma",
      confirm: "Kwenye",
      back: "Laghachi",
      next: "Gaa N'ihu",
      submit: "Zipu",
      offline: "Ị nọ offline. Mgbanwe ga-eme sync mgbe ị jikọọ.",
      syncing: "Na-eme sync...",
      synced: "Emechara sync",
      ndprConsent: "Ekwenyere m na nchịkọta na nhazi nke data nkeonwe m dị ka NDPR 2019.",
      language: "Asụsụ",
      currency: "Ego",
      date: "Ụbọchị",
      amount: "Ọnụ Ego",
      description: "Nkọwa",
      notes: "Ndetu",
      noData: "Enweghị data",
      required: "Dị Mkpa",
    },
  },

  ha: {
    nav: {
      dashboard: "Allon Sarrafa",
      members: "Membobi",
      donations: "Gudummawar",
      pledges: "Alkawari",
      events: "Ayyuka",
      grants: "Tallafi",
      announcements: "Sanarwa",
      settings: "Saituna",
      analytics: "Bincike",
    },
    dashboard: {
      title: "Allon Cocin & NGO",
      totalMembers: "Jimlar Membobi",
      totalDonations: "Jimlar Gudummawar",
      activePledges: "Alkawari Masu Aiki",
      upcomingEvents: "Ayyukan da ke Zuwa",
      recentDonations: "Gudummawar Kwanan Nan",
      memberGrowth: "Karuwar Membobi",
    },
    members: {
      title: "Membobi",
      addMember: "Ƙara Membro",
      editMember: "Gyara Membro",
      memberNumber: "Lambar Membro",
      firstName: "Sunan Farko",
      lastName: "Sunan Iyali",
      email: "Imel",
      phone: "Wayar Hannu",
      status: "Matsayi",
      discipleshipLevel: "Matakin Koyarwa",
      department: "Sashe",
      joinedDate: "Ranar Shiga",
      noMembers: "Ba a sami membro ba",
      searchPlaceholder: "Nemo membobi...",
    },
    donations: {
      title: "Gudummawar",
      recordDonation: "Yi Rikodin Gudummawa",
      amount: "Adadi (₦)",
      donationType: "Nau'in Gudummawa",
      paymentMethod: "Hanyar Biyan Kuɗi",
      receiptNumber: "Lambar Rasiti",
      donationDate: "Kwanan Wata",
      member: "Membro",
      anonymous: "Ba Suna",
      totalDonations: "Jimlar Gudummawar",
      noDonations: "Ba a yi rikodin gudummawa ba",
      tithe: "Zakka",
      offering: "Hadaya",
      special: "Hadaya ta Musamman",
      pledgePayment: "Biyan Alkawari",
      grantIncome: "Kuɗin Tallafi",
    },
    pledges: {
      title: "Alkawari",
      createPledge: "Ƙirƙiri Alkawari",
      totalAmount: "Jimlar Adadi",
      paidAmount: "An Biya",
      remainingAmount: "Sauran",
      progress: "Ci Gaba",
      status: "Matsayi",
      dueDate: "Ranar Ƙarshe",
      recordPayment: "Yi Rikodin Biyan Kuɗi",
      noPledges: "Ba a sami alkawari ba",
      active: "Yana Aiki",
      fulfilled: "An Cika",
      overdue: "Ya Wuce Lokaci",
      cancelled: "An Soke",
    },
    events: {
      title: "Ayyuka",
      createEvent: "Ƙirƙiri Aiki",
      eventType: "Nau'in Aiki",
      venue: "Wuri",
      startTime: "Lokacin Farawa",
      endTime: "Lokacin Ƙarewa",
      attendance: "Halarta",
      checkIn: "Yi Rajista",
      noEvents: "Ba a shirya ayyuka ba",
      sundayService: "Ibada ta Lahadi",
      midweekService: "Ibada ta Tsakiyar Mako",
      prayerMeeting: "Taron Addu'a",
      outreach: "Hidima ga Al'umma",
      conference: "Babban Taro",
      youthMeeting: "Taron Matasa",
    },
    grants: {
      title: "Tallafi",
      createGrant: "Ƙirƙiri Tallafi",
      grantor: "Mai Ba da Tallafi",
      totalAmount: "Jimlar Adadi",
      disbursed: "An Rarraba",
      status: "Matsayi",
      disburse: "Rarraba",
      noGrants: "Ba a sami tallafi ba",
      draft: "Daftari",
      approved: "An Amince",
      active: "Yana Aiki",
      completed: "An Gama",
    },
    common: {
      save: "Ajiye",
      cancel: "Soke",
      delete: "Goge",
      edit: "Gyara",
      view: "Duba",
      search: "Nemo",
      filter: "Tace",
      loading: "Ana Lodi...",
      error: "Akwai Kuskure",
      success: "Ya Yi Nasara",
      confirm: "Tabbatar",
      back: "Koma Baya",
      next: "Ci Gaba",
      submit: "Aika",
      offline: "Kana offline. Canje-canje za su yi sync idan ka sake haɗa.",
      syncing: "Ana Sync...",
      synced: "An Sync",
      ndprConsent: "Na yarda da tattara da sarrafa bayanan sirrina bisa ga NDPR 2019.",
      language: "Harshe",
      currency: "Kuɗi",
      date: "Kwanan Wata",
      amount: "Adadi",
      description: "Bayanin",
      notes: "Bayanan Kula",
      noData: "Babu Bayani",
      required: "Tilas",
    },
  },
};

export function getTranslations(lang: Language): CivicTranslations {
  return translations[lang] ?? translations.en;
}

export function getSupportedLanguages(): Array<{ code: Language; name: string; nativeName: string }> {
  return [
    { code: "en", name: "English", nativeName: "English" },
    { code: "yo", name: "Yoruba", nativeName: "Yorùbá" },
    { code: "ig", name: "Igbo", nativeName: "Igbo" },
    { code: "ha", name: "Hausa", nativeName: "Hausa" },
  ];
}

export const DEFAULT_LANGUAGE: Language = "en";
