/**
 * WebWaka Civic — Church/NGO Mobile-First PWA UI
 * Blueprint Reference: Part 10.9 (Civic & Political Suite — Church & NGO)
 *
 * Core Invariants enforced:
 * - Mobile First: all layouts start at 320px, scale up
 * - PWA First: service worker registered, manifest linked
 * - Offline First: Dexie sync engine, offline banner
 * - Nigeria First: NGN/kobo, WAT timezone, NDPR consent
 * - Africa First: i18n en/yo/ig/ha, multi-currency
 * - Build Once Use Infinitely: modular, reusable components
 * - Vendor Neutral AI: no vendor lock-in
 */

import React, { useCallback, useEffect, useReducer, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, runMigrations } from "./apiClient";
import { DEFAULT_LANGUAGE, getSupportedLanguages, getTranslations, type Language } from "./i18n";
import { CivicOfflineDb, createSyncEngine } from "../../core/sync/client";
import {
  DONATION_TYPES,
  EVENT_TYPES,
  koboToNaira,
  MEMBER_STATUSES,
  NDPR_CONSENT_TEXT,
  NIGERIAN_STATES,
  PAYMENT_METHODS,
  toWATDisplay,
  validateAmountKobo,
  validateEmail,
  validatePhoneNumber,
} from "./utils";
import type {
  CivicDonation,
  CivicEvent,
  CivicGrant,
  CivicMember,
  CivicOrganization,
  CivicPledge,
} from "../../core/db/schema.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

type Page =
  | "dashboard"
  | "members"
  | "member-detail"
  | "member-create"
  | "donations"
  | "donation-create"
  | "pledges"
  | "pledge-create"
  | "events"
  | "event-create"
  | "event-attendance"
  | "grants"
  | "grant-create";

interface AppState {
  page: Page;
  selectedId: string | null;
  language: Language;
  isOnline: boolean;
  isLoading: boolean;
  error: string | null;
  organization: CivicOrganization | null;
  members: CivicMember[];
  donations: CivicDonation[];
  pledges: CivicPledge[];
  events: CivicEvent[];
  grants: CivicGrant[];
  dashboardStats: {
    totalMembers: number;
    totalDonationsKobo: number;
    activePledges: number;
    upcomingEvents: number;
  } | null;
}

type Action =
  | { type: "SET_PAGE"; page: Page; selectedId?: string }
  | { type: "SET_LANGUAGE"; language: Language }
  | { type: "SET_ONLINE"; isOnline: boolean }
  | { type: "SET_LOADING"; isLoading: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SET_ORGANIZATION"; organization: CivicOrganization }
  | { type: "SET_MEMBERS"; members: CivicMember[] }
  | { type: "SET_DONATIONS"; donations: CivicDonation[] }
  | { type: "SET_PLEDGES"; pledges: CivicPledge[] }
  | { type: "SET_EVENTS"; events: CivicEvent[] }
  | { type: "SET_GRANTS"; grants: CivicGrant[] }
  | { type: "SET_DASHBOARD_STATS"; stats: AppState["dashboardStats"] };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_PAGE":
      return { ...state, page: action.page, selectedId: action.selectedId ?? null, error: null };
    case "SET_LANGUAGE":
      return { ...state, language: action.language };
    case "SET_ONLINE":
      return { ...state, isOnline: action.isOnline };
    case "SET_LOADING":
      return { ...state, isLoading: action.isLoading };
    case "SET_ERROR":
      return { ...state, error: action.error, isLoading: false };
    case "SET_ORGANIZATION":
      return { ...state, organization: action.organization };
    case "SET_MEMBERS":
      return { ...state, members: action.members, isLoading: false };
    case "SET_DONATIONS":
      return { ...state, donations: action.donations, isLoading: false };
    case "SET_PLEDGES":
      return { ...state, pledges: action.pledges, isLoading: false };
    case "SET_EVENTS":
      return { ...state, events: action.events, isLoading: false };
    case "SET_GRANTS":
      return { ...state, grants: action.grants, isLoading: false };
    case "SET_DASHBOARD_STATS":
      return { ...state, dashboardStats: action.stats, isLoading: false };
    default:
      return state;
  }
}

