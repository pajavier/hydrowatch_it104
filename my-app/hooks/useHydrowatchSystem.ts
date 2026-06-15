import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { evaluateAlerts } from "@/services/alert-engine";
import {
  fetchActiveMonitoringSession,
  fetchEnvironmentSettings,
  fetchSystemLogs,
  fetchWaterReadings,
  insertAlerts,
  insertLogs,
  insertPrediction,
  saveEnvironmentSettings,
  startMonitoringSession,
  stopMonitoringSession,
  subscribeToWaterReadings,
  waterReadingFromRealtimePayload,
} from "@/services/supabase-repository";
import { EngineSettings, EnvironmentSettings, MonitoringSession, SystemAlert, SystemLog, WaterReading } from "@/types/hydrowatch";
import { classifyTurbidity, predictTurbidity } from "@/utils/hydrowatch-analytics";
import { createUtcTimestamp, getUtcTimestampMs } from "@/utils/time-format";

const defaultSettings: EngineSettings = {
  thresholds: { clearMax: 5, cloudyMax: 50, criticalMin: 51 },
  alertSensitivity: 1,
  refreshIntervalMs: 2500,
  predictionAggressiveness: 1,
};

type SupabaseErrorLike = {
  code?: unknown;
  message?: unknown;
};

export function useHydrowatchSystem(accessToken: string | null, userId: string | null) {
  const [settings, setSettings] = useState<EngineSettings>(defaultSettings);
  const [readings, setReadings] = useState<WaterReading[]>([]);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isRealtimeEnabled, setIsLive] = useState(true);
  const [isDatasetReady, setIsDatasetReady] = useState(false);
  const [isLoadingReadings, setIsLoadingReadings] = useState(true);
  const [environmentSettings, setEnvironmentSettings] = useState<EnvironmentSettings | null>(null);
  const [monitoringSession, setMonitoringSession] = useState<MonitoringSession | null>(null);
  const [isLoadingMonitoring, setIsLoadingMonitoring] = useState(true);
  const [monitoringError, setMonitoringError] = useState<string | null>(null);
  const [readingsError, setReadingsError] = useState<string | null>(null);
  const [liveClock, setLiveClock] = useState(() => Date.now());
  const readingsRef = useRef<WaterReading[]>([]);
  const seenReadingIdsRef = useRef<Set<WaterReading["id"]>>(new Set());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLiveClock(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    readingsRef.current = readings;
  }, [readings]);

  const enrichReading = useCallback(
    (reading: WaterReading, history: WaterReading[]) => {
      console.info("[HydroWatch Hook] Enriching reading", {
        id: reading.id,
        turbidity: reading.turbidity,
        createdAt: reading.createdAt,
        historyCount: history.length,
      });

      const prediction = predictTurbidity(
        [...history, reading],
        settings.thresholds.criticalMin,
        settings.predictionAggressiveness,
      );
      return {
        ...reading,
        status: classifyTurbidity(reading.turbidity),
        prediction: prediction.label,
        predictionConfidence: prediction.confidence,
        projectedNTU: prediction.projectedNTU,
        predictionSlope: prediction.slope,
        predictedCriticalAt: prediction.predictedCriticalAt,
        minutesToCritical: prediction.minutesToCritical,
      };
    },
    [settings],
  );

  const recordReading = useCallback(
    async (reading: WaterReading, persistDerivedData: boolean) => {
      console.info("[HydroWatch Hook] recordReading called", {
        id: reading.id,
        turbidity: reading.turbidity,
        createdAt: reading.createdAt,
        persistDerivedData,
        alreadySeen: seenReadingIdsRef.current.has(reading.id),
        currentCount: readingsRef.current.length,
        userId,
      });

      if (!accessToken || !userId) {
        console.warn("[HydroWatch Hook] Ignoring reading without an authenticated user");
        return;
      }

      if (seenReadingIdsRef.current.has(reading.id)) {
        console.warn("[HydroWatch Hook] Duplicate reading ignored", {
          id: reading.id,
        });
        return;
      }

      const currentReadings = readingsRef.current;
      const enriched = enrichReading(reading, currentReadings);
      const prediction = predictTurbidity(
        [...currentReadings, enriched],
        settings.thresholds.criticalMin,
        settings.predictionAggressiveness,
      );
      const generatedAlerts = evaluateAlerts(enriched, currentReadings, settings);
      const logBatch: SystemLog[] = [
        {
          id: crypto.randomUUID(),
          severity: "Informational",
          message: `ESP32 reading received: ${enriched.turbidity} NTU`,
          timestamp: enriched.createdAt,
          category: "reading",
        },
        {
          id: crypto.randomUUID(),
          severity:
            prediction.label === "Critical Condition Expected" ? "Warning" : "Informational",
          message: formatPredictionMessage(prediction),
          timestamp: enriched.createdAt,
          category: "prediction",
        },
        ...generatedAlerts.map((alert) => ({
          id: crypto.randomUUID(),
          severity: alert.severity,
          message: `${alert.title}: ${alert.message} Recommendation: ${alert.action}`,
          timestamp: alert.timestamp,
          category: "alert" as const,
        })),
      ];

      seenReadingIdsRef.current.add(enriched.id);
      readingsRef.current = [...currentReadings.slice(-149), enriched];
      setReadings(readingsRef.current);

      console.info("[HydroWatch Hook] Reading stored in state", {
        newCount: readingsRef.current.length,
        latest: readingsRef.current.at(-1),
      });

      setAlerts((prev) => [...generatedAlerts, ...prev].slice(0, 40));
      setLogs((prev) => [...logBatch, ...prev].slice(0, 300));

      if (!persistDerivedData) return;

      await Promise.allSettled([
          insertPrediction({
            accessToken,
            readingId: enriched.id,
            label: prediction.label,
            confidence: prediction.confidence,
            projectedNTU: prediction.projectedNTU,
            userId,
          }),
          insertAlerts(generatedAlerts, { accessToken, userId }),
          insertLogs(logBatch, { accessToken, userId }),
        ]);
    },
    [accessToken, enrichReading, settings, userId],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadInitialReadings() {
      console.info("[HydroWatch Hook] loadInitialReadings started");
      if (!accessToken || !userId) {
        console.warn("[HydroWatch Hook] No authenticated user for readings query", {
          hasAccessToken: Boolean(accessToken),
          userId,
        });
        seenReadingIdsRef.current = new Set();
        readingsRef.current = [];
        setReadings([]);
        setAlerts([]);
        setLogs([]);
        setEnvironmentSettings(null);
        setMonitoringSession(null);
        setIsLoadingMonitoring(false);
        setIsDatasetReady(false);
        setIsLoadingReadings(false);
        return;
      }

      setIsLoadingReadings(true);
      setIsLoadingMonitoring(true);
      try {
        const [databaseReadings, databaseLogs] = await Promise.all([
          fetchWaterReadings({ accessToken, userId }),
          fetchSystemLogs({ accessToken, userId }),
        ]);
        const monitoringResult = await loadMonitoringState(accessToken, userId);
        console.info("[HydroWatch Hook] fetchWaterReadings returned", {
          queryResultCount: databaseReadings.length,
          currentAuthenticatedUser: userId,
          latestReading: databaseReadings.at(-1) ?? null,
          latestTurbidity: databaseReadings.at(-1)?.turbidity ?? null,
        });
        console.info("[HydroWatch Hook] fetchSystemLogs returned", {
          queryResultCount: databaseLogs.length,
          currentAuthenticatedUser: userId,
          latestLog: databaseLogs[0] ?? null,
        });

        if (!isMounted) return;
        setReadingsError(null);

        const enrichedReadings: WaterReading[] = [];
        const initialAlerts: SystemAlert[] = [];

        databaseReadings.forEach((reading) => {
          const enriched = enrichReading(reading, enrichedReadings);
          const generatedAlerts = evaluateAlerts(enriched, enrichedReadings, settings);
          enrichedReadings.push(enriched);
          initialAlerts.unshift(...generatedAlerts);
        });

        seenReadingIdsRef.current = new Set(enrichedReadings.map((reading) => reading.id));
        readingsRef.current = enrichedReadings;
        setReadings(enrichedReadings);

        console.info("[HydroWatch Hook] Initial readings committed to state", {
          count: enrichedReadings.length,
          latest: enrichedReadings.at(-1) ?? null,
          seenIds: seenReadingIdsRef.current.size,
        });

        setAlerts(initialAlerts.slice(0, 40));
        setLogs(databaseLogs);
        setEnvironmentSettings(monitoringResult.environmentSettings);
        setMonitoringSession(monitoringResult.monitoringSession);
        setMonitoringError(monitoringResult.error);
        setIsDatasetReady(true);
      } catch (error) {
        if (!isMounted) return;
        const message = getLoadReadingsErrorMessage(error);
        console.error("Failed to fetch water readings from Supabase:", error);
        console.error("[HydroWatch Hook] loadInitialReadings failed", {
          message,
          error,
        });
        setReadingsError(message);
        setIsDatasetReady(true);
        setLogs((prev) => [
          {
            id: crypto.randomUUID(),
            severity: "Critical",
            message: `Supabase readings failed to load: ${message}`,
            timestamp: createUtcTimestamp(),
            category: "system",
          },
          ...prev,
        ]);
        setMonitoringError(message);
      } finally {
        if (isMounted) {
          setIsLoadingReadings(false);
          setIsLoadingMonitoring(false);
          console.info("[HydroWatch Hook] loadInitialReadings finished");
        }
      }
    }

    loadInitialReadings();

    return () => {
      isMounted = false;
    };
  }, [accessToken, enrichReading, settings, userId]);

  useEffect(() => {
    console.info("[HydroWatch Hook] Realtime effect evaluated", {
      isRealtimeEnabled,
      currentCount: readingsRef.current.length,
      currentAuthenticatedUser: userId,
    });

    if (!accessToken || !userId) {
      console.warn("[HydroWatch Hook] Realtime subscription skipped because no user is authenticated");
      return;
    }

    if (!isRealtimeEnabled) {
      console.warn("[HydroWatch Hook] Realtime subscription skipped because live mode is off");
      return;
    }

    return subscribeToWaterReadings({ accessToken, userId }, (payload) => {
      console.info("[HydroWatch Hook] Realtime callback fired", payload);
      const reading = waterReadingFromRealtimePayload(payload);
      if (!reading) {
        console.warn("[HydroWatch Hook] Realtime payload could not be mapped to WaterReading");
        return;
      }

      void recordReading(reading, true);
    });
  }, [accessToken, isRealtimeEnabled, recordReading, userId]);

  useEffect(() => {
    setReadings((prev) => {
      console.info("[HydroWatch Hook] Re-enriching readings after settings change", {
        count: prev.length,
      });

      const enrichedReadings = prev.map((reading, index) => enrichReading(reading, prev.slice(0, index)));
      readingsRef.current = enrichedReadings;

      console.info("[HydroWatch Hook] Re-enriched readings committed", {
        count: enrichedReadings.length,
        latest: enrichedReadings.at(-1) ?? null,
      });

      return enrichedReadings;
    });
  }, [enrichReading]);

  const latest = readings.at(-1);
  const acknowledgeAlert = useCallback((alertId: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
  }, []);
  const saveEnvironment = useCallback(
    async (nextSettings: Omit<EnvironmentSettings, "id" | "userId" | "createdAt" | "updatedAt">) => {
      if (!accessToken || !userId) throw new Error("Authentication required.");

      setMonitoringError(null);
      try {
        const saved = await saveEnvironmentSettings({ accessToken, userId }, nextSettings);
        setEnvironmentSettings(saved);
        return saved;
      } catch (error) {
        const message = getMonitoringSetupErrorMessage(error);
        setMonitoringError(message);
        throw new Error(message);
      }
    },
    [accessToken, userId],
  );
  const startMonitoring = useCallback(async () => {
    if (!accessToken || !userId) throw new Error("Authentication required.");
    if (!environmentSettings) {
      throw new Error("Configure environment settings before starting monitoring.");
    }

    setIsLoadingMonitoring(true);
    setMonitoringError(null);
    try {
      const session = await startMonitoringSession({ accessToken, userId });
      setMonitoringSession(session);
      return session;
    } catch (error) {
      const message = getMonitoringSetupErrorMessage(error);
      setMonitoringError(message);
      throw new Error(message);
    } finally {
      setIsLoadingMonitoring(false);
    }
  }, [accessToken, environmentSettings, userId]);
  const stopMonitoring = useCallback(async () => {
    if (!accessToken || !userId) throw new Error("Authentication required.");

    setIsLoadingMonitoring(true);
    setMonitoringError(null);
    try {
      await stopMonitoringSession({ accessToken, userId });
      setMonitoringSession(null);
    } catch (error) {
      const message = getMonitoringSetupErrorMessage(error);
      setMonitoringError(message);
      throw new Error(message);
    } finally {
      setIsLoadingMonitoring(false);
    }
  }, [accessToken, userId]);
  const isLive = useMemo(() => {
    if (!latest || !Number.isFinite(latest.turbidity)) return false;
    const ageSeconds = (liveClock - getUtcTimestampMs(latest.createdAt)) / 1000;
    return ageSeconds <= 15;
  }, [latest, liveClock]);
  const healthScore = useMemo(() => {
    if (!latest) return 100;
    const turbidityPenalty = Math.min(95, Math.max(0, latest.turbidity - 5) * 1.2);
    return Math.round(Math.max(0, 100 - turbidityPenalty));
  }, [latest]);

  const waterQualityScore = useMemo(() => Math.max(0, Math.min(100, healthScore + 5)), [healthScore]);
  const uptimeHours = useMemo(
    () => {
      if (readings.length < 2) return "0.00";
      const first = getUtcTimestampMs(readings[0].createdAt);
      const latestReading = getUtcTimestampMs(readings[readings.length - 1].createdAt);
      return (Math.max(0, latestReading - first) / (1000 * 60 * 60)).toFixed(2);
    },
    [readings],
  );

  return {
    acknowledgeAlert,
    alerts,
    healthScore,
    environmentSettings,
    isLive,
    isLoadingMonitoring,
    isLoadingReadings,
    latest,
    logs,
    monitoringError,
    monitoringSession,
    readingsError,
    readings,
    settings,
    saveEnvironment,
    setIsLive,
    setSettings,
    startMonitoring,
    stopMonitoring,
    isDatasetReady,
    uptimeHours,
    waterQualityScore,
  };
}

