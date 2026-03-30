/**
 * WebWaka Civic — CIV-2 Political Party i18n Translations
 * Blueprint Reference: Part 9.1 (Africa First — en/yo/ig/ha)
 * Part 10.9 (Civic & Political Suite — Political Party Management)
 *
 * Languages:
 * - en: English (default)
 * - yo: Yoruba (Southwest Nigeria)
 * - ig: Igbo (Southeast Nigeria)
 * - ha: Hausa (Northern Nigeria)
 *
 * Nigeria-specific terms are translated with cultural accuracy.
 */

export type PartyLocale = "en" | "yo" | "ig" | "ha";

export interface PartyTranslations {
  nav: {
    dashboard: string;
    members: string;
    dues: string;
    structure: string;
    meetings: string;
    idCards: string;
    announcements: string;
    positions: string;
    nominations: string;
    campaignFinance: string;
    analytics: string;
  };
  dashboard: {
    title: string;
    totalMembers: string;
    activeMembers: string;
    duesCollected: string;
    currentYearDues: string;
    totalStructures: string;
    upcomingMeetings: string;
    recentAnnouncements: string;
    noData: string;
  };
  members: {
    title: string;
    registerMember: string;
    membershipNumber: string;
    firstName: string;
    lastName: string;
    middleName: string;
    phone: string;
    email: string;
    address: string;
    state: string;
    lga: string;
    ward: string;
    voterCard: string;
    memberStatus: string;
    role: string;
    joinedDate: string;
    ndprConsent: string;
    ndprConsentRequired: string;
    statusActive: string;
    statusSuspended: string;
    statusExpelled: string;
    statusDeceased: string;
    statusResigned: string;
    roleOrdinary: string;
    roleDelegate: string;
    roleExecutive: string;
    roleChairman: string;
    roleSecretary: string;
    roleTreasurer: string;
    roleYouthLeader: string;
    roleWomenLeader: string;
    searchPlaceholder: string;
    noMembers: string;
    viewProfile: string;
    editMember: string;
  };
  dues: {
    title: string;
    recordPayment: string;
    year: string;
    amount: string;
    paymentMethod: string;
    receiptNumber: string;
    paidDate: string;
    collectedBy: string;
    notes: string;
    methodCash: string;
    methodBankTransfer: string;
    methodPOS: string;
    methodMobileMoney: string;
    methodOnline: string;
    summary: string;
    totalCollected: string;
    paymentCount: string;
    noDues: string;
    duesHistory: string;
  };
  structure: {
    title: string;
    addStructure: string;
    level: string;
    levelNational: string;
    levelState: string;
    levelSenatorial: string;
    levelFederalConstituency: string;
    levelLGA: string;
    levelWard: string;
    name: string;
    code: string;
    chairperson: string;
    secretary: string;
    children: string;
    noStructures: string;
    drillDown: string;
    backToParent: string;
  };
  meetings: {
    title: string;
    scheduleMeeting: string;
    meetingTitle: string;
    meetingType: string;
    venue: string;
    scheduledAt: string;
    attendeeCount: string;
    minutes: string;
    typeExecutive: string;
    typeWard: string;
    typeState: string;
    typeNational: string;
    typeEmergency: string;
    typeCongress: string;
    typeConvention: string;
    noMeetings: string;
    upcoming: string;
    past: string;
  };
  idCards: {
    title: string;
    issueCard: string;
    cardNumber: string;
    issuedDate: string;
    expiresDate: string;
    status: string;
    statusActive: string;
    statusRevoked: string;
    revokeCard: string;
    revokeReason: string;
    noCard: string;
    downloadCard: string;
  };
  announcements: {
    title: string;
    createAnnouncement: string;
    announcementTitle: string;
    content: string;
    priority: string;
    priorityNormal: string;
    priorityUrgent: string;
    priorityCritical: string;
    publishedAt: string;
    expiresAt: string;
    noAnnouncements: string;
  };
  common: {
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    search: string;
    filter: string;
    loading: string;
    error: string;
    success: string;
    confirm: string;
    back: string;
    next: string;
    previous: string;
    page: string;
    of: string;
    total: string;
    actions: string;
    view: string;
    create: string;
    update: string;
    required: string;
    optional: string;
    yes: string;
    no: string;
    close: string;
    refresh: string;
    offline: string;
    syncing: string;
    synced: string;
    naira: string;
    kobo: string;
  };
}

