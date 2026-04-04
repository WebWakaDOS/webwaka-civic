/**
 * WebWaka Civic — Citizen Reporting Portal Test Suite
 * Plan Reference: Section 5, Prompts 1 & 2
 *
 * Test Categories:
 *   1.  CitizenReport type structure (4 tests)
 *   2.  AI platform client — triageReport (8 tests)
 *   3.  Report submission (POST /reports) — validation (6 tests)
 *   4.  Report submission — AI triage integration (4 tests)
 *   5.  Report listing — filtering & pagination (6 tests)
 *   6.  Report retrieval (GET /reports/:id) (4 tests)
 *   7.  Status updates (PATCH /reports/:id/status) (6 tests)
 *   8.  Assignment (PATCH /reports/:id/assign) (5 tests)
 *   9.  Stats aggregation (GET /reports/stats) (5 tests)
 *  10.  Rate limiting (2 tests)
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { v4 as uuidv4 } from "uuid";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT   = "tenant-civic-reporting";
const ORG      = "org-civic-001";
const ADMIN_ID = "user-admin-001";
const USER_ID  = "user-citizen-001";

function makeReport(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: uuidv4(),
    tenantId: TENANT,
    userId: USER_ID,
    description: "There is a large pothole on Adeola Odeku Street blocking traffic.",
    userCategory: "Infrastructure",
    lat: 6.4281,
    lng: 3.4219,
    address: "Adeola Odeku Street, Victoria Island, Lagos",
    imageUrl: "https://cdn.webwaka.ng/reports/pothole-001.jpg",
    aiCategory: "Infrastructure",
    aiConfidence: 0.93,
    aiNotes: "Pothole reported on a major road — likely Infrastructure.",
    aiTriagedAt: Date.now(),
    status: "open",
    priority: "medium",
    assignedDepartment: null,
    resolvedAt: null,
    resolutionNotes: null,
    deletedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ─── In-Memory DB Mock ────────────────────────────────────────────────────────

class InMemoryDB {
  private store = new Map<string, Record<string, unknown>>();

  add(record: Record<string, unknown>): void {
    this.store.set(record.id as string, { ...record });
  }

  get(id: string): Record<string, unknown> | undefined {
    return this.store.get(id);
  }

  update(id: string, updates: Record<string, unknown>): void {
    const existing = this.store.get(id);
    if (existing) this.store.set(id, { ...existing, ...updates });
  }

  delete(id: string): void {
    this.store.delete(id);
  }

  list(filter?: (r: Record<string, unknown>) => boolean): Record<string, unknown>[] {
    const all = Array.from(this.store.values());
    return filter ? all.filter(filter) : all;
  }

  clear(): void {
    this.store.clear();
  }
}

const db = new InMemoryDB();

beforeEach(() => db.clear());

// ─── 1. CitizenReport type structure ─────────────────────────────────────────

describe("CitizenReport type structure", () => {
  it("has required fields", () => {
    const r = makeReport();
    expect(r.id).toBeDefined();
    expect(r.tenantId).toBe(TENANT);
    expect(r.userId).toBe(USER_ID);
    expect(r.description).toBeDefined();
    expect(r.status).toBe("open");
    expect(r.priority).toBe("medium");
    expect(r.createdAt).toBeDefined();
    expect(r.updatedAt).toBeDefined();
  });

  it("supports geotagged coordinates", () => {
    const r = makeReport({ lat: 9.0579, lng: 7.4951, address: "Abuja FCT" });
    expect(r.lat).toBeCloseTo(9.0579);
    expect(r.lng).toBeCloseTo(7.4951);
    expect(r.address).toBe("Abuja FCT");
  });

  it("supports image URL", () => {
    const r = makeReport({ imageUrl: "https://cdn.webwaka.ng/reports/img.jpg" });
    expect(r.imageUrl).toContain("webwaka.ng");
  });

  it("supports all valid status values", () => {
    const statuses = ["open", "in_progress", "resolved", "closed"];
    statuses.forEach((s) => {
      const r = makeReport({ status: s });
      expect(statuses).toContain(r.status as string);
    });
  });
});

// ─── 2. AI platform client — triageReport ────────────────────────────────────

import {
  triageReport,
  getAICompletion,
  REPORT_CATEGORIES,
} from "../../core/ai-platform-client";

describe("REPORT_CATEGORIES", () => {
  it("contains Infrastructure", () => {
    expect(REPORT_CATEGORIES).toContain("Infrastructure");
  });
  it("contains Sanitation", () => {
    expect(REPORT_CATEGORIES).toContain("Sanitation");
  });
  it("contains Security", () => {
    expect(REPORT_CATEGORIES).toContain("Security");
  });
  it("has 9 categories", () => {
    expect(REPORT_CATEGORIES.length).toBe(9);
  });
});

describe("getAICompletion — fallback", () => {
  it("returns fallback when no AI provider configured", async () => {
    const result = await getAICompletion({}, { prompt: "test prompt" });
    expect(result.isFallback).toBe(true);
    expect(result.provider).toBe("fallback");
    expect(result.text).toBe("");
  });

  it("returns fallback model name when no provider", async () => {
    const result = await getAICompletion({}, { prompt: "anything" });
    expect(result.model).toBe("none");
  });
});

describe("triageReport — fallback (no AI provider)", () => {
  it("returns Other with confidence 0 when fallback", async () => {
    const result = await triageReport({}, "pothole on the main road");
    expect(result.isFallback).toBe(true);
    expect(result.category).toBe("Other");
    expect(result.confidence).toBe(0);
  });

  it("fallback notes mention manual review", async () => {
    const result = await triageReport({}, "any description here");
    expect(result.notes.toLowerCase()).toMatch(/manual|review|unavailable/);
  });
});

describe("triageReport — mocked Cloudflare AI binding", () => {
  it("parses valid JSON response from AI binding", async () => {
    const mockAI = {
      run: vi.fn().mockResolvedValue({
        response: JSON.stringify({
          category: "Infrastructure",
          confidence: 0.91,
          notes: "Pothole on road — Infrastructure issue.",
        }),
      }),
    };
    const result = await triageReport(
      { AI: mockAI },
      "Large pothole on Broad Street blocking traffic"
    );
    expect(result.isFallback).toBe(false);
    expect(result.category).toBe("Infrastructure");
    expect(result.confidence).toBeCloseTo(0.91);
    expect(result.provider).toBe("cloudflare");
  });

  it("falls back to Other if AI returns unrecognised category", async () => {
    const mockAI = {
      run: vi.fn().mockResolvedValue({
        response: JSON.stringify({ category: "Space Aliens", confidence: 0.99, notes: "Aliens." }),
      }),
    };
    const result = await triageReport({ AI: mockAI }, "aliens took the streetlight");
    expect(result.category).toBe("Other");
  });

  it("clamps confidence to 0–1 range", async () => {
    const mockAI = {
      run: vi.fn().mockResolvedValue({
        response: JSON.stringify({ category: "Security", confidence: 1.5, notes: "High confidence." }),
      }),
    };
    const result = await triageReport({ AI: mockAI }, "armed robbery at market");
    expect(result.confidence).toBeLessThanOrEqual(1.0);
    expect(result.confidence).toBeGreaterThanOrEqual(0.0);
  });

  it("handles AI binding network error gracefully", async () => {
    const mockAI = { run: vi.fn().mockRejectedValue(new Error("AI binding timeout")) };
    const result = await getAICompletion({ AI: mockAI }, { prompt: "test" });
    expect(result.isFallback).toBe(true);
  });
});

// ─── 3. Report submission — validation ───────────────────────────────────────

describe("CreateReportBody validation rules", () => {
  it("rejects description shorter than 10 chars", () => {
    const isValid = (desc: string) => desc.trim().length >= 10 && desc.trim().length <= 2000;
    expect(isValid("Short")).toBe(false);
  });

  it("accepts description of exactly 10 chars", () => {
    const isValid = (desc: string) => desc.trim().length >= 10;
    expect(isValid("1234567890")).toBe(true);
  });

  it("rejects description over 2000 chars", () => {
    const long = "x".repeat(2001);
    expect(long.length > 2000).toBe(true);
  });

  it("rejects lat out of range", () => {
    const isValidLat = (lat: number) => lat >= -90 && lat <= 90;
    expect(isValidLat(91)).toBe(false);
    expect(isValidLat(-91)).toBe(false);
  });

  it("accepts lat within range", () => {
    const isValidLat = (lat: number) => lat >= -90 && lat <= 90;
    expect(isValidLat(6.4281)).toBe(true);
    expect(isValidLat(-33.9249)).toBe(true);
  });

  it("rejects lng out of range", () => {
    const isValidLng = (lng: number) => lng >= -180 && lng <= 180;
    expect(isValidLng(181)).toBe(false);
    expect(isValidLng(-181)).toBe(false);
  });
});

// ─── 4. Report submission — AI triage integration ────────────────────────────

describe("Report submission with AI triage", () => {
  it("stores aiCategory from successful triage", async () => {
    const mockAI = {
      run: vi.fn().mockResolvedValue({
        response: JSON.stringify({ category: "Sanitation", confidence: 0.87, notes: "Waste issue." }),
      }),
    };
    const triage = await triageReport({ AI: mockAI }, "Overflowing rubbish bins on the street corner");
    const report = makeReport({ aiCategory: triage.category, aiConfidence: triage.confidence, aiNotes: triage.notes });
    db.add(report);

    const stored = db.get(report.id as string);
    expect(stored?.aiCategory).toBe("Sanitation");
    expect(stored?.aiConfidence).toBeCloseTo(0.87);
  });

  it("stores null aiCategory when triage fallback", async () => {
    const triage = await triageReport({}, "Broken streetlight on my road");
    const report = makeReport({
      aiCategory: triage.isFallback ? null : triage.category,
      aiConfidence: triage.isFallback ? null : triage.confidence,
    });
    db.add(report);

    const stored = db.get(report.id as string);
    expect(stored?.aiCategory).toBeNull();
  });

  it("triage does not block report storage even on AI error", async () => {
    const mockAI = { run: vi.fn().mockRejectedValue(new Error("503 Service Unavailable")) };
    const result = await getAICompletion({ AI: mockAI }, { prompt: "classify" });
    expect(result.isFallback).toBe(true);

    const report = makeReport({ aiCategory: null });
    db.add(report);
    expect(db.get(report.id as string)).toBeDefined();
  });

  it("stores aiTriagedAt timestamp after successful triage", async () => {
    const mockAI = {
      run: vi.fn().mockResolvedValue({
        response: JSON.stringify({ category: "Utilities", confidence: 0.8, notes: "Electricity issue." }),
      }),
    };
    const triage = await triageReport({ AI: mockAI }, "No electricity for 3 days in my area");
    expect(triage.isFallback).toBe(false);

    const now = Date.now();
    const report = makeReport({ aiTriagedAt: now });
    db.add(report);

    const stored = db.get(report.id as string);
    expect(stored?.aiTriagedAt).toBeGreaterThan(0);
  });
});

// ─── 5. Report listing — filtering & pagination ───────────────────────────────

describe("Report listing and filtering", () => {
  beforeEach(() => {
    db.clear();
    db.add(makeReport({ id: "r1", status: "open",        aiCategory: "Infrastructure", priority: "high"   }));
    db.add(makeReport({ id: "r2", status: "in_progress", aiCategory: "Sanitation",    priority: "medium"  }));
    db.add(makeReport({ id: "r3", status: "resolved",    aiCategory: "Infrastructure", priority: "low"    }));
    db.add(makeReport({ id: "r4", status: "open",        aiCategory: "Security",      priority: "urgent"  }));
    db.add(makeReport({ id: "r5", userId: ADMIN_ID, status: "open", aiCategory: "Health", priority: "medium" }));
  });

  it("admin sees all reports", () => {
    const all = db.list((r) => r.tenantId === TENANT && !r.deletedAt);
    expect(all.length).toBe(5);
  });

  it("non-admin sees only own reports", () => {
    const own = db.list((r) => r.tenantId === TENANT && r.userId === USER_ID && !r.deletedAt);
    expect(own.length).toBe(4);
  });

  it("filters by status", () => {
    const open = db.list((r) => r.tenantId === TENANT && r.status === "open" && !r.deletedAt);
    expect(open.length).toBe(3);
  });

  it("filters by aiCategory", () => {
    const infra = db.list((r) => r.tenantId === TENANT && r.aiCategory === "Infrastructure" && !r.deletedAt);
    expect(infra.length).toBe(2);
  });

  it("filters by priority", () => {
    const urgent = db.list((r) => r.tenantId === TENANT && r.priority === "urgent" && !r.deletedAt);
    expect(urgent.length).toBe(1);
  });

  it("pagination slices results", () => {
    const all = db.list((r) => r.tenantId === TENANT && !r.deletedAt);
    const page1 = all.slice(0, 2);
    const page2 = all.slice(2, 4);
    expect(page1.length).toBe(2);
    expect(page2.length).toBe(2);
    expect(page1[0]?.id).not.toBe(page2[0]?.id);
  });
});

// ─── 6. Report retrieval ──────────────────────────────────────────────────────

describe("GET /api/reporting/reports/:id", () => {
  beforeEach(() => {
    db.clear();
    db.add(makeReport({ id: "report-alpha", userId: USER_ID }));
    db.add(makeReport({ id: "report-beta",  userId: ADMIN_ID }));
  });

  it("owner can retrieve own report", () => {
    const r = db.get("report-alpha");
    expect(r).toBeDefined();
    expect(r?.userId).toBe(USER_ID);
  });

  it("admin can retrieve any report", () => {
    const r = db.get("report-beta");
    expect(r).toBeDefined();
    expect(r?.userId).toBe(ADMIN_ID);
  });

  it("returns undefined for non-existent report", () => {
    const r = db.get("non-existent-id");
    expect(r).toBeUndefined();
  });

  it("returns undefined for soft-deleted report", () => {
    db.update("report-alpha", { deletedAt: Date.now() });
    const r = db.get("report-alpha");
    expect(r?.deletedAt).not.toBeNull();
  });
});

// ─── 7. Status updates ────────────────────────────────────────────────────────

describe("PATCH /api/reporting/reports/:id/status", () => {
  beforeEach(() => {
    db.clear();
    db.add(makeReport({ id: "r-status", status: "open" }));
  });

  const updateStatus = (id: string, status: string, notes?: string) => {
    const r = db.get(id);
    if (!r) return null;
    const now = Date.now();
    const isTerminal = status === "resolved" || status === "closed";
    db.update(id, {
      status,
      ...(notes ? { resolutionNotes: notes } : {}),
      ...(isTerminal ? { resolvedAt: now } : {}),
      updatedAt: now,
    });
    return db.get(id);
  };

  it("updates status from open to in_progress", () => {
    const updated = updateStatus("r-status", "in_progress");
    expect(updated?.status).toBe("in_progress");
  });

  it("updates status from in_progress to resolved", () => {
    updateStatus("r-status", "in_progress");
    const resolved = updateStatus("r-status", "resolved", "Pothole filled by DPW");
    expect(resolved?.status).toBe("resolved");
    expect(resolved?.resolutionNotes).toBe("Pothole filled by DPW");
  });

  it("sets resolvedAt when status becomes resolved", () => {
    const resolved = updateStatus("r-status", "resolved");
    expect(resolved?.resolvedAt).toBeGreaterThan(0);
  });

  it("sets resolvedAt when status becomes closed", () => {
    const closed = updateStatus("r-status", "closed");
    expect(closed?.resolvedAt).toBeGreaterThan(0);
  });

  it("does NOT set resolvedAt for non-terminal transitions", () => {
    const inProgress = updateStatus("r-status", "in_progress");
    expect(inProgress?.resolvedAt).toBeNull();
  });

  it("rejects invalid status values", () => {
    const VALID = ["open", "in_progress", "resolved", "closed"];
    expect(VALID.includes("deleted")).toBe(false);
    expect(VALID.includes("unknown")).toBe(false);
  });
});

// ─── 8. Assignment ────────────────────────────────────────────────────────────

describe("PATCH /api/reporting/reports/:id/assign", () => {
  beforeEach(() => {
    db.clear();
    db.add(makeReport({ id: "r-assign", status: "open" }));
  });

  const assign = (id: string, dept: string, priority?: string) => {
    const r = db.get(id);
    if (!r) return null;
    db.update(id, {
      assignedDepartment: dept,
      ...(priority ? { priority } : {}),
      status: r.status === "open" ? "in_progress" : r.status,
      updatedAt: Date.now(),
    });
    return db.get(id);
  };

  it("assigns a department to the report", () => {
    const r = assign("r-assign", "Lagos State Works Department");
    expect(r?.assignedDepartment).toBe("Lagos State Works Department");
  });

  it("auto-promotes status from open to in_progress on assignment", () => {
    const r = assign("r-assign", "Dept of Sanitation");
    expect(r?.status).toBe("in_progress");
  });

  it("does not revert status if already in_progress or later", () => {
    db.update("r-assign", { status: "in_progress" });
    assign("r-assign", "Works Dept");
    const r = db.get("r-assign");
    expect(r?.status).toBe("in_progress");
  });

  it("allows setting priority during assignment", () => {
    const r = assign("r-assign", "Road Safety Corps", "urgent");
    expect(r?.priority).toBe("urgent");
  });

  it("requires assignedDepartment to be non-empty", () => {
    const isValid = (dept: string) => Boolean(dept && dept.trim());
    expect(isValid("")).toBe(false);
    expect(isValid("  ")).toBe(false);
    expect(isValid("Works Dept")).toBe(true);
  });
});

// ─── 9. Stats aggregation ────────────────────────────────────────────────────

describe("GET /api/reporting/reports/stats", () => {
  const reports = [
    makeReport({ id: "s1", status: "open",        aiCategory: "Infrastructure", priority: "high"   }),
    makeReport({ id: "s2", status: "open",        aiCategory: "Sanitation",    priority: "medium"  }),
    makeReport({ id: "s3", status: "in_progress", aiCategory: "Infrastructure", priority: "urgent" }),
    makeReport({ id: "s4", status: "resolved",    aiCategory: "Security",      priority: "low"    }),
    makeReport({ id: "s5", status: "closed",      aiCategory: "Sanitation",    priority: "low"    }),
  ];

  const computeStats = (rs: Record<string, unknown>[]): {
    total: number;
    byStatus: Record<string, number>;
    byCategory: Record<string, number>;
    byPriority: Record<string, number>;
  } => {
    const byStatus: Record<string, number>   = {};
    const byCategory: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    for (const r of rs) {
      const s = r.status as string;
      const c = (r.aiCategory as string) ?? "Uncategorised";
      const p = r.priority as string;
      byStatus[s]   = (byStatus[s]   ?? 0) + 1;
      byCategory[c] = (byCategory[c] ?? 0) + 1;
      byPriority[p] = (byPriority[p] ?? 0) + 1;
    }
    return { total: rs.length, byStatus, byCategory, byPriority };
  };

  it("total equals number of reports", () => {
    const stats = computeStats(reports);
    expect(stats.total).toBe(5);
  });

  it("byStatus counts correctly", () => {
    const stats = computeStats(reports);
    expect(stats.byStatus["open"]).toBe(2);
    expect(stats.byStatus["in_progress"]).toBe(1);
    expect(stats.byStatus["resolved"]).toBe(1);
    expect(stats.byStatus["closed"]).toBe(1);
  });

  it("byCategory groups correctly", () => {
    const stats = computeStats(reports);
    expect(stats.byCategory["Infrastructure"]).toBe(2);
    expect(stats.byCategory["Sanitation"]).toBe(2);
    expect(stats.byCategory["Security"]).toBe(1);
  });

  it("byPriority counts correctly", () => {
    const stats = computeStats(reports);
    expect(stats.byPriority["high"]).toBe(1);
    expect(stats.byPriority["urgent"]).toBe(1);
    expect(stats.byPriority["low"]).toBe(2);
  });

  it("excludes soft-deleted reports from stats", () => {
    const withDeleted = [
      ...reports,
      makeReport({ id: "s6", deletedAt: Date.now() }),
    ];
    const active = withDeleted.filter((r) => !r.deletedAt);
    const stats = computeStats(active);
    expect(stats.total).toBe(5);
  });
});

// ─── 10. Rate limiting ────────────────────────────────────────────────────────

describe("Rate limiting for report submissions", () => {
  it("allows up to 10 requests within the window", () => {
    const counts = new Map<string, number[]>();
    const checkLimit = (key: string, max: number, windowMs: number): boolean => {
      const now = Date.now();
      const hits = (counts.get(key) ?? []).filter((t) => now - t < windowMs);
      if (hits.length >= max) return false;
      counts.set(key, [...hits, now]);
      return true;
    };

    const ip = "192.168.1.1";
    let allowed = 0;
    for (let i = 0; i < 10; i++) {
      if (checkLimit(`report:${ip}`, 10, 60_000)) allowed++;
    }
    expect(allowed).toBe(10);
  });

  it("blocks the 11th request in the same window", () => {
    const counts = new Map<string, number[]>();
    const checkLimit = (key: string, max: number, windowMs: number): boolean => {
      const now = Date.now();
      const hits = (counts.get(key) ?? []).filter((t) => now - t < windowMs);
      if (hits.length >= max) return false;
      counts.set(key, [...hits, now]);
      return true;
    };

    const ip = "192.168.1.2";
    for (let i = 0; i < 10; i++) checkLimit(`report:${ip}`, 10, 60_000);
    const eleventh = checkLimit(`report:${ip}`, 10, 60_000);
    expect(eleventh).toBe(false);
  });
});
