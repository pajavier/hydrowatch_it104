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

const defaultSettings: EngineSettings = {
  thresholds: { clearMax: 5, cloudyMax: 50, criticalMin: 51 },
  alertSensitivity: 1,
  refreshIntervalMs: 2500,
  predictionAggressiveness: 1,
};

export function useHydrowatchSystem() {
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
      if (seenReadingIdsRef.current.has(reading.id)) return;

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
      setAlerts((prev) => [...generatedAlerts, ...prev].slice(0, 40));
      setLogs((prev) => [...logBatch, ...prev].slice(0, 300));

      if (!persistDerivedData) return;

      await Promise.allSettled([
          insertPrediction({
            readingId: enriched.id,
            label: prediction.label,
            confidence: prediction.confidence,
            projectedNTU: prediction.projectedNTU,
          }),
          insertAlerts(generatedAlerts),
          insertLogs(logBatch),
        ]);
    },
    [enrichReading, settings],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadInitialReadings() {
      setIsLoadingReadings(true);
      try {
        const databaseReadings = await fetchWaterReadings();
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
            timestamp: new Date().toISOString(),
            category: "system",
          },
          ...initialLogs.slice(0, 80),
          ...prev,
        ]);
      } catch (error) {
        if (!isMounted) return;
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Failed to fetch water readings from Supabase:", error);
        setReadingsError(message);
        setIsDatasetReady(true);
        setLogs((prev) => [
          {
            id: crypto.randomUUID(),
            severity: "Critical",
            message: `Supabase readings failed to load: ${message}`,
            timestamp: new Date().toISOString(),
            category: "system",
          },
          ...prev,
        ]);
      } finally {
        if (isMounted) {
          setIsLoadingReadings(false);
        }
      }
    }

    loadInitialReadings();

    return () => {
      isMounted = false;
    };
  }, [enrichReading, settings]);

  useEffect(() => {
    if (!isLive) return;

    return subscribeToWaterReadings((payload) => {
      const reading = waterReadingFromRealtimePayload(payload);
      if (!reading) return;
      void recordReading(reading, true);
    });
  }, [isLive, recordReading]);

  useEffect(() => {
    setReadings((prev) => {
      const enrichedReadings = prev.map((reading, index) => enrichReading(reading, prev.slice(0, index)));
      readingsRef.current = enrichedReadings;
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
      const first = new Date(readings[0].createdAt).getTime();
      const latestReading = new Date(readings[readings.length - 1].createdAt).getTime();
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
