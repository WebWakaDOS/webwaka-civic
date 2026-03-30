/**
 * WebWaka Civic — CIV-3 Elections & Campaigns Module UI
 * Blueprint Reference: Part 10.9 (Civic & Political Suite — Elections & Campaigns)
 *
 * Core Invariants:
 * - Mobile First: 320px base, scale up
 * - Offline First: queued mutations via SW + Dexie
 * - Nigeria First: kobo/NGN, WAT, NDPR, INEC hierarchy
 * - Africa First: i18n en/yo/ig/ha
 * - Build Once Use Infinitely: composes existing presentational components
 *
 * Pages: elections | election-detail | voting | volunteers |
 *        fundraising | results | collation | admin
 */

import React, { useCallback, useEffect, useReducer, useState } from "react";
import {
  electionsApi,
  volunteersApi,
  fundraisingApi,
  resultsApi,
  type Election,
  type Candidate,
  type Volunteer,
  type VolunteerTask,
  type Donation,
  type Expense,
  type BudgetStatus,
  type PublicResults,
} from "./apiClient";

// ─── Types ────────────────────────────────────────────────────────────────────

type Page =
  | "elections"
  | "election-detail"
  | "voting"
  | "volunteers"
  | "volunteer-register"
  | "fundraising"
  | "donation-create"
  | "expense-create"
  | "results"
  | "collation"
  | "admin";

interface AppState {
  page: Page;
  locale: string;
  isOnline: boolean;
  isLoading: boolean;
  error: string | null;
  // Data
  elections: Election[];
  selectedElection: Election | null;
  candidates: Candidate[];
  hasVoted: boolean;
  volunteers: Volunteer[];
  volunteerTasks: VolunteerTask[];
  donations: Donation[];
  expenses: Expense[];
  budgetStatus: BudgetStatus | null;
  publicResults: PublicResults | null;
  // Pagination
  electionSearch: string;
}

type Action =
  | { type: "SET_PAGE"; page: Page }
  | { type: "SET_LOCALE"; locale: string }
  | { type: "SET_ONLINE"; isOnline: boolean }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SET_ELECTIONS"; elections: Election[] }
  | { type: "SELECT_ELECTION"; election: Election; candidates: Candidate[] }
  | { type: "SET_HAS_VOTED" }
  | { type: "SET_VOLUNTEERS"; volunteers: Volunteer[]; tasks: VolunteerTask[] }
  | { type: "SET_FUNDRAISING"; donations: Donation[]; expenses: Expense[]; budget: BudgetStatus | null }
  | { type: "SET_RESULTS"; results: PublicResults | null }
  | { type: "SET_ELECTION_SEARCH"; search: string };

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case "SET_PAGE":       return { ...s, page: a.page, error: null };
    case "SET_LOCALE":     return { ...s, locale: a.locale };
    case "SET_ONLINE":     return { ...s, isOnline: a.isOnline };
    case "SET_LOADING":    return { ...s, isLoading: a.loading };
    case "SET_ERROR":      return { ...s, error: a.error, isLoading: false };
    case "SET_ELECTIONS":  return { ...s, elections: a.elections, isLoading: false };
    case "SELECT_ELECTION": return { ...s, selectedElection: a.election, candidates: a.candidates, isLoading: false };
    case "SET_HAS_VOTED":  return { ...s, hasVoted: true };
    case "SET_VOLUNTEERS": return { ...s, volunteers: a.volunteers, volunteerTasks: a.tasks, isLoading: false };
    case "SET_FUNDRAISING": return { ...s, donations: a.donations, expenses: a.expenses, budgetStatus: a.budget, isLoading: false };
    case "SET_RESULTS":    return { ...s, publicResults: a.results, isLoading: false };
    case "SET_ELECTION_SEARCH": return { ...s, electionSearch: a.search };
    default: return s;
  }
}

const initialState: AppState = {
  page: "elections",
  locale: localStorage.getItem("webwaka_lang") ?? "en",
  isOnline: navigator.onLine,
  isLoading: false,
  error: null,
  elections: [],
  selectedElection: null,
  candidates: [],
  hasVoted: false,
  volunteers: [],
  volunteerTasks: [],
  donations: [],
  expenses: [],
  budgetStatus: null,
  publicResults: null,
  electionSearch: "",
};

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  primary:      "#6B21A8",
  primaryLight: "#9333EA",
  accent:       "#D97706",
  surface:      "#FFFFFF",
  surfaceAlt:   "#F5F0FF",
  border:       "#E5D9F8",
  text:         "#1A1A2E",
  textMuted:    "#6B7280",
  success:      "#15803D",
  warning:      "#B45309",
  error:        "#B91C1C",
  offline:      "#D97706",
};

