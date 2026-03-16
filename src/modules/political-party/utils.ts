/**
 * WebWaka Civic — CIV-2 Political Party Utilities
 * Blueprint Reference: Part 9.1 (Nigeria First, Africa First)
 * Part 9.2 (Universal Architecture Standards — Monetary Values as Kobo)
 * Part 10.9 (Civic & Political Suite — Political Party Management)
 *
 * Nigeria-specific utilities:
 * - Dues calculations in kobo (Blueprint Part 9.2)
 * - INEC-aligned membership number generation
 * - Nigerian state/LGA/ward hierarchy constants
 * - WAT timezone (Africa/Lagos, UTC+1)
 * - NDPR compliance helpers
 */

// ─── Monetary Utilities (Blueprint Part 9.2 — Kobo Integers) ─────────────────

/**
 * Convert kobo (integer) to Naira display string.
 * Blueprint: All monetary values stored as kobo integers.
 */
export function koboToNaira(kobo: number): string {
  if (!Number.isInteger(kobo) || kobo < 0) {
    throw new Error(`koboToNaira: expected non-negative integer, got ${kobo}`);
  }
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(kobo / 100);
}

/**
 * Convert Naira amount to kobo integer.
 * Rounds to nearest kobo to avoid floating-point errors.
 */
export function nairaToKobo(naira: number): number {
  if (naira < 0) {
    throw new Error(`nairaToKobo: expected non-negative amount, got ${naira}`);
  }
  return Math.round(naira * 100);
}

/**
 * Format kobo as a compact amount for display.
 * E.g., 500000 kobo → "₦5,000.00"
 */
export function formatDuesAmount(kobo: number): string {
  return koboToNaira(kobo);
}

/**
 * Calculate dues collection rate as a percentage.
 * Returns 0 if expectedTotal is 0.
 */
export function calculateDuesCollectionRate(
  collectedKobo: number,
  expectedTotalKobo: number
): number {
  if (expectedTotalKobo === 0) return 0;
  return Math.min(100, Math.round((collectedKobo / expectedTotalKobo) * 100));
}

/**
 * Calculate expected total dues for a given member count and annual dues amount.
 */
export function calculateExpectedDuesKobo(memberCount: number, annualDuesKobo: number): number {
  return memberCount * annualDuesKobo;
}

// ─── Membership Number Utilities ─────────────────────────────────────────────

/**
 * Generate an INEC-aligned party membership number.
 * Format: {PARTY_ABBR}-{STATE_CODE}-{SEQUENCE}
 * Example: APC-LAG-0001234
 *
 * Blueprint Reference: Part 10.9 (Nigeria First — INEC alignment)
 */
export function generateMembershipNumber(
  partyAbbreviation: string,
  stateCode: string,
  sequence: number
): string {
  if (!partyAbbreviation || partyAbbreviation.trim().length === 0) {
    throw new Error("partyAbbreviation is required");
  }
  if (!stateCode || stateCode.trim().length === 0) {
    throw new Error("stateCode is required");
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`sequence must be a positive integer, got ${sequence}`);
  }
  const abbr = partyAbbreviation.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  const code = stateCode.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  const seq = String(sequence).padStart(7, "0");
  return `${abbr}-${code}-${seq}`;
}

/**
 * Validate a party membership number format.
 * Returns true if the number matches the expected format.
 */
export function isValidMembershipNumber(membershipNumber: string): boolean {
  return /^[A-Z]{2,4}-[A-Z]{2,3}-\d{7}$/.test(membershipNumber);
}

/**
 * Generate a party ID card number.
 * Format: {PARTY_ABBR}-CARD-{YEAR}-{SEQUENCE}
 * Example: APC-CARD-2026-000001
 */
export function generateCardNumber(
  partyAbbreviation: string,
  sequence: number,
  year?: number
): string {
  if (!partyAbbreviation || partyAbbreviation.trim().length === 0) {
    throw new Error("partyAbbreviation is required");
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`sequence must be a positive integer, got ${sequence}`);
  }
  const abbr = partyAbbreviation.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  const cardYear = year ?? new Date().getFullYear();
  const seq = String(sequence).padStart(6, "0");
  return `${abbr}-CARD-${cardYear}-${seq}`;
}