const initialState: AppState = {
  page: "dashboard",
  selectedId: null,
  language: (localStorage.getItem("webwaka_civic_lang") as Language) ?? DEFAULT_LANGUAGE,
  isOnline: navigator.onLine,
  isLoading: false,
  error: null,
  organization: null,
  members: [],
  donations: [],
  pledges: [],
  events: [],
  grants: [],
  dashboardStats: null,
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const colors = {
  primary: "#1B4332",       // Deep forest green — trustworthy, spiritual
  primaryLight: "#2D6A4F",
  primaryDark: "#0A1F14",
  accent: "#D4A017",        // Gold — generosity, giving
  accentLight: "#F0C040",
  surface: "#FFFFFF",
  surfaceAlt: "#F8FAF9",
  border: "#E2E8E4",
  text: "#1A2E22",
  textMuted: "#6B7C72",
  success: "#2D6A4F",
  warning: "#D4A017",
  error: "#C0392B",
  offline: "#E67E22",
};

const s = {
  app: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    backgroundColor: colors.surfaceAlt,
    minHeight: "100vh",
    color: colors.text,
  } as React.CSSProperties,

  header: {
    backgroundColor: colors.primary,
    color: "#FFFFFF",
    padding: "0 16px",
    height: "56px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    position: "sticky" as const,
    top: 0,
    zIndex: 100,
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
  } as React.CSSProperties,

  headerTitle: {
    fontSize: "18px",
    fontWeight: 700,
    letterSpacing: "-0.3px",
  } as React.CSSProperties,

  offlineBanner: {
    backgroundColor: colors.offline,
    color: "#FFFFFF",
    padding: "8px 16px",
    fontSize: "13px",
    textAlign: "center" as const,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
  } as React.CSSProperties,

  bottomNav: {
    position: "fixed" as const,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTop: `1px solid ${colors.border}`,
    display: "flex",
    zIndex: 100,
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
  } as React.CSSProperties,

  navItem: (active: boolean): React.CSSProperties => ({
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "8px 4px",
    gap: "2px",
    cursor: "pointer",
    color: active ? colors.primary : colors.textMuted,
    backgroundColor: "transparent",
    border: "none",
    fontSize: "10px",
    fontWeight: active ? 600 : 400,
    minHeight: "56px",
    transition: "color 0.15s",
  }),

  content: {
    padding: "16px",
    paddingBottom: "80px",
    maxWidth: "600px",
    margin: "0 auto",
  } as React.CSSProperties,

  card: {
    backgroundColor: colors.surface,
    borderRadius: "12px",
    padding: "16px",
    marginBottom: "12px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    border: `1px solid ${colors.border}`,
  } as React.CSSProperties,

  statCard: {
    backgroundColor: colors.surface,
    borderRadius: "12px",
    padding: "16px",
    flex: 1,
    minWidth: "calc(50% - 6px)",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    border: `1px solid ${colors.border}`,
  } as React.CSSProperties,

  statsGrid: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "12px",
    marginBottom: "16px",
  } as React.CSSProperties,

  statValue: {
    fontSize: "22px",
    fontWeight: 700,
    color: colors.primary,
    lineHeight: 1.2,
  } as React.CSSProperties,

  statLabel: {
    fontSize: "12px",
    color: colors.textMuted,
    marginTop: "4px",
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: "18px",
    fontWeight: 700,
    color: colors.text,
    marginBottom: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  } as React.CSSProperties,

  btn: (variant: "primary" | "secondary" | "danger" = "primary"): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    padding: "10px 16px",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
    transition: "opacity 0.15s",
    backgroundColor:
      variant === "primary"
        ? colors.primary
        : variant === "danger"
        ? colors.error
        : colors.surfaceAlt,
    color: variant === "secondary" ? colors.text : "#FFFFFF",
    boxShadow: variant === "primary" ? "0 2px 6px rgba(27,67,50,0.3)" : "none",
  }),

  btnFab: {
    position: "fixed" as const,
    bottom: "76px",
    right: "16px",
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    backgroundColor: colors.accent,
    color: "#FFFFFF",
    border: "none",
    cursor: "pointer",
    fontSize: "24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 12px rgba(212,160,23,0.4)",
    zIndex: 90,
  } as React.CSSProperties,

  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "8px",
    border: `1px solid ${colors.border}`,
    fontSize: "14px",
    color: colors.text,
    backgroundColor: colors.surface,
    boxSizing: "border-box" as const,
    outline: "none",
  } as React.CSSProperties,

  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    color: colors.text,
    marginBottom: "6px",
  } as React.CSSProperties,

  formGroup: {
    marginBottom: "16px",
  } as React.CSSProperties,

  badge: (color: string): React.CSSProperties => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "12px",
    fontSize: "11px",
    fontWeight: 600,
    backgroundColor: `${color}20`,
    color,
  }),

  listItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 0",
    borderBottom: `1px solid ${colors.border}`,
    cursor: "pointer",
  } as React.CSSProperties,

  avatar: (name: string): React.CSSProperties => ({
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    backgroundColor: colors.primaryLight,
    color: "#FFFFFF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "14px",
    fontWeight: 700,
    flexShrink: 0,
    marginRight: "12px",
  }),

  progressBar: (percent: number): React.CSSProperties => ({
    height: "6px",
    borderRadius: "3px",
    backgroundColor: colors.border,
    overflow: "hidden",
    position: "relative" as const,
  }),

  progressFill: (percent: number): React.CSSProperties => ({
    height: "100%",
    width: `${percent}%`,
    borderRadius: "3px",
    backgroundColor: percent >= 100 ? colors.success : colors.accent,
    transition: "width 0.3s ease",
  }),

  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "8px",
    border: `1px solid ${colors.border}`,
    fontSize: "14px",
    color: colors.text,
    backgroundColor: colors.surface,
    boxSizing: "border-box" as const,
    outline: "none",
    appearance: "auto" as const,
  } as React.CSSProperties,

  errorText: {
    color: colors.error,
    fontSize: "12px",
    marginTop: "4px",
  } as React.CSSProperties,

  emptyState: {
    textAlign: "center" as const,
    padding: "48px 16px",
    color: colors.textMuted,
  } as React.CSSProperties,
};

