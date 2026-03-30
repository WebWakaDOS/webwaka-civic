/**
 * WebWaka Civic — Offline / Sync Status Banner
 * Listens to the SW mutation-queue postMessages defined in public/sw.js
 * and surfaces a dismissable banner to the user.
 */

import React, { useEffect, useState } from "react";

type SyncState = "online" | "offline" | "syncing" | "synced";

interface BannerState {
  sync: SyncState;
  queued: number;
  replayed: number;
}

export function OfflineSyncBanner() {
  const [state, setState] = useState<BannerState>({
    sync: navigator.onLine ? "online" : "offline",
    queued: 0,
    replayed: 0,
  });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Ask SW for current queue count on mount
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "GET_QUEUE_COUNT" });
    }

    const handleSWMessage = (event: MessageEvent) => {
      const { data } = event;
      if (!data?.type) return;

      switch (data.type) {
        case "QUEUE_COUNT":
          setState((s) => ({
            ...s,
            queued: data.count ?? 0,
            sync: data.count > 0 ? "offline" : s.sync,
          }));
          setDismissed(false);
          break;

        case "MUTATION_QUEUED":
          setState((s) => ({ ...s, sync: "offline", queued: s.queued + 1 }));
          setDismissed(false);
          break;

        case "SYNC_COMPLETE":
          setState({
            sync: data.remaining > 0 ? "offline" : "synced",
            queued: data.remaining ?? 0,
            replayed: data.replayed ?? 0,
          });
          setDismissed(false);
          // Auto-dismiss "synced" banner after 4 s
          if ((data.remaining ?? 0) === 0) {
            setTimeout(() => setDismissed(true), 4000);
          }
          break;
      }
    };

    const handleOnline = () => {
      setState((s) => ({ ...s, sync: s.queued > 0 ? "syncing" : "online" }));
      setDismissed(false);
    };
    const handleOffline = () => {
      setState((s) => ({ ...s, sync: "offline" }));
      setDismissed(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    navigator.serviceWorker?.addEventListener("message", handleSWMessage);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      navigator.serviceWorker?.removeEventListener("message", handleSWMessage);
    };
  }, []);

  // Nothing to show when online and queue is empty
  if ((state.sync === "online" || dismissed) && state.queued === 0) return null;

  const cfg: Record<SyncState, { bg: string; icon: string; text: string }> = {
    online:  { bg: "bg-green-600",  icon: "✓", text: "Connected" },
    offline: { bg: "bg-amber-600",  icon: "⚡", text: `Offline — ${state.queued} action${state.queued !== 1 ? "s" : ""} queued` },
    syncing: { bg: "bg-blue-600",   icon: "↻", text: `Syncing ${state.queued} item${state.queued !== 1 ? "s" : ""}…` },
    synced:  { bg: "bg-green-600",  icon: "✓", text: `Synced — ${state.replayed} action${state.replayed !== 1 ? "s" : ""} uploaded` },
  };

  const { bg, icon, text } = cfg[state.sync];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-2 px-4 py-2 text-sm font-medium text-white ${bg} safe-bottom`}
    >
      <span className="flex items-center gap-2">
        <span
          className={state.sync === "syncing" ? "inline-block animate-spin" : ""}
          aria-hidden="true"
        >
          {icon}
        </span>
        {text}
      </span>
      {state.sync !== "syncing" && (
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="ml-auto p-1 text-white/70 hover:text-white"
        >
          ✕
        </button>
      )}
    </div>
  );
}