const en: PartyTranslations = {
  nav: {
    dashboard: "Dashboard",
    members: "Members",
    dues: "Dues",
    structure: "Structure",
    meetings: "Meetings",
    idCards: "ID Cards",
    announcements: "Announcements",
    positions: "Positions",
    nominations: "Nominations",
    campaignFinance: "Finance",
    analytics: "Analytics",
  },
  dashboard: {
    title: "Party Dashboard",
    totalMembers: "Total Members",
    activeMembers: "Active Members",
    duesCollected: "Total Dues Collected",
    currentYearDues: "Current Year Dues",
    totalStructures: "Total Structures",
    upcomingMeetings: "Upcoming Meetings",
    recentAnnouncements: "Recent Announcements",
    noData: "No data available",
  },
  members: {
    title: "Party Members",
    registerMember: "Register Member",
    membershipNumber: "Membership Number",
    firstName: "First Name",
    lastName: "Last Name",
    middleName: "Middle Name",
    phone: "Phone Number",
    email: "Email Address",
    address: "Home Address",
    state: "State",
    lga: "Local Government Area",
    ward: "Ward",
    voterCard: "Voter Card Number",
    memberStatus: "Member Status",
    role: "Party Role",
    joinedDate: "Date Joined",
    ndprConsent: "NDPR Consent",
    ndprConsentRequired: "Member must consent to data processing under NDPR before registration",
    statusActive: "Active",
    statusSuspended: "Suspended",
    statusExpelled: "Expelled",
    statusDeceased: "Deceased",
    statusResigned: "Resigned",
    roleOrdinary: "Ordinary Member",
    roleDelegate: "Delegate",
    roleExecutive: "Executive",
    roleChairman: "Chairman",
    roleSecretary: "Secretary",
    roleTreasurer: "Treasurer",
    roleYouthLeader: "Youth Leader",
    roleWomenLeader: "Women Leader",
    searchPlaceholder: "Search by name, phone, or membership number",
    noMembers: "No members found",
    viewProfile: "View Profile",
    editMember: "Edit Member",
  },
  dues: {
    title: "Party Dues",
    recordPayment: "Record Payment",
    year: "Year",
    amount: "Amount (₦)",
    paymentMethod: "Payment Method",
    receiptNumber: "Receipt Number",
    paidDate: "Date Paid",
    collectedBy: "Collected By",
    notes: "Notes",
    methodCash: "Cash",
    methodBankTransfer: "Bank Transfer",
    methodPOS: "POS Terminal",
    methodMobileMoney: "Mobile Money",
    methodOnline: "Online Payment",
    summary: "Dues Summary",
    totalCollected: "Total Collected",
    paymentCount: "Number of Payments",
    noDues: "No dues records found",
    duesHistory: "Dues History",
  },
  structure: {
    title: "Party Structure",
    addStructure: "Add Structure",
    level: "Level",
    levelNational: "National",
    levelState: "State",
    levelSenatorial: "Senatorial District",
    levelFederalConstituency: "Federal Constituency",
    levelLGA: "Local Government Area",
    levelWard: "Ward",
    name: "Structure Name",
    code: "INEC Code",
    chairperson: "Chairperson",
    secretary: "Secretary",
    children: "Sub-Structures",
    noStructures: "No structures found",
    drillDown: "View Sub-Structures",
    backToParent: "Back to Parent",
  },
  meetings: {
    title: "Party Meetings",
    scheduleMeeting: "Schedule Meeting",
    meetingTitle: "Meeting Title",
    meetingType: "Meeting Type",
    venue: "Venue",
    scheduledAt: "Scheduled Date & Time",
    attendeeCount: "Number of Attendees",
    minutes: "Meeting Minutes",
    typeExecutive: "Executive Meeting",
    typeWard: "Ward Meeting",
    typeState: "State Meeting",
    typeNational: "National Meeting",
    typeEmergency: "Emergency Meeting",
    typeCongress: "Congress",
    typeConvention: "Convention",
    noMeetings: "No meetings found",
    upcoming: "Upcoming",
    past: "Past",
  },
  idCards: {
    title: "Membership ID Cards",
    issueCard: "Issue ID Card",
    cardNumber: "Card Number",
    issuedDate: "Date Issued",
    expiresDate: "Expiry Date",
    status: "Card Status",
    statusActive: "Active",
    statusRevoked: "Revoked",
    revokeCard: "Revoke Card",
    revokeReason: "Reason for Revocation",
    noCard: "No active ID card",
    downloadCard: "Download Card",
  },
  announcements: {
    title: "Party Announcements",
    createAnnouncement: "Create Announcement",
    announcementTitle: "Title",
    content: "Content",
    priority: "Priority",
    priorityNormal: "Normal",
    priorityUrgent: "Urgent",
    priorityCritical: "Critical",
    publishedAt: "Published Date",
    expiresAt: "Expiry Date",
    noAnnouncements: "No announcements",
  },
  common: {
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    search: "Search",
    filter: "Filter",
    loading: "Loading...",
    error: "An error occurred",
    success: "Success",
    confirm: "Confirm",
    back: "Back",
    next: "Next",
    previous: "Previous",
    page: "Page",
    of: "of",
    total: "Total",
    actions: "Actions",
    view: "View",
    create: "Create",
    update: "Update",
    required: "Required",
    optional: "Optional",
    yes: "Yes",
    no: "No",
    close: "Close",
    refresh: "Refresh",
    offline: "Offline",
    syncing: "Syncing...",
    synced: "Synced",
    naira: "Naira",
    kobo: "Kobo",
  },
};