// ─── Helper Components ────────────────────────────────────────────────────────

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    active: colors.success,
    inactive: colors.textMuted,
    fulfilled: colors.success,
    overdue: colors.error,
    cancelled: colors.textMuted,
    approved: colors.success,
    draft: colors.textMuted,
    completed: colors.primary,
  };
  const color = colorMap[status] ?? colors.textMuted;
  return <span style={s.badge(color)}>{status}</span>;
}

function LoadingSpinner() {
  return (
    <div style={{ textAlign: "center", padding: "48px 16px", color: colors.textMuted }}>
      <div
        style={{
          width: "32px",
          height: "32px",
          border: `3px solid ${colors.border}`,
          borderTopColor: colors.primary,
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
          margin: "0 auto 12px",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ fontSize: "14px" }}>Loading...</p>
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

function DashboardPage({
  state,
  dispatch,
  t,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  t: ReturnType<typeof getTranslations>;
}) {
  const stats = state.dashboardStats;
  const [migrateResult, setMigrateResult] = useState<string | null>(null);
  const [migrateRunning, setMigrateRunning] = useState(false);

  const handleMigrate = async () => {
    setMigrateRunning(true);
    setMigrateResult(null);
    const res = await runMigrations();
    setMigrateRunning(false);
    setMigrateResult(res.success ? `✓ Migration complete (${res.data?.applied ?? 0} applied)` : `✗ ${res.error}`);
  };

  return (
    <div>
      <h2 style={s.sectionTitle}>{t.dashboard.title}</h2>

      {state.organization && (
        <div style={{ ...s.card, backgroundColor: colors.primary, color: "#FFFFFF", marginBottom: "16px" }}>
          <div style={{ fontSize: "20px", fontWeight: 700 }}>{state.organization.name}</div>
          <div style={{ fontSize: "13px", opacity: 0.8, marginTop: "4px" }}>
            {state.organization.orgType.replace(/_/g, " ").toUpperCase()}
          </div>
        </div>
      )}

      <div style={s.statsGrid}>
        <div style={s.statCard}>
          <div style={s.statValue}>{stats?.totalMembers ?? "—"}</div>
          <div style={s.statLabel}>{t.dashboard.totalMembers}</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue}>
            {stats ? koboToNaira(stats.totalDonationsKobo) : "—"}
          </div>
          <div style={s.statLabel}>{t.dashboard.totalDonations}</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue}>{stats?.activePledges ?? "—"}</div>
          <div style={s.statLabel}>{t.dashboard.activePledges}</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue}>{stats?.upcomingEvents ?? "—"}</div>
          <div style={s.statLabel}>{t.dashboard.upcomingEvents}</div>
        </div>
      </div>

      <div style={s.card}>
        <h3 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "12px" }}>
          {t.dashboard.recentDonations}
        </h3>
        {state.donations.slice(0, 5).length === 0 ? (
          <p style={{ color: colors.textMuted, fontSize: "14px" }}>{t.donations.noDonations}</p>
        ) : (
          state.donations.slice(0, 5).map((d) => (
            <div key={d.id} style={s.listItem}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600 }}>
                  {DONATION_TYPES.find((dt) => dt.value === d.donationType)?.label ?? d.donationType}
                </div>
                <div style={{ fontSize: "12px", color: colors.textMuted }}>
                  {toWATDisplay(d.donationDate, "date")}
                </div>
              </div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: colors.primary }}>
                {koboToNaira(d.amountKobo)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Admin Tools */}
      <div style={{ marginTop: "16px", backgroundColor: colors.surfaceAlt, borderRadius: "12px", padding: "16px", border: `1px solid ${colors.border}` }}>
        <details>
          <summary style={{ fontSize: "13px", fontWeight: 600, color: colors.textMuted, cursor: "pointer", userSelect: "none" }}>⚙️ Admin Tools</summary>
          <div style={{ marginTop: "12px" }}>
            {migrateResult && (
              <div style={{ padding: "8px 12px", borderRadius: "8px", backgroundColor: migrateResult.startsWith("✓") ? "#D1FAE5" : "#FEE2E2", color: migrateResult.startsWith("✓") ? colors.success : colors.error, fontSize: "13px", marginBottom: "10px" }}>
                {migrateResult}
              </div>
            )}
            <button
              onClick={handleMigrate}
              disabled={migrateRunning}
              style={{ padding: "10px 18px", backgroundColor: colors.primary, color: "#fff", border: "none", borderRadius: "8px", cursor: migrateRunning ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: 600, opacity: migrateRunning ? 0.7 : 1 }}
            >
              {migrateRunning ? "Running…" : "🗄️ Run DB Migrations"}
            </button>
            <p style={{ fontSize: "12px", color: colors.textMuted, margin: "8px 0 0" }}>
              Bootstrap or upgrade this tenant's database tables. Safe to run multiple times.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}

