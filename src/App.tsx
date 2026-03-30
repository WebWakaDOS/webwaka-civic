/**
 * WebWaka Civic & Political Suite — Unified App Shell
 * Blueprint Reference: Part 9.5 (PWA First), Part 9.1 (Nigeria-First), Part 9.2 (Multi-Tenant)
 *
 * Entry point that routes users to their module:
 *  CIV-1 — Church & NGO
 *  CIV-2 — Political Party
 *  CIV-3 — Elections & Campaigns
 *
 * Tenant ID + JWT are entered at login and persisted to sessionStorage for the session.
 */

import React, { useState, useEffect, useCallback } from "react";
import { ChurchNGOApp } from "./modules/church-ngo/ui";
import PartyApp from "./modules/political-party/ui";
import { ElectionsApp } from "./modules/elections/ui";
import { OfflineSyncBanner } from "./components/shared/OfflineSyncBanner";

type Module = "civ1" | "civ2" | "civ3";
type AppView = "select" | "login" | "app";

const LANG_KEY = "webwaka_lang";
const MODULE_KEY = "webwaka_active_module";

const SUPPORTED_LANGS = [
  { code: "en", label: "English" },
  { code: "yo", label: "Yorùbá" },
  { code: "ig", label: "Igbo" },
  { code: "ha", label: "Hausa" },
];

const MODULE_INFO: Record<Module, { title: string; subtitle: string; icon: string; color: string; tokenKey: string }> = {
  civ1: {
    title: "Church & NGO",
    subtitle: "Member management, donations, events & grants",
    icon: "⛪",
    color: "#1E7A4A",
    tokenKey: "webwaka_token",
  },
  civ2: {
    title: "Political Party",
    subtitle: "Members, nominations, campaign finance & INEC compliance",
    icon: "🏛️",
    color: "#1A3A5C",
    tokenKey: "webwaka_party_token",
  },
  civ3: {
    title: "Elections & Campaigns",
    subtitle: "Elections, voting, volunteers, fundraising & public results",
    icon: "🗳️",
    color: "#6B21A8",
    tokenKey: "webwaka_election_token",
  },
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  shell: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    minHeight: "100vh",
    backgroundColor: "#F0F4F8",
    color: "#1A2433",
  } as React.CSSProperties,
  header: {
    backgroundColor: "#0F172A",
    color: "#FFFFFF",
    padding: "0 16px",
    height: "52px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    position: "sticky" as const,
    top: 0,
    zIndex: 100,
  } as React.CSSProperties,
  logo: { fontSize: "15px", fontWeight: 700, letterSpacing: "-0.3px" } as React.CSSProperties,
  selectGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "16px",
    padding: "24px 16px",
    maxWidth: "480px",
    margin: "0 auto",
  } as React.CSSProperties,
  card: (color: string): React.CSSProperties => ({
    backgroundColor: "#FFFFFF",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04)",
    display: "flex",
    alignItems: "center",
    gap: "16px",
    cursor: "pointer",
    border: `2px solid transparent`,
    transition: "all 0.15s ease",
    borderLeft: `4px solid ${color}`,
  }),
  cardIcon: (color: string): React.CSSProperties => ({
    fontSize: "32px",
    width: "56px",
    height: "56px",
    borderRadius: "12px",
    backgroundColor: `${color}15`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  }),
  cardTitle: { fontSize: "16px", fontWeight: 700, marginBottom: "4px" } as React.CSSProperties,
  cardSub: { fontSize: "13px", color: "#6B7A8D", lineHeight: 1.4 } as React.CSSProperties,
  loginBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: "16px",
    padding: "28px 24px",
    margin: "24px 16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    maxWidth: "480px",
    marginLeft: "auto",
    marginRight: "auto",
  } as React.CSSProperties,
  label: { display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px", color: "#374151" } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #D1D5DB",
    borderRadius: "8px",
    fontSize: "14px",
    marginBottom: "16px",
    boxSizing: "border-box" as const,
    backgroundColor: "#FAFAFA",
  } as React.CSSProperties,
  btnPrimary: (color: string): React.CSSProperties => ({
    width: "100%",
    padding: "12px",
    backgroundColor: color,
    color: "#FFFFFF",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
    marginTop: "4px",
  }),
  btnBack: {
    background: "none",
    border: "none",
    color: "#6B7A8D",
    cursor: "pointer",
    fontSize: "13px",
    padding: "8px 0",
    display: "flex",
    alignItems: "center",
    gap: "4px",
    marginBottom: "16px",
  } as React.CSSProperties,
  pageTitle: { fontSize: "20px", fontWeight: 700, marginBottom: "6px" } as React.CSSProperties,
  pageSub: { fontSize: "13px", color: "#6B7A8D", marginBottom: "24px" } as React.CSSProperties,
};

// ─── Module Selector ──────────────────────────────────────────────────────────