function getLoadReadingsErrorMessage(error: unknown) {
  if (isSupabaseErrorLike(error)) {
    if (
      error.code === "42703" &&
      typeof error.message === "string" &&
      error.message.includes("user_id")
    ) {
      return "Supabase schema migration is required: water_readings.user_id does not exist yet.";
    }

    return typeof error.message === "string" ? error.message : "Supabase query failed.";
  }

  return error instanceof Error ? error.message : "Unknown error";
}

async function loadMonitoringState(accessToken: string, userId: string) {
  const [environmentSettingsResult, monitoringSessionResult] = await Promise.allSettled([
    fetchEnvironmentSettings({ accessToken, userId }),
    fetchActiveMonitoringSession({ accessToken, userId }),
  ]);
  const failures = [environmentSettingsResult, monitoringSessionResult]
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason);

  if (environmentSettingsResult.status === "fulfilled" && monitoringSessionResult.status === "fulfilled") {
    return {
      environmentSettings: environmentSettingsResult.value,
      monitoringSession: monitoringSessionResult.value,
      error: null,
    };
  }

  const message = getMonitoringSetupErrorMessage(failures[0]);
  console.warn("[HydroWatch Hook] monitoring setup unavailable", {
    message,
    failures: failures.map((failure) => summarizeError(failure)),
  });

  return {
    environmentSettings: environmentSettingsResult.status === "fulfilled" ? environmentSettingsResult.value : null,
    monitoringSession: monitoringSessionResult.status === "fulfilled" ? monitoringSessionResult.value : null,
    error: message,
  };
}

