/**
 * WebWaka Civic — Political Party Management Mobile-First PWA UI
 * Blueprint Reference: Part 10.9 (Civic & Political Suite — Political Party Management)
 *
 * Core Invariants enforced:
 * - Mobile First: all layouts start at 320px, scale up
 * - PWA First: service worker registered, manifest linked
 * - Offline First: Dexie sync engine, offline banner
 * - Nigeria First: NGN/kobo, WAT timezone, NDPR consent, INEC hierarchy
 * - Africa First: i18n en/yo/ig/ha, multi-currency
 * - Build Once Use Infinitely: modular, reusable components
 * - Vendor Neutral AI: no vendor lock-in
 *
 * Pages:
 * 1. Dashboard — stats, announcements, upcoming meetings
 * 2. Members — paginated list, search, register
 * 3. Dues — collection tracking, record payment
 * 4. Structure — INEC 6-level hierarchy drill-down
 * 5. Meetings — schedule, list upcoming/past
 * 6. ID Cards — issue, view, revoke
 */
import React, { useCallback, useEffect, useReducer, useState } from "react";
import { createPartyApiClient, type PartyMemberFilters, type PartyNomination, type PartyCampaignAccount, type PartyCampaignSummary } from "./apiClient";
import { getPartyTranslations, LOCALE_NAMES, SUPPORTED_LOCALES, type PartyLocale } from "./i18n";
import {
  formatWATDate,
  formatWATDateTime,
  generateMembershipNumber,
  getNDPRConsentStatement,
  isValidNigerianPhone,
  koboToNaira,
  NIGERIAN_STATES,
  PARTY_LEVEL_LABELS,
  PARTY_STRUCTURE_LEVELS,
} from "./utils";
import type {
  PartyAnnouncement,
  PartyDues,
  PartyIdCard,
  PartyMeeting,
  PartyMember,
  PartyOrganization,
  PartyStructure,
} from "../../core/db/schema.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

type Page =
  | "dashboard"
  | "members"
  | "member-detail"
  | "member-create"
  | "dues"
  | "dues-create"
  | "structure"
  | "structure-detail"
  | "meetings"
  | "meeting-create"
  | "id-cards"
  | "id-card-issue"
  | "nominations"
  | "nomination-create"
  | "nomination-detail"
  | "campaign-finance"
  | "finance-account-create"
  | "finance-transactions"
  | "analytics";

interface DashboardStats {
  totalMembers: number;
  activeMembers: number;
  totalDuesCollectedKobo: number;
  currentYearDuesKobo: number;
  totalStructures: number;
  upcomingMeetings: number;
  totalDuesCollectedNaira: string;
  currentYearDuesNaira: string;
}

interface AppState {
  page: Page;
  selectedId: string | null;
  locale: PartyLocale;
  isOnline: boolean;
  isLoading: boolean;
  error: string | null;
  organization: PartyOrganization | null;
  members: PartyMember[];
  membersTotal: number;
  membersPage: number;
  dues: PartyDues[];
  structures: PartyStructure[];
  selectedStructure: PartyStructure | null;
  meetings: PartyMeeting[];
  announcements: PartyAnnouncement[];
  idCards: PartyIdCard[];
  dashboardStats: DashboardStats | null;
  memberSearch: string;
  memberStatusFilter: string;
  nominations: PartyNomination[];
  nominationsTotal: number;
  selectedNomination: PartyNomination | null;
  campaignAccounts: PartyCampaignAccount[];
  selectedCampaignAccount: PartyCampaignAccount | null;
  campaignSummary: PartyCampaignSummary | null;
  nominationStatusFilter: string;
}

type Action =
  | { type: "SET_PAGE"; page: Page; selectedId?: string }
  | { type: "SET_LOCALE"; locale: PartyLocale }
  | { type: "SET_ONLINE"; isOnline: boolean }
  | { type: "SET_LOADING"; isLoading: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SET_ORGANIZATION"; organization: PartyOrganization }
  | { type: "SET_MEMBERS"; members: PartyMember[]; total: number; page: number }
  | { type: "SET_DUES"; dues: PartyDues[] }
  | { type: "SET_STRUCTURES"; structures: PartyStructure[] }
  | { type: "SET_SELECTED_STRUCTURE"; structure: PartyStructure | null }
  | { type: "SET_MEETINGS"; meetings: PartyMeeting[] }
  | { type: "SET_ANNOUNCEMENTS"; announcements: PartyAnnouncement[] }
  | { type: "SET_ID_CARDS"; idCards: PartyIdCard[] }
  | { type: "SET_DASHBOARD_STATS"; stats: DashboardStats }
  | { type: "SET_MEMBER_SEARCH"; search: string }
  | { type: "SET_MEMBER_STATUS_FILTER"; status: string }
  | { type: "SET_NOMINATIONS"; nominations: PartyNomination[]; total: number }
  | { type: "SET_SELECTED_NOMINATION"; nomination: PartyNomination | null }
  | { type: "SET_CAMPAIGN_ACCOUNTS"; accounts: PartyCampaignAccount[] }
  | { type: "SET_SELECTED_CAMPAIGN_ACCOUNT"; account: PartyCampaignAccount | null }
  | { type: "SET_CAMPAIGN_SUMMARY"; summary: PartyCampaignSummary | null }
  | { type: "SET_NOMINATION_STATUS_FILTER"; status: string };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_PAGE":
      return { ...state, page: action.page, selectedId: action.selectedId ?? null, error: null };
    case "SET_LOCALE":
      return { ...state, locale: action.locale };
    case "SET_ONLINE":
      return { ...state, isOnline: action.isOnline };
    case "SET_LOADING":
      return { ...state, isLoading: action.isLoading };
    case "SET_ERROR":
      return { ...state, error: action.error, isLoading: false };
    case "SET_ORGANIZATION":
      return { ...state, organization: action.organization };
    case "SET_MEMBERS":
      return { ...state, members: action.members, membersTotal: action.total, membersPage: action.page, isLoading: false };
    case "SET_DUES":
      return { ...state, dues: action.dues, isLoading: false };
    case "SET_STRUCTURES":
      return { ...state, structures: action.structures, isLoading: false };
    case "SET_SELECTED_STRUCTURE":
      return { ...state, selectedStructure: action.structure };
    case "SET_MEETINGS":
      return { ...state, meetings: action.meetings, isLoading: false };
    case "SET_ANNOUNCEMENTS":
      return { ...state, announcements: action.announcements, isLoading: false };
    case "SET_ID_CARDS":
      return { ...state, idCards: action.idCards, isLoading: false };
    case "SET_DASHBOARD_STATS":
      return { ...state, dashboardStats: action.stats, isLoading: false };
    case "SET_MEMBER_SEARCH":
      return { ...state, memberSearch: action.search };
    case "SET_MEMBER_STATUS_FILTER":
      return { ...state, memberStatusFilter: action.status };
    case "SET_NOMINATIONS":
      return { ...state, nominations: action.nominations, nominationsTotal: action.total, isLoading: false };
    case "SET_SELECTED_NOMINATION":
      return { ...state, selectedNomination: action.nomination };
    case "SET_CAMPAIGN_ACCOUNTS":
      return { ...state, campaignAccounts: action.accounts, isLoading: false };
    case "SET_SELECTED_CAMPAIGN_ACCOUNT":
      return { ...state, selectedCampaignAccount: action.account };
    case "SET_CAMPAIGN_SUMMARY":
      return { ...state, campaignSummary: action.summary, isLoading: false };
    case "SET_NOMINATION_STATUS_FILTER":
      return { ...state, nominationStatusFilter: action.status };
    default:
      return state;
  }
}

const initialState: AppState = {
  page: "dashboard",
  selectedId: null,
  locale: (localStorage.getItem("webwaka_party_locale") as PartyLocale) ?? "en",
  isOnline: navigator.onLine,
  isLoading: false,
  error: null,
  organization: null,
  members: [],
  membersTotal: 0,
  membersPage: 1,
  dues: [],
  structures: [],
  selectedStructure: null,
  meetings: [],
  announcements: [],
  idCards: [],
  dashboardStats: null,
  memberSearch: "",
  memberStatusFilter: "",
  nominations: [],
  nominationsTotal: 0,
  selectedNomination: null,
  campaignAccounts: [],
  selectedCampaignAccount: null,
  campaignSummary: null,
  nominationStatusFilter: "",
};

// ─── Design Tokens ────────────────────────────────────────────────────────────

const colors = {
  primary: "#1A3A5C",       // Deep navy — authority, trust, governance
  primaryLight: "#2A5A8C",
  primaryDark: "#0D1F33",
  accent: "#C8A951",        // Gold — prestige, national pride
  accentLight: "#E8C96A",
  surface: "#FFFFFF",
  surfaceAlt: "#F5F7FA",
  border: "#DDE2EA",
  text: "#1A2433",
  textMuted: "#6B7A8D",
  success: "#1E7A4A",
  warning: "#C8A951",
  error: "#C0392B",
  offline: "#E67E22",
  suspended: "#E67E22",
  expelled: "#C0392B",
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
    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
  } as React.CSSProperties,
  headerTitle: {
    fontSize: "17px",
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
    padding: "8px 2px",
    gap: "2px",
    cursor: "pointer",
    color: active ? colors.primary : colors.textMuted,
    backgroundColor: "transparent",
    border: "none",
    fontSize: "9px",
    fontWeight: active ? 700 : 400,
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
    boxShadow: variant === "primary" ? "0 2px 6px rgba(26,58,92,0.3)" : "none",
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
    boxShadow: "0 4px 12px rgba(200,169,81,0.4)",
    zIndex: 50,
  } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "8px",
    border: `1px solid ${colors.border}`,
    fontSize: "14px",
    color: colors.text,
    backgroundColor: colors.surface,
    outline: "none",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,
  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    color: colors.textMuted,
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
    backgroundColor: color + "20",
    color: color,
  }),
  errorBox: {
    backgroundColor: "#FEF2F2",
    border: `1px solid ${colors.error}`,
    borderRadius: "8px",
    padding: "12px",
    color: colors.error,
    fontSize: "14px",
    marginBottom: "16px",
  } as React.CSSProperties,
  searchBar: {
    display: "flex",
    gap: "8px",
    marginBottom: "16px",
  } as React.CSSProperties,
  emptyState: {
    textAlign: "center" as const,
    padding: "48px 16px",
    color: colors.textMuted,
  } as React.CSSProperties,
};

