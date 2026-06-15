"use client";

import { useEffect, useState } from "react";
import { Alerts } from "./components/Alerts";
import { AppLayout } from "./components/AppLayout";
import { Dashboard } from "./components/Dashboard";
import { Logs } from "./components/Logs";
import { Login } from "./components/Login";
import { Settings } from "./components/Settings";
import { getSupabaseClient } from "@/utils/supabase/client";
import { useHydrowatchSystem } from "@/hooks/useHydrowatchSystem";
import { getAuthenticatedUserId } from "@/utils/auth-user";

type Screen = "dashboard" | "alerts" | "settings" | "logs";

export default function App() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentScreen, setCurrentScreen] = useState<Screen>("dashboard");
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [showEnvironmentSuccess, setShowEnvironmentSuccess] = useState(false);
  const system = useHydrowatchSystem(accessToken, currentUserId);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let isMounted = true;

    const applySession = (session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]) => {
      if (!isMounted) return;

      if (!session?.access_token) {
        setAccessToken(null);
        setCurrentUserId(null);
        setCurrentScreen("dashboard");
        return;
      }

      setAccessToken(session.access_token);
      setCurrentUserId(getAuthenticatedUserId(session.user, session.access_token));
    };

    const checkExistingSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const expiresAtMs = session?.expires_at ? session.expires_at * 1000 : null;
        if (expiresAtMs && expiresAtMs <= Date.now() + 60_000) {
          const {
            data: { session: refreshedSession },
          } = await supabase.auth.refreshSession();
          applySession(refreshedSession);
        } else {
          applySession(session);
        }
      } catch (error) {
        console.error("Error checking session:", error);
        applySession(null);
      } finally {
        if (isMounted) setIsCheckingSession(false);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
      setIsCheckingSession(false);
    });

    checkExistingSession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogin = (token: string, userId?: string | null) => {
    setAccessToken(token);
    setCurrentUserId(userId ?? null);
    setCurrentScreen("dashboard");
  };

  const handleLogout = async () => {
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
      setAccessToken(null);
      setCurrentUserId(null);
      setCurrentScreen("dashboard");
      localStorage.removeItem("rememberMe");
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  const handleNavigate = (screen: Screen) => {
    setCurrentScreen(screen);
  };

  const handleSaveEnvironment = async (settings: Parameters<typeof system.saveEnvironment>[0]) => {
    const saved = await system.saveEnvironment(settings);
    setShowEnvironmentSuccess(true);
    setCurrentScreen("dashboard");
    return saved;
  };

  useEffect(() => {
    if (!showEnvironmentSuccess) return;

    const timer = window.setTimeout(() => {
      setShowEnvironmentSuccess(false);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [showEnvironmentSuccess]);

  if (isCheckingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#EEF1EC]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[#9FBDD3] border-t-[#F57578]" />
          <p className="font-semibold text-[#1D3B70]">Loading...</p>
        </div>
      </div>
    );
  }

  if (!accessToken) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <AppLayout activeScreen={currentScreen} onLogout={handleLogout} onNavigate={handleNavigate}>
      {showEnvironmentSuccess && (
        <div className="fixed right-4 top-4 z-50 w-[min(calc(100vw-2rem),24rem)] rounded-xl border border-emerald-300/40 bg-emerald-500 px-4 py-3 text-white shadow-2xl shadow-emerald-950/30">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-extrabold" aria-hidden="true">
              ✓
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-extrabold">✅ Configuration Saved Successfully!</p>
              <p className="mt-1 text-sm text-emerald-50">Environment settings have been saved and are ready for monitoring.</p>
            </div>
            <button
              className="rounded-lg px-2 py-1 text-lg leading-none text-white/80 transition hover:bg-white/15 hover:text-white"
              type="button"
              aria-label="Close success notification"
              onClick={() => setShowEnvironmentSuccess(false)}
            >
              ×
            </button>
          </div>
        </div>
      )}
      {currentScreen === "dashboard" && (
        <Dashboard
          accessToken={accessToken}
          onAcknowledgeAlert={system.acknowledgeAlert}
          environmentSettings={system.environmentSettings}
          alerts={system.alerts}
          healthScore={system.healthScore}
          isLoadingMonitoring={system.isLoadingMonitoring}
          isLoadingReadings={system.isLoadingReadings}
          isLive={system.isLive}
          monitoringError={system.monitoringError}
          monitoringSession={system.monitoringSession}
          onConfigureEnvironment={() => setCurrentScreen("settings")}
          onStartMonitoring={system.startMonitoring}
          onStopMonitoring={system.stopMonitoring}
          readingsError={system.readingsError}
          readings={system.readings}
          uptimeHours={system.uptimeHours}
          waterQualityScore={system.waterQualityScore}
        />
      )}
      {currentScreen === "alerts" && (
        <Alerts alerts={system.alerts} onAcknowledgeAlert={system.acknowledgeAlert} />
      )}
      {currentScreen === "settings" && (
        <Settings
          accessToken={accessToken}
          environmentSettings={system.environmentSettings}
          onSaveEnvironment={handleSaveEnvironment}
          onSave={system.setSettings}
          settings={system.settings}
        />
      )}
      {currentScreen === "logs" && (
        <Logs
          accessToken={accessToken}
          logs={system.logs}
          readings={system.readings}
        />
      )}
    </AppLayout>
  );
}
