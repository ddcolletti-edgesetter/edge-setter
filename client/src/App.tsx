import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useState, useEffect } from "react";

import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import AdminReview from "./pages/AdminReview";
import SourceLeaderboard from "./pages/SourceLeaderboard";
import DraftBoard from "./pages/DraftBoard";
import AlertsPage from "./pages/AlertsPage";
import AgentLogs from "./pages/AgentLogs";
import SignalsPage from "./pages/SignalsPage";
import ProPage from "./pages/ProPage";
import SuccessPage from "./pages/SuccessPage";
import SignalAdmin from "./pages/SignalAdmin";
import SignalOpsQueue from "./pages/SignalOpsQueue";
import SiteWatchLogs from "./pages/SiteWatchLogs";
import DistributionDrafts from "./pages/DistributionDrafts";
import DailyOps from "./pages/DailyOps";
import V2Home from "./pages/V2Home";
import FlagshipHome from "./pages/FlagshipHome";
import NBABoard from "./pages/NBABoard";
import MLBBoard from "./pages/MLBBoard";
import NFLBoard from "./pages/NFLBoard";
import CFBBoard from "./pages/CFBBoard";
import ToolsHub from "./pages/ToolsHub";
import MyEdge from "./pages/MyEdge";
import V2Sources from "./pages/V2Sources";
import AlertSettingsPage from "./pages/AlertSettingsPage";
import OpsBoard from "./pages/OpsBoard";
import NotFound from "./pages/not-found";
import { SignalGateProvider } from "./context/SignalGate";
import { AuthProvider } from "./context/AuthContext";
import { AdminGate } from "./components/AdminGate";
import { ProModal } from "./components/ProGate";

export type Theme = "dark" | "light";

function App() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
      <SignalGateProvider>
      <ProModal />
      <Router hook={useHashLocation}>
        <Switch>
          <Route path="/" component={NBABoard} />
          <Route path="/dashboard" component={() => <Dashboard theme={theme} toggleTheme={toggleTheme} />} />
          <Route path="/admin" component={() => <AdminGate><AdminReview theme={theme} toggleTheme={toggleTheme} /></AdminGate>} />
          <Route path="/leaderboard" component={SourceLeaderboard} />
          <Route path="/draft" component={() => <DraftBoard theme={theme} toggleTheme={toggleTheme} />} />
          <Route path="/alerts" component={() => <AdminGate><AlertsPage theme={theme} toggleTheme={toggleTheme} /></AdminGate>} />
          <Route path="/logs" component={() => <AdminGate><AgentLogs theme={theme} toggleTheme={toggleTheme} /></AdminGate>} />
          <Route path="/signals" component={SignalsPage} />
          <Route path="/pro" component={ProPage} />
          <Route path="/success" component={SuccessPage} />
          <Route path="/signal-admin" component={SignalAdmin} />
          <Route path="/signal-ops-queue" component={() => <AdminGate><SignalOpsQueue theme={theme} toggleTheme={toggleTheme} /></AdminGate>} />
          <Route path="/site-watch-logs" component={() => <AdminGate><SiteWatchLogs theme={theme} toggleTheme={toggleTheme} /></AdminGate>} />
          <Route path="/distribution-drafts" component={() => <AdminGate><DistributionDrafts theme={theme} toggleTheme={toggleTheme} /></AdminGate>} />
          <Route path="/daily-ops" component={() => <AdminGate><DailyOps theme={theme} toggleTheme={toggleTheme} /></AdminGate>} />
          {/* ── v2 multi-sport shell ── */}
          <Route path="/v2" component={V2Home} />
          <Route path="/v2/nba" component={NBABoard} />
          <Route path="/v2/mlb" component={MLBBoard} />
          <Route path="/v2/nfl" component={NFLBoard} />
          <Route path="/v2/cfb" component={CFBBoard} />
          <Route path="/v2/tools" component={ToolsHub} />
          <Route path="/v2/my-edge" component={MyEdge} />
          <Route path="/v2/sources" component={V2Sources} />
          <Route path="/v2/alerts" component={AlertSettingsPage} />
          <Route path="/admin/ops" component={() => <AdminGate><OpsBoard /></AdminGate>} />
          <Route component={NotFound} />
        </Switch>
      </Router>
      </SignalGateProvider>
      </AuthProvider>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