const S = {
  app: { fontFamily: "'Inter', -apple-system, sans-serif", minHeight: "100vh", backgroundColor: C.surfaceAlt, color: C.text } as React.CSSProperties,
  header: { backgroundColor: C.primary, color: "#FFF", padding: "0 16px", height: "56px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky" as const, top: 0, zIndex: 100 } as React.CSSProperties,
  headerTitle: { fontSize: "16px", fontWeight: 700 } as React.CSSProperties,
  offlineBanner: { backgroundColor: C.offline, color: "#FFF", padding: "8px 16px", fontSize: "13px", textAlign: "center" as const } as React.CSSProperties,
  errorBanner:  { backgroundColor: C.error, color: "#FFF", padding: "8px 16px", fontSize: "13px", textAlign: "center" as const, display: "flex", justifyContent: "space-between", alignItems: "center" } as React.CSSProperties,
  content: { padding: "16px", paddingBottom: "72px" } as React.CSSProperties,
  bottomNav: { position: "fixed" as const, bottom: 0, left: 0, right: 0, backgroundColor: C.surface, borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 90 } as React.CSSProperties,
  navBtn: (active: boolean): React.CSSProperties => ({ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8px 4px", gap: "2px", border: "none", background: "none", cursor: "pointer", color: active ? C.primary : C.textMuted, fontSize: "10px", fontWeight: active ? 700 : 400, borderTop: active ? `2px solid ${C.primary}` : "2px solid transparent" }),
  card: { backgroundColor: C.surface, borderRadius: "12px", padding: "16px", marginBottom: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" } as React.CSSProperties,
  sectionTitle: { fontSize: "16px", fontWeight: 700, marginBottom: "12px", marginTop: "4px" } as React.CSSProperties,
  badge: (color: string): React.CSSProperties => ({ display: "inline-block", padding: "2px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 600, backgroundColor: `${color}20`, color }),
  statBox: { backgroundColor: C.surface, borderRadius: "10px", padding: "14px", textAlign: "center" as const } as React.CSSProperties,
  statVal: { fontSize: "24px", fontWeight: 800, color: C.primary } as React.CSSProperties,
  statLbl: { fontSize: "11px", color: C.textMuted, marginTop: "2px" } as React.CSSProperties,
  btn: (color: string, sm?: boolean): React.CSSProperties => ({ padding: sm ? "6px 14px" : "12px 20px", backgroundColor: color, color: "#FFF", border: "none", borderRadius: "8px", fontSize: sm ? "13px" : "15px", fontWeight: 600, cursor: "pointer" }),
  btnOutline: (color: string): React.CSSProperties => ({ padding: "8px 16px", backgroundColor: "transparent", color, border: `1.5px solid ${color}`, borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }),
  input: { width: "100%", padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: "8px", fontSize: "14px", marginBottom: "12px", boxSizing: "border-box" as const, backgroundColor: "#FAFAFA" } as React.CSSProperties,
  label: { display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px", color: C.textMuted } as React.CSSProperties,
  progressBar: (pct: number, color: string): React.CSSProperties => ({ height: "8px", borderRadius: "4px", background: `linear-gradient(to right, ${color} ${pct}%, #E5E7EB ${pct}%)` }),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function koboToNaira(k: number) { return `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}` }
function formatDate(ts: number) { return new Date(ts).toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" }) }
function statusColor(s: string) {
  return { upcoming: "#2563EB", nomination: "#D97706", voting: "#15803D", collation: "#9333EA", closed: "#6B7280" }[s] ?? "#6B7280";
}
function Spinner() {
  return <div style={{ textAlign: "center", padding: "48px", color: C.textMuted }}>⌛ Loading…</div>;
}

// ─── Pages ────────────────────────────────────────────────────────────────────

function ElectionsPage({ state, dispatch, onSelect }: { state: AppState; dispatch: React.Dispatch<Action>; onSelect: (e: Election) => void }) {
  const filtered = state.elections.filter((e) =>
    !state.electionSearch || e.name.toLowerCase().includes(state.electionSearch.toLowerCase())
  );

  return (
    <div>
      <input
        style={S.input}
        placeholder="🔍 Search elections…"
        value={state.electionSearch}
        onChange={(ev) => dispatch({ type: "SET_ELECTION_SEARCH", search: ev.target.value })}
      />
      <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "12px" }}>
        {filtered.length} election{filtered.length !== 1 ? "s" : ""}
      </div>
      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px", color: C.textMuted }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>🗳️</div>
          <div>No elections found</div>
        </div>
      )}
      {filtered.map((e) => (
        <div key={e.id} style={{ ...S.card, cursor: "pointer" }} onClick={() => onSelect(e)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
            <div style={{ fontSize: "15px", fontWeight: 700, flex: 1 }}>{e.name}</div>
            <span style={S.badge(statusColor(e.status))}>{e.status}</span>
          </div>
          {e.description && <div style={{ fontSize: "13px", color: C.textMuted, marginBottom: "8px" }}>{e.description}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
            <div style={{ fontSize: "12px", color: C.textMuted }}>📅 {formatDate(e.startDate)}</div>
            <div style={{ fontSize: "12px", color: C.textMuted }}>📍 {e.state ?? "—"}</div>
          </div>
          <div style={{ display: "flex", gap: "16px" }}>
            {e.candidateCount != null && <span style={{ fontSize: "12px", color: C.textMuted }}>👥 {e.candidateCount} candidates</span>}
            {e.voterCount != null && <span style={{ fontSize: "12px", color: C.textMuted }}>🗳️ {e.voterCount} voters</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function ElectionDetailPage({ state, dispatch }: { state: AppState; dispatch: React.Dispatch<Action> }) {
  const e = state.selectedElection;
  if (!e) return null;

  return (
    <div>
      <button style={{ background: "none", border: "none", cursor: "pointer", color: C.primary, fontSize: "14px", marginBottom: "12px" }}
        onClick={() => dispatch({ type: "SET_PAGE", page: "elections" })}>← Back</button>
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 800, margin: 0 }}>{e.name}</h2>
          <span style={S.badge(statusColor(e.status))}>{e.status}</span>
        </div>
        {e.description && <p style={{ color: C.textMuted, fontSize: "13px", marginBottom: "12px" }}>{e.description}</p>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
          <div><div style={S.label}>Start Date</div><div style={{ fontSize: "14px" }}>{formatDate(e.startDate)}</div></div>
          <div><div style={S.label}>End Date</div><div style={{ fontSize: "14px" }}>{formatDate(e.endDate)}</div></div>
          {e.state && <div><div style={S.label}>State</div><div style={{ fontSize: "14px" }}>{e.state}</div></div>}
          {e.lga && <div><div style={S.label}>LGA</div><div style={{ fontSize: "14px" }}>{e.lga}</div></div>}
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {e.status === "voting" && (
            <button style={S.btn(C.success)} onClick={() => dispatch({ type: "SET_PAGE", page: "voting" })}>
              🗳️ Vote Now
            </button>
          )}
          <button style={S.btn(C.primary)} onClick={() => dispatch({ type: "SET_PAGE", page: "results" })}>
            📊 Results
          </button>
        </div>
      </div>

      <div style={S.sectionTitle}>Candidates ({state.candidates.length})</div>
      {state.candidates.length === 0
        ? <div style={{ color: C.textMuted, fontSize: "13px" }}>No candidates registered yet.</div>
        : state.candidates.map((c) => (
          <div key={c.id} style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: "12px", color: C.textMuted }}>{c.position}{c.party ? ` — ${c.party}` : ""}</div>
              </div>
              <span style={S.badge(c.status === "approved" ? C.success : c.status === "rejected" ? C.error : C.warning)}>{c.status}</span>
            </div>
          </div>
        ))
      }
    </div>
  );
}

function VotingPage({ state, dispatch, electionId }: { state: AppState; dispatch: React.Dispatch<Action>; electionId: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (state.hasVoted || done) {
    return (
      <div style={{ textAlign: "center", padding: "48px 16px" }}>
        <div style={{ fontSize: "64px", marginBottom: "16px" }}>✅</div>
        <div style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>Vote Submitted</div>
        <div style={{ color: C.textMuted, fontSize: "14px", marginBottom: "24px" }}>
          {!state.isOnline ? "Saved offline — will sync when you reconnect." : "Your vote has been recorded."}
        </div>
        <button style={S.btn(C.primary)} onClick={() => dispatch({ type: "SET_PAGE", page: "election-detail" })}>
          Back to Election
        </button>
      </div>
    );
  }

  const handleVote = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await fetch(`/api/elections/${electionId}/votes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionStorage.getItem("webwaka_election_token") ?? ""}` },
        body: JSON.stringify({ candidateId: selected }),
      });
      dispatch({ type: "SET_HAS_VOTED" });
      setDone(true);
    } catch {
      // SW will queue when offline
      dispatch({ type: "SET_HAS_VOTED" });
      setDone(true);
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  };

  return (
    <div>
      <button style={{ background: "none", border: "none", cursor: "pointer", color: C.primary, fontSize: "14px", marginBottom: "12px" }}
        onClick={() => dispatch({ type: "SET_PAGE", page: "election-detail" })}>← Back</button>
      <div style={{ ...S.card, marginBottom: "16px" }}>
        <h2 style={{ fontSize: "17px", fontWeight: 700, margin: "0 0 4px 0" }}>Cast Your Vote</h2>
        <p style={{ color: C.textMuted, fontSize: "13px", margin: 0 }}>Select one candidate and confirm your choice. Votes cannot be changed.</p>
      </div>

      {state.candidates.filter(c => c.status === "approved").map((c) => (
        <div
          key={c.id}
          style={{ ...S.card, cursor: "pointer", border: `2px solid ${selected === c.id ? C.primary : C.border}`, transition: "border-color 0.15s" }}
          onClick={() => setSelected(c.id)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "50%", backgroundColor: C.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>👤</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{c.name}</div>
              <div style={{ fontSize: "12px", color: C.textMuted }}>{c.position}{c.party ? ` — ${c.party}` : ""}</div>
            </div>
            {selected === c.id && <span style={{ color: C.primary, fontSize: "20px" }}>✓</span>}
          </div>
        </div>
      ))}

      {selected && !confirming && (
        <button style={{ ...S.btn(C.primary), width: "100%", marginTop: "8px" }} onClick={() => setConfirming(true)}>
          Confirm Vote →
        </button>
      )}

      {confirming && (
        <div style={{ ...S.card, border: `2px solid ${C.primary}` }}>
          <div style={{ fontWeight: 700, marginBottom: "8px" }}>Are you sure?</div>
          <div style={{ color: C.textMuted, fontSize: "13px", marginBottom: "16px" }}>
            You are voting for <strong>{state.candidates.find(c => c.id === selected)?.name}</strong>. This action cannot be undone.
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button style={S.btn(C.success)} onClick={handleVote} disabled={submitting}>
              {submitting ? "Submitting…" : "✓ Confirm Vote"}
            </button>
            <button style={S.btnOutline(C.error)} onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function VolunteersPage({ state, dispatch, electionId }: { state: AppState; dispatch: React.Dispatch<Action>; electionId: string }) {
  const [tab, setTab] = useState<"tasks" | "people">("tasks");

  return (
    <div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button style={tab === "tasks" ? S.btn(C.primary, true) : S.btnOutline(C.primary)} onClick={() => setTab("tasks")}>Tasks</button>
        <button style={tab === "people" ? S.btn(C.primary, true) : S.btnOutline(C.primary)} onClick={() => setTab("people")}>Volunteers</button>
        <button style={{ ...S.btnOutline(C.primary), marginLeft: "auto" }} onClick={() => dispatch({ type: "SET_PAGE", page: "volunteer-register" })}>+ Register</button>
      </div>

      {tab === "tasks" && (
        <>
          {state.volunteerTasks.length === 0
            ? <div style={{ textAlign: "center", padding: "40px", color: C.textMuted }}>No tasks created yet.</div>
            : state.volunteerTasks.map((t) => (
              <div key={t.id} style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontWeight: 600 }}>{t.title}</span>
                  <span style={S.badge(t.status === "completed" ? C.success : t.status === "assigned" ? C.warning : C.primary)}>
                    {t.status}
                  </span>
                </div>
                {t.description && <div style={{ fontSize: "13px", color: C.textMuted, marginBottom: "6px" }}>{t.description}</div>}
                <div style={{ display: "flex", gap: "12px", fontSize: "12px", color: C.textMuted }}>
                  <span>⭐ {t.pointsReward} pts</span>
                  <span style={S.badge(t.priority === "high" ? C.error : t.priority === "low" ? C.textMuted : C.warning)}>
                    {t.priority}
                  </span>
                  {t.dueAt && <span>Due {formatDate(t.dueAt)}</span>}
                </div>
              </div>
            ))
          }
        </>
      )}

      {tab === "people" && (
        <>
          {state.volunteers.length === 0
            ? <div style={{ textAlign: "center", padding: "40px", color: C.textMuted }}>No volunteers yet.</div>
            : state.volunteers.map((v) => (
              <div key={v.id} style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{v.name}</div>
                    <div style={{ fontSize: "12px", color: C.textMuted }}>
                      {[v.state, v.lga, v.ward].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, color: C.primary }}>{v.points} pts</div>
                    <div style={{ fontSize: "11px", color: C.textMuted }}>{v.tasksCompleted} tasks done</div>
                  </div>
                </div>
              </div>
            ))
          }
        </>
      )}
    </div>
  );
}

function VolunteerRegisterPage({ dispatch, electionId }: { dispatch: React.Dispatch<Action>; electionId: string }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", state: "", lga: "", ward: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handle = useCallback(async () => {
    if (!form.name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError("");
    const res = await volunteersApi.register(electionId, { ...form, status: "active" });
    setSaving(false);
    if (res.success) dispatch({ type: "SET_PAGE", page: "volunteers" });
    else setError(res.error);
  }, [form, electionId, dispatch]);

  return (
    <div>
      <button style={{ background: "none", border: "none", cursor: "pointer", color: C.primary, fontSize: "14px", marginBottom: "12px" }}
        onClick={() => dispatch({ type: "SET_PAGE", page: "volunteers" })}>← Back</button>
      <div style={S.sectionTitle}>Register as Volunteer</div>
      {error && <div style={S.errorBanner}>{error}</div>}
      {(["name", "phone", "email", "state", "lga", "ward"] as const).map((f) => (
        <div key={f}>
          <label style={S.label}>{f.charAt(0).toUpperCase() + f.slice(1)}{f === "name" ? " *" : ""}</label>
          <input style={S.input} value={form[f]} onChange={(ev) => setForm((p) => ({ ...p, [f]: ev.target.value }))} />
        </div>
      ))}
      <button style={{ ...S.btn(C.primary), width: "100%" }} onClick={handle} disabled={saving}>
        {saving ? "Registering…" : "Register"}
      </button>
    </div>
  );
}

function FundraisingPage({ state, dispatch, electionId }: { state: AppState; dispatch: React.Dispatch<Action>; electionId: string }) {
  const [tab, setTab] = useState<"overview" | "donations" | "expenses">("overview");
  const b = state.budgetStatus;

  return (
    <div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        {(["overview", "donations", "expenses"] as const).map((t) => (
          <button key={t} style={tab === t ? S.btn(C.primary, true) : S.btnOutline(C.primary)} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <button style={{ ...S.btnOutline(C.success), marginLeft: "auto" }} onClick={() => dispatch({ type: "SET_PAGE", page: "donation-create" })}>+ Donate</button>
      </div>

      {tab === "overview" && b && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
            {[
              { label: "Total Budget", val: koboToNaira(b.totalBudgetKobo) },
              { label: "Total Raised", val: koboToNaira(b.totalRaisedKobo) },
              { label: "Total Spent", val: koboToNaira(b.totalSpentKobo) },
              { label: "Remaining", val: koboToNaira(b.remainingBudgetKobo) },
            ].map(({ label, val }) => (
              <div key={label} style={S.statBox}>
                <div style={S.statVal}>{val}</div>
                <div style={S.statLbl}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ ...S.card, padding: "12px" }}>
            <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "6px" }}>
              Spent {b.spentPercent.toFixed(1)}% of budget
            </div>
            <div style={S.progressBar(b.spentPercent, b.spentPercent > 80 ? C.error : C.primary)} />
          </div>
          <div style={{ ...S.card, padding: "12px", marginTop: "0" }}>
            <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "6px" }}>
              Raised {b.fundraisingPercent.toFixed(1)}% of budget
            </div>
            <div style={S.progressBar(b.fundraisingPercent, C.success)} />
          </div>
        </>
      )}

      {tab === "donations" && (
        <>
          {state.donations.length === 0
            ? <div style={{ textAlign: "center", padding: "40px", color: C.textMuted }}>No donations yet.</div>
            : state.donations.map((d) => (
              <div key={d.id} style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{d.donorName}</div>
                    <div style={{ fontSize: "12px", color: C.textMuted }}>{formatDate(d.createdAt)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700 }}>{koboToNaira(d.amountKobo)}</div>
                    <span style={S.badge(d.status === "completed" ? C.success : d.status === "failed" ? C.error : C.warning)}>{d.status}</span>
                  </div>
                </div>
              </div>
            ))
          }
        </>
      )}

      {tab === "expenses" && (
        <>
          <button style={{ ...S.btn(C.accent, true), marginBottom: "12px" }} onClick={() => dispatch({ type: "SET_PAGE", page: "expense-create" })}>
            + Submit Expense
          </button>
          {state.expenses.length === 0
            ? <div style={{ textAlign: "center", padding: "40px", color: C.textMuted }}>No expenses yet.</div>
            : state.expenses.map((ex) => (
              <div key={ex.id} style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{ex.description}</div>
                    <div style={{ fontSize: "12px", color: C.textMuted }}>{ex.category}{ex.vendorName ? ` · ${ex.vendorName}` : ""}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700 }}>{koboToNaira(ex.amountKobo)}</div>
                    <span style={S.badge(ex.status === "approved" ? C.success : ex.status === "rejected" ? C.error : C.warning)}>{ex.status}</span>
                  </div>
                </div>
              </div>
            ))
          }
        </>
      )}
    </div>
  );
}

function DonationCreatePage({ dispatch, electionId }: { dispatch: React.Dispatch<Action>; electionId: string }) {
  const [form, setForm] = useState({ donorName: "", donorEmail: "", donorPhone: "", amountKobo: "", ndprConsent: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handle = useCallback(async () => {
    if (!form.donorName || !form.amountKobo) { setError("Name and amount are required"); return; }
    if (!form.ndprConsent) { setError("NDPR consent is required"); return; }
    setSaving(true);
    setError("");
    const res = await fundraisingApi.createDonation(electionId, {
      ...form,
      amountKobo: parseInt(form.amountKobo) * 100,
    });
    setSaving(false);
    if (res.success) dispatch({ type: "SET_PAGE", page: "fundraising" });
    else setError(res.error);
  }, [form, electionId, dispatch]);

  return (
    <div>
      <button style={{ background: "none", border: "none", cursor: "pointer", color: C.primary, fontSize: "14px", marginBottom: "12px" }}
        onClick={() => dispatch({ type: "SET_PAGE", page: "fundraising" })}>← Back</button>
      <div style={S.sectionTitle}>Record Donation</div>
      {error && <div style={S.errorBanner}>{error} <span /></div>}
      <label style={S.label}>Donor Name *</label>
      <input style={S.input} value={form.donorName} onChange={(ev) => setForm((p) => ({ ...p, donorName: ev.target.value }))} />
      <label style={S.label}>Amount (₦) *</label>
      <input style={S.input} type="number" min="0" placeholder="e.g. 5000" value={form.amountKobo}
        onChange={(ev) => setForm((p) => ({ ...p, amountKobo: ev.target.value }))} />
      <label style={S.label}>Phone (WhatsApp)</label>
      <input style={S.input} value={form.donorPhone} onChange={(ev) => setForm((p) => ({ ...p, donorPhone: ev.target.value }))} />
      <label style={S.label}>Email</label>
      <input style={S.input} value={form.donorEmail} onChange={(ev) => setForm((p) => ({ ...p, donorEmail: ev.target.value }))} />
      <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", cursor: "pointer", fontSize: "13px" }}>
        <input type="checkbox" checked={form.ndprConsent} onChange={(ev) => setForm((p) => ({ ...p, ndprConsent: ev.target.checked }))} />
        I consent to my data being stored in accordance with NDPR regulations.
      </label>
      <button style={{ ...S.btn(C.primary), width: "100%" }} onClick={handle} disabled={saving}>
        {saving ? "Recording…" : "Record Donation"}
      </button>
    </div>
  );
}

function ExpenseCreatePage({ dispatch, electionId }: { dispatch: React.Dispatch<Action>; electionId: string }) {
  const [form, setForm] = useState({ category: "", description: "", amountKobo: "", vendorName: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handle = useCallback(async () => {
    if (!form.category || !form.description || !form.amountKobo) { setError("All required fields must be filled"); return; }
    setSaving(true);
    setError("");
    const res = await fundraisingApi.createExpense(electionId, { ...form, amountKobo: parseInt(form.amountKobo) * 100 });
    setSaving(false);
    if (res.success) dispatch({ type: "SET_PAGE", page: "fundraising" });
    else setError(res.error);
  }, [form, electionId, dispatch]);

  return (
    <div>
      <button style={{ background: "none", border: "none", cursor: "pointer", color: C.primary, fontSize: "14px", marginBottom: "12px" }}
        onClick={() => dispatch({ type: "SET_PAGE", page: "fundraising" })}>← Back</button>
      <div style={S.sectionTitle}>Submit Expense</div>
      {error && <div style={S.errorBanner}>{error} <span /></div>}
      <label style={S.label}>Category *</label>
      <select style={S.input} value={form.category} onChange={(ev) => setForm((p) => ({ ...p, category: ev.target.value }))}>
        <option value="">Select…</option>
        {["advertising", "logistics", "personnel", "printing", "events", "technology", "legal", "other"].map((c) => (
          <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
        ))}
      </select>
      <label style={S.label}>Description *</label>
      <input style={S.input} value={form.description} onChange={(ev) => setForm((p) => ({ ...p, description: ev.target.value }))} />
      <label style={S.label}>Amount (₦) *</label>
      <input style={S.input} type="number" min="0" value={form.amountKobo}
        onChange={(ev) => setForm((p) => ({ ...p, amountKobo: ev.target.value }))} />
      <label style={S.label}>Vendor Name</label>
      <input style={S.input} value={form.vendorName} onChange={(ev) => setForm((p) => ({ ...p, vendorName: ev.target.value }))} />
      <button style={{ ...S.btn(C.primary), width: "100%" }} onClick={handle} disabled={saving}>
        {saving ? "Submitting…" : "Submit Expense"}
      </button>
    </div>
  );
}

function ResultsPage({ state, dispatch, electionId }: { state: AppState; dispatch: React.Dispatch<Action>; electionId: string }) {
  const r = state.publicResults;
  const [tab, setTab] = useState<"summary" | "breakdown">("summary");

  return (
    <div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button style={tab === "summary" ? S.btn(C.primary, true) : S.btnOutline(C.primary)} onClick={() => setTab("summary")}>Summary</button>
        <button style={tab === "breakdown" ? S.btn(C.primary, true) : S.btnOutline(C.primary)} onClick={() => setTab("breakdown")}>Collation</button>
      </div>

      {tab === "summary" && (
        <>
          {!r
            ? <div style={{ textAlign: "center", padding: "40px", color: C.textMuted }}>
                Select an election to view its results.
              </div>
            : <>
              <div style={{ ...S.card, marginBottom: "8px" }}>
                <div style={{ fontSize: "13px", color: C.textMuted, marginBottom: "4px" }}>Total Votes Cast</div>
                <div style={{ fontSize: "28px", fontWeight: 800, color: C.primary }}>{r.totalVotes.toLocaleString()}</div>
              </div>
              {r.results.map((res, i) => (
                <div key={res.candidateId} style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div>
                      <span style={{ fontWeight: 700, marginRight: "8px" }}>#{i + 1}</span>
                      <span style={{ fontWeight: 600 }}>{res.candidateName}</span>
                      {res.party && <span style={{ fontSize: "12px", color: C.textMuted }}> · {res.party}</span>}
                    </div>
                    <div style={{ fontWeight: 800, color: C.primary }}>{res.percentage.toFixed(1)}%</div>
                  </div>
                  <div style={S.progressBar(res.percentage, i === 0 ? C.success : C.primary)} />
                  <div style={{ fontSize: "12px", color: C.textMuted, marginTop: "4px" }}>
                    {res.totalVotes.toLocaleString()} votes
                  </div>
                </div>
              ))}
            </>
          }
        </>
      )}

      {tab === "breakdown" && (
        <div style={{ textAlign: "center", padding: "40px", color: C.textMuted }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>📊</div>
          <div>Select an election and level to view geographic breakdown.</div>
          <button style={{ ...S.btn(C.primary), marginTop: "16px" }}
            onClick={() => dispatch({ type: "SET_PAGE", page: "collation" })}>
            Open Collation View →
          </button>
        </div>
      )}
    </div>
  );
}

function CollationPage({ state, dispatch, electionId }: { state: AppState; dispatch: React.Dispatch<Action>; electionId: string }) {
  const [level, setLevel] = useState("ward");
  const [collations, setCollations] = useState<{ candidateName: string; votes: number; level: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const loadCollation = useCallback(async () => {
    setLoading(true);
    const res = await resultsApi.getCollation(electionId, level);
    setLoading(false);
    if (res.success) setCollations(res.data.collations as typeof collations);
  }, [electionId, level]);

  return (
    <div>
      <button style={{ background: "none", border: "none", cursor: "pointer", color: C.primary, fontSize: "14px", marginBottom: "12px" }}
        onClick={() => dispatch({ type: "SET_PAGE", page: "results" })}>← Back</button>
      <div style={S.sectionTitle}>Multi-Level Result Collation</div>
      <div style={{ marginBottom: "12px" }}>
        <label style={S.label}>Collation Level</label>
        <select style={S.input} value={level} onChange={(ev) => setLevel(ev.target.value)}>
          {["polling_unit", "ward", "lga", "state", "senatorial", "federal_constituency", "national"].map((l) => (
            <option key={l} value={l}>{l.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
          ))}
        </select>
        <button style={S.btn(C.primary, true)} onClick={loadCollation} disabled={loading}>
          {loading ? "Loading…" : "Load Results"}
        </button>
      </div>
      {collations.length > 0 && (
        <>
          {collations.map((c, i) => (
            <div key={i} style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600 }}>{c.candidateName}</span>
                <span style={{ fontWeight: 700, color: C.primary }}>{c.votes.toLocaleString()} votes</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function AdminPage({ state, dispatch, tenantId }: { state: AppState; dispatch: React.Dispatch<Action>; tenantId: string }) {
  const [migrateResult, setMigrateResult] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const electionId = state.selectedElection?.id ?? "";

  const runMigration = useCallback(async () => {
    if (!electionId) { setMigrateResult("Please select an election first"); return; }
    setMigrating(true);
    const res = await electionsApi.migrate(electionId);
    setMigrating(false);
    setMigrateResult(res.success ? "✓ Migration complete" : `✗ ${res.error}`);
  }, [electionId]);

  return (
    <div>
      <div style={S.sectionTitle}>Admin Tools</div>
      <div style={S.card}>
        <div style={{ fontWeight: 600, marginBottom: "8px" }}>Database Migration</div>
        <div style={{ fontSize: "13px", color: C.textMuted, marginBottom: "12px" }}>
          Run the CIV-3 D1 migration to create all elections tables for this tenant.
          {!electionId && <div style={{ color: C.error, marginTop: "4px" }}>⚠️ No election selected — select one from the Elections tab first.</div>}
        </div>
        {migrateResult && (
          <div style={{ padding: "8px 12px", borderRadius: "8px", backgroundColor: migrateResult.startsWith("✓") ? "#D1FAE5" : "#FEE2E2", color: migrateResult.startsWith("✓") ? C.success : C.error, fontSize: "13px", marginBottom: "12px" }}>
            {migrateResult}
          </div>
        )}
        <button style={S.btn(C.primary, true)} onClick={runMigration} disabled={migrating || !electionId}>
          {migrating ? "Running…" : "Run Migrations"}
        </button>
      </div>

      <div style={S.card}>
        <div style={{ fontWeight: 600, marginBottom: "8px" }}>Tenant Info</div>
        <div style={{ fontSize: "13px", color: C.textMuted }}>Tenant ID: <strong>{tenantId || "—"}</strong></div>
        <div style={{ fontSize: "13px", color: C.textMuted, marginTop: "4px" }}>Module: <strong>CIV-3 Elections & Campaigns</strong></div>
      </div>
    </div>
  );
}

// ─── Main Module Component ────────────────────────────────────────────────────

const NAV = [
  { page: "elections" as Page, icon: "🗳️", label: "Elections" },
  { page: "volunteers" as Page, icon: "🙋", label: "Volunteers" },
  { page: "fundraising" as Page, icon: "💰", label: "Finance" },
  { page: "results" as Page, icon: "📊", label: "Results" },
  { page: "admin" as Page, icon: "⚙️", label: "Admin" },
];

export function ElectionsApp({ tenantId, onLogout }: { tenantId: string; onLogout?: () => void }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Connectivity
  useEffect(() => {
    const up   = () => dispatch({ type: "SET_ONLINE", isOnline: true });
    const down = () => dispatch({ type: "SET_ONLINE", isOnline: false });
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  // Initial load — elections list
  useEffect(() => {
    if (!tenantId) return;
    dispatch({ type: "SET_LOADING", loading: true });
    electionsApi.list(tenantId).then((res) => {
      if (res.success) dispatch({ type: "SET_ELECTIONS", elections: res.data.elections });
      else dispatch({ type: "SET_ERROR", error: res.error });
    });
  }, [tenantId]);

  // Load data for current page
  useEffect(() => {
    const elId = state.selectedElection?.id;
    if (!elId) return;

    if (state.page === "volunteers") {
      dispatch({ type: "SET_LOADING", loading: true });
      Promise.all([volunteersApi.list(elId), volunteersApi.tasks(elId)]).then(([vRes, tRes]) => {
        dispatch({
          type: "SET_VOLUNTEERS",
          volunteers: vRes.success ? vRes.data.volunteers : [],
          tasks: tRes.success ? tRes.data.tasks : [],
        });
      });
    }

    if (state.page === "fundraising") {
      dispatch({ type: "SET_LOADING", loading: true });
      Promise.all([
        fundraisingApi.donations(elId),
        fundraisingApi.expenses(elId),
        fundraisingApi.budgetStatus(elId),
      ]).then(([dRes, eRes, bRes]) => {
        dispatch({
          type: "SET_FUNDRAISING",
          donations: dRes.success ? dRes.data.donations : [],
          expenses: eRes.success ? eRes.data.expenses : [],
          budget: bRes.success ? bRes.data : null,
        });
      });
    }

    if (state.page === "results") {
      dispatch({ type: "SET_LOADING", loading: true });
      resultsApi.publicResults(elId).then((res) => {
        dispatch({ type: "SET_RESULTS", results: res.success ? res.data : null });
      });
    }
  }, [state.page, state.selectedElection?.id]);

  const handleSelectElection = useCallback(async (e: Election) => {
    dispatch({ type: "SET_LOADING", loading: true });
    const res = await electionsApi.candidates(e.id);
    dispatch({
      type: "SELECT_ELECTION",
      election: e,
      candidates: res.success ? res.data.candidates : [],
    });
    dispatch({ type: "SET_PAGE", page: "election-detail" });
  }, []);

  const electionId = state.selectedElection?.id ?? "";

  const renderPage = () => {
    if (state.isLoading && state.page === "elections") return <Spinner />;
    switch (state.page) {
      case "elections":       return <ElectionsPage state={state} dispatch={dispatch} onSelect={handleSelectElection} />;
      case "election-detail": return <ElectionDetailPage state={state} dispatch={dispatch} />;
      case "voting":          return <VotingPage state={state} dispatch={dispatch} electionId={electionId} />;
      case "volunteers":
      case "volunteer-register":
        return state.page === "volunteer-register"
          ? <VolunteerRegisterPage dispatch={dispatch} electionId={electionId} />
          : <VolunteersPage state={state} dispatch={dispatch} electionId={electionId} />;
      case "fundraising":     return <FundraisingPage state={state} dispatch={dispatch} electionId={electionId} />;
      case "donation-create": return <DonationCreatePage dispatch={dispatch} electionId={electionId} />;
      case "expense-create":  return <ExpenseCreatePage dispatch={dispatch} electionId={electionId} />;
      case "results":         return <ResultsPage state={state} dispatch={dispatch} electionId={electionId} />;
      case "collation":       return <CollationPage state={state} dispatch={dispatch} electionId={electionId} />;
      case "admin":           return <AdminPage state={state} dispatch={dispatch} tenantId={tenantId} />;
      default:                return <ElectionsPage state={state} dispatch={dispatch} onSelect={handleSelectElection} />;
    }
  };

  const activeNav = NAV.find((n) => state.page.startsWith(n.page))?.page ?? "elections";
  const showNav = !["voting", "volunteer-register", "donation-create", "expense-create"].includes(state.page);

  return (
    <div style={S.app}>
      <header style={S.header}>
        <div style={S.headerTitle}>
          🗳️ {state.selectedElection?.name ?? "Elections & Campaigns"}
        </div>
        {onLogout && (
          <button
            style={{ background: "none", border: "1px solid rgba(255,255,255,0.4)", color: "#FFF", borderRadius: "6px", padding: "4px 10px", fontSize: "12px", cursor: "pointer" }}
            onClick={onLogout}
          >
            Exit
          </button>
        )}
      </header>

      {!state.isOnline && (
        <div style={S.offlineBanner}>📡 Offline — changes will sync when connected</div>
      )}
      {state.error && (
        <div style={S.errorBanner}>
          <span>⚠️ {state.error}</span>
          <button style={{ background: "none", border: "none", color: "#FFF", cursor: "pointer", fontSize: "16px" }}
            onClick={() => dispatch({ type: "SET_ERROR", error: null })}>×</button>
        </div>
      )}

      <main style={S.content}>{renderPage()}</main>

      {showNav && (
        <nav style={S.bottomNav}>
          {NAV.map(({ page, icon, label }) => (
            <button
              key={page}
              style={S.navBtn(activeNav === page)}
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

export default ElectionsApp;