// ─── Members Page ─────────────────────────────────────────────────────────────

function MembersPage({
  state,
  dispatch,
  t,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  t: ReturnType<typeof getTranslations>;
}) {
  const [search, setSearch] = useState("");

  const filtered = state.members.filter(
    (m) =>
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      (m.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (m.phone ?? "").includes(search)
  );

  return (
    <div>
      <div style={s.sectionTitle}>
        <span>{t.members.title}</span>
        <span style={{ fontSize: "14px", color: colors.textMuted }}>
          {state.members.length}
        </span>
      </div>

      <input
        style={{ ...s.input, marginBottom: "16px" }}
        placeholder={t.members.searchPlaceholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {filtered.length === 0 ? (
        <div style={s.emptyState}>
          <div style={{ fontSize: "40px", marginBottom: "8px" }}>👥</div>
          <p>{t.members.noMembers}</p>
        </div>
      ) : (
        filtered.map((m) => (
          <div
            key={m.id}
            style={s.card}
            onClick={() => dispatch({ type: "SET_PAGE", page: "member-detail", selectedId: m.id })}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={s.avatar(`${m.firstName} ${m.lastName}`)}>
                {getInitials(m.firstName, m.lastName)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "15px" }}>
                  {m.firstName} {m.lastName}
                </div>
                <div style={{ fontSize: "12px", color: colors.textMuted }}>
                  {m.memberNumber ?? ""} {m.phone ? `• ${m.phone}` : ""}
                </div>
              </div>
              <StatusBadge status={m.memberStatus} />
            </div>
          </div>
        ))
      )}

      <button
        style={s.btnFab}
        onClick={() => dispatch({ type: "SET_PAGE", page: "member-create" })}
        aria-label={t.members.addMember}
      >
        +
      </button>
    </div>
  );
}

// ─── Create Member Form ───────────────────────────────────────────────────────

function CreateMemberPage({
  state,
  dispatch,
  t,
  offlineDb,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  t: ReturnType<typeof getTranslations>;
  offlineDb: CivicOfflineDb | null;
}) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    gender: "male" as "male" | "female" | "other",
    state: "Lagos",
    discipleshipLevel: "new_convert",
    ndprConsent: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.firstName.trim()) errs.firstName = t.common.required;
    if (!form.lastName.trim()) errs.lastName = t.common.required;
    if (form.email && !validateEmail(form.email).valid) errs.email = "Invalid email";
    if (form.phone && !validatePhoneNumber(form.phone).valid)
      errs.phone = "Invalid Nigerian phone number";
    if (!form.ndprConsent) errs.ndprConsent = "NDPR consent is required";
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    const payload = {
      ...form,
      ndprConsent: 1,
      ndprConsentDate: Date.now(),
    };

    if (!state.isOnline && offlineDb) {
      await offlineDb.mutationQueue.add({
        entityType: "member",
        entityId: crypto.randomUUID(),
        operation: "CREATE",
        payload,
        tenantId: "local",
        organizationId: "local",
        createdAt: Date.now(),
        retryCount: 0,
        synced: false,
      });
      dispatch({ type: "SET_PAGE", page: "members" });
      return;
    }

    const res = await apiPost<CivicMember>("/members", payload);
    setSubmitting(false);

    if (res.success && res.data) {
      dispatch({ type: "SET_MEMBERS", members: [...state.members, res.data] });
      dispatch({ type: "SET_PAGE", page: "members" });
    } else {
      setErrors({ submit: res.error ?? t.common.error });
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <button
          style={{ ...s.btn("secondary"), padding: "8px 12px" }}
          onClick={() => dispatch({ type: "SET_PAGE", page: "members" })}
        >
          ← {t.common.back}
        </button>
        <h2 style={{ fontSize: "18px", fontWeight: 700 }}>{t.members.addMember}</h2>
      </div>

      <div style={s.card}>
        <div style={s.formGroup}>
          <label style={s.label}>{t.members.firstName} *</label>
          <input
            style={s.input}
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
          {errors.firstName && <p style={s.errorText}>{errors.firstName}</p>}
        </div>

        <div style={s.formGroup}>
          <label style={s.label}>{t.members.lastName} *</label>
          <input
            style={s.input}
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
          {errors.lastName && <p style={s.errorText}>{errors.lastName}</p>}
        </div>

        <div style={s.formGroup}>
          <label style={s.label}>{t.members.email}</label>
          <input
            style={s.input}
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          {errors.email && <p style={s.errorText}>{errors.email}</p>}
        </div>

        <div style={s.formGroup}>
          <label style={s.label}>{t.members.phone}</label>
          <input
            style={s.input}
            type="tel"
            placeholder="08012345678"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          {errors.phone && <p style={s.errorText}>{errors.phone}</p>}
        </div>

        <div style={s.formGroup}>
          <label style={s.label}>Gender</label>
          <select
            style={s.select}
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value as typeof form.gender })}
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div style={s.formGroup}>
          <label style={s.label}>State</label>
          <select
            style={s.select}
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
          >
            {NIGERIAN_STATES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        <div style={s.formGroup}>
          <label style={s.label}>{t.members.discipleshipLevel}</label>
          <select
            style={s.select}
            value={form.discipleshipLevel}
            onChange={(e) => setForm({ ...form, discipleshipLevel: e.target.value })}
          >
            <option value="new_convert">New Convert</option>
            <option value="growing">Growing</option>
            <option value="mature">Mature</option>
            <option value="leader">Leader</option>
            <option value="minister">Minister</option>
          </select>
        </div>

        {/* NDPR Consent — Nigeria First */}
        <div style={{ ...s.formGroup, backgroundColor: "#FFF8E1", padding: "12px", borderRadius: "8px" }}>
          <label style={{ display: "flex", gap: "10px", alignItems: "flex-start", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={form.ndprConsent}
              onChange={(e) => setForm({ ...form, ndprConsent: e.target.checked })}
              style={{ marginTop: "2px", flexShrink: 0 }}
            />
            <span style={{ fontSize: "12px", color: colors.text, lineHeight: 1.5 }}>
              {NDPR_CONSENT_TEXT}
            </span>
          </label>
          {errors.ndprConsent && <p style={s.errorText}>{errors.ndprConsent}</p>}
        </div>

        {errors.submit && (
          <div style={{ ...s.card, backgroundColor: "#FEF2F2", color: colors.error }}>
            {errors.submit}
          </div>
        )}

        <button
          style={{ ...s.btn("primary"), width: "100%" }}
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? t.common.loading : t.common.save}
        </button>
      </div>
    </div>
  );
}