// ─── Helper Components ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    active: colors.success,
    suspended: colors.suspended,
    expelled: colors.expelled,
    deceased: colors.textMuted,
    resigned: colors.textMuted,
  };
  const color = colorMap[status] ?? colors.textMuted;
  return <span style={s.badge(color)}>{status}</span>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const colorMap: Record<string, string> = {
    normal: colors.textMuted,
    urgent: colors.warning,
    critical: colors.error,
  };
  const color = colorMap[priority] ?? colors.textMuted;
  return <span style={s.badge(color)}>{priority}</span>;
}

function LevelBadge({ level }: { level: string }) {
  const colorMap: Record<string, string> = {
    national: colors.primary,
    state: colors.primaryLight,
    senatorial: "#5B6FA8",
    federal_constituency: "#7B8FA8",
    lga: "#8B9FA8",
    ward: colors.textMuted,
  };
  const color = colorMap[level] ?? colors.textMuted;
  return <span style={s.badge(color)}>{PARTY_LEVEL_LABELS[level as keyof typeof PARTY_LEVEL_LABELS] ?? level}</span>;
}

function LoadingSpinner() {
  return (
    <div style={{ textAlign: "center", padding: "48px 16px", color: colors.textMuted }}>
      <div style={{ fontSize: "32px", marginBottom: "8px" }}>⏳</div>
      <div style={{ fontSize: "14px" }}>Loading...</div>
    </div>
  );
}

// ─── Admin Migrate Card ───────────────────────────────────────────────────────

function AdminMigrateCard({ onMigrate }: { onMigrate: () => Promise<unknown> }) {
  const [result, setResult] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);

  const handle = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await onMigrate() as { success: boolean; data?: { applied?: number }; error?: string };
      setResult(res.success ? `✓ Migration complete (${res.data?.applied ?? 0} applied)` : `✗ ${res.error ?? "Failed"}`);
    } catch (e) {
      setResult(`✗ ${String(e)}`);
    }
    setRunning(false);
  };

  return (
    <div style={{ marginTop: "24px", backgroundColor: "#F5F7FA", borderRadius: "12px", padding: "16px", border: "1px solid #DDE2EA" }}>
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
        onClick={() => setOpen(!open)}
      >
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#6B7A8D" }}>⚙️ Admin Tools</span>
        <span style={{ fontSize: "12px", color: "#6B7A8D" }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ marginTop: "12px" }}>
          {result && (
            <div style={{ padding: "8px 12px", borderRadius: "8px", backgroundColor: result.startsWith("✓") ? "#D1FAE5" : "#FEE2E2", color: result.startsWith("✓") ? "#1E7A4A" : "#C0392B", fontSize: "13px", marginBottom: "10px" }}>
              {result}
            </div>
          )}
          <button
            onClick={handle}
            disabled={running}
            style={{ padding: "10px 18px", backgroundColor: "#1A3A5C", color: "#fff", border: "none", borderRadius: "8px", cursor: running ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: 600, opacity: running ? 0.7 : 1 }}
          >
            {running ? "Running…" : "🗄️ Run DB Migrations"}
          </button>
          <p style={{ fontSize: "12px", color: "#6B7A8D", margin: "8px 0 0" }}>
            Bootstrap or upgrade this tenant's database tables. Safe to run multiple times.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

function DashboardPage({
  state,
  dispatch,
  t,
  onMigrate,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  t: ReturnType<typeof getPartyTranslations>;
  onMigrate?: () => Promise<unknown>;
}) {
  const { dashboardStats, organization, announcements, meetings } = state;
  const upcomingMeetings = meetings.filter((m) => m.scheduledAt > Date.now());

  return (
    <div>
      {/* Party name header */}
      {organization && (
        <div style={{ ...s.card, backgroundColor: colors.primary, color: "#FFFFFF", marginBottom: "16px" }}>
          <div style={{ fontSize: "20px", fontWeight: 700 }}>{organization.name}</div>
          <div style={{ fontSize: "14px", opacity: 0.8, marginTop: "4px" }}>
            {organization.abbreviation}
            {organization.inecRegistrationNumber && ` · INEC: ${organization.inecRegistrationNumber}`}
          </div>
        </div>
      )}

      {/* Stats grid */}
      {dashboardStats && (
        <div style={s.statsGrid}>
          <div style={s.statCard}>
            <div style={s.statValue}>{dashboardStats.totalMembers.toLocaleString()}</div>
            <div style={s.statLabel}>{t.dashboard.totalMembers}</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statValue}>{dashboardStats.activeMembers.toLocaleString()}</div>
            <div style={s.statLabel}>{t.dashboard.activeMembers}</div>
          </div>
          <div style={s.statCard}>
            <div style={{ ...s.statValue, fontSize: "16px" }}>{dashboardStats.currentYearDuesNaira}</div>
            <div style={s.statLabel}>{t.dashboard.currentYearDues}</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statValue}>{dashboardStats.totalStructures.toLocaleString()}</div>
            <div style={s.statLabel}>{t.dashboard.totalStructures}</div>
          </div>
        </div>
      )}

      {/* Upcoming meetings */}
      {upcomingMeetings.length > 0 && (
        <div>
          <div style={s.sectionTitle}>
            <span>📅 {t.dashboard.upcomingMeetings}</span>
          </div>
          {upcomingMeetings.slice(0, 3).map((meeting) => (
            <div key={meeting.id} style={s.card}>
              <div style={{ fontWeight: 600, fontSize: "15px" }}>{meeting.title}</div>
              <div style={{ fontSize: "13px", color: colors.textMuted, marginTop: "4px" }}>
                {formatWATDateTime(meeting.scheduledAt)}
                {meeting.venue && ` · ${meeting.venue}`}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent announcements */}
      {announcements.length > 0 && (
        <div>
          <div style={s.sectionTitle}>
            <span>📢 {t.dashboard.recentAnnouncements}</span>
          </div>
          {announcements.slice(0, 3).map((ann) => (
            <div key={ann.id} style={s.card}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <span style={{ fontWeight: 600, fontSize: "15px" }}>{ann.title}</span>
                <PriorityBadge priority={ann.priority} />
              </div>
              <div style={{ fontSize: "13px", color: colors.textMuted }}>{ann.content.slice(0, 120)}{ann.content.length > 120 ? "…" : ""}</div>
            </div>
          ))}
        </div>
      )}

      {!dashboardStats && !state.isLoading && (
        <div style={s.emptyState}>
          <div style={{ fontSize: "48px" }}>🏛️</div>
          <div style={{ marginTop: "12px", fontSize: "16px", fontWeight: 600 }}>{t.dashboard.title}</div>
          <div style={{ marginTop: "8px", fontSize: "14px" }}>{t.dashboard.noData}</div>
        </div>
      )}

      {onMigrate && <AdminMigrateCard onMigrate={onMigrate} />}
    </div>
  );
}

// ─── Members Page ─────────────────────────────────────────────────────────────

function MembersPage({
  state,
  dispatch,
  t,
  onRegisterMember,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  t: ReturnType<typeof getPartyTranslations>;
  onRegisterMember: () => void;
}) {
  const { members, membersTotal, memberSearch, memberStatusFilter } = state;

  return (
    <div>
      <div style={s.sectionTitle}>
        <span>{t.members.title}</span>
        <span style={{ fontSize: "14px", color: colors.textMuted }}>{membersTotal.toLocaleString()} total</span>
      </div>

      {/* Search & Filter */}
      <div style={s.searchBar}>
        <input
          style={{ ...s.input, flex: 1 }}
          placeholder={t.members.searchPlaceholder}
          value={memberSearch}
          onChange={(e) => dispatch({ type: "SET_MEMBER_SEARCH", search: e.target.value })}
        />
        <select
          style={{ ...s.input, width: "auto", paddingRight: "8px" }}
          value={memberStatusFilter}
          onChange={(e) => dispatch({ type: "SET_MEMBER_STATUS_FILTER", status: e.target.value })}
        >
          <option value="">All</option>
          <option value="active">{t.members.statusActive}</option>
          <option value="suspended">{t.members.statusSuspended}</option>
          <option value="expelled">{t.members.statusExpelled}</option>
        </select>
      </div>

      {/* Member list */}
      {members.length === 0 && !state.isLoading ? (
        <div style={s.emptyState}>
          <div style={{ fontSize: "48px" }}>👥</div>
          <div style={{ marginTop: "12px", fontSize: "15px" }}>{t.members.noMembers}</div>
        </div>
      ) : (
        members.map((member) => (
          <div
            key={member.id}
            style={{ ...s.card, cursor: "pointer" }}
            onClick={() => dispatch({ type: "SET_PAGE", page: "member-detail", selectedId: member.id })}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "15px" }}>
                  {member.firstName} {member.lastName}
                </div>
                <div style={{ fontSize: "12px", color: colors.textMuted, marginTop: "2px" }}>
                  {member.membershipNumber}
                </div>
                <div style={{ fontSize: "13px", color: colors.textMuted, marginTop: "4px" }}>
                  📱 {member.phone}
                  {member.ward && ` · ${member.ward}`}
                </div>
              </div>
              <StatusBadge status={member.memberStatus} />
            </div>
          </div>
        ))
      )}

      {/* FAB */}
      <button style={s.btnFab} onClick={onRegisterMember} title={t.members.registerMember}>
        +
      </button>
    </div>
  );
}

// ─── Member Create Form ───────────────────────────────────────────────────────