function getMonitoringSetupErrorMessage(error: unknown) {
  if (isSupabaseErrorLike(error)) {
    const message = typeof error.message === "string" ? error.message : "";
    if (
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      message.includes("environment_settings") ||
      message.includes("monitoring_sessions")
    ) {
      return "Supabase migration required: run supabase/20260609_esp32_wifi_configuration.sql, then reload the schema cache.";
    }

    return message || "Monitoring setup query failed.";
  }

  return error instanceof Error ? error.message : "Monitoring setup query failed.";
}

function isSupabaseErrorLike(error: unknown): error is SupabaseErrorLike {
  return typeof error === "object" && error !== null && ("code" in error || "message" in error);
}

function summarizeError(error: unknown) {
  if (isSupabaseErrorLike(error)) {
    return {
      code: typeof error.code === "string" ? error.code : null,
      message: typeof error.message === "string" ? error.message : "Supabase query failed.",
    };
  }

  return {
    code: null,
    message: error instanceof Error ? error.message : "Unknown error",
  };
}

function formatPredictionMessage(prediction: {
  label: string;
  confidence: number;
  projectedNTU: number;
  minutesToCritical: number | null;
}) {
  const etaSuffix =
    prediction.minutesToCritical !== null
      ? `, abnormal ETA ${prediction.minutesToCritical.toFixed(2)} min`
      : "";

  return `${prediction.label} (${prediction.confidence}% confidence, projected ${prediction.projectedNTU} NTU${etaSuffix})`;
}