// ─── Donations Page ───────────────────────────────────────────────────────────

function DonationsPage({
  state,
  dispatch,
  t,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  t: ReturnType<typeof getTranslations>;
}) {
  const totalKobo = state.donations.reduce((sum, d) => sum + d.amountKobo, 0);

  return (
    <div>
      <div style={s.sectionTitle}>
        <span>{t.donations.title}</span>
      </div>

      <div style={{ ...s.card, backgroundColor: colors.primary, color: "#FFFFFF" }}>
        <div style={{ fontSize: "13px", opacity: 0.8 }}>{t.donations.totalDonations}</div>
        <div style={{ fontSize: "28px", fontWeight: 700, marginTop: "4px" }}>
          {koboToNaira(totalKobo)}
        </div>
      </div>

      {state.donations.length === 0 ? (
        <div style={s.emptyState}>
          <div style={{ fontSize: "40px", marginBottom: "8px" }}>🙏</div>
          <p>{t.donations.noDonations}</p>
        </div>
      ) : (
        state.donations.map((d) => (
          <div key={d.id} style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "15px" }}>
                  {DONATION_TYPES.find((dt) => dt.value === d.donationType)?.label ?? d.donationType}
                </div>
                <div style={{ fontSize: "12px", color: colors.textMuted, marginTop: "2px" }}>
                  {toWATDisplay(d.donationDate, "date")} •{" "}
                  {PAYMENT_METHODS.find((pm) => pm.value === d.paymentMethod)?.label ?? d.paymentMethod}
                </div>
                {d.receiptNumber && (
                  <div style={{ fontSize: "11px", color: colors.textMuted }}>
                    {t.donations.receiptNumber}: {d.receiptNumber}
                  </div>
                )}
              </div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: colors.primary }}>
                {koboToNaira(d.amountKobo)}
              </div>
            </div>
          </div>
        ))
      )}

      <button
        style={s.btnFab}
        onClick={() => dispatch({ type: "SET_PAGE", page: "donation-create" })}
        aria-label={t.donations.recordDonation}
      >
        +
      </button>
    </div>
  );
}

// ─── Create Donation Form ─────────────────────────────────────────────────────

