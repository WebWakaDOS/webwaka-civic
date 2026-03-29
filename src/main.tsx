/**
 * WebWaka Civic — React Entry Point
 * Blueprint Reference: Part 9.5 (PWA First), Part 9.6 (Offline First)
 */

import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ChurchNGOApp } from "./modules/church-ngo/ui";
import { ElectionsDashboard } from "./components/elections/ElectionsDashboard";
import { VolunteerBoard } from "./components/volunteers/VolunteerBoard";
import { FundraisingDashboard } from "./components/fundraising/FundraisingDashboard";
import "./index.css";

type Module = "church-ngo" | "elections" | "volunteers" | "fundraising";

const MOCK_ELECTIONS = [
  {
    id: "1",
    name: "Ward Chairman Election 2026",
    status: "voting" as const,
    startDate: Date.now() - 86400000,
    endDate: Date.now() + 86400000,
    candidateCount: 5,
    voterCount: 312,
  },
  {
    id: "2",
    name: "Local Government Primaries",
    status: "nomination" as const,
    startDate: Date.now() + 86400000,
    endDate: Date.now() + 7 * 86400000,
    candidateCount: 12,
    voterCount: 0,
  },
];

const MOCK_TASKS = [
  { id: "t1", title: "Canvass Alimosho Ward", description: "Door-to-door voter engagement", points: 50, status: "available" as const, category: "canvassing" },
  { id: "t2", title: "Phone Banking", description: "Call 50 registered voters", points: 30, status: "assigned" as const, category: "phonebanking" },
  { id: "t3", title: "Rally Setup", description: "Set up venue for Friday rally", points: 80, status: "completed" as const, category: "event_organizing" },
];

const MOCK_LEADERBOARD = [
  { id: "v1", name: "Chioma Okafor", points: 850, rank: 1, badge: "champion", tasksCompleted: 17, streak: 5 },
  { id: "v2", name: "Musa Ibrahim", points: 620, rank: 2, badge: "volunteer-star", tasksCompleted: 12 },
  { id: "v3", name: "Adebayo Ojo", points: 410, rank: 3, badge: "rising-star", tasksCompleted: 8, streak: 3 },
];

const MOCK_BUDGET = {
  totalBudget: 5000000000,
  raisedFunds: 2500000000,
  spentBudget: 1200000000,
  remainingBudget: 3800000000,
  spendPercentage: 24,
  fundraisingPercentage: 50,
};

const MOCK_DONATIONS = [
  { id: "d1", donorName: "Akin Olusola", amount: 50000000, status: "completed" as const, createdAt: Date.now() - 3600000 },
  { id: "d2", donorName: "Ngozi Adeyemi", amount: 25000000, status: "completed" as const, createdAt: Date.now() - 7200000 },
  { id: "d3", donorName: "Emeka Nwosu", amount: 10000000, status: "pending" as const, createdAt: Date.now() - 1800000 },
];

const MOCK_EXPENSES = [
  { id: "e1", category: "Advertising", description: "Billboard rentals — Lagos", amount: 120000000, status: "approved" as const, createdAt: Date.now() - 86400000 },
  { id: "e2", category: "Logistics", description: "Rally transport — Abuja", amount: 45000000, status: "paid" as const, createdAt: Date.now() - 172800000 },
  { id: "e3", category: "Printing", description: "Manifesto booklets", amount: 20000000, status: "pending" as const, createdAt: Date.now() - 43200000 },
];

const navItems: { id: Module; label: string; icon: string }[] = [
  { id: "church-ngo", label: "Church/NGO", icon: "⛪" },
  { id: "elections", label: "Elections", icon: "🗳️" },
  { id: "volunteers", label: "Volunteers", icon: "🤝" },
  { id: "fundraising", label: "Fundraising", icon: "💰" },
];

function AppShell() {
  const [activeModule, setActiveModule] = useState<Module>("church-ngo");

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", minHeight: "100vh", backgroundColor: "#F8FAF9" }}>
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        backgroundColor: "#1B4332", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", height: "56px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}>
        <span style={{ fontWeight: 700, fontSize: "18px", letterSpacing: "-0.3px" }}>
          WebWaka Civic
        </span>
        <span style={{ fontSize: "12px", opacity: 0.7 }}>OS v4</span>
      </nav>

      <div style={{ overflowX: "auto", backgroundColor: "#fff", borderBottom: "1px solid #E2E8E4", display: "flex" }}>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveModule(item.id)}
            style={{
              flex: "0 0 auto",
              padding: "10px 20px",
              border: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: activeModule === item.id ? 700 : 400,
              color: activeModule === item.id ? "#1B4332" : "#6B7C72",
              backgroundColor: "transparent",
              borderBottom: activeModule === item.id ? "2px solid #1B4332" : "2px solid transparent",
              whiteSpace: "nowrap",
              transition: "all 0.15s",
              display: "flex", alignItems: "center", gap: "6px",
            }}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <main>
        {activeModule === "church-ngo" && <ChurchNGOApp />}
        {activeModule === "elections" && (
          <ElectionsDashboard
            elections={MOCK_ELECTIONS}
            onSelectElection={(id) => alert(`Election ${id} selected`)}
            isLoading={false}
            isOffline={!navigator.onLine}
          />
        )}
        {activeModule === "volunteers" && (
          <VolunteerBoard
            volunteerId="v2"
            tasks={MOCK_TASKS}
            leaderboard={MOCK_LEADERBOARD}
            onTaskComplete={async (taskId) => {
              await new Promise((r) => setTimeout(r, 500));
            }}
            isOffline={!navigator.onLine}
          />
        )}
        {activeModule === "fundraising" && (
          <FundraisingDashboard
            campaignId="campaign-2026"
            budget={MOCK_BUDGET}
            donations={MOCK_DONATIONS}
            expenses={MOCK_EXPENSES}
            onDonate={() => alert("Paystack integration — amounts in integer kobo")}
            onSubmitExpense={() => alert("Submit expense form")}
            isOffline={!navigator.onLine}
          />
        )}
      </main>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>
);