const yo: PartyTranslations = {
  nav: {
    dashboard: "Iwe Akọọlẹ",
    members: "Awọn Ọmọ Ẹgbẹ",
    dues: "Owo Ẹgbẹ",
    structure: "Eto Ẹgbẹ",
    meetings: "Ipade",
    idCards: "Kaadi Idanimọ",
    announcements: "Awọn Ikede",
    positions: "Awọn Ipo",
    nominations: "Awọn Yiyan",
    campaignFinance: "Owó Ìdibo",
    analytics: "Ìtúpalẹ",
  },
  dashboard: {
    title: "Iwe Akọọlẹ Ẹgbẹ",
    totalMembers: "Apapọ Awọn Ọmọ Ẹgbẹ",
    activeMembers: "Awọn Ọmọ Ẹgbẹ Ti Nṣiṣẹ",
    duesCollected: "Apapọ Owo Ẹgbẹ Ti A Gba",
    currentYearDues: "Owo Ẹgbẹ Ọdun Yii",
    totalStructures: "Apapọ Awọn Ẹka",
    upcomingMeetings: "Awọn Ipade Ti Mbọ",
    recentAnnouncements: "Awọn Ikede Laipẹ",
    noData: "Ko si data",
  },
  members: {
    title: "Awọn Ọmọ Ẹgbẹ",
    registerMember: "Forukọsilẹ Ọmọ Ẹgbẹ",
    membershipNumber: "Nọmba Ọmọ Ẹgbẹ",
    firstName: "Orukọ Akọkọ",
    lastName: "Orukọ Idile",
    middleName: "Orukọ Aarin",
    phone: "Nọmba Foonu",
    email: "Adirẹsi Imeeli",
    address: "Adirẹsi Ile",
    state: "Ipinlẹ",
    lga: "Agbegbe Ijoba Ibilẹ",
    ward: "Agbegbe",
    voterCard: "Nọmba Kaadi Idibo",
    memberStatus: "Ipo Ọmọ Ẹgbẹ",
    role: "Ipa Ninu Ẹgbẹ",
    joinedDate: "Ọjọ Ti O Darapọ",
    ndprConsent: "Igbanilaaye NDPR",
    ndprConsentRequired: "Ọmọ ẹgbẹ gbọdọ gba igbanilaaye fun sisẹ data labẹ NDPR ṣaaju iforukọsilẹ",
    statusActive: "Nṣiṣẹ",
    statusSuspended: "Ti Daduro",
    statusExpelled: "Ti Lepa Jade",
    statusDeceased: "Ti Kú",
    statusResigned: "Ti Yọ Ara Rẹ Kuro",
    roleOrdinary: "Ọmọ Ẹgbẹ Lasan",
    roleDelegate: "Aṣoju",
    roleExecutive: "Alase",
    roleChairman: "Alaga",
    roleSecretary: "Akọwe",
    roleTreasurer: "Akọwe Inawo",
    roleYouthLeader: "Olori Ọdọ",
    roleWomenLeader: "Olori Awọn Obinrin",
    searchPlaceholder: "Wa nipasẹ orukọ, foonu, tabi nọmba ọmọ ẹgbẹ",
    noMembers: "Ko si awọn ọmọ ẹgbẹ",
    viewProfile: "Wo Profaili",
    editMember: "Ṣatunkọ Ọmọ Ẹgbẹ",
  },
  dues: {
    title: "Owo Ẹgbẹ",
    recordPayment: "Gbasilẹ Isanwo",
    year: "Ọdun",
    amount: "Iye Owo (₦)",
    paymentMethod: "Ọna Isanwo",
    receiptNumber: "Nọmba Gbangba",
    paidDate: "Ọjọ Isanwo",
    collectedBy: "Ti A Gba Nipasẹ",
    notes: "Akọsilẹ",
    methodCash: "Owo Ọwọ",
    methodBankTransfer: "Gbigbe Banki",
    methodPOS: "Ẹrọ POS",
    methodMobileMoney: "Owo Foonu",
    methodOnline: "Isanwo Ori Ayelujara",
    summary: "Akopọ Owo Ẹgbẹ",
    totalCollected: "Apapọ Ti A Gba",
    paymentCount: "Nọmba Awọn Isanwo",
    noDues: "Ko si awọn igbasilẹ owo ẹgbẹ",
    duesHistory: "Itan Owo Ẹgbẹ",
  },
  structure: {
    title: "Eto Ẹgbẹ",
    addStructure: "Fi Ẹka Kun",
    level: "Ipele",
    levelNational: "Orilẹ-ede",
    levelState: "Ipinlẹ",
    levelSenatorial: "Agbegbe Alagba",
    levelFederalConstituency: "Agbegbe Aṣofin",
    levelLGA: "Agbegbe Ijoba Ibilẹ",
    levelWard: "Agbegbe",
    name: "Orukọ Ẹka",
    code: "Koodu INEC",
    chairperson: "Alaga",
    secretary: "Akọwe",
    children: "Awọn Ẹka Kekere",
    noStructures: "Ko si awọn ẹka",
    drillDown: "Wo Awọn Ẹka Kekere",
    backToParent: "Pada si Ẹka Agba",
  },
  meetings: {
    title: "Awọn Ipade Ẹgbẹ",
    scheduleMeeting: "Ṣeto Ipade",
    meetingTitle: "Akọle Ipade",
    meetingType: "Iru Ipade",
    venue: "Ibi Ipade",
    scheduledAt: "Ọjọ ati Akoko Ipade",
    attendeeCount: "Nọmba Awọn Olukopa",
    minutes: "Akọsilẹ Ipade",
    typeExecutive: "Ipade Alase",
    typeWard: "Ipade Agbegbe",
    typeState: "Ipade Ipinlẹ",
    typeNational: "Ipade Orilẹ-ede",
    typeEmergency: "Ipade Pajawiri",
    typeCongress: "Apejọ",
    typeConvention: "Apejọ Nla",
    noMeetings: "Ko si awọn ipade",
    upcoming: "Ti Mbọ",
    past: "Ti Kọja",
  },
  idCards: {
    title: "Awọn Kaadi Idanimọ Ọmọ Ẹgbẹ",
    issueCard: "Fi Kaadi Jade",
    cardNumber: "Nọmba Kaadi",
    issuedDate: "Ọjọ Ti A Fi Jade",
    expiresDate: "Ọjọ Ipari",
    status: "Ipo Kaadi",
    statusActive: "Nṣiṣẹ",
    statusRevoked: "Ti Fagile",
    revokeCard: "Fagile Kaadi",
    revokeReason: "Idi Fun Ifagile",
    noCard: "Ko si kaadi idanimọ ti nṣiṣẹ",
    downloadCard: "Gba Kaadi",
  },
  announcements: {
    title: "Awọn Ikede Ẹgbẹ",
    createAnnouncement: "Ṣẹda Ikede",
    announcementTitle: "Akọle",
    content: "Akoonu",
    priority: "Pataki",
    priorityNormal: "Deede",
    priorityUrgent: "Kiakia",
    priorityCritical: "Pataki Pupọ",
    publishedAt: "Ọjọ Ikede",
    expiresAt: "Ọjọ Ipari",
    noAnnouncements: "Ko si awọn ikede",
  },
  common: {
    save: "Fipamọ",
    cancel: "Fagile",
    delete: "Pa",
    edit: "Ṣatunkọ",
    search: "Wa",
    filter: "Ṣe àlẹmọ",
    loading: "Nkojọpọ...",
    error: "Aṣiṣe kan waye",
    success: "Aṣeyọri",
    confirm: "Jẹrisi",
    back: "Pada",
    next: "Tẹle",
    previous: "Ṣaaju",
    page: "Oju-iwe",
    of: "ti",
    total: "Apapọ",
    actions: "Awọn Iṣe",
    view: "Wo",
    create: "Ṣẹda",
    update: "Ṣe imudojuiwọn",
    required: "Pataki",
    optional: "Aṣayan",
    yes: "Bẹẹni",
    no: "Rara",
    close: "Pa",
    refresh: "Tun ṣe",
    offline: "Laisi Intanẹẹti",
    syncing: "Nṣiṣẹpọ...",
    synced: "Ti Siṣẹpọ",
    naira: "Naira",
    kobo: "Kobo",
  },
};