function CreateDonationPage({
  state,
  dispatch,
  t,
  offlineDb,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  t: ReturnType<typeof getTranslations>;
  offlineDb: CivicOfflineDb | null;
}) {
  const [form, setForm] = useState({
    amountNaira: "",
    donationType: "offering",
    paymentMethod: "cash",
    memberId: "",
    description: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const errs: Record<string, string> = {};
    const amountKobo = Math.round(parseFloat(form.amountNaira) * 100);

    if (!form.amountNaira || isNaN(amountKobo)) errs.amount = "Valid amount required";
    else {
      const v = validateAmountKobo(amountKobo);
      if (!v.valid) errs.amount = v.error ?? "Invalid amount";
    }
    if (!form.donationType) errs.donationType = t.common.required;

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    const payload = {
      amountKobo,
      donationType: form.donationType,
      paymentMethod: form.paymentMethod,
      memberId: form.memberId || undefined,
      description: form.description || undefined,
    };

    if (!state.isOnline && offlineDb) {
      await offlineDb.mutationQueue.add({
        entityType: "donation",
        entityId: crypto.randomUUID(),
        operation: "CREATE",
        payload,
        tenantId: "local",
        organizationId: "local",
        createdAt: Date.now(),
        retryCount: 0,
        synced: false,
      });
      dispatch({ type: "SET_PAGE", page: "donations" });
      return;
    }

    const res = await apiPost<CivicDonation>("/donations", payload);
    setSubmitting(false);

    if (res.success && res.data) {
      dispatch({ type: "SET_DONATIONS", donations: [res.data, ...state.donations] });
      dispatch({ type: "SET_PAGE", page: "donations" });
    } else {
      setErrors({ submit: res.error ?? t.common.error });
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <button
          style={{ ...s.btn("secondary"), padding: "8px 12px" }}
          onClick={() => dispatch({ type: "SET_PAGE", page: "donations" })}
        >
          ← {t.common.back}
        </button>
        <h2 style={{ fontSize: "18px", fontWeight: 700 }}>{t.donations.recordDonation}</h2>
      </div>

      <div style={s.card}>
        <div style={s.formGroup}>
          <label style={s.label}>{t.donations.amount} *</label>
          <input
            style={s.input}
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={form.amountNaira}
            onChange={(e) => setForm({ ...form, amountNaira: e.target.value })}
          />
          {errors.amount && <p style={s.errorText}>{errors.amount}</p>}
        </div>

        <div style={s.formGroup}>
          <label style={s.label}>{t.donations.donationType} *</label>
          <select
            style={s.select}
            value={form.donationType}
            onChange={(e) => setForm({ ...form, donationType: e.target.value })}
          >
            {DONATION_TYPES.map((dt) => (
              <option key={dt.value} value={dt.value}>
                {dt.label}
              </option>
            ))}
          </select>
        </div>

        <div style={s.formGroup}>
          <label style={s.label}>{t.donations.paymentMethod}</label>
          <select
            style={s.select}
            value={form.paymentMethod}
            onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
          >
            {PAYMENT_METHODS.map((pm) => (
              <option key={pm.value} value={pm.value}>
                {pm.label}
              </option>
            ))}
          </select>
        </div>

        <div style={s.formGroup}>
          <label style={s.label}>{t.donations.member} ({t.donations.anonymous})</label>
          <select
            style={s.select}
            value={form.memberId}
            onChange={(e) => setForm({ ...form, memberId: e.target.value })}
          >
            <option value="">{t.donations.anonymous}</option>
            {state.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.firstName} {m.lastName}
              </option>
            ))}
          </select>
        </div>

        <div style={s.formGroup}>
          <label style={s.label}>{t.common.description}</label>
          <input
            style={s.input}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>

        {errors.submit && (
          <div style={{ ...s.card, backgroundColor: "#FEF2F2", color: colors.error }}>
            {errors.submit}
          </div>
        )}

        <button
          style={{ ...s.btn("primary"), width: "100%" }}
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? t.common.loading : t.donations.recordDonation}
        </button>
      </div>
    </div>
  );
}

// ─── Pledges Page ─────────────────────────────────────────────────────────────

function PledgesPage({
  state,
  dispatch,
  t,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  t: ReturnType<typeof getTranslations>;
}) {
  return (
    <div>
      <div style={s.sectionTitle}>
        <span>{t.pledges.title}</span>
        <span style={{ fontSize: "14px", color: colors.textMuted }}>
          {state.pledges.filter((p) => p.pledgeStatus === "active").length} active
        </span>
      </div>

      {state.pledges.length === 0 ? (
        <div style={s.emptyState}>
          <div style={{ fontSize: "40px", marginBottom: "8px" }}>🤝</div>
          <p>{t.pledges.noPledges}</p>
        </div>
      ) : (
        state.pledges.map((p) => {
          const progress = p.totalAmountKobo > 0
            ? Math.min(100, Math.round((p.paidAmountKobo / p.totalAmountKobo) * 100))
            : 0;
          const member = state.members.find((m) => m.id === p.memberId);

          return (
            <div key={p.id} style={s.card}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "14px" }}>{p.description}</div>
                  {member && (
                    <div style={{ fontSize: "12px", color: colors.textMuted }}>
                      {member.firstName} {member.lastName}
                    </div>
                  )}
                </div>
                <StatusBadge status={p.pledgeStatus} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "8px" }}>
                <span style={{ color: colors.textMuted }}>{t.pledges.paidAmount}: {koboToNaira(p.paidAmountKobo)}</span>
                <span style={{ fontWeight: 600 }}>{t.pledges.totalAmount}: {koboToNaira(p.totalAmountKobo)}</span>
              </div>

              <div style={s.progressBar(progress)}>
                <div style={s.progressFill(progress)} />
              </div>
              <div style={{ fontSize: "11px", color: colors.textMuted, marginTop: "4px", textAlign: "right" }}>
                {progress}%
              </div>
            </div>
          );
        })
      )}

      <button
        style={s.btnFab}
        onClick={() => dispatch({ type: "SET_PAGE", page: "pledge-create" })}
        aria-label={t.pledges.createPledge}
      >
        +
      </button>
    </div>
  );
}