// ─── Nigerian Hierarchy Constants ─────────────────────────────────────────────

/**
 * The 6 hierarchical levels of a Nigerian political party structure.
 * Blueprint Reference: Part 10.9 (Nigeria First — INEC hierarchy)
 */
export const PARTY_STRUCTURE_LEVELS = [
  "national",
  "state",
  "senatorial",
  "federal_constituency",
  "lga",
  "ward",
] as const;

export type PartyStructureLevel = typeof PARTY_STRUCTURE_LEVELS[number];

/**
 * Human-readable labels for each hierarchy level.
 */
export const PARTY_LEVEL_LABELS: Record<PartyStructureLevel, string> = {
  national: "National",
  state: "State",
  senatorial: "Senatorial District",
  federal_constituency: "Federal Constituency",
  lga: "Local Government Area",
  ward: "Ward",
};

/**
 * The 36 Nigerian states + FCT (37 total).
 * Blueprint Reference: Part 9.1 (Nigeria First)
 */
export const NIGERIAN_STATES = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "FCT",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
] as const;

export type NigerianState = typeof NIGERIAN_STATES[number];

/**
 * 3-letter state codes for membership number generation.
 */
export const NIGERIAN_STATE_CODES: Record<NigerianState, string> = {
  Abia: "ABI",
  Adamawa: "ADA",
  "Akwa Ibom": "AKW",
  Anambra: "ANA",
  Bauchi: "BAU",
  Bayelsa: "BAY",
  Benue: "BEN",
  Borno: "BOR",
  "Cross River": "CRO",
  Delta: "DEL",
  Ebonyi: "EBO",
  Edo: "EDO",
  Ekiti: "EKI",
  Enugu: "ENU",
  FCT: "FCT",
  Gombe: "GOM",
  Imo: "IMO",
  Jigawa: "JIG",
  Kaduna: "KAD",
  Kano: "KAN",
  Katsina: "KAT",
  Kebbi: "KEB",
  Kogi: "KOG",
  Kwara: "KWA",
  Lagos: "LAG",
  Nasarawa: "NAS",
  Niger: "NIG",
  Ogun: "OGU",
  Ondo: "OND",
  Osun: "OSU",
  Oyo: "OYO",
  Plateau: "PLA",
  Rivers: "RIV",
  Sokoto: "SOK",
  Taraba: "TAR",
  Yobe: "YOB",
  Zamfara: "ZAM",
};

/**
 * Get the 3-letter state code for membership number generation.
 * Falls back to the first 3 letters of the state name if not found.
 */
export function getStateCode(stateName: string): string {
  const code = NIGERIAN_STATE_CODES[stateName as NigerianState];
  if (code) return code;
  return stateName.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
}

// ─── WAT Timezone Utilities ───────────────────────────────────────────────────

/**
 * West Africa Time (WAT) — UTC+1 (Africa/Lagos).
 * Blueprint Reference: Part 9.1 (Nigeria First — WAT timezone)
 */
export const WAT_TIMEZONE = "Africa/Lagos";

/**
 * Format a Unix timestamp (ms) as a WAT datetime string.
 */