const ig: PartyTranslations = {
  nav: {
    dashboard: "Ihe Nlele",
    members: "Ndị Otu",
    dues: "Ụgwọ Otu",
    structure: "Usoro Otu",
    meetings: "Nzukọ",
    idCards: "Kaadị Njirimara",
    announcements: "Ọkwa",
    positions: "Ọkwa Ọrụ",
    nominations: "Nhọrọ Onye",
    campaignFinance: "Ego Mkpọsa",
    analytics: "Nyocha",
  },
  dashboard: {
    title: "Ihe Nlele Otu",
    totalMembers: "Ọnụọgụ Ndị Otu",
    activeMembers: "Ndị Otu Na-arụ Ọrụ",
    duesCollected: "Ụgwọ Otu Niile Ejikọtara",
    currentYearDues: "Ụgwọ Otu Afọ A",
    totalStructures: "Ọnụọgụ Usoro",
    upcomingMeetings: "Nzukọ Na-abịa",
    recentAnnouncements: "Ọkwa Nke Ọhụrụ",
    noData: "Enweghị data",
  },
  members: {
    title: "Ndị Otu",
    registerMember: "Debanye Onye Otu",
    membershipNumber: "Nọmba Ndị Otu",
    firstName: "Aha Mbụ",
    lastName: "Aha Ụmụnnà",
    middleName: "Aha Etiti",
    phone: "Nọmba Ekwentị",
    email: "Adreesị Imeeli",
    address: "Adreesị Ụlọ",
    state: "Steeti",
    lga: "Ọchịchị Obodo",
    ward: "Ogbe",
    voterCard: "Nọmba Kaadị Ntuli Aka",
    memberStatus: "Ọnọdụ Onye Otu",
    role: "Ọrụ Na Otu",
    joinedDate: "Ụbọchị Isonye",
    ndprConsent: "Nkwenye NDPR",
    ndprConsentRequired: "Onye otu kwesịrị inye nkwenye maka nhazi data n'okpuru NDPR tupu odebanye aha",
    statusActive: "Na-arụ Ọrụ",
    statusSuspended: "Akwụsịrị",
    statusExpelled: "Achụpụrụ",
    statusDeceased: "Anwụọla",
    statusResigned: "Ahapụrụ",
    roleOrdinary: "Onye Otu Nkịtị",
    roleDelegate: "Onye Nnọchiteanya",
    roleExecutive: "Onye Ọchịchị",
    roleChairman: "Onye Isi",
    roleSecretary: "Odeakwụkwọ",
    roleTreasurer: "Onye Nlekọta Ego",
    roleYouthLeader: "Onye Isi Ndị Ọcha",
    roleWomenLeader: "Onye Isi Ụmụ Nwanyị",
    searchPlaceholder: "Chọọ site na aha, ekwentị, ma ọ bụ nọmba ndị otu",
    noMembers: "Enweghị ndị otu",
    viewProfile: "Lee Profaịlụ",
    editMember: "Dezie Onye Otu",
  },
  dues: {
    title: "Ụgwọ Otu",
    recordPayment: "Debanye Ịkwụ Ụgwọ",
    year: "Afọ",
    amount: "Ego (₦)",
    paymentMethod: "Ụzọ Ịkwụ Ụgwọ",
    receiptNumber: "Nọmba Ọkwa Ịkwụ Ụgwọ",
    paidDate: "Ụbọchị Ịkwụ Ụgwọ",
    collectedBy: "Onye Natara",
    notes: "Ndetu",
    methodCash: "Ego Aka",
    methodBankTransfer: "Nnyefe Ụlọ Akụ",
    methodPOS: "Igwe POS",
    methodMobileMoney: "Ego Ekwentị",
    methodOnline: "Ịkwụ Ụgwọ Na Ntanetị",
    summary: "Nchịkọta Ụgwọ Otu",
    totalCollected: "Ụgwọ Niile Ejikọtara",
    paymentCount: "Ọnụọgụ Ịkwụ Ụgwọ",
    noDues: "Enweghị ndekọ ụgwọ otu",
    duesHistory: "Akụkọ Ụgwọ Otu",
  },
  structure: {
    title: "Usoro Otu",
    addStructure: "Tinye Usoro",
    level: "Ọkwa",
    levelNational: "Mba",
    levelState: "Steeti",
    levelSenatorial: "Mpaghara Senetọ",
    levelFederalConstituency: "Mpaghara Nzukọ Ọha",
    levelLGA: "Ọchịchị Obodo",
    levelWard: "Ogbe",
    name: "Aha Usoro",
    code: "Koodu INEC",
    chairperson: "Onye Isi",
    secretary: "Odeakwụkwọ",
    children: "Usoro Ndị Ọzọ",
    noStructures: "Enweghị usoro",
    drillDown: "Lee Usoro Ndị Ọzọ",
    backToParent: "Laghachi Na Usoro Isi",
  },
  meetings: {
    title: "Nzukọ Otu",
    scheduleMeeting: "Hazie Nzukọ",
    meetingTitle: "Aha Nzukọ",
    meetingType: "Ụdị Nzukọ",
    venue: "Ebe Nzukọ",
    scheduledAt: "Ụbọchị na Oge Nzukọ",
    attendeeCount: "Ọnụọgụ Ndị Ọbịa",
    minutes: "Ndekọ Nzukọ",
    typeExecutive: "Nzukọ Ọchịchị",
    typeWard: "Nzukọ Ogbe",
    typeState: "Nzukọ Steeti",
    typeNational: "Nzukọ Mba",
    typeEmergency: "Nzukọ Mberede",
    typeCongress: "Nzukọ Ọha",
    typeConvention: "Nzukọ Ukwu",
    noMeetings: "Enweghị nzukọ",
    upcoming: "Na-abịa",
    past: "Gara Aga",
  },
  idCards: {
    title: "Kaadị Njirimara Ndị Otu",
    issueCard: "Nyefee Kaadị",
    cardNumber: "Nọmba Kaadị",
    issuedDate: "Ụbọchị Inye",
    expiresDate: "Ụbọchị Ọgwụgwụ",
    status: "Ọnọdụ Kaadị",
    statusActive: "Na-arụ Ọrụ",
    statusRevoked: "Ewepụtara",
    revokeCard: "Wepu Kaadị",
    revokeReason: "Ihe Kpatara Iwepụ",
    noCard: "Enweghị kaadị njirimara na-arụ ọrụ",
    downloadCard: "Budata Kaadị",
  },
  announcements: {
    title: "Ọkwa Otu",
    createAnnouncement: "Mepụta Ọkwa",
    announcementTitle: "Aha",
    content: "Ọdịnaya",
    priority: "Mkpa",
    priorityNormal: "Nkịtị",
    priorityUrgent: "Ọsọ Ọsọ",
    priorityCritical: "Dị Mkpa Nke Ukwuu",
    publishedAt: "Ụbọchị Ọkwa",
    expiresAt: "Ụbọchị Ọgwụgwụ",
    noAnnouncements: "Enweghị ọkwa",
  },
  common: {
    save: "Chekwaa",
    cancel: "Kagbuo",
    delete: "Hichapụ",
    edit: "Dezie",
    search: "Chọọ",
    filter: "Họpụta",
    loading: "Na-ebudata...",
    error: "Nsogbu mere",
    success: "Ọ Dị Mma",
    confirm: "Kwenye",
    back: "Laghachi",
    next: "Ọzọ",
    previous: "Gara Aga",
    page: "Ibe",
    of: "nke",
    total: "Niile",
    actions: "Omume",
    view: "Lee",
    create: "Mepụta",
    update: "Melite",
    required: "Dị Mkpa",
    optional: "Nhọrọ",
    yes: "Ee",
    no: "Mba",
    close: "Mechie",
    refresh: "Mee Ọhụrụ",
    offline: "Enweghị Ntanetị",
    syncing: "Na-emekọ ihe...",
    synced: "Emekọrọ Ihe",
    naira: "Naira",
    kobo: "Kobo",
  },
};

