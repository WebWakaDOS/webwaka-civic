/**
 * WebWaka Civic — Church/NGO Utility Functions
 * Blueprint Reference: Part 9.2 (Nigeria First, Africa First)
 *
 * Nigeria-first conventions:
 * - All monetary values stored as kobo integers (1 NGN = 100 kobo)
 * - WAT (West Africa Time, UTC+1) as default timezone
 * - NDPR compliance for member data
 */

// ─── ID Generation ────────────────────────────────────────────────────────────

export function generateId(): string {
  return crypto.randomUUID();
}

export function generateReceiptNumber(prefix = "RCT"): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

export function generateMemberNumber(orgCode: string, sequence: number): string {
  const seq = sequence.toString().padStart(5, "0");
  return `${orgCode.toUpperCase().slice(0, 4)}-${seq}`;
}

// ─── Monetary Utilities (Nigeria First — NGN/kobo) ────────────────────────────

/**
 * Convert kobo (integer) to Naira formatted string.
 * Blueprint Part 9.2: All monetary values stored as integers in kobo.
 */
export function koboToNaira(kobo: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(kobo / 100);
}

/**
 * Convert Naira (decimal) to kobo integer for storage.
 * Blueprint Part 9.2: All monetary values stored as integers in kobo.
 */
export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

/**
 * Format amount in any African currency.
 * Africa First: supports NGN, GHS, KES, ZAR, UGX, TZS, ETB, XOF.
 */
export function formatCurrency(amountInSmallestUnit: number, currency: string): string {
  const divisors: Record<string, number> = {
    NGN: 100,
    GHS: 100,
    KES: 100,
    ZAR: 100,
    UGX: 1, // Uganda Shilling has no sub-unit
    TZS: 1, // Tanzania Shilling has no sub-unit
    ETB: 100,
    XOF: 1, // CFA Franc has no sub-unit
  };

  const divisor = divisors[currency] ?? 100;
  const amount = amountInSmallestUnit / divisor;

  const locales: Record<string, string> = {
    NGN: "en-NG",
    GHS: "en-GH",
    KES: "en-KE",
    ZAR: "en-ZA",
    UGX: "en-UG",
    TZS: "en-TZ",
    ETB: "am-ET",
    XOF: "fr-SN",
  };

  const locale = locales[currency] ?? "en-NG";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: divisor === 1 ? 0 : 2,
  }).format(amount);
}

// ─── WAT Timezone Utilities (Nigeria First) ───────────────────────────────────

export const WAT_TIMEZONE = "Africa/Lagos";

/**
 * Format a UTC timestamp for display in WAT (West Africa Time, UTC+1).
 */
export function toWATDisplay(utcTimestamp: number, format: "date" | "time" | "datetime" = "datetime"): string {
  const date = new Date(utcTimestamp);

  const options: Intl.DateTimeFormatOptions = {
    timeZone: WAT_TIMEZONE,
  };

  switch (format) {
    case "date":
      return date.toLocaleDateString("en-NG", { ...options, year: "numeric", month: "long", day: "numeric" });
    case "time":
      return date.toLocaleTimeString("en-NG", { ...options, hour: "2-digit", minute: "2-digit" });
    case "datetime":
    default:
      return date.toLocaleString("en-NG", {
        ...options,
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
  }
}

/**
 * Get the start of today in WAT as a UTC timestamp.
 */
export function getWATStartOfDay(date = new Date()): number {
  const watDate = new Date(date.toLocaleString("en-US", { timeZone: WAT_TIMEZONE }));
  watDate.setHours(0, 0, 0, 0);
  return watDate.getTime();
}

/**
 * Get the start of the current month in WAT as a UTC timestamp.
 */
export function getWATStartOfMonth(date = new Date()): number {
  const watDate = new Date(date.toLocaleString("en-US", { timeZone: WAT_TIMEZONE }));
  watDate.setDate(1);
  watDate.setHours(0, 0, 0, 0);
  return watDate.getTime();
}

// ─── Nigerian States ──────────────────────────────────────────────────────────

export const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa",
  "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo",
  "Ekiti", "Enugu", "FCT", "Gombe", "Imo", "Jigawa",
  "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara",
  "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun",
  "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
] as const;

export type NigerianState = (typeof NIGERIAN_STATES)[number];

// ─── Organization Types ───────────────────────────────────────────────────────

export const ORG_TYPES = [
  { value: "church", label: "Church" },
  { value: "mosque", label: "Mosque" },
  { value: "synagogue", label: "Synagogue" },
  { value: "ngo", label: "NGO" },
  { value: "charity", label: "Charity" },
  { value: "foundation", label: "Foundation" },
  { value: "other", label: "Other" },
] as const;

// ─── Donation Types ───────────────────────────────────────────────────────────

export const DONATION_TYPES = [
  { value: "tithe", label: "Tithe" },
  { value: "offering", label: "Offering" },
  { value: "special", label: "Special Offering" },
  { value: "pledge_payment", label: "Pledge Payment" },
  { value: "grant_income", label: "Grant Income" },
  { value: "other", label: "Other" },
] as const;

// ─── Event Types ──────────────────────────────────────────────────────────────

export const EVENT_TYPES = [
  { value: "sunday_service", label: "Sunday Service" },
  { value: "midweek_service", label: "Midweek Service" },
  { value: "prayer_meeting", label: "Prayer Meeting" },
  { value: "outreach", label: "Outreach" },
  { value: "conference", label: "Conference" },
  { value: "youth_meeting", label: "Youth Meeting" },
  { value: "womens_meeting", label: "Women's Meeting" },
  { value: "mens_meeting", label: "Men's Meeting" },
  { value: "general_meeting", label: "General Meeting" },
  { value: "other", label: "Other" },
] as const;

// ─── Discipleship Levels ──────────────────────────────────────────────────────

export const DISCIPLESHIP_LEVELS = [
  { value: "new_convert", label: "New Convert" },
  { value: "growing", label: "Growing" },
  { value: "mature", label: "Mature" },
  { value: "leader", label: "Leader" },
  { value: "minister", label: "Minister" },
  { value: "not_applicable", label: "Not Applicable" },
] as const;

// ─── Member Status ────────────────────────────────────────────────────────────

export const MEMBER_STATUSES = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "deceased", label: "Deceased" },
  { value: "transferred", label: "Transferred" },
] as const;

