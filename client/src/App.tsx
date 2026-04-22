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
import NotFound from "./pages/not-found";
import { SignalGateProvider } from "./context/SignalGate";

export type Theme = "dark" | "light";

function App() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");

  return (
    <QueryClientProvider client={queryClient}>
      <SignalGateProvider>
      <Router hook={useHashLocation}>
        <Switch>
          <Route path="/" component={() => <LandingPage theme={theme} toggleTheme={toggleTheme} />} />
          <Route path="/dashboard" component={() => <Dashboard theme={theme} toggleTheme={toggleTheme} />} />
          <Route path="/admin" component={() => <AdminReview theme={theme} toggleTheme={toggleTheme} />} />
          <Route path="/leaderboard" component={() => <SourceLeaderboard theme={theme} toggleTheme={toggleTheme} />} />
          <Route path="/draft" component={() => <DraftBoard theme={theme} toggleTheme={toggleTheme} />} />
          <Route path="/alerts" component={() => <AlertsPage theme={theme} toggleTheme={toggleTheme} />} />
          <Route path="/logs" component={() => <AgentLogs theme={theme} toggleTheme={toggleTheme} />} />
          <Route path="/signals" component={SignalsPage} />
          <Route path="/pro" component={ProPage} />
          <Route path="/success" component={SuccessPage} />
          <Route path="/signal-admin" component={SignalAdmin} />
          <Route component={NotFound} />
        </Switch>
      </Router>
      </SignalGateProvider>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