// ─── Events Page ──────────────────────────────────────────────────────────────

function EventsPage({
  state,
  dispatch,
  t,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  t: ReturnType<typeof getTranslations>;
}) {
  return (
    <div>
      <div style={s.sectionTitle}>
        <span>{t.events.title}</span>
      </div>

      {state.events.length === 0 ? (
        <div style={s.emptyState}>
          <div style={{ fontSize: "40px", marginBottom: "8px" }}>📅</div>
          <p>{t.events.noEvents}</p>
        </div>
      ) : (
        state.events.map((ev) => (
          <div
            key={ev.id}
            style={s.card}
            onClick={() =>
              dispatch({ type: "SET_PAGE", page: "event-attendance", selectedId: ev.id })
            }
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "15px" }}>{ev.title}</div>
                <div style={{ fontSize: "12px", color: colors.textMuted, marginTop: "2px" }}>
                  {EVENT_TYPES.find((et) => et.value === ev.eventType)?.label ?? ev.eventType}
                </div>
                <div style={{ fontSize: "12px", color: colors.textMuted }}>
                  📅 {toWATDisplay(ev.startTime, "datetime")}
                </div>
                {ev.venue && (
                  <div style={{ fontSize: "12px", color: colors.textMuted }}>
                    📍 {ev.venue}
                  </div>
                )}
              </div>
              {ev.offeringAmountKobo > 0 && (
                <div style={{ fontSize: "14px", fontWeight: 600, color: colors.primary }}>
                  {koboToNaira(ev.offeringAmountKobo)}
                </div>
              )}
            </div>
          </div>
        ))
      )}

      <button
        style={s.btnFab}
        onClick={() => dispatch({ type: "SET_PAGE", page: "event-create" })}
        aria-label={t.events.createEvent}
      >
        +
      </button>
    </div>
  );
}

// ─── Grants Page ──────────────────────────────────────────────────────────────

function GrantsPage({
  state,
  dispatch,
  t,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  t: ReturnType<typeof getTranslations>;
}) {
  return (
    <div>
      <div style={s.sectionTitle}>
        <span>{t.grants.title}</span>
      </div>

      {state.grants.length === 0 ? (
        <div style={s.emptyState}>
          <div style={{ fontSize: "40px", marginBottom: "8px" }}>💰</div>
          <p>{t.grants.noGrants}</p>
        </div>
      ) : (
        state.grants.map((g) => {
          const progress = g.totalAmountKobo > 0
            ? Math.min(100, Math.round((g.disbursedAmountKobo / g.totalAmountKobo) * 100))
            : 0;

          return (
            <div key={g.id} style={s.card}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "15px" }}>{g.title}</div>
                  <div style={{ fontSize: "12px", color: colors.textMuted }}>{g.grantorName}</div>
                </div>
                <StatusBadge status={g.grantStatus} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "8px" }}>
                <span style={{ color: colors.textMuted }}>
                  {t.grants.disbursed}: {koboToNaira(g.disbursedAmountKobo)}
                </span>
                <span style={{ fontWeight: 600 }}>
                  {t.grants.totalAmount}: {koboToNaira(g.totalAmountKobo)}
                </span>
              </div>

              <div style={s.progressBar(progress)}>
                <div style={s.progressFill(progress)} />
              </div>
            </div>
          );
        })
      )}

      <button
        style={s.btnFab}
        onClick={() => dispatch({ type: "SET_PAGE", page: "grant-create" })}
        aria-label={t.grants.createGrant}
      >
        +
      </button>
    </div>
  );
}

// ─── Language Switcher ────────────────────────────────────────────────────────

function LanguageSwitcher({
  language,
  onChange,
}: {
  language: Language;
  onChange: (lang: Language) => void;
}) {
  const langs = getSupportedLanguages();
  return (
    <select
      style={{
        backgroundColor: "transparent",
        color: "#FFFFFF",
        border: "1px solid rgba(255,255,255,0.4)",
        borderRadius: "6px",
        padding: "4px 8px",
        fontSize: "12px",
        cursor: "pointer",
      }}
      value={language}
      onChange={(e) => onChange(e.target.value as Language)}
      aria-label="Language"
    >
      {langs.map((l) => (
        <option key={l.code} value={l.code} style={{ color: colors.text, backgroundColor: colors.surface }}>
          {l.nativeName}
        </option>
      ))}
    </select>
  );
}

