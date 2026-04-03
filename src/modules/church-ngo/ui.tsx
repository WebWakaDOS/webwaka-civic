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
import { UsherPanel } from "./UsherPanel";
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
  CivicEventRecord,
  CivicGrant,
  CivicMember,
  CivicNdprAuditLog,
  CivicOrganization,
  CivicPledge,
  CivicWebhookLog,
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
  | "grant-create"
  | "analytics"
  | "donors"
  | "donor-detail"
  | "projects"
  | "project-create"
  | "member-portal"
  | "portal-giving"
  | "portal-pledges"
  | "portal-events"
  | "portal-profile"
  | "webhook-log"
  | "ndpr-audit"
  | "usher-panel";

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
  events: CivicEventRecord[];
  grants: CivicGrant[];
  dashboardStats: {
    totalMembers: number;
    totalDonationsKobo: number;
    activePledges: number;
    upcomingEvents: number;
  } | null;
  webhookLogs: CivicWebhookLog[];
  ndprAuditLogs: CivicNdprAuditLog[];
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
  | { type: "SET_EVENTS"; events: CivicEventRecord[] }
  | { type: "SET_GRANTS"; grants: CivicGrant[] }
  | { type: "SET_DASHBOARD_STATS"; stats: AppState["dashboardStats"] }
  | { type: "SET_WEBHOOK_LOGS"; logs: CivicWebhookLog[] }
  | { type: "SET_NDPR_AUDIT_LOGS"; logs: CivicNdprAuditLog[] };

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
    case "SET_WEBHOOK_LOGS":
      return { ...state, webhookLogs: action.logs, isLoading: false };
    case "SET_NDPR_AUDIT_LOGS":
      return { ...state, ndprAuditLogs: action.logs, isLoading: false };
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
  webhookLogs: [],
  ndprAuditLogs: [],
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

// ─── Payment Status Badge ─────────────────────────────────────────────────────
const PAYMENT_STATUS_COLORS: Record<string, string> = {
  cash: "#6b7280",
  pending: "#d97706",
  processing: "#2563eb",
  success: "#16a34a",
  failed: "#dc2626",
};
function PaymentStatusBadge({ status }: { status?: string }) {
  if (!status || status === "cash") return null;
  return (
    <span style={{
      display: "inline-block",
      fontSize: "10px",
      fontWeight: 600,
      padding: "2px 6px",
      borderRadius: "10px",
      color: "#fff",
      backgroundColor: PAYMENT_STATUS_COLORS[status] ?? "#6b7280",
      marginLeft: "6px",
      textTransform: "uppercase",
      letterSpacing: "0.03em",
    }}>
      {status}
    </span>
  );
}

// ─── Donations Page ───────────────────────────────────────────────────────────

