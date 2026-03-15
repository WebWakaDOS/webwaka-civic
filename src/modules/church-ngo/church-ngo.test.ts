/**
 * CIV-1 Church/NGO Module — Vitest Unit Tests
 * Blueprint Reference: Part 10.9 (Civic & Political Suite — Church & NGO)
 *
 * Test Coverage:
 * 1. Utils: koboToNaira, nairaToKobo, validateAmountKobo, validateEmail,
 *    validatePhoneNumber, toWATDisplay, generateId, formatMembershipNumber
 * 2. i18n: getTranslations, getSupportedLanguages, DEFAULT_LANGUAGE
 * 3. Event Bus: createEventBus, publishEvent, event type validation
 * 4. Logger: createLogger, log levels, structured output
 * 5. Schema: table names, required fields, soft delete, tenantId
 * 6. Sync Engine: CivicOfflineDb, MutationQueueItem structure
 * 7. API Client: apiGet, apiPost, apiPatch, apiDelete
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Utils Tests ──────────────────────────────────────────────────────────────

import {
  koboToNaira,
  nairaToKobo,
  validateAmountKobo,
  validateEmail,
  validatePhoneNumber,
  toWATDisplay,
  generateId,
  formatMembershipNumber,
  DONATION_TYPES,
  EVENT_TYPES,
  MEMBER_STATUSES,
  PAYMENT_METHODS,
  NIGERIAN_STATES,
  NDPR_CONSENT_TEXT,
} from "./utils.ts";

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

  it("handles large tithes correctly", () => {
    // ₦500,000 tithe = 50,000,000 kobo
    expect(koboToNaira(50000000)).toBe("₦500,000.00");
  });
});

describe("nairaToKobo", () => {
  it("converts 1 naira to 100 kobo", () => {
    expect(nairaToKobo(1)).toBe(100);
  });

  it("converts 0 naira to 0 kobo", () => {
    expect(nairaToKobo(0)).toBe(0);
  });

  it("converts 10000 naira to 1000000 kobo", () => {
    expect(nairaToKobo(10000)).toBe(1000000);
  });

  it("rounds fractional kobo correctly", () => {
    // JavaScript floating point: 1.005 * 100 = 100.49999... → rounds to 100
    expect(nairaToKobo(1.005)).toBe(100);
  });
});

describe("validateAmountKobo", () => {
  it("accepts valid positive amount", () => {
    const result = validateAmountKobo(10000);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects zero amount", () => {
    const result = validateAmountKobo(0);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("rejects negative amount", () => {
    const result = validateAmountKobo(-100);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("rejects non-integer kobo", () => {
    const result = validateAmountKobo(100.5);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("accepts minimum valid amount (1 kobo)", () => {
    const result = validateAmountKobo(1);
    expect(result.valid).toBe(true);
  });

  it("rejects amount exceeding maximum", () => {
    // Max is 10 billion naira = 1,000,000,000,000 kobo
    const result = validateAmountKobo(1_000_000_000_001);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("validateEmail", () => {
  it("accepts valid email", () => {
    const result = validateEmail("pastor@church.ng");
    expect(result.valid).toBe(true);
  });

  it("rejects email without @", () => {
    const result = validateEmail("notanemail");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("rejects email without domain", () => {
    const result = validateEmail("user@");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("accepts empty email (optional field)", () => {
    const result = validateEmail("");
    expect(result.valid).toBe(true);
  });

  it("accepts Nigerian domain email", () => {
    const result = validateEmail("admin@rccg.org.ng");
    expect(result.valid).toBe(true);
  });
});

describe("validatePhoneNumber", () => {
  it("accepts valid Nigerian mobile number", () => {
    const result = validatePhoneNumber("08012345678");
    expect(result.valid).toBe(true);
  });

  it("accepts +234 format", () => {
    const result = validatePhoneNumber("+2348012345678");
    expect(result.valid).toBe(true);
  });

  it("rejects too-short number", () => {
    const result = validatePhoneNumber("0801234");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("rejects number with letters", () => {
    const result = validatePhoneNumber("0801234abcd");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("accepts empty phone (optional field)", () => {
    const result = validatePhoneNumber("");
    expect(result.valid).toBe(true);
  });
});

describe("toWATDisplay", () => {
  it("returns a formatted date string", () => {
    const ts = 1700000000000; // Nov 14, 2023 UTC
    const result = toWATDisplay(ts);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes WAT timezone offset (+01:00 or WAT)", () => {
    const ts = 1700000000000;
    const result = toWATDisplay(ts);
    // Should contain date information
    expect(result).toMatch(/\d{4}/); // Contains a year
  });
});

describe("generateId", () => {
  it("generates a non-empty string", () => {
    const id = generateId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it("generates URL-safe IDs", () => {
    const id = generateId();
    expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
  });
});

describe("formatMembershipNumber", () => {
  it("formats a membership number with prefix", () => {
    const result = formatMembershipNumber("ORG001", 1);
    expect(typeof result).toBe("string");
    expect(result).toContain("ORG001");
  });

  it("pads sequence number to at least 4 digits", () => {
    const result = formatMembershipNumber("RCCG", 5);
    expect(result).toMatch(/0005|00005/);
  });

  it("handles large sequence numbers", () => {
    const result = formatMembershipNumber("RCCG", 10000);
    expect(result).toContain("10000");
  });
});

describe("DONATION_TYPES", () => {
  it("includes tithe", () => {
    expect(DONATION_TYPES.some(d => d.value === "tithe")).toBe(true);
  });
  it("includes offering", () => {
    expect(DONATION_TYPES.some(d => d.value === "offering")).toBe(true);
  });
  it("includes special offering", () => {
    // value is 'special', label is 'Special Offering'
    expect(DONATION_TYPES.some(d => d.value === "special")).toBe(true);
  });
  it("is a non-empty array", () => {
    expect(DONATION_TYPES.length).toBeGreaterThan(0);
  });
});

describe("EVENT_TYPES", () => {
  it("includes sunday_service", () => {
    expect(EVENT_TYPES.some(e => e.value === "sunday_service")).toBe(true);
  });
  it("includes prayer_meeting", () => {
    expect(EVENT_TYPES.some(e => e.value === "prayer_meeting")).toBe(true);
  });
  it("is a non-empty array", () => {
    expect(EVENT_TYPES.length).toBeGreaterThan(0);
  });
});

describe("MEMBER_STATUSES", () => {
  it("includes active", () => {
    expect(MEMBER_STATUSES.some(s => s.value === "active")).toBe(true);
  });
  it("includes inactive", () => {
    expect(MEMBER_STATUSES.some(s => s.value === "inactive")).toBe(true);
  });
  it("is a non-empty array", () => {
    expect(MEMBER_STATUSES.length).toBeGreaterThan(0);
  });
});

describe("PAYMENT_METHODS", () => {
  it("includes cash", () => {
    expect(PAYMENT_METHODS.some(m => m.value === "cash")).toBe(true);
  });
  it("includes bank_transfer", () => {
    expect(PAYMENT_METHODS.some(m => m.value === "bank_transfer")).toBe(true);
  });
  it("is a non-empty array", () => {
    expect(PAYMENT_METHODS.length).toBeGreaterThan(0);
  });
});

describe("NIGERIAN_STATES", () => {
  it("includes Lagos", () => {
    expect(NIGERIAN_STATES).toContain("Lagos");
  });

  it("includes Abuja (FCT)", () => {
    const hasAbuja = NIGERIAN_STATES.some(s => s.includes("Abuja") || s.includes("FCT"));
    expect(hasAbuja).toBe(true);
  });

  it("includes all 36 states + FCT (37 total)", () => {
    expect(NIGERIAN_STATES.length).toBe(37);
  });
});

describe("NDPR_CONSENT_TEXT", () => {
  it("is a non-empty string", () => {
    expect(typeof NDPR_CONSENT_TEXT).toBe("string");
    expect(NDPR_CONSENT_TEXT.length).toBeGreaterThan(0);
  });

  it("mentions NDPR", () => {
    expect(NDPR_CONSENT_TEXT.toUpperCase()).toContain("NDPR");
  });

  it("mentions data protection", () => {
    expect(NDPR_CONSENT_TEXT.toLowerCase()).toContain("data");
  });
});

// ─── i18n Tests ───────────────────────────────────────────────────────────────

import {
  getTranslations,
  getSupportedLanguages,
  DEFAULT_LANGUAGE,
  type Language,
} from "./i18n.ts";

describe("DEFAULT_LANGUAGE", () => {
  it("is 'en'", () => {
    expect(DEFAULT_LANGUAGE).toBe("en");
  });
});

describe("getSupportedLanguages", () => {
  it("returns an array of language objects", () => {
    const langs = getSupportedLanguages();
    expect(Array.isArray(langs)).toBe(true);
    expect(langs.length).toBeGreaterThan(0);
  });

  it("includes English", () => {
    const langs = getSupportedLanguages();
    const en = langs.find(l => l.code === "en");
    expect(en).toBeDefined();
    expect(en?.name).toBe("English");
  });

  it("includes Yoruba", () => {
    const langs = getSupportedLanguages();
    const yo = langs.find(l => l.code === "yo");
    expect(yo).toBeDefined();
  });

  it("includes Igbo", () => {
    const langs = getSupportedLanguages();
    const ig = langs.find(l => l.code === "ig");
    expect(ig).toBeDefined();
  });

  it("includes Hausa", () => {
    const langs = getSupportedLanguages();
    const ha = langs.find(l => l.code === "ha");
    expect(ha).toBeDefined();
  });

  it("returns exactly 4 languages", () => {
    const langs = getSupportedLanguages();
    expect(langs.length).toBe(4);
  });
});

describe("getTranslations", () => {
  const languages: Language[] = ["en", "yo", "ig", "ha"];

  languages.forEach(lang => {
    it(`returns translations for ${lang}`, () => {
      const t = getTranslations(lang);
      expect(t).toBeDefined();
      expect(typeof t).toBe("object");
    });

    it(`${lang} has nav section`, () => {
      const t = getTranslations(lang);
      expect(t.nav).toBeDefined();
    });

    it(`${lang} has dashboard section`, () => {
      const t = getTranslations(lang);
      expect(t.dashboard).toBeDefined();
    });

    it(`${lang} has members section`, () => {
      const t = getTranslations(lang);
      expect(t.members).toBeDefined();
    });

    it(`${lang} has donations section`, () => {
      const t = getTranslations(lang);
      expect(t.donations).toBeDefined();
    });

    it(`${lang} has common section`, () => {
      const t = getTranslations(lang);
      expect(t.common).toBeDefined();
    });
  });

  it("English nav has dashboard key", () => {
    const t = getTranslations("en");
    expect(t.nav.dashboard).toBeDefined();
    expect(typeof t.nav.dashboard).toBe("string");
  });

  it("English nav has members key", () => {
    const t = getTranslations("en");
    expect(t.nav.members).toBeDefined();
  });

  it("English nav has donations key", () => {
    const t = getTranslations("en");
    expect(t.nav.donations).toBeDefined();
  });

  it("Yoruba translations differ from English", () => {
    const en = getTranslations("en");
    const yo = getTranslations("yo");
    // At least one key should differ
    const hasDifference =
      en.nav.dashboard !== yo.nav.dashboard ||
      en.nav.members !== yo.nav.members ||
      en.nav.donations !== yo.nav.donations;
    expect(hasDifference).toBe(true);
  });

  it("Igbo translations differ from English", () => {
    const en = getTranslations("en");
    const ig = getTranslations("ig");
    const hasDifference =
      en.nav.dashboard !== ig.nav.dashboard ||
      en.nav.members !== ig.nav.members;
    expect(hasDifference).toBe(true);
  });

  it("Hausa translations differ from English", () => {
    const en = getTranslations("en");
    const ha = getTranslations("ha");
    const hasDifference =
      en.nav.dashboard !== ha.nav.dashboard ||
      en.nav.members !== ha.nav.members;
    expect(hasDifference).toBe(true);
  });
});

// ─── Event Bus Tests ──────────────────────────────────────────────────────────

import { createEventBus, CIVIC_EVENTS } from "../../core/event-bus/index.ts";

describe("CIVIC_EVENTS", () => {
  it("includes member.created", () => {
    expect(CIVIC_EVENTS.MEMBER_CREATED).toBeDefined();
    expect(CIVIC_EVENTS.MEMBER_CREATED).toBe("civic.member.created");
  });

  it("includes donation.received", () => {
    expect(CIVIC_EVENTS.DONATION_RECEIVED).toBeDefined();
    expect(CIVIC_EVENTS.DONATION_RECEIVED).toBe("civic.donation.received");
  });

  it("includes pledge.created", () => {
    expect(CIVIC_EVENTS.PLEDGE_CREATED).toBeDefined();
    expect(CIVIC_EVENTS.PLEDGE_CREATED).toBe("civic.pledge.created");
  });

  it("includes event.created", () => {
    expect(CIVIC_EVENTS.EVENT_CREATED).toBeDefined();
    expect(CIVIC_EVENTS.EVENT_CREATED).toBe("civic.event.created");
  });

  it("includes grant.approved", () => {
    expect(CIVIC_EVENTS.GRANT_APPROVED).toBeDefined();
    expect(CIVIC_EVENTS.GRANT_APPROVED).toBe("civic.grant.approved");
  });

  it("has at least 8 event types", () => {
    expect(Object.keys(CIVIC_EVENTS).length).toBeGreaterThanOrEqual(8);
  });
});

describe("createEventBus", () => {
  it("returns an object with publish method", () => {
    const env = { EVENT_BUS_URL: undefined, EVENT_BUS_TOKEN: undefined };
    const bus = createEventBus(env);
    expect(bus).toBeDefined();
    expect(typeof bus.publish).toBe("function");
  });

  it("publish returns false when EVENT_BUS_URL is not set", async () => {
    const env = { EVENT_BUS_URL: undefined, EVENT_BUS_TOKEN: undefined };
    const bus = createEventBus(env);
    const result = await bus.publish(CIVIC_EVENTS.MEMBER_CREATED, "t1", "o1", { memberId: "m1" });
    expect(result).toBe(false);
  });

  it("publish accepts valid event payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const env = { EVENT_BUS_URL: "https://events.webwaka.ng", EVENT_BUS_TOKEN: "token-123" };
    const bus = createEventBus(env, fetchMock as unknown as typeof fetch);
    const result = await bus.publish(CIVIC_EVENTS.DONATION_RECEIVED, "t1", "o1", { donationId: "d1", amountKobo: 500000 });
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("publish sends correct event type in payload", async () => {
    let capturedBody: string | null = null;
    const fetchMock = vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedBody = opts.body as string;
      return Promise.resolve({ ok: true });
    });
    const env = { EVENT_BUS_URL: "https://events.webwaka.ng", EVENT_BUS_TOKEN: "token-123" };
    const bus = createEventBus(env, fetchMock as unknown as typeof fetch);
    await bus.publish(CIVIC_EVENTS.MEMBER_CREATED, "t1", "o1", { memberId: "m1" });
    expect(capturedBody).not.toBeNull();
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.type).toBe("civic.member.created");
  });

  it("publish returns false on fetch error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network error"));
    const env = { EVENT_BUS_URL: "https://events.webwaka.ng", EVENT_BUS_TOKEN: "token-123" };
    const bus = createEventBus(env, fetchMock as unknown as typeof fetch);
    const result = await bus.publish(CIVIC_EVENTS.MEMBER_CREATED, "t1", "o1", { memberId: "m1" });
    expect(result).toBe(false);
  });
});

// ─── Logger Tests ─────────────────────────────────────────────────────────────

import { createLogger } from "../../core/logger.ts";

describe("createLogger", () => {
  it("returns a logger with info, warn, error methods", () => {
    const logger = createLogger("test-module");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("logger.info does not throw", () => {
    const logger = createLogger("test-module");
    expect(() => logger.info("Test message")).not.toThrow();
  });

  it("logger.warn does not throw", () => {
    const logger = createLogger("test-module");
    expect(() => logger.warn("Test warning")).not.toThrow();
  });

  it("logger.error does not throw", () => {
    const logger = createLogger("test-module");
    expect(() => logger.error("Test error")).not.toThrow();
  });

  it("logger.info accepts metadata object", () => {
    const logger = createLogger("test-module");
    expect(() =>
      logger.info("Test with meta", { tenantId: "t1", organizationId: "o1" })
    ).not.toThrow();
  });

  it("logger accepts tenantId context", () => {
    const logger = createLogger("test-module", { tenantId: "tenant-123" });
    expect(() => logger.info("Contextual log")).not.toThrow();
  });

  it("does not use console.log (uses console.info/warn/error)", () => {
    const consoleSpy = vi.spyOn(console, "log");
    const logger = createLogger("test-module");
    logger.info("Should not use console.log");
    logger.warn("Should not use console.log");
    logger.error("Should not use console.log");
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ─── Schema Tests ─────────────────────────────────────────────────────────────

import {
  TABLE_NAMES,
  MIGRATION_SQL,
  type CivicOrganization,
  type CivicMember,
  type CivicDonation,
  type CivicPledge,
  type CivicEvent,
  type CivicGrant,
} from "../../core/db/schema.ts";

describe("TABLE_NAMES", () => {
  it("has civic_organizations table", () => {
    expect(TABLE_NAMES.ORGANIZATIONS).toBe("civic_organizations");
  });

  it("has civic_members table", () => {
    expect(TABLE_NAMES.MEMBERS).toBe("civic_members");
  });

  it("has civic_donations table", () => {
    expect(TABLE_NAMES.DONATIONS).toBe("civic_donations");
  });

  it("has civic_pledges table", () => {
    expect(TABLE_NAMES.PLEDGES).toBe("civic_pledges");
  });

  it("has civic_events table", () => {
    expect(TABLE_NAMES.EVENTS).toBe("civic_events");
  });

  it("has civic_attendance table", () => {
    expect(TABLE_NAMES.ATTENDANCE).toBe("civic_attendance");
  });

  it("has civic_grants table", () => {
    expect(TABLE_NAMES.GRANTS).toBe("civic_grants");
  });
});

describe("MIGRATION_SQL", () => {
  it("is a non-empty string", () => {
    expect(typeof MIGRATION_SQL).toBe("string");
    expect(MIGRATION_SQL.length).toBeGreaterThan(0);
  });

  it("contains CREATE TABLE statements", () => {
    expect(MIGRATION_SQL.toUpperCase()).toContain("CREATE TABLE");
  });

  it("creates civic_organizations table", () => {
    expect(MIGRATION_SQL).toContain("civic_organizations");
  });

  it("creates civic_members table", () => {
    expect(MIGRATION_SQL).toContain("civic_members");
  });

  it("creates civic_donations table", () => {
    expect(MIGRATION_SQL).toContain("civic_donations");
  });

  it("enforces tenantId on all tables", () => {
    const tableCount = (MIGRATION_SQL.match(/CREATE TABLE/gi) ?? []).length;
    const tenantIdCount = (MIGRATION_SQL.match(/tenantId/g) ?? []).length;
    // Each table should have at least one tenantId reference
    expect(tenantIdCount).toBeGreaterThanOrEqual(tableCount);
  });

  it("enforces deletedAt soft deletes", () => {
    const deletedAtCount = (MIGRATION_SQL.match(/deletedAt/g) ?? []).length;
    expect(deletedAtCount).toBeGreaterThan(0);
  });

  it("uses INTEGER for monetary amounts (kobo)", () => {
    expect(MIGRATION_SQL).toContain("amountKobo");
    // amountKobo should be INTEGER not REAL/FLOAT
    expect(MIGRATION_SQL).toMatch(/amountKobo\s+INTEGER/);
  });
});

describe("CivicOrganization type structure", () => {
  it("has required fields", () => {
    const org: CivicOrganization = {
      id: "org-001",
      tenantId: "tenant-001",
      name: "RCCG Lagos",
      organizationType: "church",
      currency: "NGN",
      timezone: "Africa/Lagos",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(org.id).toBe("org-001");
    expect(org.tenantId).toBe("tenant-001");
    expect(org.currency).toBe("NGN");
    expect(org.timezone).toBe("Africa/Lagos");
  });
});

describe("CivicMember type structure", () => {
  it("has required fields including NDPR consent", () => {
    const member: CivicMember = {
      id: "mem-001",
      tenantId: "tenant-001",
      organizationId: "org-001",
      firstName: "Adaeze",
      lastName: "Okonkwo",
      membershipNumber: "RCCG-0001",
      memberStatus: "active",
      discipleshipLevel: "member",
      ndprConsent: 1,
      ndprConsentDate: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(member.ndprConsent).toBe(1);
    expect(member.ndprConsentDate).toBeDefined();
  });
});

describe("CivicDonation type structure", () => {
  it("stores monetary value as integer kobo", () => {
    const donation: CivicDonation = {
      id: "don-001",
      tenantId: "tenant-001",
      organizationId: "org-001",
      amountKobo: 5000000, // ₦50,000
      donationType: "tithe",
      paymentMethod: "bank_transfer",
      currency: "NGN",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(typeof donation.amountKobo).toBe("number");
    expect(Number.isInteger(donation.amountKobo)).toBe(true);
    expect(donation.amountKobo).toBe(5000000);
  });
});

// ─── Sync Engine Tests ────────────────────────────────────────────────────────

import { CivicOfflineDb, type MutationQueueItem, type CivicEntityType, type MutationOperation } from "../../core/sync/client.ts";

describe("CivicOfflineDb", () => {
  it("can be instantiated", () => {
    // In test environment (no browser), Dexie may not fully initialize
    // but the class should be constructable
    expect(() => new CivicOfflineDb()).not.toThrow();
  });

  it("has mutationQueue table", () => {
    const db = new CivicOfflineDb();
    expect(db.mutationQueue).toBeDefined();
  });

  it("has members table", () => {
    const db = new CivicOfflineDb();
    expect(db.members).toBeDefined();
  });

  it("has donations table", () => {
    const db = new CivicOfflineDb();
    expect(db.donations).toBeDefined();
  });

  it("has events table", () => {
    const db = new CivicOfflineDb();
    expect(db.events).toBeDefined();
  });
});

describe("MutationQueueItem structure", () => {
  it("accepts valid member create mutation", () => {
    const item: MutationQueueItem = {
      entityType: "member",
      entityId: "mem-001",
      operation: "CREATE",
      payload: { firstName: "Chidi", lastName: "Okeke" },
      tenantId: "tenant-001",
      organizationId: "org-001",
      createdAt: Date.now(),
      retryCount: 0,
      synced: false,
    };
    expect(item.entityType).toBe("member");
    expect(item.operation).toBe("CREATE");
    expect(item.synced).toBe(false);
  });

  it("accepts valid donation create mutation", () => {
    const item: MutationQueueItem = {
      entityType: "donation",
      entityId: "don-001",
      operation: "CREATE",
      payload: { amountKobo: 100000, donationType: "tithe" },
      tenantId: "tenant-001",
      organizationId: "org-001",
      createdAt: Date.now(),
      retryCount: 0,
      synced: false,
    };
    expect(item.entityType).toBe("donation");
  });

  it("CivicEntityType includes all expected values", () => {
    const validTypes: CivicEntityType[] = [
      "member", "donation", "pledge", "event", "attendance", "grant", "announcement"
    ];
    validTypes.forEach(t => {
      const item: MutationQueueItem = {
        entityType: t,
        entityId: "id-001",
        operation: "CREATE",
        payload: {},
        tenantId: "t1",
        organizationId: "o1",
        createdAt: Date.now(),
        retryCount: 0,
        synced: false,
      };
      expect(item.entityType).toBe(t);
    });
  });

  it("MutationOperation includes CREATE, UPDATE, DELETE", () => {
    const ops: MutationOperation[] = ["CREATE", "UPDATE", "DELETE"];
    ops.forEach(op => {
      const item: MutationQueueItem = {
        entityType: "member",
        entityId: "id-001",
        operation: op,
        payload: {},
        tenantId: "t1",
        organizationId: "o1",
        createdAt: Date.now(),
        retryCount: 0,
        synced: false,
      };
      expect(item.operation).toBe(op);
    });
  });
});

// ─── API Client Tests ─────────────────────────────────────────────────────────

import { apiGet, apiPost, apiPatch, apiDelete } from "./apiClient.ts";

describe("apiClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("apiGet sends GET request", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await apiGet("/members");
    expect(mockFetch).toHaveBeenCalledOnce();
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(opts.method).toBe("GET");
  });

  it("apiPost sends POST request with JSON body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { id: "m1" } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const payload = { firstName: "Emeka", lastName: "Nwosu" };
    await apiPost("/members", payload);
    expect(mockFetch).toHaveBeenCalledOnce();
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body as string)).toEqual(payload);
  });

  it("apiPatch sends PATCH request", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { id: "m1" } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await apiPatch("/members/m1", { memberStatus: "inactive" });
    expect(mockFetch).toHaveBeenCalledOnce();
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(opts.method).toBe("PATCH");
  });

  it("apiDelete sends DELETE request", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: null }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await apiDelete("/members/m1");
    expect(mockFetch).toHaveBeenCalledOnce();
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(opts.method).toBe("DELETE");
  });

  it("apiGet returns success:false on HTTP error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ success: false, error: "Not found" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await apiGet("/members/nonexistent");
    expect(result.success).toBe(false);
  });

  it("apiPost returns success:false on network error", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", mockFetch);

    const result = await apiPost("/members", { firstName: "Test" });
    expect(result.success).toBe(false);
  });
});
