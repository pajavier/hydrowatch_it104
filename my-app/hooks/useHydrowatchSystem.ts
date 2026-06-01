import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { evaluateAlerts } from "@/services/alert-engine";
import {
  fetchWaterReadings,
  insertAlerts,
  insertLogs,
  insertPrediction,
  subscribeToWaterReadings,
  waterReadingFromRealtimePayload,
} from "@/services/supabase-repository";
import { EngineSettings, SystemAlert, SystemLog, WaterReading } from "@/types/hydrowatch";
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
  const [isLive, setIsLive] = useState(true);
  const [isDatasetReady, setIsDatasetReady] = useState(false);
  const [isLoadingReadings, setIsLoadingReadings] = useState(true);
  const [readingsError, setReadingsError] = useState<string | null>(null);
  const readingsRef = useRef<WaterReading[]>([]);
  const seenReadingIdsRef = useRef<Set<string>>(new Set());

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
          message: `${prediction.label} (${prediction.confidence}% confidence, projected ${prediction.projectedNTU} NTU)`,
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
        seenReadingIdsRef.current = new Set();
        readingsRef.current = [];
        setReadings([]);
        setAlerts([]);
        setLogs([]);
        setIsDatasetReady(false);
        setIsLoadingReadings(false);
        return;
      }

      setIsLoadingReadings(true);
      try {
        const databaseReadings = await fetchWaterReadings({ accessToken, userId });
        console.info("[HydroWatch Hook] fetchWaterReadings returned", {
          count: databaseReadings.length,
          latest: databaseReadings.at(-1) ?? null,
        });

        if (!isMounted) return;
        setReadingsError(null);

        const enrichedReadings: WaterReading[] = [];
        const initialAlerts: SystemAlert[] = [];
        const initialLogs: SystemLog[] = [];

        databaseReadings.forEach((reading) => {
          const enriched = enrichReading(reading, enrichedReadings);
          const generatedAlerts = evaluateAlerts(enriched, enrichedReadings, settings);
          enrichedReadings.push(enriched);
          initialAlerts.unshift(...generatedAlerts);
          initialLogs.unshift(
            ...generatedAlerts.map((alert) => ({
              id: crypto.randomUUID(),
              severity: alert.severity,
              message: `${alert.title}: ${alert.message} Recommendation: ${alert.action}`,
              timestamp: alert.timestamp,
              category: "alert" as const,
            })),
          );
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
        setIsDatasetReady(true);
        setLogs((prev) => [
          {
            id: crypto.randomUUID(),
            severity: "Informational",
            message:
              enrichedReadings.length > 0
                ? `Loaded ${enrichedReadings.length} readings from Supabase.`
                : "Connected to Supabase. Waiting for ESP32 readings.",
            timestamp: createUtcTimestamp(),
            category: "system",
          },
          ...initialLogs.slice(0, 80),
          ...prev,
        ]);
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
      } finally {
        if (isMounted) {
          setIsLoadingReadings(false);
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
      isLive,
      currentCount: readingsRef.current.length,
    });

    if (!accessToken || !userId) {
      console.warn("[HydroWatch Hook] Realtime subscription skipped because no user is authenticated");
      return;
    }

    if (!isLive) {
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
  }, [accessToken, isLive, recordReading, userId]);

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
    alerts,
    healthScore,
    isLive,
    isLoadingReadings,
    latest,
    logs,
    readingsError,
    readings,
    settings,
    setIsLive,
    setSettings,
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

function isSupabaseErrorLike(error: unknown): error is SupabaseErrorLike {
  return typeof error === "object" && error !== null && ("code" in error || "message" in error);
}