function DonationsPage({
  state,
  dispatch,
  t,
  onRefresh,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  t: ReturnType<typeof getTranslations>;
  onRefresh?: () => Promise<void>;
}) {
  const totalKobo = state.donations.reduce((sum, d) => sum + d.amountKobo, 0);

  const hasPending = state.donations.some(
    (d) => d.paymentStatus === "pending" || d.paymentStatus === "processing"
  );

  useEffect(() => {
    if (!hasPending || !onRefresh) return;
    const timer = setInterval(() => { void onRefresh(); }, 10_000);
    return () => clearInterval(timer);
  }, [hasPending, onRefresh]);

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
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: "15px", display: "flex", alignItems: "center", flexWrap: "wrap" }}>
                  {DONATION_TYPES.find((dt) => dt.value === d.donationType)?.label ?? d.donationType}
                  <PaymentStatusBadge status={d.paymentStatus} />
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
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                <div style={{ fontSize: "16px", fontWeight: 700, color: colors.primary }}>
                  {koboToNaira(d.amountKobo)}
                </div>
                {d.receiptNumber && (
                  <a
                    href={`/api/documents/receipt?ref=${encodeURIComponent(d.receiptNumber)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: "11px", color: colors.primary, textDecoration: "none", whiteSpace: "nowrap" }}
                    aria-label="Get Receipt"
                  >
                    📄 {t.donations.receiptNumber}
                  </a>
                )}
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
    // nairaToKobo: multiply by 100 then round to avoid float drift (Part 9.2)
    const amountKobo = Math.round(parseFloat(form.amountNaira || "0") * 100);

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

// ─── Phase 5: Analytics & Donor CRM Pages ────────────────────────────────────

interface DonationAnalytics {
  monthlyTrend: Array<{ month: string; totalKobo: number; count: number }>;
  departmentBreakdown: Array<{ departmentId: string; name: string; totalKobo: number }>;
  topGiversTiers: { major: number; regular: number; lapsed: number };
  yoyComparison: { thisYearKobo: number; lastYearKobo: number; percentChange: number | null };
}

interface PledgeAnalytics {
  totalPledgedKobo: number;
  totalPaidKobo: number;
  fulfillmentPercent: number;
  aging: {
    bucket30d: { count: number; kobo: number };
    bucket60d: { count: number; kobo: number };
    bucket90dPlus: { count: number; kobo: number };
  };
  topUnfulfilled: Array<{ pledgeId: string; memberId: string; totalAmountKobo: number; paidAmountKobo: number; remainingKobo: number; dueDate: number | null }>;
}

interface DonorProfile {
  id: string; firstName: string; lastName: string; phone: string | null; email: string | null;
  isDonor: number; donorSince: number | null; donorNotes: string | null;
  totalGivenKobo: number; lastGiftDate: number | null; giftCount: number; ytdKobo: number;
  donorTier: "major" | "regular" | "lapsed";
}

interface CivicProjectItem {
  id: string; name: string; donorName: string | null; budgetKobo: number; status: string;
  startDate: number | null; endDate: number | null; description: string | null;
}

function AnalyticsPage({ dispatch }: { dispatch: React.Dispatch<Action> }) {
  const [donAna, setDonAna] = useState<DonationAnalytics | null>(null);
  const [pledAna, setPledAna] = useState<PledgeAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiGet<DonationAnalytics>("/analytics/donations"),
      apiGet<PledgeAnalytics>("/analytics/pledges"),
    ]).then(([d, p]) => {
      if (d.success && d.data) setDonAna(d.data);
      if (p.success && p.data) setPledAna(p.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingSpinner />;

  const maxKobo = donAna ? Math.max(...donAna.monthlyTrend.map((m) => m.totalKobo), 1) : 1;

  return (
    <div>
      <div style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>📊 Analytics</div>

      {donAna && (
        <>
          <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>Tithe & Offering Trends (12 months)</div>
          <div style={{ backgroundColor: colors.surface, borderRadius: "12px", padding: "16px", marginBottom: "16px", border: `1px solid ${colors.border}` }}>
            {donAna.monthlyTrend.map((m) => (
              <div key={m.month} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <div style={{ width: "42px", fontSize: "10px", color: colors.textMuted, flexShrink: 0 }}>{m.month.slice(5)}</div>
                <div style={{ flex: 1, height: "18px", borderRadius: "4px", backgroundColor: colors.border, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(m.totalKobo / maxKobo) * 100}%`, backgroundColor: colors.primary, borderRadius: "4px" }} />
                </div>
                <div style={{ width: "70px", fontSize: "10px", textAlign: "right" as const, color: colors.text }}>{koboToNaira(m.totalKobo)}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
            <div style={{ ...s.statCard }}>
              <div style={{ fontSize: "11px", color: colors.textMuted }}>This Year</div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: colors.success }}>{koboToNaira(donAna.yoyComparison.thisYearKobo)}</div>
            </div>
            <div style={{ ...s.statCard }}>
              <div style={{ fontSize: "11px", color: colors.textMuted }}>YoY Change</div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: (donAna.yoyComparison.percentChange ?? 0) >= 0 ? colors.success : colors.error }}>
                {donAna.yoyComparison.percentChange !== null ? `${donAna.yoyComparison.percentChange > 0 ? "+" : ""}${donAna.yoyComparison.percentChange}%` : "N/A"}
              </div>
            </div>
          </div>

          <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>Giving Tiers (YTD)</div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            {[
              { label: "Major (≥₦5k)", count: donAna.topGiversTiers.major, color: colors.primary },
              { label: "Regular", count: donAna.topGiversTiers.regular, color: colors.success },
              { label: "Lapsed", count: donAna.topGiversTiers.lapsed, color: colors.textMuted },
            ].map((tier) => (
              <div key={tier.label} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: "10px", padding: "10px", border: `1px solid ${colors.border}`, textAlign: "center" as const }}>
                <div style={{ fontSize: "20px", fontWeight: 700, color: tier.color }}>{tier.count}</div>
                <div style={{ fontSize: "10px", color: colors.textMuted }}>{tier.label}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>Department Giving</div>
          <div style={{ backgroundColor: colors.surface, borderRadius: "12px", padding: "16px", marginBottom: "16px", border: `1px solid ${colors.border}` }}>
            {donAna.departmentBreakdown.length === 0 && <div style={{ color: colors.textMuted, fontSize: "13px" }}>No department data</div>}
            {donAna.departmentBreakdown.map((d) => {
              const maxD = Math.max(...donAna.departmentBreakdown.map((x) => x.totalKobo), 1);
              return (
                <div key={d.departmentId} style={{ marginBottom: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "3px" }}>
                    <span>{d.name}</span><span style={{ color: colors.primary }}>{koboToNaira(d.totalKobo)}</span>
                  </div>
                  <div style={{ height: "6px", borderRadius: "3px", backgroundColor: colors.border }}>
                    <div style={{ height: "100%", width: `${(d.totalKobo / maxD) * 100}%`, backgroundColor: colors.primary, borderRadius: "3px" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {pledAna && (
        <>
          <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>Pledge Reconciliation</div>
          <div style={{ backgroundColor: colors.surface, borderRadius: "12px", padding: "16px", marginBottom: "16px", border: `1px solid ${colors.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "13px" }}>Total Pledged</span>
              <span style={{ fontWeight: 700 }}>{koboToNaira(pledAna.totalPledgedKobo)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "13px" }}>Total Paid</span>
              <span style={{ fontWeight: 700, color: colors.success }}>{koboToNaira(pledAna.totalPaidKobo)}</span>
            </div>
            <div style={{ height: "8px", borderRadius: "4px", backgroundColor: colors.border, marginBottom: "4px" }}>
              <div style={{ height: "100%", width: `${pledAna.fulfillmentPercent}%`, backgroundColor: colors.success, borderRadius: "4px" }} />
            </div>
            <div style={{ fontSize: "12px", color: colors.textMuted }}>{pledAna.fulfillmentPercent}% fulfilled</div>
          </div>

          <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>Overdue Buckets</div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            {[
              { label: "0–30 days", ...pledAna.aging.bucket30d },
              { label: "30–60 days", ...pledAna.aging.bucket60d },
              { label: "90+ days", ...pledAna.aging.bucket90dPlus },
            ].map((b) => (
              <div key={b.label} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: "10px", padding: "10px", border: `1px solid ${colors.border}` }}>
                <div style={{ fontSize: "16px", fontWeight: 700, color: colors.error }}>{b.count}</div>
                <div style={{ fontSize: "9px", color: colors.textMuted }}>{b.label}</div>
                <div style={{ fontSize: "10px", color: colors.textMuted }}>{koboToNaira(b.kobo)}</div>
              </div>
            ))}
          </div>

          {pledAna.topUnfulfilled.length > 0 && (
            <>
              <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>Top Unfulfilled Pledges</div>
              {pledAna.topUnfulfilled.map((p) => (
                <div key={p.pledgeId} style={{ ...s.card, display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: "12px", color: colors.textMuted }}>Member: {p.memberId.slice(0, 8)}…</div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: colors.error }}>Outstanding: {koboToNaira(p.remainingKobo)}</div>
                  </div>
                  <div style={{ fontSize: "11px", color: colors.textMuted }}>{p.dueDate ? new Date(p.dueDate).toLocaleDateString("en-NG") : "No due"}</div>
                </div>
              ))}
            </>
          )}
        </>
      )}

      <button style={{ ...s.btn, backgroundColor: colors.primary, color: "#fff", padding: "12px 20px", borderRadius: "10px", border: "none", cursor: "pointer", width: "100%", marginTop: "8px" }}
        onClick={() => dispatch({ type: "SET_PAGE", page: "donors" })}>
        👥 View Donor CRM
      </button>
      <button style={{ ...s.btn, backgroundColor: colors.success, color: "#fff", padding: "12px 20px", borderRadius: "10px", border: "none", cursor: "pointer", width: "100%", marginTop: "8px" }}
        onClick={() => dispatch({ type: "SET_PAGE", page: "projects" })}>
        📁 View Projects
      </button>

      <div style={{ fontSize: "13px", fontWeight: 700, color: colors.textMuted, marginTop: "20px", marginBottom: "8px" }}>Admin Logs</div>
      <button style={{ ...s.btn, backgroundColor: "#6c757d", color: "#fff", padding: "10px 20px", borderRadius: "10px", border: "none", cursor: "pointer", width: "100%", marginBottom: "8px" }}
        onClick={() => dispatch({ type: "SET_PAGE", page: "webhook-log" })}>
        🔔 Payment Webhook Log
      </button>
      <button style={{ ...s.btn, backgroundColor: "#6c757d", color: "#fff", padding: "10px 20px", borderRadius: "10px", border: "none", cursor: "pointer", width: "100%" }}
        onClick={() => dispatch({ type: "SET_PAGE", page: "ndpr-audit" })}>
        🔒 NDPR Audit Trail
      </button>
    </div>
  );
}

function DonorsPage({ dispatch }: { dispatch: React.Dispatch<Action> }) {
  const [donors, setDonors] = useState<DonorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiGet<{ donors: DonorProfile[] }>("/donors").then((r) => {
      if (r.success && r.data) setDonors(r.data.donors);
      setLoading(false);
    });
  }, []);

  const tierColor = (t: string) => t === "major" ? colors.primary : t === "regular" ? colors.success : colors.textMuted;
  const filtered = donors.filter((d) => `${d.firstName} ${d.lastName}`.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <button style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer" }} onClick={() => dispatch({ type: "SET_PAGE", page: "analytics" })}>←</button>
        <div style={{ fontSize: "20px", fontWeight: 700 }}>Donor CRM</div>
      </div>
      <input
        style={{ width: "100%", padding: "10px", borderRadius: "8px", border: `1px solid ${colors.border}`, marginBottom: "12px", fontSize: "14px", boxSizing: "border-box" as const }}
        placeholder="Search donors..." value={search} onChange={(e) => setSearch(e.target.value)}
      />
      {filtered.length === 0 && <div style={{ color: colors.textMuted }}>No donors found</div>}
      {filtered.map((d) => (
        <div key={d.id} style={{ ...s.card, cursor: "pointer" }} onClick={() => dispatch({ type: "SET_PAGE", page: "donor-detail", selectedId: d.id })}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 600 }}>{d.firstName} {d.lastName}</div>
              <div style={{ fontSize: "12px", color: colors.textMuted }}>{d.phone ?? d.email ?? "—"}</div>
              <div style={{ fontSize: "12px", marginTop: "4px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: tierColor(d.donorTier), backgroundColor: `${tierColor(d.donorTier)}22`, padding: "2px 7px", borderRadius: "10px" }}>{d.donorTier.toUpperCase()}</span>
              </div>
            </div>
            <div style={{ textAlign: "right" as const }}>
              <div style={{ fontWeight: 700, color: colors.primary }}>{koboToNaira(d.totalGivenKobo)}</div>
              <div style={{ fontSize: "11px", color: colors.textMuted }}>{d.giftCount} gifts</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DonorDetailPage({ state, dispatch }: { state: AppState; dispatch: React.Dispatch<Action> }) {
  const [donor, setDonor] = useState<DonorProfile | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!state.selectedId) return;
    apiGet<{ donors: DonorProfile[] }>("/donors").then((r) => {
      if (r.success && r.data) {
        const d = r.data.donors.find((x) => x.id === state.selectedId) ?? null;
        setDonor(d);
        setNotes(d?.donorNotes ?? "");
      }
    });
  }, [state.selectedId]);

  const handleSave = async () => {
    if (!donor) return;
    setSaving(true);
    await apiPatch(`/members/${donor.id}/donor-profile`, { isDonor: true, donorNotes: notes });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!donor) return <LoadingSpinner />;

  const tierColor = (t: string) => t === "major" ? colors.primary : t === "regular" ? colors.success : colors.textMuted;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <button style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer" }} onClick={() => dispatch({ type: "SET_PAGE", page: "donors" })}>←</button>
        <div style={{ fontSize: "20px", fontWeight: 700 }}>Donor Profile</div>
      </div>
      <div style={s.card}>
        <div style={{ fontWeight: 700, fontSize: "18px" }}>{donor.firstName} {donor.lastName}</div>
        <span style={{ fontSize: "11px", fontWeight: 700, color: tierColor(donor.donorTier), backgroundColor: `${tierColor(donor.donorTier)}22`, padding: "2px 8px", borderRadius: "10px" }}>{donor.donorTier.toUpperCase()}</span>
        <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
          <div style={s.statCard}><div style={{ fontSize: "11px", color: colors.textMuted }}>Total Given</div><div style={{ fontWeight: 700, color: colors.primary }}>{koboToNaira(donor.totalGivenKobo)}</div></div>
          <div style={s.statCard}><div style={{ fontSize: "11px", color: colors.textMuted }}>YTD</div><div style={{ fontWeight: 700, color: colors.success }}>{koboToNaira(donor.ytdKobo)}</div></div>
        </div>
        <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
          <div style={s.statCard}><div style={{ fontSize: "11px", color: colors.textMuted }}>Gifts</div><div style={{ fontWeight: 700 }}>{donor.giftCount}</div></div>
          <div style={s.statCard}><div style={{ fontSize: "11px", color: colors.textMuted }}>Last Gift</div><div style={{ fontWeight: 700, fontSize: "12px" }}>{donor.lastGiftDate ? new Date(donor.lastGiftDate).toLocaleDateString("en-NG") : "—"}</div></div>
        </div>
      </div>
      <div style={s.card}>
        <div style={{ fontWeight: 600, marginBottom: "8px" }}>Donor Notes</div>
        <textarea
          style={{ width: "100%", minHeight: "80px", padding: "8px", borderRadius: "8px", border: `1px solid ${colors.border}`, fontSize: "13px", resize: "vertical" as const, boxSizing: "border-box" as const }}
          value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes about this donor..."
        />
        {saved && <div style={{ color: colors.success, fontSize: "12px", marginTop: "4px" }}>✓ Saved</div>}
        <button
          style={{ marginTop: "8px", padding: "10px 20px", backgroundColor: colors.primary, color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, opacity: saving ? 0.6 : 1 }}
          onClick={handleSave} disabled={saving}
        >
          {saving ? "Saving…" : "Save Notes"}
        </button>
      </div>
    </div>
  );
}

function ProjectsPage({ dispatch }: { dispatch: React.Dispatch<Action> }) {
  const [projects, setProjects] = useState<CivicProjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ projects: CivicProjectItem[] }>("/projects").then((r) => {
      if (r.success && r.data) setProjects(r.data.projects);
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingSpinner />;

  const statusColor = (s: string) => s === "active" ? colors.success : s === "closed" ? colors.textMuted : colors.warning ?? colors.primary;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer" }} onClick={() => dispatch({ type: "SET_PAGE", page: "analytics" })}>←</button>
          <div style={{ fontSize: "20px", fontWeight: 700 }}>Projects</div>
        </div>
        <button style={{ padding: "8px 14px", backgroundColor: colors.primary, color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}
          onClick={() => dispatch({ type: "SET_PAGE", page: "project-create" })}>+ New</button>
      </div>
      {projects.length === 0 && <div style={{ color: colors.textMuted }}>No projects yet</div>}
      {projects.map((p) => (
        <div key={p.id} style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ fontWeight: 600 }}>{p.name}</div>
            <span style={{ fontSize: "11px", fontWeight: 600, color: statusColor(p.status), backgroundColor: `${statusColor(p.status)}22`, padding: "2px 8px", borderRadius: "10px" }}>{p.status}</span>
          </div>
          {p.donorName && <div style={{ fontSize: "12px", color: colors.textMuted, marginTop: "4px" }}>Donor: {p.donorName}</div>}
          <div style={{ marginTop: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
              <span>Budget: {koboToNaira(p.budgetKobo)}</span>
            </div>
            <div style={{ height: "6px", borderRadius: "3px", backgroundColor: colors.border }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectCreatePage({ dispatch }: { dispatch: React.Dispatch<Action> }) {
  const [form, setForm] = useState({ name: "", donorName: "", budgetKobo: "", description: "", status: "draft" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Project name is required"); return; }
    setSaving(true);
    const res = await apiPost<{ projectId: string }>("/projects", {
      name: form.name,
      donorName: form.donorName || undefined,
      // budgetKobo is stored as integer kobo — parse as integer, no multiplication
      budgetKobo: form.budgetKobo ? Math.trunc(parseFloat(form.budgetKobo)) : 0,
      description: form.description || undefined,
      status: form.status,
    });
    setSaving(false);
    if (res.success) dispatch({ type: "SET_PAGE", page: "projects" });
    else setError(res.error ?? "Failed to create project");
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <button style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer" }} onClick={() => dispatch({ type: "SET_PAGE", page: "projects" })}>←</button>
        <div style={{ fontSize: "20px", fontWeight: 700 }}>New Project</div>
      </div>
      {error && <div style={{ padding: "10px", backgroundColor: "#FEE2E2", color: colors.error, borderRadius: "8px", marginBottom: "12px" }}>{error}</div>}
      {[
        { label: "Project Name *", key: "name", type: "text" },
        { label: "Donor Name", key: "donorName", type: "text" },
        { label: "Budget (₦)", key: "budgetKobo", type: "number" },
        { label: "Description", key: "description", type: "text" },
      ].map(({ label, key, type }) => (
        <div key={key} style={{ marginBottom: "12px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>{label}</label>
          <input type={type} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: `1px solid ${colors.border}`, fontSize: "14px", boxSizing: "border-box" as const }}
            value={form[key as keyof typeof form]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
        </div>
      ))}
      <div style={{ marginBottom: "12px" }}>
        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>Status</label>
        <select style={{ width: "100%", padding: "10px", borderRadius: "8px", border: `1px solid ${colors.border}`, fontSize: "14px" }}
          value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      <button style={{ width: "100%", padding: "14px", backgroundColor: colors.primary, color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 700, opacity: saving ? 0.6 : 1 }}
        onClick={handleSave} disabled={saving}>
        {saving ? "Creating…" : "Create Project"}
      </button>
    </div>
  );
}

// ─── Member Self-Service Portal (E05) ─────────────────────────────────────────

function MemberPortal({ dispatch }: { dispatch: React.Dispatch<Action> }) {
  return (
    <div>
      <div style={{ textAlign: "center" as const, padding: "24px 0 16px" }}>
        <div style={{ fontSize: "40px" }}>👤</div>
        <div style={{ fontSize: "20px", fontWeight: 700, marginTop: "8px" }}>My Portal</div>
        <div style={{ fontSize: "13px", color: colors.textMuted }}>Member Self-Service</div>
      </div>
      {[
        { page: "portal-giving" as Page, icon: "🙏", label: "My Giving", desc: "Donations & YTD total" },
        { page: "portal-pledges" as Page, icon: "🤝", label: "My Pledges", desc: "Active pledges & payments" },
        { page: "portal-events" as Page, icon: "📅", label: "My Events", desc: "Upcoming events" },
        { page: "portal-profile" as Page, icon: "✏️", label: "My Profile", desc: "View & update your info" },
      ].map((item) => (
        <div key={item.page} style={{ ...s.card, cursor: "pointer", display: "flex", alignItems: "center", gap: "14px" }}
          onClick={() => dispatch({ type: "SET_PAGE", page: item.page })}>
          <div style={{ fontSize: "28px" }}>{item.icon}</div>
          <div>
            <div style={{ fontWeight: 600 }}>{item.label}</div>
            <div style={{ fontSize: "12px", color: colors.textMuted }}>{item.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PortalGivingPage({ state, dispatch }: { state: AppState; dispatch: React.Dispatch<Action> }) {
  const donations = state.donations;
  const ytd = donations.filter((d) => d.donationDate >= new Date(new Date().getFullYear(), 0, 1).getTime()).reduce((s, d) => s + d.amountKobo, 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <button style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer" }} onClick={() => dispatch({ type: "SET_PAGE", page: "member-portal" })}>←</button>
        <div style={{ fontSize: "20px", fontWeight: 700 }}>My Giving</div>
      </div>
      <div style={{ ...s.statCard, marginBottom: "16px", backgroundColor: colors.primary + "15" }}>
        <div style={{ fontSize: "12px", color: colors.textMuted }}>Year-to-Date Total</div>
        <div style={{ fontSize: "26px", fontWeight: 700, color: colors.primary }}>{koboToNaira(ytd)}</div>
      </div>
      {donations.length === 0 && <div style={{ color: colors.textMuted }}>No donations recorded</div>}
      {donations.map((d) => (
        <div key={d.id} style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 600 }}>{d.donationType}</div>
              <div style={{ fontSize: "12px", color: colors.textMuted }}>{new Date(d.donationDate).toLocaleDateString("en-NG")}</div>
            </div>
            <div style={{ fontWeight: 700, color: colors.success }}>{koboToNaira(d.amountKobo)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PortalPledgesPage({ state, dispatch }: { state: AppState; dispatch: React.Dispatch<Action> }) {
  const pledges = state.pledges.filter((p) => p.pledgeStatus === "active");
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <button style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer" }} onClick={() => dispatch({ type: "SET_PAGE", page: "member-portal" })}>←</button>
        <div style={{ fontSize: "20px", fontWeight: 700 }}>My Pledges</div>
      </div>
      {pledges.length === 0 && <div style={{ color: colors.textMuted }}>No active pledges</div>}
      {pledges.map((p) => {
        const pct = p.totalAmountKobo > 0 ? Math.round((p.paidAmountKobo / p.totalAmountKobo) * 100) : 0;
        return (
          <div key={p.id} style={s.card}>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>{p.description}</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
              <span>Paid: {koboToNaira(p.paidAmountKobo)}</span>
              <span>Total: {koboToNaira(p.totalAmountKobo)}</span>
            </div>
            <div style={{ height: "6px", borderRadius: "3px", backgroundColor: colors.border }}>
              <div style={{ height: "100%", width: `${pct}%`, backgroundColor: colors.success, borderRadius: "3px" }} />
            </div>
            <div style={{ fontSize: "11px", color: colors.textMuted, marginTop: "4px" }}>{pct}% fulfilled</div>
          </div>
        );
      })}
    </div>
  );
}

function PortalEventsPage({ state, dispatch }: { state: AppState; dispatch: React.Dispatch<Action> }) {
  const upcoming = state.events.filter((e) => e.startTime > Date.now()).slice(0, 10);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <button style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer" }} onClick={() => dispatch({ type: "SET_PAGE", page: "member-portal" })}>←</button>
        <div style={{ fontSize: "20px", fontWeight: 700 }}>My Events</div>
      </div>
      {upcoming.length === 0 && <div style={{ color: colors.textMuted }}>No upcoming events</div>}
      {upcoming.map((e) => (
        <div key={e.id} style={s.card}>
          <div style={{ fontWeight: 600 }}>{e.title}</div>
          <div style={{ fontSize: "12px", color: colors.textMuted }}>{new Date(e.startTime).toLocaleDateString("en-NG", { weekday: "short", month: "short", day: "numeric" })}</div>
          {e.venue && <div style={{ fontSize: "12px", color: colors.textMuted }}>📍 {e.venue}</div>}
        </div>
      ))}
    </div>
  );
}

function PortalProfilePage({ state, dispatch }: { state: AppState; dispatch: React.Dispatch<Action> }) {
  const me = state.members[0] ?? null;
  const [phone, setPhone] = useState(me?.phone ?? "");
  const [address, setAddress] = useState(me?.address ?? "");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const handleSave = async () => {
    if (!me) return;
    setPending(true);
    await apiPatch(`/members/${me.id}`, { phone, address });
    setPending(false);
    setDone(true);
    setTimeout(() => setDone(false), 3000);
  };

  if (!me) return <div style={{ color: colors.textMuted }}>Profile not loaded</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <button style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer" }} onClick={() => dispatch({ type: "SET_PAGE", page: "member-portal" })}>←</button>
        <div style={{ fontSize: "20px", fontWeight: 700 }}>My Profile</div>
      </div>
      <div style={s.card}>
        <div style={{ fontSize: "18px", fontWeight: 700 }}>{me.firstName} {me.lastName}</div>
        <div style={{ fontSize: "13px", color: colors.textMuted }}>Member #{me.memberNumber ?? "—"}</div>
        <div style={{ fontSize: "13px", color: colors.textMuted }}>{me.email ?? "No email"}</div>
      </div>
      {done && (
        <div style={{ padding: "10px", backgroundColor: "#D1FAE5", color: colors.success, borderRadius: "8px", marginBottom: "12px" }}>
          ✓ Update submitted — pending admin approval
        </div>
      )}
      <div style={s.card}>
        <div style={{ fontWeight: 600, marginBottom: "12px" }}>Update Contact Info</div>
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>Phone</label>
          <input type="tel" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: `1px solid ${colors.border}`, fontSize: "14px", boxSizing: "border-box" as const }}
            value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>Address</label>
          <input type="text" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: `1px solid ${colors.border}`, fontSize: "14px", boxSizing: "border-box" as const }}
            value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <button style={{ width: "100%", padding: "12px", backgroundColor: colors.primary, color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, opacity: pending ? 0.6 : 1 }}
          onClick={handleSave} disabled={pending}>
          {pending ? "Submitting…" : "Submit Update"}
        </button>
      </div>
    </div>
  );
}

// ─── Admin Log Pages ──────────────────────────────────────────────────────────

function WebhookLogPage({ state, dispatch }: { state: AppState; dispatch: React.Dispatch<Action> }) {
  const [loading, setLoading] = useState(state.webhookLogs.length === 0);

  useEffect(() => {
    if (state.webhookLogs.length > 0) return;
    apiGet<{ logs: CivicWebhookLog[] }>("/webhook-log?limit=50").then((r) => {
      if (r.success && r.data) dispatch({ type: "SET_WEBHOOK_LOGS", logs: r.data.logs });
      setLoading(false);
    });
  }, [dispatch]);

  const statusColor = (s: string) =>
    s === "processed" ? colors.success : s === "error" ? colors.error : colors.textMuted;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <button style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer" }} onClick={() => dispatch({ type: "SET_PAGE", page: "analytics" })}>←</button>
        <div style={{ fontSize: "20px", fontWeight: 700 }}>🔔 Payment Webhook Log</div>
      </div>
      {loading ? <LoadingSpinner /> : (
        <>
          {state.webhookLogs.length === 0 && (
            <div style={{ color: colors.textMuted, fontSize: "14px", textAlign: "center" as const, padding: "32px" }}>No webhook events recorded yet.</div>
          )}
          {state.webhookLogs.map((log) => (
            <div key={log.id} style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: "10px", padding: "12px", marginBottom: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <span style={{ fontWeight: 600, fontSize: "13px" }}>{log.event}</span>
                <span style={{ fontSize: "11px", fontWeight: 600, color: statusColor(log.status), textTransform: "uppercase" as const }}>{log.status}</span>
              </div>
              <div style={{ fontSize: "11px", color: colors.textMuted, marginBottom: "2px" }}>Ref: {log.reference}</div>
              <div style={{ fontSize: "11px", color: colors.textMuted }}>Provider: {log.provider} · {new Date(log.createdAt).toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function NdprAuditPage({ state, dispatch }: { state: AppState; dispatch: React.Dispatch<Action> }) {
  const [loading, setLoading] = useState(state.ndprAuditLogs.length === 0);

  useEffect(() => {
    if (state.ndprAuditLogs.length > 0) return;
    apiGet<{ logs: CivicNdprAuditLog[] }>("/ndpr/audit-log").then((r) => {
      if (r.success && r.data) dispatch({ type: "SET_NDPR_AUDIT_LOGS", logs: r.data.logs });
      setLoading(false);
    });
  }, [dispatch]);

  const actionIcon = (a: string) =>
    a === "consent_granted" ? "✅" :
    a === "consent_revoked" ? "❌" :
    a === "data_export" ? "📤" :
    a === "data_deleted" ? "🗑️" : "📋";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <button style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer" }} onClick={() => dispatch({ type: "SET_PAGE", page: "analytics" })}>←</button>
        <div style={{ fontSize: "20px", fontWeight: 700 }}>🔒 NDPR Audit Trail</div>
      </div>
      <div style={{ fontSize: "12px", color: colors.textMuted, marginBottom: "12px" }}>All data-privacy actions recorded for NDPR compliance.</div>
      {loading ? <LoadingSpinner /> : (
        <>
          {state.ndprAuditLogs.length === 0 && (
            <div style={{ color: colors.textMuted, fontSize: "14px", textAlign: "center" as const, padding: "32px" }}>No NDPR audit events recorded yet.</div>
          )}
          {state.ndprAuditLogs.map((log) => (
            <div key={log.id} style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: "10px", padding: "12px", marginBottom: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <span style={{ fontWeight: 600, fontSize: "13px" }}>{actionIcon(log.action)} {log.action.replace(/_/g, " ")}</span>
                <span style={{ fontSize: "11px", color: colors.textMuted }}>{new Date(log.createdAt).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos" })}</span>
              </div>
              <div style={{ fontSize: "11px", color: colors.textMuted, marginBottom: "2px" }}>Member ID: {log.memberId.slice(0, 8)}…</div>
              {log.notes && <div style={{ fontSize: "11px", color: colors.text }}>{log.notes}</div>}
              <div style={{ fontSize: "11px", color: colors.textMuted }}>By: {log.performedBy}</div>
            </div>
          ))}
        </>
      )}
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
  { page: "analytics" as Page, icon: "📊", key: "analytics" as const },
  { page: "usher-panel" as Page, icon: "📿", key: "usher" as const },
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
      apiGet<{ events: CivicEventRecord[] }>("/events"),
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

  const refreshDonations = useCallback(async () => {
    const res = await apiGet<{ donations: CivicDonation[]; totalKobo: number }>("/donations");
    if (res.success && res.data) {
      dispatch({ type: "SET_DONATIONS", donations: res.data.donations });
    }
  }, [dispatch]);

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
        return <DonationsPage state={state} dispatch={dispatch} t={t} onRefresh={refreshDonations} />;
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
      case "analytics":
        return <AnalyticsPage dispatch={dispatch} />;
      case "donors":
        return <DonorsPage dispatch={dispatch} />;
      case "donor-detail":
        return <DonorDetailPage state={state} dispatch={dispatch} />;
      case "projects":
        return <ProjectsPage dispatch={dispatch} />;
      case "project-create":
        return <ProjectCreatePage dispatch={dispatch} />;
      case "member-portal":
        return <MemberPortal dispatch={dispatch} />;
      case "portal-giving":
        return <PortalGivingPage state={state} dispatch={dispatch} />;
      case "portal-pledges":
        return <PortalPledgesPage state={state} dispatch={dispatch} />;
      case "portal-events":
        return <PortalEventsPage state={state} dispatch={dispatch} />;
      case "portal-profile":
        return <PortalProfilePage state={state} dispatch={dispatch} />;
      case "webhook-log":
        return <WebhookLogPage state={state} dispatch={dispatch} />;
      case "ndpr-audit":
        return <NdprAuditPage state={state} dispatch={dispatch} />;
      case "usher-panel":
        return (
          <UsherPanel
            tenantId={state.organization?.tenantId ?? "local"}
            organizationId={state.organization?.id ?? "default"}
            apiBase=""
            getAuthToken={() => localStorage.getItem("webwaka_token") ?? ""}
            onBack={() => dispatch({ type: "SET_PAGE", page: "dashboard" })}
          />
        );
      default:
        return <DashboardPage state={state} dispatch={dispatch} t={t} />;
    }
  };

  const mainPage = (["dashboard", "members", "donations", "pledges", "events", "analytics", "usher-panel"] as Page[]).includes(
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