// ─── NDPR Compliance ──────────────────────────────────────────────────────────

export const NDPR_CONSENT_VERSION = "1.0";

export const NDPR_CONSENT_TEXT = `By registering, you consent to the collection and processing of your personal data in accordance with the Nigeria Data Protection Regulation (NDPR) 2019. Your data will be used solely for church/organization management purposes and will not be shared with third parties without your explicit consent. You have the right to access, correct, or delete your personal data at any time.`;

// ─── Payment Methods ──────────────────────────────────────────────────────────

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "pos", label: "POS Terminal" },
  { value: "paystack", label: "Paystack" },
  { value: "flutterwave", label: "Flutterwave" },
  { value: "ussd", label: "USSD" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
] as const;

// ─── Pledge Status ────────────────────────────────────────────────────────────

export const PLEDGE_STATUSES = [
  { value: "active", label: "Active" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "cancelled", label: "Cancelled" },
  { value: "overdue", label: "Overdue" },
] as const;

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePhoneNumber(phone: string): ValidationResult {
  // Empty string is valid — phone is an optional field
  if (phone.trim() === "") return { valid: true };
  // Nigerian phone number: 11 digits starting with 0, or +234 followed by 10 digits
  const nigerianPhone = /^(0[7-9][0-1]\d{8}|\+234[7-9][0-1]\d{8})$/;
  if (!nigerianPhone.test(phone.replace(/\s/g, ""))) {
    return { valid: false, error: "Invalid Nigerian phone number format (e.g., 08012345678)" };
  }
  return { valid: true };
}

/**
 * Format a membership number with organization prefix and zero-padded sequence.
 * Nigeria First: used for church/NGO member IDs.
 */
export function formatMembershipNumber(prefix: string, sequence: number): string {
  const padded = String(sequence).padStart(4, "0");
  return `${prefix.toUpperCase()}-${padded}`;
}

export function validateEmail(email: string): ValidationResult {
  // Empty string is valid — email is an optional field
  if (email.trim() === "") return { valid: true };
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: "Invalid email address" };
  }
  return { valid: true };
}

export function validateAmountKobo(amountKobo: number): ValidationResult {
  if (!Number.isInteger(amountKobo)) {
    return { valid: false, error: "Amount must be an integer (kobo)" };
  }
  if (amountKobo <= 0) {
    return { valid: false, error: "Amount must be greater than zero" };
  }
  if (amountKobo > 100_000_000_00) {
    // Max 1 billion NGN
    return { valid: false, error: "Amount exceeds maximum allowed value" };
  }
  return { valid: true };
}

// ─── Pledge Progress ──────────────────────────────────────────────────────────

export function getPledgeProgress(paidKobo: number, totalKobo: number): number {
  if (totalKobo === 0) return 0;
  return Math.min(100, Math.round((paidKobo / totalKobo) * 100));
}

export function getPledgeRemainingKobo(paidKobo: number, totalKobo: number): number {
  return Math.max(0, totalKobo - paidKobo);
}
