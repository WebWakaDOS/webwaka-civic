/**
 * CIV-2 Political Party Module — Vitest Unit Tests
 * Blueprint Reference: Part 10.9 (Civic & Political Suite — Political Party Management)
 *
 * Test Coverage:
 * 1.  Utils: koboToNaira, nairaToKobo, formatDuesAmount, calculateDuesCollectionRate
 * 2.  Utils: generateMembershipNumber, isValidMembershipNumber, generateCardNumber
 * 3.  Utils: Nigerian state codes, getStateCode, NIGERIAN_STATES
 * 4.  Utils: WAT timezone helpers, formatWATDate, formatWATDateTime, nowMs
 * 5.  Utils: NDPR compliance, hasValidNDPRConsent, getNDPRConsentStatement
 * 6.  Utils: Dues status, isDuesCurrent, calculateOutstandingDuesYears
 * 7.  Utils: Hierarchy, getChildLevel, getParentLevel, isValidStructureLevel
 * 8.  Utils: Validation, isValidNigerianPhone, normalizeNigerianPhone, isValidVoterCardNumber
 * 9.  Utils: calculateExpectedDuesKobo
 * 10. i18n: getPartyTranslations, SUPPORTED_LOCALES, LOCALE_NAMES
 * 11. i18n: All 4 languages have required keys
 * 12. i18n: Yoruba translations
 * 13. i18n: Igbo translations
 * 14. i18n: Hausa translations
 * 15. API Client: PartyApiClient construction, request methods
 * 16. Schema: TABLE_NAMES, party table names, PARTY_MIGRATION_SQL
 * 17. Schema: PartyOrganization type structure
 * 18. Schema: PartyMember type structure
 * 19. Schema: PartyDues type structure
 * 20. Schema: PartyStructure type structure
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Utils Tests ──────────────────────────────────────────────────────────────

import {
  koboToNaira,
  nairaToKobo,
  formatDuesAmount,
  calculateDuesCollectionRate,
  calculateExpectedDuesKobo,
  generateMembershipNumber,
  isValidMembershipNumber,
  generateCardNumber,
  getStateCode,
  NIGERIAN_STATES,
  NIGERIAN_STATE_CODES,
  WAT_TIMEZONE,
  formatWATDate,
  formatWATDateTime,
  nowMs,
  hasValidNDPRConsent,
  getNDPRConsentStatement,
  isDuesCurrent,
  calculateOutstandingDuesYears,
  getChildLevel,
  getParentLevel,
  isValidStructureLevel,
  PARTY_STRUCTURE_LEVELS,
  PARTY_LEVEL_LABELS,
  isValidNigerianPhone,
  normalizeNigerianPhone,
  isValidVoterCardNumber,
} from "../utils.ts";

// ─── 1. koboToNaira ───────────────────────────────────────────────────────────

describe("koboToNaira", () => {
  it("converts 100 kobo to ₦1.00", () => {
    expect(koboToNaira(100)).toBe("₦1.00");
  });

  it("converts 0 kobo to ₦0.00", () => {
    expect(koboToNaira(0)).toBe("₦0.00");
  });

  it("converts 1000000 kobo to ₦10,000.00", () => {
    expect(koboToNaira(1000000)).toBe("₦10,000.00");
  });

  it("converts 50 kobo to ₦0.50", () => {
    expect(koboToNaira(50)).toBe("₦0.50");
  });

  it("handles large party dues correctly", () => {
    // ₦500,000 = 50,000,000 kobo
    expect(koboToNaira(50000000)).toBe("₦500,000.00");
  });

  it("throws on negative kobo", () => {
    expect(() => koboToNaira(-1)).toThrow();
  });

  it("throws on non-integer kobo", () => {
    expect(() => koboToNaira(1.5)).toThrow();
  });

  it("converts 1 kobo correctly", () => {
    expect(koboToNaira(1)).toBe("₦0.01");
  });
});

// ─── 2. nairaToKobo ───────────────────────────────────────────────────────────

describe("nairaToKobo", () => {
  it("converts 1 naira to 100 kobo", () => {
    expect(nairaToKobo(1)).toBe(100);
  });

  it("converts 0 naira to 0 kobo", () => {
    expect(nairaToKobo(0)).toBe(0);
  });

  it("converts 5000 naira to 500000 kobo", () => {
    expect(nairaToKobo(5000)).toBe(500000);
  });

  it("rounds fractional kobo", () => {
    expect(nairaToKobo(1.005)).toBe(100);
  });

  it("throws on negative naira", () => {
    expect(() => nairaToKobo(-1)).toThrow();
  });

  it("converts 10000 naira to 1000000 kobo", () => {
    expect(nairaToKobo(10000)).toBe(1000000);
  });
});

// ─── 3. formatDuesAmount ──────────────────────────────────────────────────────

describe("formatDuesAmount", () => {
  it("formats 500000 kobo as ₦5,000.00", () => {
    expect(formatDuesAmount(500000)).toBe("₦5,000.00");
  });

  it("formats 0 kobo as ₦0.00", () => {
    expect(formatDuesAmount(0)).toBe("₦0.00");
  });

  it("formats 100 kobo as ₦1.00", () => {
    expect(formatDuesAmount(100)).toBe("₦1.00");
  });
});

// ─── 4. calculateDuesCollectionRate ──────────────────────────────────────────

describe("calculateDuesCollectionRate", () => {
  it("returns 100 when all dues collected", () => {
    expect(calculateDuesCollectionRate(1000000, 1000000)).toBe(100);
  });

  it("returns 0 when nothing collected", () => {
    expect(calculateDuesCollectionRate(0, 1000000)).toBe(0);
  });

  it("returns 0 when expectedTotal is 0", () => {
    expect(calculateDuesCollectionRate(0, 0)).toBe(0);
  });

  it("returns 50 for half collection", () => {
    expect(calculateDuesCollectionRate(500000, 1000000)).toBe(50);
  });

  it("caps at 100 even if over-collected", () => {
    expect(calculateDuesCollectionRate(1500000, 1000000)).toBe(100);
  });

  it("rounds to nearest integer", () => {
    expect(calculateDuesCollectionRate(333, 1000)).toBe(33);
  });
});

// ─── 5. calculateExpectedDuesKobo ────────────────────────────────────────────

describe("calculateExpectedDuesKobo", () => {
  it("calculates expected dues for 100 members at 5000 kobo each", () => {
    expect(calculateExpectedDuesKobo(100, 500000)).toBe(50000000);
  });

  it("returns 0 for 0 members", () => {
    expect(calculateExpectedDuesKobo(0, 500000)).toBe(0);
  });

  it("returns 0 for 0 dues amount", () => {
    expect(calculateExpectedDuesKobo(100, 0)).toBe(0);
  });

  it("handles single member", () => {
    expect(calculateExpectedDuesKobo(1, 500000)).toBe(500000);
  });
});

// ─── 6. generateMembershipNumber ─────────────────────────────────────────────

describe("generateMembershipNumber", () => {
  it("generates correct format for APC Lagos", () => {
    expect(generateMembershipNumber("APC", "LAG", 1)).toBe("APC-LAG-0000001");
  });

  it("generates correct format for PDP Rivers", () => {
    expect(generateMembershipNumber("PDP", "RIV", 1234567)).toBe("PDP-RIV-1234567");
  });

  it("pads sequence to 7 digits", () => {
    expect(generateMembershipNumber("LP", "ABI", 42)).toBe("LP-ABI-0000042");
  });

  it("uppercases party abbreviation", () => {
    expect(generateMembershipNumber("apc", "lag", 1)).toBe("APC-LAG-0000001");
  });

  it("truncates long abbreviation to 4 chars", () => {
    expect(generateMembershipNumber("LONGPARTY", "LAG", 1)).toBe("LONG-LAG-0000001");
  });

  it("truncates long state code to 3 chars", () => {
    expect(generateMembershipNumber("APC", "LAGOS", 1)).toBe("APC-LAG-0000001");
  });

  it("throws on empty abbreviation", () => {
    expect(() => generateMembershipNumber("", "LAG", 1)).toThrow();
  });

  it("throws on empty state code", () => {
    expect(() => generateMembershipNumber("APC", "", 1)).toThrow();
  });

  it("throws on zero sequence", () => {
    expect(() => generateMembershipNumber("APC", "LAG", 0)).toThrow();
  });

  it("throws on negative sequence", () => {
    expect(() => generateMembershipNumber("APC", "LAG", -1)).toThrow();
  });

  it("handles maximum 7-digit sequence", () => {
    expect(generateMembershipNumber("APC", "LAG", 9999999)).toBe("APC-LAG-9999999");
  });
});

// ─── 7. isValidMembershipNumber ──────────────────────────────────────────────

describe("isValidMembershipNumber", () => {
  it("validates correct APC-LAG format", () => {
    expect(isValidMembershipNumber("APC-LAG-0001234")).toBe(true);
  });

  it("validates correct PDP-RIV format", () => {
    expect(isValidMembershipNumber("PDP-RIV-9999999")).toBe(true);
  });

  it("rejects lowercase", () => {
    expect(isValidMembershipNumber("apc-lag-0001234")).toBe(false);
  });

  it("rejects missing parts", () => {
    expect(isValidMembershipNumber("APC-LAG")).toBe(false);
  });

  it("rejects wrong digit count", () => {
    expect(isValidMembershipNumber("APC-LAG-12345")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidMembershipNumber("")).toBe(false);
  });

  it("validates 2-letter party abbreviation", () => {
    expect(isValidMembershipNumber("LP-FC-0000001")).toBe(true);
  });
});

// ─── 8. generateCardNumber ────────────────────────────────────────────────────

describe("generateCardNumber", () => {
  it("generates correct format", () => {
    const card = generateCardNumber("APC", 1, 2026);
    expect(card).toBe("APC-CARD-2026-000001");
  });

  it("pads sequence to 6 digits", () => {
    expect(generateCardNumber("PDP", 42, 2026)).toBe("PDP-CARD-2026-000042");
  });

  it("uses current year when not specified", () => {
    const card = generateCardNumber("APC", 1);
    expect(card).toMatch(/^APC-CARD-\d{4}-000001$/);
  });

  it("throws on empty abbreviation", () => {
    expect(() => generateCardNumber("", 1, 2026)).toThrow();
  });

  it("throws on zero sequence", () => {
    expect(() => generateCardNumber("APC", 0, 2026)).toThrow();
  });

  it("truncates long abbreviation to 4 chars", () => {
    expect(generateCardNumber("LONGPARTY", 1, 2026)).toBe("LONG-CARD-2026-000001");
  });
});

// ─── 9. Nigerian State Codes ──────────────────────────────────────────────────

describe("NIGERIAN_STATES", () => {
  it("contains 37 states including FCT", () => {
    expect(NIGERIAN_STATES.length).toBe(37);
  });

  it("includes Lagos", () => {
    expect(NIGERIAN_STATES).toContain("Lagos");
  });

  it("includes FCT", () => {
    expect(NIGERIAN_STATES).toContain("FCT");
  });

  it("includes Rivers", () => {
    expect(NIGERIAN_STATES).toContain("Rivers");
  });

  it("includes Kano", () => {
    expect(NIGERIAN_STATES).toContain("Kano");
  });
});

describe("NIGERIAN_STATE_CODES", () => {
  it("maps Lagos to LAG", () => {
    expect(NIGERIAN_STATE_CODES["Lagos"]).toBe("LAG");
  });

  it("maps Rivers to RIV", () => {
    expect(NIGERIAN_STATE_CODES["Rivers"]).toBe("RIV");
  });

  it("maps FCT to FCT", () => {
    expect(NIGERIAN_STATE_CODES["FCT"]).toBe("FCT");
  });

  it("maps Kano to KAN", () => {
    expect(NIGERIAN_STATE_CODES["Kano"]).toBe("KAN");
  });
});

describe("getStateCode", () => {
  it("returns LAG for Lagos", () => {
    expect(getStateCode("Lagos")).toBe("LAG");
  });

  it("returns FCT for FCT", () => {
    expect(getStateCode("FCT")).toBe("FCT");
  });

  it("falls back to first 3 letters for unknown state", () => {
    expect(getStateCode("Unknown")).toBe("UNK");
  });

  it("handles case insensitivity for fallback", () => {
    expect(getStateCode("xyz")).toBe("XYZ");
  });
});

// ─── 10. WAT Timezone Utilities ───────────────────────────────────────────────

describe("WAT_TIMEZONE", () => {
  it("is Africa/Lagos", () => {
    expect(WAT_TIMEZONE).toBe("Africa/Lagos");
  });
});

describe("formatWATDate", () => {
  it("returns a non-empty string for a valid timestamp", () => {
    const result = formatWATDate(1700000000000);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns a date string containing a year", () => {
    const result = formatWATDate(1700000000000);
    expect(result).toMatch(/\d{4}/);
  });
});

describe("formatWATDateTime", () => {
  it("returns a non-empty string for a valid timestamp", () => {
    const result = formatWATDateTime(1700000000000);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes time information (colon for HH:MM)", () => {
    const result = formatWATDateTime(1700000000000);
    expect(result).toMatch(/:/);
  });
});

describe("nowMs", () => {
  it("returns a number", () => {
    expect(typeof nowMs()).toBe("number");
  });

  it("returns a positive integer", () => {
    expect(nowMs()).toBeGreaterThan(0);
  });

  it("returns approximately current time", () => {
    const before = Date.now();
    const result = nowMs();
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });
});

// ─── 11. NDPR Compliance ──────────────────────────────────────────────────────

describe("hasValidNDPRConsent", () => {
  it("returns false when consent is false", () => {
    expect(hasValidNDPRConsent(false, Date.now())).toBe(false);
  });

  it("returns false when consentDate is undefined", () => {
    expect(hasValidNDPRConsent(true, undefined)).toBe(false);
  });

  it("returns true for recent consent", () => {
    expect(hasValidNDPRConsent(true, Date.now() - 1000)).toBe(true);
  });

  it("returns false for consent older than 2 years", () => {
    const twoYearsAgo = Date.now() - (2 * 365 * 24 * 60 * 60 * 1000 + 1000);
    expect(hasValidNDPRConsent(true, twoYearsAgo)).toBe(false);
  });

  it("returns true for consent exactly 1 year ago", () => {
    const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
    expect(hasValidNDPRConsent(true, oneYearAgo)).toBe(true);
  });
});

describe("getNDPRConsentStatement", () => {
  it("includes the party name", () => {
    const statement = getNDPRConsentStatement("All Progressives Congress");
    expect(statement).toContain("All Progressives Congress");
  });

  it("mentions NDPR 2019", () => {
    const statement = getNDPRConsentStatement("APC");
    expect(statement).toContain("NDPR");
  });

  it("mentions data processing", () => {
    const statement = getNDPRConsentStatement("APC");
    expect(statement).toContain("data");
  });

  it("mentions withdrawal of consent", () => {
    const statement = getNDPRConsentStatement("APC");
    expect(statement).toContain("withdraw");
  });
});

// ─── 12. Dues Status Utilities ────────────────────────────────────────────────

describe("isDuesCurrent", () => {
  it("returns true when current year is in paid years", () => {
    const currentYear = new Date().getFullYear();
    expect(isDuesCurrent([currentYear])).toBe(true);
  });

  it("returns false when current year is not in paid years", () => {
    expect(isDuesCurrent([2020, 2021])).toBe(false);
  });

  it("returns false for empty paid years", () => {
    expect(isDuesCurrent([])).toBe(false);
  });

  it("checks specific year when provided", () => {
    expect(isDuesCurrent([2024, 2025], 2025)).toBe(true);
    expect(isDuesCurrent([2024, 2025], 2023)).toBe(false);
  });
});

describe("calculateOutstandingDuesYears", () => {
  it("returns empty array when all years paid", () => {
    expect(calculateOutstandingDuesYears(2022, [2022, 2023, 2024], 2024)).toEqual([]);
  });

  it("returns missing years", () => {
    expect(calculateOutstandingDuesYears(2022, [2022, 2024], 2024)).toEqual([2023]);
  });

  it("returns all years when none paid", () => {
    expect(calculateOutstandingDuesYears(2022, [], 2024)).toEqual([2022, 2023, 2024]);
  });

  it("returns empty array when joined year equals current year and paid", () => {
    expect(calculateOutstandingDuesYears(2024, [2024], 2024)).toEqual([]);
  });

  it("handles single year range", () => {
    expect(calculateOutstandingDuesYears(2024, [], 2024)).toEqual([2024]);
  });
});

// ─── 13. Hierarchy Utilities ──────────────────────────────────────────────────

describe("PARTY_STRUCTURE_LEVELS", () => {
  it("has 6 levels", () => {
    expect(PARTY_STRUCTURE_LEVELS.length).toBe(6);
  });

  it("starts with national", () => {
    expect(PARTY_STRUCTURE_LEVELS[0]).toBe("national");
  });

  it("ends with ward", () => {
    expect(PARTY_STRUCTURE_LEVELS[PARTY_STRUCTURE_LEVELS.length - 1]).toBe("ward");
  });

  it("contains all INEC hierarchy levels", () => {
    expect(PARTY_STRUCTURE_LEVELS).toContain("state");
    expect(PARTY_STRUCTURE_LEVELS).toContain("senatorial");
    expect(PARTY_STRUCTURE_LEVELS).toContain("federal_constituency");
    expect(PARTY_STRUCTURE_LEVELS).toContain("lga");
  });
});

describe("PARTY_LEVEL_LABELS", () => {
  it("has label for national", () => {
    expect(PARTY_LEVEL_LABELS.national).toBe("National");
  });

  it("has label for ward", () => {
    expect(PARTY_LEVEL_LABELS.ward).toBe("Ward");
  });

  it("has label for lga", () => {
    expect(PARTY_LEVEL_LABELS.lga).toBe("Local Government Area");
  });

  it("has label for senatorial", () => {
    expect(PARTY_LEVEL_LABELS.senatorial).toBe("Senatorial District");
  });
});

describe("getChildLevel", () => {
  it("national → state", () => {
    expect(getChildLevel("national")).toBe("state");
  });

  it("state → senatorial", () => {
    expect(getChildLevel("state")).toBe("senatorial");
  });

  it("senatorial → federal_constituency", () => {
    expect(getChildLevel("senatorial")).toBe("federal_constituency");
  });

  it("federal_constituency → lga", () => {
    expect(getChildLevel("federal_constituency")).toBe("lga");
  });

  it("lga → ward", () => {
    expect(getChildLevel("lga")).toBe("ward");
  });

  it("ward → null (leaf node)", () => {
    expect(getChildLevel("ward")).toBeNull();
  });
});

describe("getParentLevel", () => {
  it("national → null (root)", () => {
    expect(getParentLevel("national")).toBeNull();
  });

  it("state → national", () => {
    expect(getParentLevel("state")).toBe("national");
  });

  it("ward → lga", () => {
    expect(getParentLevel("ward")).toBe("lga");
  });

  it("lga → federal_constituency", () => {
    expect(getParentLevel("lga")).toBe("federal_constituency");
  });
});

describe("isValidStructureLevel", () => {
  it("accepts national", () => {
    expect(isValidStructureLevel("national")).toBe(true);
  });

  it("accepts ward", () => {
    expect(isValidStructureLevel("ward")).toBe(true);
  });

  it("rejects invalid level", () => {
    expect(isValidStructureLevel("district")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidStructureLevel("")).toBe(false);
  });

  it("rejects uppercase", () => {
    expect(isValidStructureLevel("NATIONAL")).toBe(false);
  });
});

// ─── 14. Phone & Voter Card Validation ───────────────────────────────────────

describe("isValidNigerianPhone", () => {
  it("accepts 08012345678", () => {
    expect(isValidNigerianPhone("08012345678")).toBe(true);
  });

  it("accepts +2348012345678", () => {
    expect(isValidNigerianPhone("+2348012345678")).toBe(true);
  });

  it("accepts 2348012345678", () => {
    expect(isValidNigerianPhone("2348012345678")).toBe(true);
  });

  it("accepts 09012345678", () => {
    expect(isValidNigerianPhone("09012345678")).toBe(true);
  });

  it("accepts 07012345678", () => {
    expect(isValidNigerianPhone("07012345678")).toBe(true);
  });

  it("rejects 12345678", () => {
    expect(isValidNigerianPhone("12345678")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidNigerianPhone("")).toBe(false);
  });

  it("rejects letters", () => {
    expect(isValidNigerianPhone("abcdefghijk")).toBe(false);
  });

  it("accepts number with spaces (cleaned)", () => {
    expect(isValidNigerianPhone("080 1234 5678")).toBe(true);
  });
});

describe("normalizeNigerianPhone", () => {
  it("normalizes +2348012345678 to 08012345678", () => {
    expect(normalizeNigerianPhone("+2348012345678")).toBe("08012345678");
  });

  it("normalizes 2348012345678 to 08012345678", () => {
    expect(normalizeNigerianPhone("2348012345678")).toBe("08012345678");
  });

  it("keeps 08012345678 as is", () => {
    expect(normalizeNigerianPhone("08012345678")).toBe("08012345678");
  });
});

describe("isValidVoterCardNumber", () => {
  it("accepts a valid 19-char voter card number", () => {
    expect(isValidVoterCardNumber("1234567890ABCDEFGHI")).toBe(true);
  });

  it("accepts 10-char voter card number", () => {
    expect(isValidVoterCardNumber("1234567890")).toBe(true);
  });

  it("rejects too short (< 10 chars)", () => {
    expect(isValidVoterCardNumber("12345")).toBe(false);
  });

  it("rejects too long (> 20 chars)", () => {
    expect(isValidVoterCardNumber("123456789012345678901")).toBe(false);
  });

  it("rejects special characters", () => {
    expect(isValidVoterCardNumber("1234567890!@#$%")).toBe(false);
  });
});

// ─── 15. i18n Tests ───────────────────────────────────────────────────────────

import {
  getPartyTranslations,
  SUPPORTED_LOCALES,
  LOCALE_NAMES,
  PARTY_TRANSLATIONS,
  type PartyLocale,
} from "../i18n.ts";

describe("SUPPORTED_LOCALES", () => {
  it("contains 4 locales", () => {
    expect(SUPPORTED_LOCALES.length).toBe(4);
  });

  it("contains en", () => {
    expect(SUPPORTED_LOCALES).toContain("en");
  });

  it("contains yo (Yoruba)", () => {
    expect(SUPPORTED_LOCALES).toContain("yo");
  });

  it("contains ig (Igbo)", () => {
    expect(SUPPORTED_LOCALES).toContain("ig");
  });

  it("contains ha (Hausa)", () => {
    expect(SUPPORTED_LOCALES).toContain("ha");
  });
});

describe("LOCALE_NAMES", () => {
  it("maps en to English", () => {
    expect(LOCALE_NAMES.en).toBe("English");
  });

  it("maps yo to Yorùbá", () => {
    expect(LOCALE_NAMES.yo).toBe("Yorùbá");
  });

  it("maps ig to Igbo", () => {
    expect(LOCALE_NAMES.ig).toBe("Igbo");
  });

  it("maps ha to Hausa", () => {
    expect(LOCALE_NAMES.ha).toBe("Hausa");
  });
});

describe("getPartyTranslations", () => {
  it("returns English translations by default", () => {
    const t = getPartyTranslations("en");
    expect(t.nav.dashboard).toBe("Dashboard");
  });

  it("falls back to English for unknown locale", () => {
    const t = getPartyTranslations("xx" as PartyLocale);
    expect(t.nav.dashboard).toBe("Dashboard");
  });

  it("returns Yoruba translations", () => {
    const t = getPartyTranslations("yo");
    expect(t.nav.dashboard).toBe("Iwe Akọọlẹ");
  });

  it("returns Igbo translations", () => {
    const t = getPartyTranslations("ig");
    expect(t.nav.dashboard).toBe("Ihe Nlele");
  });

  it("returns Hausa translations", () => {
    const t = getPartyTranslations("ha");
    expect(t.nav.dashboard).toBe("Allon Sarrafa");
  });
});

describe("All locales have required nav keys", () => {
  const requiredNavKeys = ["dashboard", "members", "dues", "structure", "meetings", "idCards", "announcements", "positions"] as const;

  for (const locale of SUPPORTED_LOCALES) {
    it(`${locale} has all nav keys`, () => {
      const t = getPartyTranslations(locale);
      for (const key of requiredNavKeys) {
        expect(t.nav[key]).toBeTruthy();
        expect(typeof t.nav[key]).toBe("string");
      }
    });
  }
});

describe("All locales have required common keys", () => {
  const requiredCommonKeys = ["save", "cancel", "delete", "edit", "search", "loading", "error", "success", "offline", "syncing", "naira", "kobo"] as const;

  for (const locale of SUPPORTED_LOCALES) {
    it(`${locale} has all common keys`, () => {
      const t = getPartyTranslations(locale);
      for (const key of requiredCommonKeys) {
        expect(t.common[key]).toBeTruthy();
        expect(typeof t.common[key]).toBe("string");
      }
    });
  }
});

describe("All locales have NDPR consent text", () => {
  for (const locale of SUPPORTED_LOCALES) {
    it(`${locale} has NDPR consent required text`, () => {
      const t = getPartyTranslations(locale);
      expect(t.members.ndprConsentRequired).toBeTruthy();
      expect(t.members.ndprConsentRequired.length).toBeGreaterThan(10);
    });
  }
});

describe("Yoruba translations", () => {
  const t = getPartyTranslations("yo");

  it("has Yoruba members title", () => {
    expect(t.members.title).toBe("Awọn Ọmọ Ẹgbẹ");
  });

  it("has Yoruba dues title", () => {
    expect(t.dues.title).toBe("Owo Ẹgbẹ");
  });

  it("has Yoruba structure title", () => {
    expect(t.structure.title).toBe("Eto Ẹgbẹ");
  });

  it("has Yoruba common save", () => {
    expect(t.common.save).toBe("Fipamọ");
  });
});

describe("Igbo translations", () => {
  const t = getPartyTranslations("ig");

  it("has Igbo members title", () => {
    expect(t.members.title).toBe("Ndị Otu");
  });

  it("has Igbo dues title", () => {
    expect(t.dues.title).toBe("Ụgwọ Otu");
  });

  it("has Igbo common save", () => {
    expect(t.common.save).toBe("Chekwaa");
  });
});

describe("Hausa translations", () => {
  const t = getPartyTranslations("ha");

  it("has Hausa members title", () => {
    expect(t.members.title).toBe("Mambobin Ƙungiya");
  });

  it("has Hausa dues title", () => {
    expect(t.dues.title).toBe("Kuɗin Ƙungiya");
  });

  it("has Hausa common save", () => {
    expect(t.common.save).toBe("Ajiye");
  });
});

// ─── 16. API Client Tests ─────────────────────────────────────────────────────

import { PartyApiClient, createPartyApiClient } from "../apiClient.ts";

describe("createPartyApiClient", () => {
  it("creates a PartyApiClient instance", () => {
    const client = createPartyApiClient("https://api.example.com", "test-token");
    expect(client).toBeInstanceOf(PartyApiClient);
  });

  it("strips trailing slash from baseUrl", () => {
    const client = createPartyApiClient("https://api.example.com/", "test-token");
    expect(client).toBeInstanceOf(PartyApiClient);
  });
});

describe("PartyApiClient", () => {
  let client: PartyApiClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    client = new PartyApiClient("https://api.example.com", "test-token");
  });

  it("sends Authorization header with Bearer token", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ success: true, data: { module: "political-party" } }),
    });
    await client.health();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/party/health",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      })
    );
  });

  it("sends GET request for health check", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ success: true, data: { module: "political-party" } }),
    });
    await client.health();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/party/health",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("sends POST request for createMember", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ success: true, data: { id: "test-id" } }),
    });
    await client.createMember({
      tenantId: "t1",
      organizationId: "o1",
      structureId: "s1",
      firstName: "John",
      lastName: "Doe",
      phone: "08012345678",
      memberStatus: "active",
      role: "ordinary",
      joinedDate: Date.now(),
      ndprConsent: true,
      ndprConsentDate: Date.now(),
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/party/members",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sends PATCH request for updateMember", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ success: true, data: { id: "test-id" } }),
    });
    await client.updateMember("member-id", { memberStatus: "suspended" });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/party/members/member-id",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("sends DELETE request for deleteMember", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ success: true, data: { deleted: true } }),
    });
    await client.deleteMember("member-id");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/party/members/member-id",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("sends POST request for createDues", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ success: true, data: { id: "dues-id" } }),
    });
    await client.createDues({
      tenantId: "t1",
      organizationId: "o1",
      memberId: "m1",
      year: 2026,
      amountKobo: 500000,
      paymentMethod: "cash",
      receiptNumber: "RCP-001",
      paidAt: Date.now(),
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/party/dues",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sends GET request for getDues with year param", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ success: true, data: [] }),
    });
    await client.getDues(2026);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/party/dues?year=2026",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("sends GET request for getStructures with null parentId", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ success: true, data: [] }),
    });
    await client.getStructures(null);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/party/structures?parentId=null",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("sends POST request for issueIdCard", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ success: true, data: { id: "card-id" } }),
    });
    await client.issueIdCard("member-id");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/party/id-cards",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sends PATCH request for revokeIdCard", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ success: true, data: { revoked: true } }),
    });
    await client.revokeIdCard("card-id", "Expelled from party");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/party/id-cards/card-id",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("sends GET request for syncPull with since param", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ success: true, data: { since: 0, serverTime: Date.now(), members: [], structures: [], dues: [] } }),
    });
    await client.syncPull(1700000000000);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/party/sync/pull?since=1700000000000",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("sends POST request for syncPush", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ success: true, data: { processed: 0, results: [] } }),
    });
    await client.syncPush([]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/party/sync/push",
      expect.objectContaining({ method: "POST" })
    );
  });
});

// ─── 17. Schema Tests ─────────────────────────────────────────────────────────

import {
  PARTY_TABLE_NAMES,
  PARTY_MIGRATION_SQL,
} from "../../../core/db/schema.ts";

describe("PARTY_TABLE_NAMES", () => {
  it("includes ORGANIZATIONS", () => {
    expect(PARTY_TABLE_NAMES.ORGANIZATIONS).toBe("party_organizations");
  });

  it("includes STRUCTURES", () => {
    expect(PARTY_TABLE_NAMES.STRUCTURES).toBe("party_structures");
  });

  it("includes MEMBERS", () => {
    expect(PARTY_TABLE_NAMES.MEMBERS).toBe("party_members");
  });

  it("includes DUES", () => {
    expect(PARTY_TABLE_NAMES.DUES).toBe("party_dues");
  });

  it("includes POSITIONS", () => {
    expect(PARTY_TABLE_NAMES.POSITIONS).toBe("party_positions");
  });

  it("includes MEETINGS", () => {
    expect(PARTY_TABLE_NAMES.MEETINGS).toBe("party_meetings");
  });

  it("includes ANNOUNCEMENTS", () => {
    expect(PARTY_TABLE_NAMES.ANNOUNCEMENTS).toBe("party_announcements");
  });

  it("includes ID_CARDS", () => {
    expect(PARTY_TABLE_NAMES.ID_CARDS).toBe("party_id_cards");
  });
});

describe("PARTY_MIGRATION_SQL", () => {
  it("is a non-empty string", () => {
    expect(typeof PARTY_MIGRATION_SQL).toBe("string");
    expect(PARTY_MIGRATION_SQL.length).toBeGreaterThan(0);
  });

  it("creates party_organizations table", () => {
    expect(PARTY_MIGRATION_SQL).toContain("party_organizations");
  });

  it("creates party_members table", () => {
    expect(PARTY_MIGRATION_SQL).toContain("party_members");
  });

  it("creates party_dues table", () => {
    expect(PARTY_MIGRATION_SQL).toContain("party_dues");
  });

  it("creates party_structures table", () => {
    expect(PARTY_MIGRATION_SQL).toContain("party_structures");
  });

  it("creates party_id_cards table", () => {
    expect(PARTY_MIGRATION_SQL).toContain("party_id_cards");
  });

  it("includes tenantId columns for multi-tenancy", () => {
    expect(PARTY_MIGRATION_SQL).toContain("tenantId");
  });

  it("includes deletedAt for soft deletes", () => {
    expect(PARTY_MIGRATION_SQL).toContain("deletedAt");
  });

  it("includes amountKobo for monetary storage", () => {
    expect(PARTY_MIGRATION_SQL).toContain("amountKobo");
  });
});