const ha: PartyTranslations = {
  nav: {
    dashboard: "Allon Sarrafa",
    members: "Mambobi",
    dues: "Kuɗin Ƙungiya",
    structure: "Tsarin Ƙungiya",
    meetings: "Tarurruka",
    idCards: "Katin Shaida",
    announcements: "Sanarwa",
    positions: "Mukamai",
    nominations: "Zaɓe",
    campaignFinance: "Kuɗin Yaƙi",
    analytics: "Bincike",
  },
  dashboard: {
    title: "Allon Sarrafa Ƙungiya",
    totalMembers: "Jimlar Mambobi",
    activeMembers: "Mambobin Da Ke Aiki",
    duesCollected: "Jimlar Kuɗin Ƙungiya Da Aka Tattara",
    currentYearDues: "Kuɗin Ƙungiya Na Wannan Shekara",
    totalStructures: "Jimlar Rassa",
    upcomingMeetings: "Tarurrukan Da Ke Zuwa",
    recentAnnouncements: "Sanarwar Kwanan Nan",
    noData: "Babu bayani",
  },
  members: {
    title: "Mambobin Ƙungiya",
    registerMember: "Yi Rajista",
    membershipNumber: "Lambar Mamba",
    firstName: "Sunan Farko",
    lastName: "Sunan Iyali",
    middleName: "Sunan Tsakiya",
    phone: "Lambar Waya",
    email: "Adireshin Imel",
    address: "Adireshin Gida",
    state: "Jiha",
    lga: "Hukumar Yanki",
    ward: "Unguwa",
    voterCard: "Lambar Katin Zabe",
    memberStatus: "Matsayin Mamba",
    role: "Rawa A Ƙungiya",
    joinedDate: "Ranar Shiga",
    ndprConsent: "Yarda NDPR",
    ndprConsentRequired: "Dole mamba ya ba da izini don sarrafa bayanan a ƙarƙashin NDPR kafin rajista",
    statusActive: "Yana Aiki",
    statusSuspended: "An Dakatar",
    statusExpelled: "An Kore",
    statusDeceased: "Ya Mutu",
    statusResigned: "Ya Yi Murabus",
    roleOrdinary: "Mamba Na Yau Da Kullum",
    roleDelegate: "Wakili",
    roleExecutive: "Jami'in Zartarwa",
    roleChairman: "Shugaba",
    roleSecretary: "Sakatare",
    roleTreasurer: "Mai Kula Da Kudi",
    roleYouthLeader: "Shugaban Matasa",
    roleWomenLeader: "Shugabar Mata",
    searchPlaceholder: "Nema ta suna, waya, ko lambar mamba",
    noMembers: "Babu mambobi",
    viewProfile: "Duba Bayani",
    editMember: "Gyara Mamba",
  },
  dues: {
    title: "Kuɗin Ƙungiya",
    recordPayment: "Yi Rikodin Biyan Kuɗi",
    year: "Shekara",
    amount: "Adadin Kuɗi (₦)",
    paymentMethod: "Hanyar Biyan Kuɗi",
    receiptNumber: "Lambar Rasit",
    paidDate: "Ranar Biya",
    collectedBy: "Wanda Ya Karɓa",
    notes: "Bayani",
    methodCash: "Kuɗi A Hannu",
    methodBankTransfer: "Canja Banki",
    methodPOS: "Na'urar POS",
    methodMobileMoney: "Kuɗin Waya",
    methodOnline: "Biyan Kuɗi Ta Intanet",
    summary: "Taƙaitaccen Kuɗin Ƙungiya",
    totalCollected: "Jimlar Da Aka Tattara",
    paymentCount: "Adadin Biyan Kuɗi",
    noDues: "Babu rikodin kuɗin ƙungiya",
    duesHistory: "Tarihin Kuɗin Ƙungiya",
  },
  structure: {
    title: "Tsarin Ƙungiya",
    addStructure: "Ƙara Reshe",
    level: "Matakin",
    levelNational: "Ƙasa",
    levelState: "Jiha",
    levelSenatorial: "Yankin Majalisar Dattawa",
    levelFederalConstituency: "Yankin Majalisar Wakilai",
    levelLGA: "Hukumar Yanki",
    levelWard: "Unguwa",
    name: "Sunan Reshe",
    code: "Lambar INEC",
    chairperson: "Shugaba",
    secretary: "Sakatare",
    children: "Rassa Ƙanana",
    noStructures: "Babu rassa",
    drillDown: "Duba Rassa Ƙanana",
    backToParent: "Koma Ga Reshe Na Sama",
  },
  meetings: {
    title: "Tarurrukan Ƙungiya",
    scheduleMeeting: "Shirya Taro",
    meetingTitle: "Taken Taro",
    meetingType: "Nau'in Taro",
    venue: "Wurin Taro",
    scheduledAt: "Ranar Da Lokacin Taro",
    attendeeCount: "Adadin Masu Halartar",
    minutes: "Rikodin Taro",
    typeExecutive: "Taron Zartarwa",
    typeWard: "Taron Unguwa",
    typeState: "Taron Jiha",
    typeNational: "Taron Ƙasa",
    typeEmergency: "Taron Gaggawa",
    typeCongress: "Babban Taro",
    typeConvention: "Babban Taron Ƙungiya",
    noMeetings: "Babu tarurruka",
    upcoming: "Da Ke Zuwa",
    past: "Da Ya Wuce",
  },
  idCards: {
    title: "Katin Shaida Na Mambobi",
    issueCard: "Bayar Da Kati",
    cardNumber: "Lambar Kati",
    issuedDate: "Ranar Bayarwa",
    expiresDate: "Ranar Ƙarewa",
    status: "Matsayin Kati",
    statusActive: "Yana Aiki",
    statusRevoked: "An Soke",
    revokeCard: "Soke Kati",
    revokeReason: "Dalilin Sokewa",
    noCard: "Babu katin shaida mai aiki",
    downloadCard: "Zazzage Kati",
  },
  announcements: {
    title: "Sanarwar Ƙungiya",
    createAnnouncement: "Ƙirƙiri Sanarwa",
    announcementTitle: "Take",
    content: "Abun Ciki",
    priority: "Muhimmanci",
    priorityNormal: "Na Yau Da Kullum",
    priorityUrgent: "Mai Gaggawa",
    priorityCritical: "Mai Muhimmanci Sosai",
    publishedAt: "Ranar Sanarwa",
    expiresAt: "Ranar Ƙarewa",
    noAnnouncements: "Babu sanarwa",
  },
  common: {
    save: "Ajiye",
    cancel: "Soke",
    delete: "Goge",
    edit: "Gyara",
    search: "Nema",
    filter: "Tace",
    loading: "Ana Lodi...",
    error: "Kuskure Ya Faru",
    success: "An Yi Nasara",
    confirm: "Tabbatar",
    back: "Koma",
    next: "Gaba",
    previous: "Baya",
    page: "Shafi",
    of: "na",
    total: "Jimla",
    actions: "Ayyuka",
    view: "Duba",
    create: "Ƙirƙira",
    update: "Sabunta",
    required: "Wajibi",
    optional: "Zaɓi",
    yes: "Eh",
    no: "A'a",
    close: "Rufe",
    refresh: "Sabunta",
    offline: "Ba Intanet",
    syncing: "Ana Haɗawa...",
    synced: "An Haɗa",
    naira: "Naira",
    kobo: "Kobo",
  },
};

export const PARTY_TRANSLATIONS: Record<PartyLocale, PartyTranslations> = { en, yo, ig, ha };

export function getPartyTranslations(locale: PartyLocale = "en"): PartyTranslations {
  return PARTY_TRANSLATIONS[locale] ?? PARTY_TRANSLATIONS.en;
}

export const SUPPORTED_LOCALES: PartyLocale[] = ["en", "yo", "ig", "ha"];

export const LOCALE_NAMES: Record<PartyLocale, string> = {
  en: "English",
  yo: "Yorùbá",
  ig: "Igbo",
  ha: "Hausa",
};