function MemberCreatePage({
  state,
  dispatch,
  t,
  onSave,
  onCancel,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  t: ReturnType<typeof getPartyTranslations>;
  onSave: (data: Partial<PartyMember>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    middleName: "",
    phone: "",
    email: "",
    address: "",
    state: "",
    lga: "",
    ward: "",
    voterCardNumber: "",
    structureId: "",
    role: "ordinary",
    ndprConsent: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.firstName.trim()) errs.firstName = "Required";
    if (!form.lastName.trim()) errs.lastName = "Required";
    if (!form.phone.trim()) errs.phone = "Required";
    else if (!isValidNigerianPhone(form.phone)) errs.phone = "Invalid Nigerian phone number";
    if (!form.structureId.trim()) errs.structureId = "Ward assignment required";
    if (!form.ndprConsent) errs.ndprConsent = t.members.ndprConsentRequired;
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    const memberData: Partial<PartyMember> = {
      firstName: form.firstName,
      lastName: form.lastName,
      phone: form.phone,
      role: form.role as PartyMember["role"],
      ndprConsent: true,
      ndprConsentDate: Date.now(),
      structureId: form.structureId,
    };
    if (form.middleName) memberData.middleName = form.middleName;
    if (form.email) memberData.email = form.email;
    if (form.address) memberData.address = form.address;
    if (form.state) memberData.state = form.state;
    if (form.lga) memberData.lga = form.lga;
    if (form.ward) memberData.ward = form.ward;
    if (form.voterCardNumber) memberData.voterCardNumber = form.voterCardNumber;
    await onSave(memberData);
  };

  const f = (field: string) => ({
    value: form[field as keyof typeof form] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value })),
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <button style={s.btn("secondary")} onClick={onCancel}>← {t.common.back}</button>
        <div style={{ fontSize: "18px", fontWeight: 700 }}>{t.members.registerMember}</div>
      </div>

      {state.error && <div style={s.errorBox}>{state.error}</div>}

      <form onSubmit={handleSubmit}>
        <div style={s.card}>
          <div style={{ fontWeight: 600, marginBottom: "12px", color: colors.primary }}>Personal Information</div>

          <div style={s.formGroup}>
            <label style={s.label}>{t.members.firstName} *</label>
            <input style={s.input} {...f("firstName")} />
            {errors.firstName && <div style={{ color: colors.error, fontSize: "12px", marginTop: "4px" }}>{errors.firstName}</div>}
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>{t.members.lastName} *</label>
            <input style={s.input} {...f("lastName")} />
            {errors.lastName && <div style={{ color: colors.error, fontSize: "12px", marginTop: "4px" }}>{errors.lastName}</div>}
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>{t.members.middleName}</label>
            <input style={s.input} {...f("middleName")} />
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>{t.members.phone} *</label>
            <input style={s.input} type="tel" placeholder="08012345678" {...f("phone")} />
            {errors.phone && <div style={{ color: colors.error, fontSize: "12px", marginTop: "4px" }}>{errors.phone}</div>}
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>{t.members.email}</label>
            <input style={s.input} type="email" {...f("email")} />
          </div>
        </div>

        <div style={s.card}>
          <div style={{ fontWeight: 600, marginBottom: "12px", color: colors.primary }}>Location & Ward</div>

          <div style={s.formGroup}>
            <label style={s.label}>{t.members.state}</label>
            <select style={s.input} {...f("state")}>
              <option value="">Select State</option>
              {NIGERIAN_STATES.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>{t.members.lga}</label>
            <input style={s.input} {...f("lga")} placeholder="e.g. Ikeja" />
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>{t.members.ward}</label>
            <input style={s.input} {...f("ward")} placeholder="e.g. Ward 5" />
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>{t.members.voterCard}</label>
            <input style={s.input} {...f("voterCardNumber")} placeholder="INEC Voter Card Number" />
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>Ward Structure ID *</label>
            <input style={s.input} {...f("structureId")} placeholder="Structure UUID" />
            {errors.structureId && <div style={{ color: colors.error, fontSize: "12px", marginTop: "4px" }}>{errors.structureId}</div>}
          </div>
        </div>

        <div style={s.card}>
          <div style={{ fontWeight: 600, marginBottom: "12px", color: colors.primary }}>Party Role</div>
          <div style={s.formGroup}>
            <label style={s.label}>{t.members.role}</label>
            <select style={s.input} {...f("role")}>
              <option value="ordinary">{t.members.roleOrdinary}</option>
              <option value="delegate">{t.members.roleDelegate}</option>
              <option value="executive">{t.members.roleExecutive}</option>
              <option value="chairman">{t.members.roleChairman}</option>
              <option value="secretary">{t.members.roleSecretary}</option>
              <option value="treasurer">{t.members.roleTreasurer}</option>
              <option value="youth_leader">{t.members.roleYouthLeader}</option>
              <option value="women_leader">{t.members.roleWomenLeader}</option>
            </select>
          </div>
        </div>

        {/* NDPR Consent */}
        <div style={{ ...s.card, backgroundColor: "#FFF8E1", borderColor: colors.warning }}>
          <div style={{ fontWeight: 600, marginBottom: "8px", color: colors.text }}>
            🔒 {t.members.ndprConsent}
          </div>
          <div style={{ fontSize: "13px", color: colors.textMuted, marginBottom: "12px", lineHeight: 1.5 }}>
            {state.organization ? getNDPRConsentStatement(state.organization.name) : t.members.ndprConsentRequired}
          </div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={form.ndprConsent}
              onChange={(e) => setForm((prev) => ({ ...prev, ndprConsent: e.target.checked }))}
              style={{ marginTop: "2px", width: "18px", height: "18px" }}
            />
            <span style={{ fontSize: "14px", fontWeight: 500 }}>
              I consent to data processing under NDPR
            </span>
          </label>
          {errors.ndprConsent && <div style={{ color: colors.error, fontSize: "12px", marginTop: "8px" }}>{errors.ndprConsent}</div>}
        </div>

        <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
          <button type="button" style={{ ...s.btn("secondary"), flex: 1 }} onClick={onCancel}>
            {t.common.cancel}
          </button>
          <button type="submit" style={{ ...s.btn("primary"), flex: 2 }} disabled={state.isLoading}>
            {state.isLoading ? t.common.loading : t.members.registerMember}
          </button>
        </div>
      </form>
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

// ─── Dues Page ────────────────────────────────────────────────────────────────

function DuesPage({
  state,
  dispatch,
  t,
  onRecordPayment,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  t: ReturnType<typeof getPartyTranslations>;
  onRecordPayment: () => void;
}) {
  const { dues } = state;
  const currentYear = new Date().getFullYear();
  const currentYearDues = dues.filter((d) => d.year === currentYear);
  const totalKobo = currentYearDues.reduce((sum, d) => sum + d.amountKobo, 0);

  return (
    <div>
      <div style={s.sectionTitle}>
        <span>{t.dues.title}</span>
      </div>

      {/* Summary card */}
      <div style={{ ...s.card, backgroundColor: colors.primary, color: "#FFFFFF" }}>
        <div style={{ fontSize: "13px", opacity: 0.8 }}>{t.dues.summary} — {currentYear}</div>
        <div style={{ fontSize: "28px", fontWeight: 700, marginTop: "4px" }}>{koboToNaira(totalKobo)}</div>
        <div style={{ fontSize: "13px", opacity: 0.8, marginTop: "4px" }}>
          {currentYearDues.length} {t.dues.paymentCount}
        </div>
      </div>

      {/* Dues list */}
      {dues.length === 0 ? (
        <div style={s.emptyState}>
          <div style={{ fontSize: "48px" }}>💰</div>
          <div style={{ marginTop: "12px", fontSize: "15px" }}>{t.dues.noDues}</div>
        </div>
      ) : (
        dues.map((due) => (
          <div key={due.id} style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: "15px", display: "flex", alignItems: "center", flexWrap: "wrap" }}>
                  {koboToNaira(due.amountKobo)}
                  <PaymentStatusBadge status={due.paymentStatus} />
                </div>
                <div style={{ fontSize: "12px", color: colors.textMuted, marginTop: "2px" }}>
                  {due.year} · {due.paymentMethod}
                </div>
                {due.receiptNumber && (
                  <div style={{ fontSize: "12px", color: colors.textMuted }}>
                    Receipt: {due.receiptNumber}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                <div style={{ fontSize: "12px", color: colors.textMuted, textAlign: "right" }}>
                  {formatWATDate(due.paidAt)}
                </div>
                {due.receiptNumber && (
                  <a
                    href={`/api/party/documents/dues-receipt?ref=${encodeURIComponent(due.receiptNumber)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: "11px", color: colors.primary, textDecoration: "none", whiteSpace: "nowrap" }}
                    aria-label="Get Receipt"
                  >
                    📄 Receipt
                  </a>
                )}
              </div>
            </div>
          </div>
        ))
      )}

      <button style={s.btnFab} onClick={onRecordPayment} title={t.dues.recordPayment}>
        +
      </button>
    </div>
  );
}

// ─── Dues Create Form ─────────────────────────────────────────────────────────

function DuesCreatePage({
  state,
  t,
  onSave,
  onCancel,
}: {
  state: AppState;
  t: ReturnType<typeof getPartyTranslations>;
  onSave: (data: Partial<PartyDues>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    memberId: "",
    year: String(new Date().getFullYear()),
    amountKobo: "",
    paymentMethod: "cash",
    receiptNumber: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.memberId.trim()) errs.memberId = "Required";
    if (!form.amountKobo || isNaN(Number(form.amountKobo)) || Number(form.amountKobo) <= 0)
      errs.amountKobo = "Enter a valid amount in Naira";
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    const duesData: Partial<PartyDues> = {
      memberId: form.memberId,
      year: parseInt(form.year, 10),
      amountKobo: Math.round(parseFloat(form.amountKobo) * 100),
      paymentMethod: form.paymentMethod as PartyDues["paymentMethod"],
      receiptNumber: form.receiptNumber || "",
      paidAt: Date.now(),
    };
    if (form.notes) duesData.notes = form.notes;
    await onSave(duesData);
  };

  const f = (field: string) => ({
    value: form[field as keyof typeof form],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value })),
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <button style={s.btn("secondary")} onClick={onCancel}>← {t.common.back}</button>
        <div style={{ fontSize: "18px", fontWeight: 700 }}>{t.dues.recordPayment}</div>
      </div>

      {state.error && <div style={s.errorBox}>{state.error}</div>}

      <form onSubmit={handleSubmit}>
        <div style={s.card}>
          <div style={s.formGroup}>
            <label style={s.label}>Member ID *</label>
            <input style={s.input} {...f("memberId")} placeholder="Member UUID" />
            {errors.memberId && <div style={{ color: colors.error, fontSize: "12px", marginTop: "4px" }}>{errors.memberId}</div>}
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>{t.dues.year} *</label>
            <input style={s.input} type="number" min="2000" max="2099" {...f("year")} />
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>{t.dues.amount} *</label>
            <input style={s.input} type="number" min="0" step="0.01" placeholder="e.g. 5000" {...f("amountKobo")} />
            {errors.amountKobo && <div style={{ color: colors.error, fontSize: "12px", marginTop: "4px" }}>{errors.amountKobo}</div>}
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>{t.dues.paymentMethod} *</label>
            <select style={s.input} {...f("paymentMethod")}>
              <option value="cash">{t.dues.methodCash}</option>
              <option value="bank_transfer">{t.dues.methodBankTransfer}</option>
              <option value="pos">{t.dues.methodPOS}</option>
              <option value="mobile_money">{t.dues.methodMobileMoney}</option>
              <option value="online">{t.dues.methodOnline}</option>
            </select>
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>{t.dues.receiptNumber}</label>
            <input style={s.input} {...f("receiptNumber")} />
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>{t.dues.notes}</label>
            <textarea style={{ ...s.input, minHeight: "80px", resize: "vertical" }} {...f("notes")} />
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          <button type="button" style={{ ...s.btn("secondary"), flex: 1 }} onClick={onCancel}>{t.common.cancel}</button>
          <button type="submit" style={{ ...s.btn("primary"), flex: 2 }} disabled={state.isLoading}>
            {state.isLoading ? t.common.loading : t.dues.recordPayment}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Structure Page ───────────────────────────────────────────────────────────

function StructurePage({
  state,
  dispatch,
  t,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  t: ReturnType<typeof getPartyTranslations>;
}) {
  const { structures, selectedStructure } = state;

  const rootStructures = structures.filter((s) => s.parentId === null || s.parentId === undefined);
  const childStructures = selectedStructure
    ? structures.filter((s) => s.parentId === selectedStructure.id)
    : [];

  const displayStructures = selectedStructure ? childStructures : rootStructures;

  return (
    <div>
      <div style={s.sectionTitle}>
        <span>{t.structure.title}</span>
      </div>

      {/* Breadcrumb */}
      {selectedStructure && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
          <button
            style={{ ...s.btn("secondary"), padding: "6px 12px", fontSize: "13px" }}
            onClick={() => dispatch({ type: "SET_SELECTED_STRUCTURE", structure: null })}
          >
            ← {t.structure.backToParent}
          </button>
          <LevelBadge level={selectedStructure.level} />
          <span style={{ fontWeight: 600 }}>{selectedStructure.name}</span>
        </div>
      )}

      {displayStructures.length === 0 ? (
        <div style={s.emptyState}>
          <div style={{ fontSize: "48px" }}>🗺️</div>
          <div style={{ marginTop: "12px", fontSize: "15px" }}>{t.structure.noStructures}</div>
        </div>
      ) : (
        displayStructures.map((structure) => (
          <div
            key={structure.id}
            style={{ ...s.card, cursor: "pointer" }}
            onClick={() => dispatch({ type: "SET_SELECTED_STRUCTURE", structure })}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "15px" }}>{structure.name}</div>
                {structure.code && (
                  <div style={{ fontSize: "12px", color: colors.textMuted, marginTop: "2px" }}>
                    INEC: {structure.code}
                  </div>
                )}
                {structure.state && (
                  <div style={{ fontSize: "13px", color: colors.textMuted, marginTop: "4px" }}>
                    📍 {structure.state}{structure.lga ? ` · ${structure.lga}` : ""}
                  </div>
                )}
              </div>
              <LevelBadge level={structure.level} />
            </div>
            {structure.level !== "ward" && (
              <div style={{ marginTop: "8px", fontSize: "13px", color: colors.primary, fontWeight: 500 }}>
                {t.structure.drillDown} →
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ─── Meetings Page ────────────────────────────────────────────────────────────

function MeetingsPage({
  state,
  dispatch,
  t,
  onScheduleMeeting,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  t: ReturnType<typeof getPartyTranslations>;
  onScheduleMeeting: () => void;
}) {
  const { meetings } = state;
  const now = Date.now();
  const upcoming = meetings.filter((m) => m.scheduledAt >= now);
  const past = meetings.filter((m) => m.scheduledAt < now);

  return (
    <div>
      <div style={s.sectionTitle}>
        <span>{t.meetings.title}</span>
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: colors.textMuted, marginBottom: "8px" }}>
            📅 {t.meetings.upcoming}
          </div>
          {upcoming.map((meeting) => (
            <div key={meeting.id} style={s.card}>
              <div style={{ fontWeight: 600, fontSize: "15px" }}>{meeting.title}</div>
              <div style={{ fontSize: "13px", color: colors.textMuted, marginTop: "4px" }}>
                {formatWATDateTime(meeting.scheduledAt)}
              </div>
              {meeting.venue && (
                <div style={{ fontSize: "13px", color: colors.textMuted }}>📍 {meeting.venue}</div>
              )}
              <div style={{ marginTop: "8px" }}>
                <span style={s.badge(colors.primaryLight)}>{meeting.meetingType.replace(/_/g, " ")}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: colors.textMuted, margin: "16px 0 8px" }}>
            🕐 {t.meetings.past}
          </div>
          {past.slice(0, 5).map((meeting) => (
            <div key={meeting.id} style={{ ...s.card, opacity: 0.7 }}>
              <div style={{ fontWeight: 600, fontSize: "15px" }}>{meeting.title}</div>
              <div style={{ fontSize: "13px", color: colors.textMuted, marginTop: "4px" }}>
                {formatWATDateTime(meeting.scheduledAt)}
                {meeting.attendeeCount !== undefined && ` · ${meeting.attendeeCount} attendees`}
              </div>
            </div>
          ))}
        </div>
      )}

      {meetings.length === 0 && (
        <div style={s.emptyState}>
          <div style={{ fontSize: "48px" }}>📅</div>
          <div style={{ marginTop: "12px", fontSize: "15px" }}>{t.meetings.noMeetings}</div>
        </div>
      )}

      <button style={s.btnFab} onClick={onScheduleMeeting} title={t.meetings.scheduleMeeting}>
        +
      </button>
    </div>
  );
}

// ─── ID Cards Page ────────────────────────────────────────────────────────────

function IdCardsPage({
  state,
  dispatch,
  t,
  onIssueCard,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  t: ReturnType<typeof getPartyTranslations>;
  onIssueCard: () => void;
}) {
  const { idCards } = state;

  return (
    <div>
      <div style={s.sectionTitle}>
        <span>{t.idCards.title}</span>
      </div>

      {idCards.length === 0 ? (
        <div style={s.emptyState}>
          <div style={{ fontSize: "48px" }}>🪪</div>
          <div style={{ marginTop: "12px", fontSize: "15px" }}>{t.idCards.noCard}</div>
        </div>
      ) : (
        idCards.map((card) => (
          <div key={card.id} style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "15px" }}>{card.cardNumber}</div>
                <div style={{ fontSize: "12px", color: colors.textMuted, marginTop: "2px" }}>
                  Issued: {formatWATDate(card.issuedAt)}
                </div>
                {card.expiresAt && (
                  <div style={{ fontSize: "12px", color: card.expiresAt < Date.now() ? colors.error : colors.textMuted }}>
                    Expires: {formatWATDate(card.expiresAt)}
                  </div>
                )}
              </div>
              <span style={s.badge(card.isActive ? colors.success : colors.error)}>
                {card.isActive ? t.idCards.statusActive : t.idCards.statusRevoked}
              </span>
            </div>
          </div>
        ))
      )}

      <button style={s.btnFab} onClick={onIssueCard} title={t.idCards.issueCard}>
        +
      </button>
    </div>
  );
}

// ─── Nominations Pages ────────────────────────────────────────────────────────

const NOMINATION_STATUS_COLORS: Record<string, string> = {
  pending: "#C8A951",
  approved: "#1E7A4A",
  rejected: "#C0392B",
  submitted: "#1A3A5C",
};

function NominationsPage({
  state,
  dispatch,
  t,
  onCreateNomination,
  onViewNomination,
  onApprove,
  onReject,
  onSubmit,
  onFilterChange,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  t: ReturnType<typeof getPartyTranslations>;
  onCreateNomination: () => void;
  onViewNomination: (nom: PartyNomination) => void;
  onApprove: (id: string, notes?: string) => Promise<void>;
  onReject: (id: string, notes: string) => Promise<void>;
  onSubmit: (id: string) => Promise<void>;
  onFilterChange: (status: string) => void;
}) {
  const [rejectModal, setRejectModal] = useState<{ id: string } | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");

  const STATUS_OPTIONS = [
    { value: "", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
    { value: "submitted", label: "Submitted" },
  ];

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>📋 {t.nav.nominations}</h2>
        <button
          onClick={onCreateNomination}
          style={{ padding: "8px 16px", backgroundColor: "#1A3A5C", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: 600 }}
        >
          + New
        </button>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", overflowX: "auto", paddingBottom: "4px" }}>
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onFilterChange(opt.value)}
            style={{
              padding: "6px 12px",
              borderRadius: "16px",
              border: "1px solid",
              borderColor: state.nominationStatusFilter === opt.value ? "#1A3A5C" : "#DDE2EA",
              backgroundColor: state.nominationStatusFilter === opt.value ? "#1A3A5C" : "#fff",
              color: state.nominationStatusFilter === opt.value ? "#fff" : "#1A2433",
              fontSize: "13px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {state.isLoading ? (
        <LoadingSpinner />
      ) : state.nominations.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 16px", color: "#6B7A8D" }}>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>📋</div>
          <p>No nominations found</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {state.nominations.map((nom) => (
            <div
              key={nom.id}
              style={{ backgroundColor: "#fff", borderRadius: "12px", padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", cursor: "pointer" }}
              onClick={() => onViewNomination(nom)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "15px" }}>{nom.position}</div>
                  {nom.constituency && <div style={{ fontSize: "13px", color: "#6B7A8D" }}>{nom.constituency}</div>}
                </div>
                <span style={{
                  padding: "3px 10px",
                  borderRadius: "12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  backgroundColor: NOMINATION_STATUS_COLORS[nom.status] + "20",
                  color: NOMINATION_STATUS_COLORS[nom.status],
                  textTransform: "capitalize",
                }}>
                  {nom.status}
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "#6B7A8D" }}>
                Nominated: {new Date(nom.nominatedAt).toLocaleDateString()}
              </div>
              {nom.status === "pending" && (
                <div style={{ display: "flex", gap: "8px", marginTop: "12px" }} onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onApprove(nom.id)}
                    style={{ flex: 1, padding: "8px", backgroundColor: "#1E7A4A", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}
                  >
                    ✓ Approve
                  </button>
                  <button
                    onClick={() => { setRejectModal({ id: nom.id }); setRejectNotes(""); }}
                    style={{ flex: 1, padding: "8px", backgroundColor: "#C0392B", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}
                  >
                    ✗ Reject
                  </button>
                </div>
              )}
              {nom.status === "approved" && (
                <div style={{ marginTop: "12px" }} onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onSubmit(nom.id)}
                    style={{ width: "100%", padding: "8px", backgroundColor: "#1A3A5C", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}
                  >
                    → Submit to INEC
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {rejectModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "16px" }}>
          <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "400px" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: "17px" }}>Reject Nomination</h3>
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="Reason for rejection (required)"
              rows={4}
              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #DDE2EA", fontSize: "14px", resize: "none", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              <button
                onClick={() => setRejectModal(null)}
                style={{ flex: 1, padding: "10px", backgroundColor: "#F5F7FA", color: "#1A2433", border: "1px solid #DDE2EA", borderRadius: "8px", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={() => { onReject(rejectModal.id, rejectNotes); setRejectModal(null); }}
                disabled={!rejectNotes.trim()}
                style={{ flex: 1, padding: "10px", backgroundColor: "#C0392B", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", opacity: rejectNotes.trim() ? 1 : 0.5 }}
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NominationCreatePage({
  state,
  t,
  onSave,
  onCancel,
}: {
  state: AppState;
  t: ReturnType<typeof getPartyTranslations>;
  onSave: (data: Parameters<ReturnType<typeof createPartyApiClient>["createNomination"]>[0]) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ memberId: "", position: "", constituency: "", statementOfIntent: "" });

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px" }}>←</button>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>New Nomination</h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <label style={{ fontSize: "13px", fontWeight: 600, color: "#6B7A8D", display: "block", marginBottom: "6px" }}>Member ID *</label>
          <input
            value={form.memberId}
            onChange={(e) => setForm({ ...form, memberId: e.target.value })}
            placeholder="Member ID"
            style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #DDE2EA", fontSize: "14px", boxSizing: "border-box" }}
          />
        </div>
        <div>
          <label style={{ fontSize: "13px", fontWeight: 600, color: "#6B7A8D", display: "block", marginBottom: "6px" }}>Position *</label>
          <input
            value={form.position}
            onChange={(e) => setForm({ ...form, position: e.target.value })}
            placeholder="e.g. House of Representatives"
            style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #DDE2EA", fontSize: "14px", boxSizing: "border-box" }}
          />
        </div>
        <div>
          <label style={{ fontSize: "13px", fontWeight: 600, color: "#6B7A8D", display: "block", marginBottom: "6px" }}>Constituency</label>
          <input
            value={form.constituency}
            onChange={(e) => setForm({ ...form, constituency: e.target.value })}
            placeholder="e.g. Lagos East"
            style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #DDE2EA", fontSize: "14px", boxSizing: "border-box" }}
          />
        </div>
        <div>
          <label style={{ fontSize: "13px", fontWeight: 600, color: "#6B7A8D", display: "block", marginBottom: "6px" }}>Statement of Intent</label>
          <textarea
            value={form.statementOfIntent}
            onChange={(e) => setForm({ ...form, statementOfIntent: e.target.value })}
            placeholder="Candidate's statement..."
            rows={4}
            style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #DDE2EA", fontSize: "14px", resize: "none", boxSizing: "border-box" }}
          />
        </div>
        <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: "14px", backgroundColor: "#F5F7FA", color: "#1A2433", border: "1px solid #DDE2EA", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}
          >
            Cancel
          </button>
          <button
            onClick={() => form.memberId && form.position && onSave({ memberId: form.memberId, position: form.position, constituency: form.constituency || undefined, statementOfIntent: form.statementOfIntent || undefined })}
            disabled={!form.memberId || !form.position || state.isLoading}
            style={{ flex: 2, padding: "14px", backgroundColor: "#1A3A5C", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 700, opacity: !form.memberId || !form.position ? 0.5 : 1 }}
          >
            {state.isLoading ? "Saving…" : "Submit Nomination"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NominationDetailPage({
  state,
  t,
  onApprove,
  onReject,
  onSubmit,
  onBack,
}: {
  state: AppState;
  t: ReturnType<typeof getPartyTranslations>;
  onApprove: (id: string, notes?: string) => Promise<void>;
  onReject: (id: string, notes: string) => Promise<void>;
  onSubmit: (id: string) => Promise<void>;
  onBack: () => void;
}) {
  const nom = state.selectedNomination;
  const [rejectNotes, setRejectNotes] = useState("");
  const [approveNotes, setApproveNotes] = useState("");

  if (!nom) return <div style={{ padding: "24px", textAlign: "center" }}>No nomination selected</div>;

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px" }}>←</button>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>Nomination Detail</h2>
      </div>

      <div style={{ backgroundColor: "#fff", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ fontSize: "18px", fontWeight: 700 }}>{nom.position}</div>
          <span style={{ padding: "4px 12px", borderRadius: "12px", fontSize: "12px", fontWeight: 600, backgroundColor: NOMINATION_STATUS_COLORS[nom.status] + "20", color: NOMINATION_STATUS_COLORS[nom.status], textTransform: "capitalize" }}>
            {nom.status}
          </span>
        </div>

        {[
          { label: "Member ID", value: nom.memberId },
          { label: "Constituency", value: nom.constituency || "—" },
          { label: "Nominated", value: new Date(nom.nominatedAt).toLocaleDateString() },
          { label: "Nominator", value: nom.nominatorId },
          nom.vettedBy ? { label: "Vetted By", value: nom.vettedBy } : null,
          nom.vettingNotes ? { label: "Vetting Notes", value: nom.vettingNotes } : null,
        ].filter(Boolean).map((row) => row && (
          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F5F7FA" }}>
            <span style={{ fontSize: "13px", color: "#6B7A8D" }}>{row.label}</span>
            <span style={{ fontSize: "13px", fontWeight: 600, maxWidth: "60%", textAlign: "right" }}>{row.value}</span>
          </div>
        ))}

        {nom.status === "pending" && (
          <div style={{ marginTop: "20px" }}>
            <div>
              <label style={{ fontSize: "13px", fontWeight: 600, color: "#6B7A8D", display: "block", marginBottom: "6px" }}>Approval Notes (optional)</label>
              <input value={approveNotes} onChange={(e) => setApproveNotes(e.target.value)} placeholder="Notes…" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #DDE2EA", fontSize: "14px", marginBottom: "12px", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: "13px", fontWeight: 600, color: "#6B7A8D", display: "block", marginBottom: "6px" }}>Rejection Notes (required to reject)</label>
              <input value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} placeholder="Reason for rejection…" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #DDE2EA", fontSize: "14px", marginBottom: "12px", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => onApprove(nom.id, approveNotes)} style={{ flex: 1, padding: "12px", backgroundColor: "#1E7A4A", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}>✓ Approve</button>
              <button onClick={() => rejectNotes.trim() && onReject(nom.id, rejectNotes)} disabled={!rejectNotes.trim()} style={{ flex: 1, padding: "12px", backgroundColor: "#C0392B", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, opacity: rejectNotes.trim() ? 1 : 0.5 }}>✗ Reject</button>
            </div>
          </div>
        )}

        {nom.status === "approved" && (
          <div style={{ marginTop: "20px" }}>
            <button onClick={() => onSubmit(nom.id)} style={{ width: "100%", padding: "14px", backgroundColor: "#1A3A5C", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 700, fontSize: "15px" }}>
              → Submit to INEC
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Campaign Finance Pages ───────────────────────────────────────────────────

const POSITION_LEVEL_LIMITS: Record<string, number> = {
  presidential: 5_000_000_000,
  governorship: 1_000_000_000,
  senate: 100_000_000,
  house_of_representatives: 70_000_000,
  state_assembly: 30_000_000,
  lga_chairmanship: 30_000_000,
  councillor: 30_000_000,
};

function CampaignFinancePage({
  state,
  dispatch,
  t,
  onCreateAccount,
  onViewTransactions,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  t: ReturnType<typeof getPartyTranslations>;
  onCreateAccount: () => void;
  onViewTransactions: (account: PartyCampaignAccount) => void;
}) {
  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>💳 {t.nav.campaignFinance}</h2>
        <button
          onClick={onCreateAccount}
          style={{ padding: "8px 16px", backgroundColor: "#1A3A5C", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: 600 }}
        >
          + Account
        </button>
      </div>

      {state.isLoading ? (
        <LoadingSpinner />
      ) : state.campaignAccounts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 16px", color: "#6B7A8D" }}>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>💳</div>
          <p>No campaign finance accounts yet</p>
          <button onClick={onCreateAccount} style={{ padding: "10px 24px", backgroundColor: "#1A3A5C", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}>
            Create First Account
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {state.campaignAccounts.map((account) => {
            const limitNaira = account.limitKobo / 100;
            return (
              <div
                key={account.id}
                style={{ backgroundColor: "#fff", borderRadius: "12px", padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", cursor: "pointer" }}
                onClick={() => onViewTransactions(account)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <div>
                    <div style={{ fontWeight: 700, textTransform: "capitalize" }}>{account.positionLevel.replace(/_/g, " ")}</div>
                    {account.candidateId && <div style={{ fontSize: "13px", color: "#6B7A8D" }}>Candidate: {account.candidateId}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", color: "#6B7A8D" }}>Limit</div>
                    <div style={{ fontWeight: 700, color: "#1A3A5C" }}>₦{limitNaira.toLocaleString()}</div>
                  </div>
                </div>
                <div style={{ fontSize: "12px", color: "#6B7A8D", marginTop: "4px" }}>
                  Tap to view transactions →
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FinanceAccountCreatePage({
  state,
  t,
  onSave,
  onCancel,
}: {
  state: AppState;
  t: ReturnType<typeof getPartyTranslations>;
  onSave: (data: Parameters<ReturnType<typeof createPartyApiClient>["createCampaignAccount"]>[0]) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ memberId: "", position: "", positionLevel: "house_of_representatives", constituency: "" });

  const POSITION_LEVELS = [
    { value: "presidential", label: "Presidential" },
    { value: "governorship", label: "Governorship" },
    { value: "senate", label: "Senate" },
    { value: "house_of_representatives", label: "House of Representatives" },
    { value: "state_assembly", label: "State Assembly" },
    { value: "lga_chairmanship", label: "LGA Chairmanship" },
    { value: "councillor", label: "Councillor" },
  ];

  const limitKobo = POSITION_LEVEL_LIMITS[form.positionLevel] ?? 0;

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px" }}>←</button>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>New Campaign Finance Account</h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <label style={{ fontSize: "13px", fontWeight: 600, color: "#6B7A8D", display: "block", marginBottom: "6px" }}>Candidate Member ID *</label>
          <input value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })} placeholder="Member ID" style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #DDE2EA", fontSize: "14px", boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ fontSize: "13px", fontWeight: 600, color: "#6B7A8D", display: "block", marginBottom: "6px" }}>Position Title *</label>
          <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="e.g. Member House of Representatives" style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #DDE2EA", fontSize: "14px", boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ fontSize: "13px", fontWeight: 600, color: "#6B7A8D", display: "block", marginBottom: "6px" }}>Position Level *</label>
          <select value={form.positionLevel} onChange={(e) => setForm({ ...form, positionLevel: e.target.value })} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #DDE2EA", fontSize: "14px", backgroundColor: "#fff", boxSizing: "border-box" }}>
            {POSITION_LEVELS.map((pl) => <option key={pl.value} value={pl.value}>{pl.label}</option>)}
          </select>
        </div>
        <div style={{ backgroundColor: "#EFF7F2", borderRadius: "8px", padding: "12px", fontSize: "13px" }}>
          <strong>Electoral Act 2022 Spending Limit:</strong><br />
          ₦{(limitKobo / 100).toLocaleString()} for {POSITION_LEVELS.find((pl) => pl.value === form.positionLevel)?.label}
        </div>
        <div>
          <label style={{ fontSize: "13px", fontWeight: 600, color: "#6B7A8D", display: "block", marginBottom: "6px" }}>Constituency</label>
          <input value={form.constituency} onChange={(e) => setForm({ ...form, constituency: e.target.value })} placeholder="e.g. Ikeja Federal Constituency" style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #DDE2EA", fontSize: "14px", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "14px", backgroundColor: "#F5F7FA", color: "#1A2433", border: "1px solid #DDE2EA", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
          <button
            onClick={() => form.memberId && form.position && onSave({ memberId: form.memberId, position: form.position, positionLevel: form.positionLevel, constituency: form.constituency || undefined })}
            disabled={!form.memberId || !form.position || state.isLoading}
            style={{ flex: 2, padding: "14px", backgroundColor: "#1A3A5C", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 700, opacity: !form.memberId || !form.position ? 0.5 : 1 }}
          >
            {state.isLoading ? "Creating…" : "Create Account"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FinanceTransactionsPage({
  state,
  t,
  onAddTransaction,
  onBack,
}: {
  state: AppState;
  t: ReturnType<typeof getPartyTranslations>;
  onAddTransaction: (data: { type: "income" | "expenditure"; category: string; description: string; amountKobo: number; evidenceUrl?: string }) => Promise<void>;
  onBack: () => void;
}) {
  const account = state.selectedCampaignAccount;
  const summary = state.campaignSummary;
  const [showForm, setShowForm] = useState(false);
  const [txForm, setTxForm] = useState({ type: "income" as "income" | "expenditure", category: "", description: "", amountNaira: "" });

  if (!account) return <div style={{ padding: "24px", textAlign: "center" }}>No account selected</div>;

  const limitNaira = account.limitKobo / 100;
  const spentNaira = summary ? summary.totalExpenditureKobo / 100 : 0;
  const incomeNaira = summary ? summary.totalIncomeKobo / 100 : 0;
  const percent = limitNaira > 0 ? Math.min(100, (spentNaira / limitNaira) * 100) : 0;
  const atWarning = percent >= 80;

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px" }}>←</button>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, textTransform: "capitalize" }}>
          {account.positionLevel.replace(/_/g, " ")}
        </h2>
      </div>

      <div style={{ backgroundColor: "#fff", borderRadius: "12px", padding: "16px", marginBottom: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "12px", color: "#6B7A8D", marginBottom: "4px" }}>Income</div>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#1E7A4A" }}>₦{incomeNaira.toLocaleString()}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "12px", color: "#6B7A8D", marginBottom: "4px" }}>Expenditure</div>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#C0392B" }}>₦{spentNaira.toLocaleString()}</div>
          </div>
        </div>
        <div style={{ marginBottom: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#6B7A8D", marginBottom: "6px" }}>
            <span>Spending vs Electoral Act Limit</span>
            <span style={{ color: atWarning ? "#C0392B" : "#1E7A4A", fontWeight: 700 }}>{percent.toFixed(1)}%</span>
          </div>
          <div style={{ height: "10px", backgroundColor: "#F5F7FA", borderRadius: "5px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${percent}%`, backgroundColor: atWarning ? "#C0392B" : "#1E7A4A", borderRadius: "5px", transition: "width 0.3s" }} />
          </div>
          <div style={{ fontSize: "11px", color: "#6B7A8D", marginTop: "4px" }}>
            Limit: ₦{limitNaira.toLocaleString()}
          </div>
        </div>
        {atWarning && (
          <div style={{ backgroundColor: "#FEF3CD", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#856404", display: "flex", alignItems: "center", gap: "8px" }}>
            ⚠️ Approaching Electoral Act spending limit
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Transactions</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{ padding: "8px 16px", backgroundColor: "#1A3A5C", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}
        >
          {showForm ? "× Cancel" : "+ Add"}
        </button>
      </div>

      {showForm && (
        <div style={{ backgroundColor: "#fff", borderRadius: "12px", padding: "16px", marginBottom: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            {(["income", "expenditure"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setTxForm({ ...txForm, type })}
                style={{ flex: 1, padding: "8px", borderRadius: "8px", border: "1px solid", borderColor: txForm.type === type ? "#1A3A5C" : "#DDE2EA", backgroundColor: txForm.type === type ? "#1A3A5C" : "#fff", color: txForm.type === type ? "#fff" : "#1A2433", cursor: "pointer", fontWeight: 600, fontSize: "13px", textTransform: "capitalize" }}
              >
                {type}
              </button>
            ))}
          </div>
          <input value={txForm.category} onChange={(e) => setTxForm({ ...txForm, category: e.target.value })} placeholder="Category (e.g. Rally)" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #DDE2EA", fontSize: "14px", marginBottom: "8px", boxSizing: "border-box" }} />
          <input value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} placeholder="Description" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #DDE2EA", fontSize: "14px", marginBottom: "8px", boxSizing: "border-box" }} />
          <input type="number" value={txForm.amountNaira} onChange={(e) => setTxForm({ ...txForm, amountNaira: e.target.value })} placeholder="Amount (₦)" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #DDE2EA", fontSize: "14px", marginBottom: "12px", boxSizing: "border-box" }} />
          <button
            onClick={() => {
              const amt = parseFloat(txForm.amountNaira);
              if (!txForm.category || !txForm.description || isNaN(amt) || amt <= 0) return;
              onAddTransaction({ type: txForm.type, category: txForm.category, description: txForm.description, amountKobo: Math.round(amt * 100) }).then(() => {
                setTxForm({ type: "income", category: "", description: "", amountNaira: "" });
                setShowForm(false);
              });
            }}
            disabled={!txForm.category || !txForm.description || !txForm.amountNaira}
            style={{ width: "100%", padding: "12px", backgroundColor: "#1A3A5C", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 700, opacity: !txForm.category || !txForm.description || !txForm.amountNaira ? 0.5 : 1 }}
          >
            Record Transaction
          </button>
        </div>
      )}

      {state.isLoading ? (
        <LoadingSpinner />
      ) : !summary || summary.transactions.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 16px", color: "#6B7A8D", fontSize: "14px" }}>No transactions yet</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {summary.transactions.map((tx) => (
            <div key={tx.id} style={{ backgroundColor: "#fff", borderRadius: "10px", padding: "12px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "14px" }}>{tx.description}</div>
                <div style={{ fontSize: "12px", color: "#6B7A8D" }}>{tx.category} · {new Date(tx.transactionDate).toLocaleDateString()}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: "15px", color: tx.transactionType === "income" ? "#1E7A4A" : "#C0392B" }}>
                  {tx.transactionType === "income" ? "+" : "-"}₦{(tx.amountKobo / 100).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Phase 5: Hierarchy Analytics Page (P09) ──────────────────────────────────

interface HierarchyNode {
  structureId: string; name: string; level: string; parentId: string | null;
  memberCount: number; activeMemberCount: number; duesCollectedKoboYTD: number; meetingCountLast90d: number;
}

function HierarchyAnalyticsPage({
  api,
  t,
  dispatch,
}: {
  api: ReturnType<typeof createPartyApiClient>;
  t: ReturnType<typeof getPartyTranslations>;
  dispatch: React.Dispatch<Action>;
}) {
  const [node, setNode] = useState<HierarchyNode | null>(null);
  const [children, setChildren] = useState<HierarchyNode[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  const loadLevel = async (structureId?: string) => {
    setLoading(true);
    const res = await api.getHierarchyAnalytics(structureId);
    if (res.success) {
      setNode(res.data.node);
      setChildren(res.data.children);
    }
    setLoading(false);
  };

  useEffect(() => { void loadLevel(); }, []);

  const drillDown = (child: HierarchyNode) => {
    setBreadcrumb((prev) => [...prev, { id: child.structureId, name: child.name }]);
    void loadLevel(child.structureId);
  };

  const goBack = () => {
    const prev = [...breadcrumb];
    prev.pop();
    setBreadcrumb(prev);
    const parentId = prev.length > 0 ? prev[prev.length - 1].id : undefined;
    void loadLevel(parentId);
  };

  const maxDues = Math.max(...children.map((c) => c.duesCollectedKoboYTD), 1);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        {breadcrumb.length > 0 && (
          <button style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer" }} onClick={goBack}>←</button>
        )}
        <div style={{ fontSize: "20px", fontWeight: 700 }}>📊 {t.nav.analytics}</div>
      </div>

      {breadcrumb.length > 0 && (
        <div style={{ fontSize: "12px", color: "#6B7A8D", marginBottom: "12px" }}>
          Root {breadcrumb.map((b) => ` › ${b.name}`)}
        </div>
      )}

      {node && (
        <div style={{ backgroundColor: "#fff", borderRadius: "12px", padding: "16px", marginBottom: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", border: "1px solid #E5EAF0" }}>
          <div style={{ fontWeight: 700, fontSize: "16px" }}>{node.name}</div>
          <div style={{ fontSize: "12px", color: "#6B7A8D", marginBottom: "12px" }}>Level: {node.level}</div>
          <div style={{ display: "flex", gap: "8px" }}>
            {[
              { label: "Members", value: node.memberCount },
              { label: "Active", value: node.activeMemberCount },
              { label: "Meetings (90d)", value: node.meetingCountLast90d },
            ].map((s) => (
              <div key={s.label} style={{ flex: 1, backgroundColor: "#F4F7FA", borderRadius: "8px", padding: "10px", textAlign: "center" }}>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#1A6B3C" }}>{s.value}</div>
                <div style={{ fontSize: "10px", color: "#6B7A8D" }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "10px", fontSize: "12px", color: "#6B7A8D" }}>Dues YTD: <strong>₦{(node.duesCollectedKoboYTD / 100).toLocaleString()}</strong></div>
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : children.length === 0 ? (
        <div style={{ color: "#6B7A8D", textAlign: "center", padding: "24px" }}>No sub-structures found</div>
      ) : (
        <>
          <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>Sub-structures</div>
          {children.map((c) => (
            <div key={c.structureId} style={{ backgroundColor: "#fff", borderRadius: "12px", padding: "14px 16px", marginBottom: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", cursor: "pointer", border: "1px solid #E5EAF0" }}
              onClick={() => drillDown(c)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontSize: "11px", color: "#6B7A8D" }}>{c.level} · {c.memberCount} members</div>
                </div>
                <div style={{ textAlign: "right", fontSize: "12px" }}>
                  <div style={{ fontWeight: 600, color: "#1A6B3C" }}>₦{(c.duesCollectedKoboYTD / 100).toLocaleString()}</div>
                  <div style={{ color: "#6B7A8D" }}>{c.meetingCountLast90d} meetings</div>
                </div>
              </div>
              <div style={{ marginTop: "8px", height: "5px", borderRadius: "3px", backgroundColor: "#E5EAF0" }}>
                <div style={{ height: "100%", width: `${(c.duesCollectedKoboYTD / maxDues) * 100}%`, backgroundColor: "#1A6B3C", borderRadius: "3px" }} />
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

interface PartyAppProps {
  apiBaseUrl: string;
  token: string;
  organizationId: string;
}

export function PartyApp({ apiBaseUrl, token, organizationId }: PartyAppProps) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    locale: (localStorage.getItem("webwaka_party_locale") as PartyLocale) ?? "en",
  });

  const t = getPartyTranslations(state.locale);
  const api = createPartyApiClient(apiBaseUrl, token);

  // ─── Online/Offline detection ─────────────────────────────────────────────

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

  // ─── Locale persistence ───────────────────────────────────────────────────

  useEffect(() => {
    localStorage.setItem("webwaka_party_locale", state.locale);
  }, [state.locale]);

  // ─── Data loading ─────────────────────────────────────────────────────────

  const loadDashboard = useCallback(async () => {
    dispatch({ type: "SET_LOADING", isLoading: true });
    try {
      const [statsRes, announcementsRes, meetingsRes] = await Promise.all([
        api.getOrganizationStats(organizationId),
        api.getAnnouncements(),
        api.getMeetings(),
      ]);
      if (statsRes.success) dispatch({ type: "SET_DASHBOARD_STATS", stats: statsRes.data });
      if (announcementsRes.success) dispatch({ type: "SET_ANNOUNCEMENTS", announcements: announcementsRes.data });
      if (meetingsRes.success) dispatch({ type: "SET_MEETINGS", meetings: meetingsRes.data });
    } catch {
      dispatch({ type: "SET_ERROR", error: t.common.error });
    }
  }, [organizationId, t.common.error]);

  const loadMembers = useCallback(async (page = 1) => {
    dispatch({ type: "SET_LOADING", isLoading: true });
    try {
      const filters: PartyMemberFilters = { page, limit: 20 };
      if (state.memberSearch) filters.search = state.memberSearch;
      if (state.memberStatusFilter) filters.memberStatus = state.memberStatusFilter;
      const res = await api.getMembers(filters);
      if (res.success) {
        dispatch({ type: "SET_MEMBERS", members: res.data.members, total: res.data.total, page });
      }
    } catch {
      dispatch({ type: "SET_ERROR", error: t.common.error });
    }
  }, [state.memberSearch, state.memberStatusFilter, t.common.error]);

  const loadDues = useCallback(async () => {
    dispatch({ type: "SET_LOADING", isLoading: true });
    try {
      const res = await api.getDues();
      if (res.success) dispatch({ type: "SET_DUES", dues: res.data });
    } catch {
      dispatch({ type: "SET_ERROR", error: t.common.error });
    }
  }, [t.common.error]);

  const loadStructures = useCallback(async () => {
    dispatch({ type: "SET_LOADING", isLoading: true });
    try {
      const res = await api.getStructures();
      if (res.success) dispatch({ type: "SET_STRUCTURES", structures: res.data });
    } catch {
      dispatch({ type: "SET_ERROR", error: t.common.error });
    }
  }, [t.common.error]);

  const loadIdCards = useCallback(async () => {
    // Load ID cards for all members (simplified: load org-level)
    dispatch({ type: "SET_ID_CARDS", idCards: [] });
  }, []);

  const loadNominations = useCallback(async (statusFilter?: string) => {
    dispatch({ type: "SET_LOADING", isLoading: true });
    try {
      const res = await api.getNominations(statusFilter || state.nominationStatusFilter || undefined);
      if (res.success) dispatch({ type: "SET_NOMINATIONS", nominations: res.data.nominations, total: res.data.total });
    } catch {
      dispatch({ type: "SET_ERROR", error: t.common.error });
    }
  }, [state.nominationStatusFilter, t.common.error]);

  const loadCampaignAccounts = useCallback(async () => {
    dispatch({ type: "SET_LOADING", isLoading: true });
    try {
      const res = await api.getCampaignAccounts();
      if (res.success) dispatch({ type: "SET_CAMPAIGN_ACCOUNTS", accounts: res.data.accounts });
    } catch {
      dispatch({ type: "SET_ERROR", error: t.common.error });
    }
  }, [t.common.error]);

  const loadCampaignSummary = useCallback(async (accountId: string) => {
    dispatch({ type: "SET_LOADING", isLoading: true });
    try {
      const res = await api.getCampaignSummary(accountId);
      if (res.success) dispatch({ type: "SET_CAMPAIGN_SUMMARY", summary: res.data });
      else dispatch({ type: "SET_CAMPAIGN_SUMMARY", summary: null });
    } catch {
      dispatch({ type: "SET_ERROR", error: t.common.error });
    }
  }, [t.common.error]);

  // ─── Page change effects ──────────────────────────────────────────────────

  useEffect(() => {
    if (state.page === "dashboard") loadDashboard();
    else if (state.page === "members") loadMembers();
    else if (state.page === "dues") loadDues();
    else if (state.page === "structure") loadStructures();
    else if (state.page === "id-cards") loadIdCards();
    else if (state.page === "nominations") loadNominations();
    else if (state.page === "campaign-finance") loadCampaignAccounts();
    else if (state.page === "finance-transactions" && state.selectedCampaignAccount)
      loadCampaignSummary(state.selectedCampaignAccount.id);
  }, [state.page]);

  // ─── Search/filter effects ────────────────────────────────────────────────

  useEffect(() => {
    if (state.page === "members") {
      const timer = setTimeout(() => loadMembers(1), 300);
      return () => clearTimeout(timer);
    }
  }, [state.memberSearch, state.memberStatusFilter]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleRegisterMember = async (data: Partial<PartyMember>) => {
    dispatch({ type: "SET_LOADING", isLoading: true });
    try {
      const res = await api.createMember(data as Parameters<typeof api.createMember>[0]);
      if (res.success) {
        dispatch({ type: "SET_PAGE", page: "members" });
        await loadMembers();
      } else {
        dispatch({ type: "SET_ERROR", error: (res as { error: string }).error });
      }
    } catch {
      dispatch({ type: "SET_ERROR", error: t.common.error });
    }
  };

  const handleRecordDues = async (data: Partial<PartyDues>) => {
    dispatch({ type: "SET_LOADING", isLoading: true });
    try {
      const res = await api.createDues(data as Parameters<typeof api.createDues>[0]);
      if (res.success) {
        dispatch({ type: "SET_PAGE", page: "dues" });
        await loadDues();
      } else {
        dispatch({ type: "SET_ERROR", error: (res as { error: string }).error });
      }
    } catch {
      dispatch({ type: "SET_ERROR", error: t.common.error });
    }
  };

  const handleApproveNomination = async (id: string, notes?: string) => {
    dispatch({ type: "SET_LOADING", isLoading: true });
    try {
      const res = await api.approveNomination(id, notes);
      if (res.success) {
        await loadNominations();
        dispatch({ type: "SET_PAGE", page: "nominations" });
      } else {
        dispatch({ type: "SET_ERROR", error: (res as { error: string }).error });
      }
    } catch {
      dispatch({ type: "SET_ERROR", error: t.common.error });
    }
  };

  const handleRejectNomination = async (id: string, notes: string) => {
    dispatch({ type: "SET_LOADING", isLoading: true });
    try {
      const res = await api.rejectNomination(id, notes);
      if (res.success) {
        await loadNominations();
        dispatch({ type: "SET_PAGE", page: "nominations" });
      } else {
        dispatch({ type: "SET_ERROR", error: (res as { error: string }).error });
      }
    } catch {
      dispatch({ type: "SET_ERROR", error: t.common.error });
    }
  };

  const handleSubmitNomination = async (id: string) => {
    dispatch({ type: "SET_LOADING", isLoading: true });
    try {
      const res = await api.submitNomination(id);
      if (res.success) {
        await loadNominations();
        dispatch({ type: "SET_PAGE", page: "nominations" });
      } else {
        dispatch({ type: "SET_ERROR", error: (res as { error: string }).error });
      }
    } catch {
      dispatch({ type: "SET_ERROR", error: t.common.error });
    }
  };

  const handleCreateNomination = async (data: Parameters<typeof api.createNomination>[0]) => {
    dispatch({ type: "SET_LOADING", isLoading: true });
    try {
      const res = await api.createNomination(data);
      if (res.success) {
        await loadNominations();
        dispatch({ type: "SET_PAGE", page: "nominations" });
      } else {
        dispatch({ type: "SET_ERROR", error: (res as { error: string }).error });
      }
    } catch {
      dispatch({ type: "SET_ERROR", error: t.common.error });
    }
  };

  const handleCreateCampaignAccount = async (data: Parameters<typeof api.createCampaignAccount>[0]) => {
    dispatch({ type: "SET_LOADING", isLoading: true });
    try {
      const res = await api.createCampaignAccount(data);
      if (res.success) {
        await loadCampaignAccounts();
        dispatch({ type: "SET_PAGE", page: "campaign-finance" });
      } else {
        dispatch({ type: "SET_ERROR", error: (res as { error: string }).error });
      }
    } catch {
      dispatch({ type: "SET_ERROR", error: t.common.error });
    }
  };

  const handleAddTransaction = async (accountId: string, data: Parameters<typeof api.addCampaignTransaction>[1]) => {
    dispatch({ type: "SET_LOADING", isLoading: true });
    try {
      const res = await api.addCampaignTransaction(accountId, data);
      if (res.success) {
        await loadCampaignSummary(accountId);
      } else {
        dispatch({ type: "SET_ERROR", error: (res as { error: string }).error });
      }
    } catch {
      dispatch({ type: "SET_ERROR", error: t.common.error });
    }
  };

  // ─── Bottom Nav ───────────────────────────────────────────────────────────

  const navItems = [
    { page: "dashboard" as Page, icon: "🏛️", label: t.nav.dashboard },
    { page: "members" as Page, icon: "👥", label: t.nav.members },
    { page: "dues" as Page, icon: "💰", label: t.nav.dues },
    { page: "nominations" as Page, icon: "📋", label: t.nav.nominations },
    { page: "campaign-finance" as Page, icon: "💳", label: t.nav.campaignFinance },
    { page: "structure" as Page, icon: "🗺️", label: t.nav.structure },
    { page: "meetings" as Page, icon: "📅", label: t.nav.meetings },
    { page: "id-cards" as Page, icon: "🪪", label: t.nav.idCards },
    { page: "analytics" as Page, icon: "📊", label: t.nav.analytics },
  ];

  const activePage = navItems.find((n) => state.page.startsWith(n.page))?.page ?? "dashboard";

  // ─── Page Renderer ────────────────────────────────────────────────────────

  const renderPage = () => {
    if (state.isLoading && state.page === "dashboard") return <LoadingSpinner />;

    switch (state.page) {
      case "dashboard":
        return <DashboardPage state={state} dispatch={dispatch} t={t} onMigrate={() => api.migrate()} />;

      case "members":
        return (
          <MembersPage
            state={state}
            dispatch={dispatch}
            t={t}
            onRegisterMember={() => dispatch({ type: "SET_PAGE", page: "member-create" })}
          />
        );

      case "member-create":
        return (
          <MemberCreatePage
            state={state}
            dispatch={dispatch}
            t={t}
            onSave={handleRegisterMember}
            onCancel={() => dispatch({ type: "SET_PAGE", page: "members" })}
          />
        );

      case "dues":
        return (
          <DuesPage
            state={state}
            dispatch={dispatch}
            t={t}
            onRecordPayment={() => dispatch({ type: "SET_PAGE", page: "dues-create" })}
          />
        );

      case "dues-create":
        return (
          <DuesCreatePage
            state={state}
            t={t}
            onSave={handleRecordDues}
            onCancel={() => dispatch({ type: "SET_PAGE", page: "dues" })}
          />
        );

      case "structure":
        return <StructurePage state={state} dispatch={dispatch} t={t} />;

      case "meetings":
        return (
          <MeetingsPage
            state={state}
            dispatch={dispatch}
            t={t}
            onScheduleMeeting={() => dispatch({ type: "SET_PAGE", page: "meeting-create" })}
          />
        );

      case "id-cards":
        return (
          <IdCardsPage
            state={state}
            dispatch={dispatch}
            t={t}
            onIssueCard={() => dispatch({ type: "SET_PAGE", page: "id-card-issue" })}
          />
        );

      case "nominations":
        return (
          <NominationsPage
            state={state}
            dispatch={dispatch}
            t={t}
            onCreateNomination={() => dispatch({ type: "SET_PAGE", page: "nomination-create" })}
            onViewNomination={(nom) => {
              dispatch({ type: "SET_SELECTED_NOMINATION", nomination: nom });
              dispatch({ type: "SET_PAGE", page: "nomination-detail" });
            }}
            onApprove={handleApproveNomination}
            onReject={handleRejectNomination}
            onSubmit={handleSubmitNomination}
            onFilterChange={(s) => {
              dispatch({ type: "SET_NOMINATION_STATUS_FILTER", status: s });
              loadNominations(s);
            }}
          />
        );

      case "nomination-create":
        return (
          <NominationCreatePage
            state={state}
            t={t}
            onSave={handleCreateNomination}
            onCancel={() => dispatch({ type: "SET_PAGE", page: "nominations" })}
          />
        );

      case "nomination-detail":
        return (
          <NominationDetailPage
            state={state}
            t={t}
            onApprove={handleApproveNomination}
            onReject={handleRejectNomination}
            onSubmit={handleSubmitNomination}
            onBack={() => dispatch({ type: "SET_PAGE", page: "nominations" })}
          />
        );

      case "campaign-finance":
        return (
          <CampaignFinancePage
            state={state}
            dispatch={dispatch}
            t={t}
            onCreateAccount={() => dispatch({ type: "SET_PAGE", page: "finance-account-create" })}
            onViewTransactions={(account) => {
              dispatch({ type: "SET_SELECTED_CAMPAIGN_ACCOUNT", account });
              dispatch({ type: "SET_PAGE", page: "finance-transactions" });
            }}
          />
        );

      case "finance-account-create":
        return (
          <FinanceAccountCreatePage
            state={state}
            t={t}
            onSave={handleCreateCampaignAccount}
            onCancel={() => dispatch({ type: "SET_PAGE", page: "campaign-finance" })}
          />
        );

      case "finance-transactions":
        return (
          <FinanceTransactionsPage
            state={state}
            t={t}
            onAddTransaction={(data) =>
              state.selectedCampaignAccount
                ? handleAddTransaction(state.selectedCampaignAccount.id, data)
                : Promise.resolve()
            }
            onBack={() => dispatch({ type: "SET_PAGE", page: "campaign-finance" })}
          />
        );

      case "analytics":
        return <HierarchyAnalyticsPage api={api} t={t} dispatch={dispatch} />;

      default:
        return <DashboardPage state={state} dispatch={dispatch} t={t} />;
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const showBottomNav = ![
    "member-create", "dues-create", "meeting-create", "id-card-issue",
    "nomination-create", "nomination-detail",
    "finance-account-create", "finance-transactions",
  ].includes(state.page);

  return (
    <div style={s.app}>
      {/* Header */}
      <header style={s.header}>
        <div style={s.headerTitle}>
          {state.organization?.abbreviation ?? "WebWaka Party"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Locale selector */}
          <select
            style={{
              backgroundColor: "transparent",
              color: "#FFFFFF",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: "6px",
              padding: "4px 8px",
              fontSize: "12px",
              cursor: "pointer",
            }}
            value={state.locale}
            onChange={(e) => dispatch({ type: "SET_LOCALE", locale: e.target.value as PartyLocale })}
          >
            {SUPPORTED_LOCALES.map((loc) => (
              <option key={loc} value={loc} style={{ color: colors.text, backgroundColor: colors.surface }}>
                {LOCALE_NAMES[loc]}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Offline banner */}
      {!state.isOnline && (
        <div style={s.offlineBanner}>
          <span>📡</span>
          <span>{t.common.offline} — {t.common.syncing}</span>
        </div>
      )}

      {/* Error banner */}
      {state.error && (
        <div style={{ ...s.offlineBanner, backgroundColor: colors.error }}>
          <span>⚠️</span>
          <span>{state.error}</span>
          <button
            style={{ marginLeft: "8px", background: "none", border: "none", color: "#FFFFFF", cursor: "pointer", fontSize: "16px" }}
            onClick={() => dispatch({ type: "SET_ERROR", error: null })}
          >
            ×
          </button>
        </div>
      )}

      {/* Page content */}
      <main style={s.content}>
        {renderPage()}
      </main>

      {/* Bottom navigation */}
      {showBottomNav && (
        <nav style={s.bottomNav}>
          {navItems.map(({ page, icon, label }) => (
            <button
              key={page}
              style={s.navItem(activePage === page)}
              onClick={() => dispatch({ type: "SET_PAGE", page })}
            >
              <span style={{ fontSize: "20px" }}>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

export default PartyApp;