// ─── Bottom Navigation ────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { page: "dashboard" as Page, icon: "🏠", key: "dashboard" as const },
  { page: "members" as Page, icon: "👥", key: "members" as const },
  { page: "donations" as Page, icon: "🙏", key: "donations" as const },
  { page: "pledges" as Page, icon: "🤝", key: "pledges" as const },
  { page: "events" as Page, icon: "📅", key: "events" as const },
];

// ─── Main App ─────────────────────────────────────────────────────────────────

export function ChurchNGOApp() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [offlineDb, setOfflineDb] = useState<CivicOfflineDb | null>(null);

  const t = getTranslations(state.language);

  // Initialize offline DB
  useEffect(() => {
    const db = new CivicOfflineDb();
    setOfflineDb(db);
  }, []);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => dispatch({ type: "SET_ONLINE", isOnline: true });
    const handleOffline = () => dispatch({ type: "SET_ONLINE", isOnline: false });
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Persist language preference
  useEffect(() => {
    localStorage.setItem("webwaka_civic_lang", state.language);
  }, [state.language]);

  // Load initial data
  const loadDashboard = useCallback(async () => {
    dispatch({ type: "SET_LOADING", isLoading: true });

    const [dashRes, membersRes, donationsRes, pledgesRes, eventsRes] = await Promise.all([
      apiGet<{ totalMembers: number; totalDonationsKobo: number; activePledges: number; upcomingEvents: number }>("/dashboard"),
      apiGet<{ members: CivicMember[]; total: number }>("/members"),
      apiGet<{ donations: CivicDonation[]; totalKobo: number }>("/donations"),
      apiGet<{ pledges: CivicPledge[] }>("/pledges"),
      apiGet<{ events: CivicEvent[] }>("/events"),
    ]);

    if (dashRes.success && dashRes.data) {
      dispatch({ type: "SET_DASHBOARD_STATS", stats: dashRes.data });
    }
    if (membersRes.success && membersRes.data) {
      dispatch({ type: "SET_MEMBERS", members: membersRes.data.members });
    }
    if (donationsRes.success && donationsRes.data) {
      dispatch({ type: "SET_DONATIONS", donations: donationsRes.data.donations });
    }
    if (pledgesRes.success && pledgesRes.data) {
      dispatch({ type: "SET_PLEDGES", pledges: pledgesRes.data.pledges });
    }
    if (eventsRes.success && eventsRes.data) {
      dispatch({ type: "SET_EVENTS", events: eventsRes.data.events });
    }

    dispatch({ type: "SET_LOADING", isLoading: false });
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  // Render current page
  const renderPage = () => {
    if (state.isLoading && state.page === "dashboard") return <LoadingSpinner />;

    switch (state.page) {
      case "dashboard":
        return <DashboardPage state={state} dispatch={dispatch} t={t} />;
      case "members":
        return <MembersPage state={state} dispatch={dispatch} t={t} />;
      case "member-create":
        return (
          <CreateMemberPage state={state} dispatch={dispatch} t={t} offlineDb={offlineDb} />
        );
      case "donations":
        return <DonationsPage state={state} dispatch={dispatch} t={t} />;
      case "donation-create":
        return (
          <CreateDonationPage state={state} dispatch={dispatch} t={t} offlineDb={offlineDb} />
        );
      case "pledges":
        return <PledgesPage state={state} dispatch={dispatch} t={t} />;
      case "events":
        return <EventsPage state={state} dispatch={dispatch} t={t} />;
      case "grants":
        return <GrantsPage state={state} dispatch={dispatch} t={t} />;
      default:
        return <DashboardPage state={state} dispatch={dispatch} t={t} />;
    }
  };

  const mainPage = (["dashboard", "members", "donations", "pledges", "events"] as Page[]).includes(
    state.page
  )
    ? state.page
    : "dashboard";

  return (
    <div style={s.app}>
      {/* Header */}
      <header style={s.header}>
        <div style={s.headerTitle}>
          ⛪ {state.organization?.name ?? "WebWaka Civic"}
        </div>
        <LanguageSwitcher
          language={state.language}
          onChange={(lang) => dispatch({ type: "SET_LANGUAGE", language: lang })}
        />
      </header>

      {/* Offline Banner */}
      {!state.isOnline && (
        <div style={s.offlineBanner} role="alert">
          <span>📡</span>
          <span>{t.common.offline}</span>
        </div>
      )}

      {/* Main Content */}
      <main style={s.content}>{renderPage()}</main>

      {/* Bottom Navigation */}
      <nav style={s.bottomNav} aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.page}
            style={s.navItem(mainPage === item.page)}
            onClick={() => dispatch({ type: "SET_PAGE", page: item.page })}
            aria-label={t.nav[item.key]}
            aria-current={mainPage === item.page ? "page" : undefined}
          >
            <span style={{ fontSize: "20px" }}>{item.icon}</span>
            <span>{t.nav[item.key]}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default ChurchNGOApp;