export function formatWATDateTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleString("en-NG", {
    timeZone: WAT_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format a Unix timestamp (ms) as a WAT date string only.
 */
export function formatWATDate(timestampMs: number): string {
  return new Date(timestampMs).toLocaleDateString("en-NG", {
    timeZone: WAT_TIMEZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Get the current year in WAT timezone.
 */
export function getCurrentYearWAT(): number {
  return new Date().toLocaleString("en-NG", { timeZone: WAT_TIMEZONE, year: "numeric" }) as unknown as number;
}

/**
 * Get the current Unix timestamp in milliseconds.
 */
export function nowMs(): number {
  return Date.now();
}

// ─── NDPR Compliance Utilities ────────────────────────────────────────────────

/**
 * NDPR (Nigeria Data Protection Regulation) compliance check.
 * Blueprint Reference: Part 9.1 (Nigeria First — NDPR compliance)
 *
 * Returns true if the member has valid NDPR consent.
 */
export function hasValidNDPRConsent(ndprConsent: boolean, ndprConsentDate?: number): boolean {
  if (!ndprConsent) return false;
  if (ndprConsentDate === undefined) return false;
  // Consent is valid if it was given within the last 2 years
  const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;
  return Date.now() - ndprConsentDate < twoYearsMs;
}

/**
 * Generate an NDPR consent statement for display to members.
 */
export function getNDPRConsentStatement(partyName: string): string {
  return (
    `I consent to ${partyName} collecting and processing my personal data ` +
    `(name, contact details, voter card number, photograph) for the purposes of ` +
    `party membership management, dues collection, and official communications. ` +
    `This consent is given in accordance with the Nigeria Data Protection Regulation (NDPR) 2019. ` +
    `I understand I may withdraw consent at any time by contacting the party secretariat.`
  );
}

// ─── Dues Status Utilities ────────────────────────────────────────────────────

/**
 * Check if a member's dues are current for a given year.
 */
export function isDuesCurrent(
  duesPaidYears: number[],
  checkYear: number = new Date().getFullYear()
): boolean {
  return duesPaidYears.includes(checkYear);
}

/**
 * Calculate the number of years a member has outstanding dues.
 */
export function calculateOutstandingDuesYears(
  joinedYear: number,
  paidYears: number[],
  currentYear: number = new Date().getFullYear()
): number[] {
  const outstanding: number[] = [];
  for (let year = joinedYear; year <= currentYear; year++) {
    if (!paidYears.includes(year)) {
      outstanding.push(year);
    }
  }
  return outstanding;
}

// ─── Hierarchy Utilities ──────────────────────────────────────────────────────

/**
 * Get the child level for a given parent level in the Nigerian party hierarchy.
 * Returns null if the level has no children (ward is the leaf node).
 */
export function getChildLevel(level: PartyStructureLevel): PartyStructureLevel | null {
  const index = PARTY_STRUCTURE_LEVELS.indexOf(level);
  if (index === -1 || index === PARTY_STRUCTURE_LEVELS.length - 1) return null;
  return (PARTY_STRUCTURE_LEVELS as readonly string[])[index + 1] as PartyStructureLevel;
}

/**
 * Get the parent level for a given level in the Nigerian party hierarchy.
 * Returns null if the level has no parent (national is the root).
 */
export function getParentLevel(level: PartyStructureLevel): PartyStructureLevel | null {
  const index = PARTY_STRUCTURE_LEVELS.indexOf(level);
  if (index <= 0) return null;
  return (PARTY_STRUCTURE_LEVELS as readonly string[])[index - 1] as PartyStructureLevel;
}

/**
 * Check if a given level is a valid party structure level.
 */
export function isValidStructureLevel(level: string): level is PartyStructureLevel {
  return PARTY_STRUCTURE_LEVELS.includes(level as PartyStructureLevel);
}

// ─── Validation Utilities ─────────────────────────────────────────────────────

/**
 * Validate a Nigerian phone number.
 * Accepts formats: 08012345678, +2348012345678, 2348012345678
 */
export function isValidNigerianPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  return /^(\+234|234|0)[789]\d{9}$/.test(cleaned);
}

/**
 * Normalize a Nigerian phone number to the 080XXXXXXXX format.
 */
export function normalizeNigerianPhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+234")) return "0" + cleaned.slice(4);
  if (cleaned.startsWith("234")) return "0" + cleaned.slice(3);
  return cleaned;
}

/**
 * Validate an INEC voter card number (basic format check).
 * INEC voter cards are typically 19 characters.
 */
export function isValidVoterCardNumber(voterCardNumber: string): boolean {
  return /^[A-Z0-9]{10,20}$/.test(voterCardNumber.toUpperCase().replace(/\s/g, ""));
}
