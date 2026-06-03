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
  const system = useHydrowatchSystem(accessToken, currentUserId);

  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        const supabase = getSupabaseClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        console.info("[HydroWatch Auth] Existing Supabase session", {
          hasSession: Boolean(session),
          expiresAt: session?.expires_at ?? null,
          user: session?.user
            ? {
                id: getSessionUserField(session.user, "id"),
                email: getSessionUserField(session.user, "email"),
              }
            : null,
        });

        if (session?.access_token) {
          const authenticatedUserId = getAuthenticatedUserId(session.user, session.access_token);
          console.info("[HydroWatch Auth] Current authenticated user", {
            userId: authenticatedUserId,
            sessionUserId: getSessionUserField(session.user, "id"),
            email: getSessionUserField(session.user, "email"),
          });
          setAccessToken(session.access_token);
          setCurrentUserId(authenticatedUserId);
        }
      } catch (error) {
        console.error("Error checking session:", error);
      } finally {
        setIsCheckingSession(false);
      }
    };

    checkExistingSession();
  }, []);

  const handleLogin = (token: string, userId?: string | null) => {
    console.info("[HydroWatch Auth] Login completed", {
      currentAuthenticatedUser: userId ?? null,
      hasAccessToken: Boolean(token),
    });
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
      {currentScreen === "dashboard" && (
        <Dashboard
          accessToken={accessToken}
          onAcknowledgeAlert={system.acknowledgeAlert}
          alerts={system.alerts}
          healthScore={system.healthScore}
          isLoadingReadings={system.isLoadingReadings}
          isLive={system.isLive}
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

function getSessionUserField(user: unknown, field: "id" | "email") {
  if (typeof user !== "object" || user === null || !(field in user)) return null;
  const value = (user as Record<"id" | "email", unknown>)[field];
  return typeof value === "string" ? value : null;
}