function ModuleSelector({ onSelect, lang, onLangChange }: {
  onSelect: (m: Module) => void;
  lang: string;
  onLangChange: (l: string) => void;
}) {
  return (
    <div>
      <div style={{ ...S.selectGrid, paddingBottom: "8px" }}>
        <div>
          <h1 style={S.pageTitle}>WebWaka Civic</h1>
          <p style={S.pageSub}>Select your module to continue</p>
        </div>
        {(Object.entries(MODULE_INFO) as [Module, typeof MODULE_INFO.civ1][]).map(([key, info]) => (
          <button
            key={key}
            style={S.card(info.color)}
            onClick={() => onSelect(key)}
          >
            <div style={S.cardIcon(info.color)}>
              <span>{info.icon}</span>
            </div>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={S.cardTitle}>{info.title}</div>
              <div style={S.cardSub}>{info.subtitle}</div>
            </div>
            <span style={{ color: "#9CA3AF", fontSize: "18px" }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Login Gate ───────────────────────────────────────────────────────────────

function LoginGate({ module, onSuccess, onBack }: {
  module: Module;
  onSuccess: () => void;
  onBack: () => void;
}) {
  const info = MODULE_INFO[module];
  const [tenantId, setTenantId] = useState(sessionStorage.getItem(`webwaka_tenant_${module}`) ?? "");
  const [token, setToken] = useState(sessionStorage.getItem(info.tokenKey) ?? "");
  const [error, setError] = useState("");

  const handleLogin = useCallback(() => {
    if (!tenantId.trim()) { setError("Tenant ID is required"); return; }
    if (!token.trim())    { setError("Access token is required"); return; }
    sessionStorage.setItem(`webwaka_tenant_${module}`, tenantId.trim());
    sessionStorage.setItem(info.tokenKey, token.trim());
    setError("");
    onSuccess();
  }, [tenantId, token, module, info.tokenKey, onSuccess]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div style={S.loginBox}>
      <button style={S.btnBack} onClick={onBack}>
        ← Back
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
        <div style={S.cardIcon(info.color)}>
          <span style={{ fontSize: "24px" }}>{info.icon}</span>
        </div>
        <div>
          <div style={S.pageTitle}>{info.title}</div>
          <div style={{ fontSize: "13px", color: "#6B7A8D" }}>Enter your credentials to continue</div>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: "#FEE2E2", color: "#991B1B", padding: "10px 12px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>
          {error}
        </div>
      )}

      <label style={S.label} htmlFor={`tenant-${module}`}>Tenant / Organisation ID</label>
      <input
        id={`tenant-${module}`}
        style={S.input}
        placeholder="e.g. org-abc123"
        value={tenantId}
        onChange={(e) => setTenantId(e.target.value)}
        onKeyDown={handleKeyDown}
        autoComplete="username"
      />

      <label style={S.label} htmlFor={`token-${module}`}>Access Token (JWT)</label>
      <input
        id={`token-${module}`}
        style={S.input}
        type="password"
        placeholder="Paste your JWT here"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        onKeyDown={handleKeyDown}
        autoComplete="current-password"
      />

      <button style={S.btnPrimary(info.color)} onClick={handleLogin}>
        Enter {info.title}
      </button>
    </div>
  );
}

// ─── App Shell ────────────────────────────────────────────────────────────────

export default function App() {
  const [lang, setLang] = useState<string>(localStorage.getItem(LANG_KEY) ?? "en");
  const [activeModule, setActiveModule] = useState<Module | null>(() => {
    return (sessionStorage.getItem(MODULE_KEY) as Module | null);
  });
  const [view, setView] = useState<AppView>(() => {
    const saved = sessionStorage.getItem(MODULE_KEY) as Module | null;
    if (!saved) return "select";
    const info = MODULE_INFO[saved];
    return sessionStorage.getItem(info.tokenKey) ? "app" : "select";
  });

  const handleLangChange = useCallback((l: string) => {
    setLang(l);
    localStorage.setItem(LANG_KEY, l);
  }, []);

  const handleModuleSelect = useCallback((m: Module) => {
    setActiveModule(m);
    sessionStorage.setItem(MODULE_KEY, m);
    // If token already cached, go straight to app
    const info = MODULE_INFO[m];
    setView(sessionStorage.getItem(info.tokenKey) ? "app" : "login");
  }, []);

  const handleLoginSuccess = useCallback(() => setView("app"), []);

  const handleBack = useCallback(() => {
    setView("select");
    setActiveModule(null);
    sessionStorage.removeItem(MODULE_KEY);
  }, []);

  const handleLogout = useCallback(() => {
    if (activeModule) {
      sessionStorage.removeItem(MODULE_INFO[activeModule].tokenKey);
      sessionStorage.removeItem(`webwaka_tenant_${activeModule}`);
    }
    sessionStorage.removeItem(MODULE_KEY);
    setView("select");
    setActiveModule(null);
  }, [activeModule]);

  // Render active module app
  if (view === "app" && activeModule) {
    return (
      <>
        {activeModule === "civ1" && <ChurchNGOApp />}
        {activeModule === "civ2" && <PartyApp />}
        {activeModule === "civ3" && (
          <ElectionsApp
            tenantId={sessionStorage.getItem(`webwaka_tenant_civ3`) ?? ""}
            onLogout={handleLogout}
          />
        )}
        <OfflineSyncBanner />
      </>
    );
  }

  return (
    <div style={S.shell}>
      {/* Header */}
      <header style={S.header}>
        <span style={S.logo}>🇳🇬 WebWaka Civic</span>
        <select
          value={lang}
          onChange={(e) => handleLangChange(e.target.value)}
          style={{
            backgroundColor: "transparent",
            color: "#FFFFFF",
            border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: "6px",
            padding: "4px 8px",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          {SUPPORTED_LANGS.map((l) => (
            <option key={l.code} value={l.code} style={{ color: "#1A2433", backgroundColor: "#FFFFFF" }}>
              {l.label}
            </option>
          ))}
        </select>
      </header>

      {view === "select" && (
        <ModuleSelector onSelect={handleModuleSelect} lang={lang} onLangChange={handleLangChange} />
      )}

      {view === "login" && activeModule && (
        <LoginGate module={activeModule} onSuccess={handleLoginSuccess} onBack={handleBack} />
      )}

      <OfflineSyncBanner />
    </div>
  );
}
