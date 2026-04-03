/**
 * WebWaka Civic — T-CIV-01: Usher PWA Offline Donation Panel
 * Blueprint Reference: Part 10.9 (Church & NGO), Part 6 (Offline Sync)
 *
 * Core Invariants:
 * - Offline First: every tap is saved to Dexie immediately — no network needed
 * - Mobile First: large denomination tap targets, thumb-reachable layout
 * - Nigeria First: NGN denominations, kobo storage
 * - PWA First: background sync registered on mount
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  NAIRA_DENOMINATIONS,
  type DenominationBreakdown,
  type NairaDenomination,
  clearSyncedDonations,
  countPending,
  createDonationSyncManager,
  deserializeBreakdown,
  getAllOfflineDonations,
  logDonationOffline,
  totalFromBreakdown,
} from "./offlineDonations";
import type { PendingDonation } from "../../core/sync/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UsherPanelProps {
  tenantId: string;
  organizationId: string;
  apiBase: string;
  getAuthToken: () => string;
  onBack: () => void;
}

type DonationType = PendingDonation["donationType"];

const DONATION_TYPE_OPTIONS: { value: DonationType; label: string; emoji: string }[] = [
  { value: "tithe", label: "Tithe", emoji: "✝️" },
  { value: "offering", label: "Offering", emoji: "🙏" },
  { value: "special", label: "Special", emoji: "⭐" },
  { value: "seed", label: "Seed", emoji: "🌱" },
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const C = {
  green: "#1B4332",
  greenLight: "#2D6A4F",
  gold: "#D4A017",
  goldLight: "#F0C040",
  surface: "#FFFFFF",
  surfaceAlt: "#F8FAF9",
  border: "#E2E8E4",
  text: "#1A2E22",
  textMuted: "#6B7C72",
  success: "#2D6A4F",
  error: "#C0392B",
  warning: "#F39C12",
  info: "#2980B9",
};

const s = {
  wrap: {
    minHeight: "100vh",
    background: C.surfaceAlt,
    paddingBottom: "80px",
  } as React.CSSProperties,

  header: {
    background: C.green,
    color: "#fff",
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
  } as React.CSSProperties,

  backBtn: {
    background: "rgba(255,255,255,0.15)",
    border: "none",
    borderRadius: "8px",
    color: "#fff",
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: "14px",
  } as React.CSSProperties,

  headerTitle: {
    flex: 1,
    fontSize: "18px",
    fontWeight: 700,
  } as React.CSSProperties,

  pendingBadge: (n: number) =>
    ({
      background: n > 0 ? C.gold : "#4CAF50",
      color: n > 0 ? "#fff" : "#fff",
      borderRadius: "12px",
      padding: "2px 10px",
      fontSize: "13px",
      fontWeight: 600,
    } as React.CSSProperties),

  section: {
    background: C.surface,
    margin: "12px 12px 0",
    borderRadius: "12px",
    padding: "16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: "13px",
    fontWeight: 700,
    color: C.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: "12px",
  },

  inputRow: {
    display: "flex",
    gap: "8px",
    marginBottom: "10px",
  } as React.CSSProperties,

  input: {
    flex: 1,
    border: `1px solid ${C.border}`,
    borderRadius: "8px",
    padding: "10px 12px",
    fontSize: "15px",
    color: C.text,
    background: C.surface,
    outline: "none",
  } as React.CSSProperties,

  typeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "8px",
    marginBottom: "4px",
  } as React.CSSProperties,

  typeBtn: (active: boolean) =>
    ({
      background: active ? C.green : C.surfaceAlt,
      color: active ? "#fff" : C.text,
      border: `2px solid ${active ? C.green : C.border}`,
      borderRadius: "10px",
      padding: "8px 4px",
      fontSize: "12px",
      fontWeight: 600,
      cursor: "pointer",
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      gap: "2px",
    } as React.CSSProperties),

  denomGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: "8px",
  } as React.CSSProperties,

  denomBtn: (count: number) =>
    ({
      background: count > 0 ? C.green : C.surface,
      color: count > 0 ? "#fff" : C.text,
      border: `2px solid ${count > 0 ? C.green : C.border}`,
      borderRadius: "10px",
      padding: "12px 4px",
      fontSize: "13px",
      fontWeight: 700,
      cursor: "pointer",
      position: "relative" as const,
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      gap: "2px",
      minHeight: "60px",
      justifyContent: "center",
    } as React.CSSProperties),

  denomCount: {
    fontSize: "11px",
    fontWeight: 600,
    opacity: 0.85,
  } as React.CSSProperties,

  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "16px",
    background: C.green,
    borderRadius: "10px",
    padding: "14px 16px",
    color: "#fff",
  } as React.CSSProperties,

  totalLabel: {
    fontSize: "15px",
    fontWeight: 600,
    opacity: 0.85,
  } as React.CSSProperties,

  totalAmount: {
    fontSize: "22px",
    fontWeight: 800,
  } as React.CSSProperties,

  clearBtn: {
    background: "rgba(255,255,255,0.15)",
    border: "1px solid rgba(255,255,255,0.3)",
    borderRadius: "8px",
    color: "#fff",
    padding: "6px 14px",
    fontSize: "13px",
    cursor: "pointer",
  } as React.CSSProperties,

  submitBtn: (disabled: boolean) =>
    ({
      width: "100%",
      background: disabled ? C.border : C.gold,
      color: disabled ? C.textMuted : C.green,
      border: "none",
      borderRadius: "12px",
      padding: "16px",
      fontSize: "17px",
      fontWeight: 800,
      cursor: disabled ? "not-allowed" : "pointer",
      marginTop: "12px",
      letterSpacing: "0.02em",
    } as React.CSSProperties),

  syncBtn: (disabled: boolean, online: boolean) =>
    ({
      width: "100%",
      background: !online ? C.border : disabled ? C.border : C.greenLight,
      color: !online ? C.textMuted : disabled ? C.textMuted : "#fff",
      border: "none",
      borderRadius: "12px",
      padding: "14px",
      fontSize: "15px",
      fontWeight: 700,
      cursor: disabled || !online ? "not-allowed" : "pointer",
      marginTop: "8px",
    } as React.CSSProperties),

  toastBox: (type: "success" | "error" | "info") =>
    ({
      background:
        type === "success" ? "#d4edda" : type === "error" ? "#f8d7da" : "#d1ecf1",
      color:
        type === "success" ? "#155724" : type === "error" ? "#721c24" : "#0c5460",
      borderRadius: "10px",
      padding: "12px 16px",
      margin: "8px 0 0",
      fontSize: "14px",
      fontWeight: 600,
    } as React.CSSProperties),

  historyItem: {
    borderBottom: `1px solid ${C.border}`,
    paddingBottom: "10px",
    marginBottom: "10px",
  } as React.CSSProperties,

  histRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "8px",
  } as React.CSSProperties,

  histAmount: {
    fontWeight: 700,
    fontSize: "15px",
    color: C.text,
  } as React.CSSProperties,

  histMeta: {
    fontSize: "12px",
    color: C.textMuted,
    marginTop: "2px",
  } as React.CSSProperties,

  statusPill: (status: PendingDonation["status"]) =>
    ({
      fontSize: "11px",
      fontWeight: 700,
      padding: "2px 8px",
      borderRadius: "20px",
      background:
        status === "synced"
          ? "#d4edda"
          : status === "failed"
          ? "#f8d7da"
          : status === "syncing"
          ? "#d1ecf1"
          : "#fff3cd",
      color:
        status === "synced"
          ? "#155724"
          : status === "failed"
          ? "#721c24"
          : status === "syncing"
          ? "#0c5460"
          : "#856404",
      whiteSpace: "nowrap" as const,
    } as React.CSSProperties),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNaira(kobo: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(kobo / 100);
}

function formatDenomLabel(naira: number): string {
  if (naira >= 1000) return `₦${naira / 1000}k`;
  return `₦${naira}`;
}

function formatTime(ts: number): string {
  return new Intl.DateTimeFormat("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  }).format(new Date(ts));
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UsherPanel({
  tenantId,
  organizationId,
  apiBase,
  getAuthToken,
  onBack,
}: UsherPanelProps) {
  const [breakdown, setBreakdown] = useState<DenominationBreakdown>({});
  const [donationType, setDonationType] = useState<DonationType>("offering");
  const [serviceRef, setServiceRef] = useState("Sunday Service");
  const [collectedBy, setCollectedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const [history, setHistory] = useState<PendingDonation[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncManager = useRef(
    createDonationSyncManager({ apiBase, tenantId, organizationId, getAuthToken })
  );

  const showToast = useCallback(
    (msg: string, type: "success" | "error" | "info" = "info") => {
      setToast({ msg, type });
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 3500);
    },
    []
  );

  const refreshCounts = useCallback(async () => {
    const [count, all] = await Promise.all([
      countPending(tenantId, organizationId),
      getAllOfflineDonations(tenantId, organizationId),
    ]);
    setPendingCount(count);
    setHistory(all.slice().reverse().slice(0, 20));
  }, [tenantId, organizationId]);

  useEffect(() => {
    refreshCounts();
    syncManager.current.registerBackgroundSync();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [refreshCounts]);

  const totalKobo = totalFromBreakdown(breakdown);
  const hasEntries = totalKobo > 0;

  const tapDenomination = (denom: NairaDenomination) => {
    setBreakdown((prev) => ({
      ...prev,
      [denom]: (prev[denom] ?? 0) + 1,
    }));
  };

  const clearBreakdown = () => setBreakdown({});

  const handleSubmit = async () => {
    if (!hasEntries) return;
    if (!collectedBy.trim()) {
      showToast("Please enter your name as the collector.", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      await logDonationOffline({
        tenantId,
        organizationId,
        donationType,
        breakdown,
        collectedBy: collectedBy.trim(),
        serviceRef: serviceRef.trim() || "Service",
        notes: notes.trim() || undefined,
      });
      clearBreakdown();
      setNotes("");
      await refreshCounts();
      showToast(`${formatNaira(totalKobo)} saved offline — will sync when online.`, "success");
    } catch (err) {
      showToast(String(err), "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSync = async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await syncManager.current.flushPending();
      if (result.synced > 0) await clearSyncedDonations(tenantId);
      await refreshCounts();
      if (result.synced > 0) {
        showToast(`${result.synced} donation(s) synced to server.`, "success");
      } else if (result.failed > 0) {
        showToast(`${result.failed} donation(s) failed to sync. Will retry.`, "error");
      } else {
        showToast("Nothing new to sync.", "info");
      }
    } catch (err) {
      showToast(`Sync error: ${String(err)}`, "error");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div style={s.wrap}>
      {/* Header */}
      <header style={s.header}>
        <button style={s.backBtn} onClick={onBack} aria-label="Back">
          ← Back
        </button>
        <span style={s.headerTitle}>📿 Usher Station</span>
        <span style={s.pendingBadge(pendingCount)} title="Pending donations">
          {pendingCount > 0 ? `${pendingCount} pending` : "all synced"}
        </span>
      </header>

      {/* Online status banner */}
      {!isOnline && (
        <div
          style={{
            background: "#fff3cd",
            color: "#856404",
            padding: "8px 16px",
            fontSize: "13px",
            fontWeight: 600,
            textAlign: "center",
          }}
          role="alert"
        >
          📡 Offline — donations are saved locally and will sync when you reconnect
        </div>
      )}

      {/* Service Info */}
      <section style={s.section}>
        <div style={s.sectionTitle}>Service Info</div>
        <div style={s.inputRow}>
          <input
            style={s.input}
            placeholder="Service (e.g. Sunday Morning)"
            value={serviceRef}
            onChange={(e) => setServiceRef(e.target.value)}
            aria-label="Service reference"
          />
        </div>
        <div style={s.inputRow}>
          <input
            style={s.input}
            placeholder="Your name (Usher)"
            value={collectedBy}
            onChange={(e) => setCollectedBy(e.target.value)}
            aria-label="Usher name"
          />
        </div>
      </section>

      {/* Donation Type */}
      <section style={s.section}>
        <div style={s.sectionTitle}>Donation Type</div>
        <div style={s.typeGrid}>
          {DONATION_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              style={s.typeBtn(donationType === opt.value)}
              onClick={() => setDonationType(opt.value)}
              aria-pressed={donationType === opt.value}
            >
              <span style={{ fontSize: "18px" }}>{opt.emoji}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Denomination Buttons */}
      <section style={s.section}>
        <div style={s.sectionTitle}>Tap Denominations Collected</div>
        <div style={s.denomGrid}>
          {NAIRA_DENOMINATIONS.map((denom) => {
            const count = breakdown[denom] ?? 0;
            return (
              <button
                key={denom}
                style={s.denomBtn(count)}
                onClick={() => tapDenomination(denom as NairaDenomination)}
                aria-label={`Add ${formatDenomLabel(denom)} note`}
              >
                <span>{formatDenomLabel(denom)}</span>
                {count > 0 && <span style={s.denomCount}>× {count}</span>}
              </button>
            );
          })}
        </div>

        {/* Total */}
        <div style={s.totalRow}>
          <div>
            <div style={s.totalLabel}>Total Collected</div>
            {hasEntries && (
              <div style={{ fontSize: "11px", opacity: 0.7, marginTop: "2px" }}>
                {Object.entries(breakdown)
                  .filter(([, c]) => (c ?? 0) > 0)
                  .map(([d, c]) => `₦${Number(d) >= 1000 ? `${Number(d) / 1000}k` : d}×${c}`)
                  .join("  ")}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
            <span style={s.totalAmount}>{formatNaira(totalKobo)}</span>
            {hasEntries && (
              <button style={s.clearBtn} onClick={clearBreakdown} aria-label="Clear all">
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Optional notes */}
        <textarea
          style={{
            ...s.input,
            marginTop: "10px",
            minHeight: "56px",
            resize: "vertical" as const,
          }}
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          aria-label="Optional notes"
        />

        {/* Toast */}
        {toast && <div style={s.toastBox(toast.type)}>{toast.msg}</div>}

        {/* Submit */}
        <button
          style={s.submitBtn(!hasEntries || isSubmitting)}
          onClick={handleSubmit}
          disabled={!hasEntries || isSubmitting}
          aria-label="Save donation offline"
        >
          {isSubmitting ? "Saving…" : `💾 Save Offline — ${formatNaira(totalKobo)}`}
        </button>

        {/* Sync */}
        <button
          style={s.syncBtn(isSyncing, isOnline)}
          onClick={handleSync}
          disabled={isSyncing || !isOnline}
          aria-label="Sync pending donations"
        >
          {isSyncing
            ? "⏳ Syncing…"
            : !isOnline
            ? "📡 Sync unavailable — offline"
            : `☁️ Sync ${pendingCount} pending donation${pendingCount !== 1 ? "s" : ""}`}
        </button>
      </section>

      {/* Session History */}
      {history.length > 0 && (
        <section style={s.section}>
          <div style={s.sectionTitle}>Today's Log (last 20)</div>
          {history.map((d) => {
            const bd = deserializeBreakdown(d.denominationBreakdown);
            const denomSummary = Object.entries(bd)
              .filter(([, c]) => (c ?? 0) > 0)
              .map(([k, c]) => `₦${Number(k) >= 1000 ? `${Number(k) / 1000}k` : k}×${c}`)
              .join(" ");
            return (
              <div key={d.id} style={s.historyItem}>
                <div style={s.histRow}>
                  <div>
                    <div style={s.histAmount}>{formatNaira(d.amountKobo)}</div>
                    <div style={s.histMeta}>
                      {d.donationType} · {d.serviceRef} · {formatTime(d.collectedAt)}
                    </div>
                    {denomSummary && (
                      <div style={{ ...s.histMeta, marginTop: "2px" }}>{denomSummary}</div>
                    )}
                  </div>
                  <span style={s.statusPill(d.status)}>{d.status}</span>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

export default UsherPanel;
