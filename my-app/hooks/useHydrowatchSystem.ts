import { useEffect, useMemo, useRef, useState } from "react";
import { evaluateAlerts } from "@/services/alert-engine";
import { loadWaterReadingsCsv } from "@/services/csv-loader";
import { SensorSimulator } from "@/services/sensor-simulator";
import {
  fetchWaterReadingsDataset,
  importCsvReadingsToSupabase,
  insertAlerts,
  insertLogs,
  insertPrediction,
  insertWaterReading,
} from "@/services/supabase-repository";
import { EngineSettings, SystemAlert, SystemLog, WaterReading } from "@/types/hydrowatch";
import { classifyTurbidity, predictTurbidity } from "@/utils/hydrowatch-analytics";

const defaultSettings: EngineSettings = {
  thresholds: { clearMax: 49, cloudyMax: 75, criticalMin: 76 },
  alertSensitivity: 1,
  refreshIntervalMs: 2500,
  predictionAggressiveness: 1,
};

const simulator = new SensorSimulator();

export function useHydrowatchSystem() {
  const [settings, setSettings] = useState<EngineSettings>(defaultSettings);
  const [readings, setReadings] = useState<WaterReading[]>([]);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isLive, setIsLive] = useState(true);
  const [isDatasetReady, setIsDatasetReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const readingsRef = useRef<WaterReading[]>([]);

  useEffect(() => {
    readingsRef.current = readings;
  }, [readings]);

  useEffect(() => {
    let isMounted = true;

    async function prepareDataset() {
      try {
        const csvDataset = await loadWaterReadingsCsv();
        if (!isMounted) return;

        let playbackDataset = csvDataset;
        let importMessage = "Supabase is not configured; using CSV playback locally.";

        try {
          const importResult = await importCsvReadingsToSupabase(csvDataset);
          const supabaseDataset = await fetchWaterReadingsDataset();

          if (supabaseDataset.length > 0) {
            playbackDataset = supabaseDataset;
            importMessage = importResult.skipped
              ? `Loaded ${supabaseDataset.length} readings from Supabase.`
              : `Imported ${importResult.inserted} CSV readings into Supabase and loaded them for playback.`;
          }
        } catch (databaseError) {
          importMessage = `Supabase dataset sync failed; using CSV playback locally. ${
            databaseError instanceof Error ? databaseError.message : "Unknown database error"
          }`;
        }

        simulator.setDataset(playbackDataset);
        setIsDatasetReady(playbackDataset.length > 0);
        setLogs((prev) => [
          {
            id: crypto.randomUUID(),
            severity: playbackDataset.length > 0 ? "Informational" : "Warning",
            message:
              playbackDataset.length > 0
                ? importMessage
                : "CSV dataset loaded but no valid readings were found.",
            timestamp: new Date().toISOString(),
            category: "system",
          },
          ...prev,
        ]);
      } catch (error) {
        if (!isMounted) return;
        setIsDatasetReady(false);
        setLogs((prev) => [
          {
            id: crypto.randomUUID(),
            severity: "Critical",
            message: `CSV dataset failed to load: ${error instanceof Error ? error.message : "Unknown error"}`,
            timestamp: new Date().toISOString(),
            category: "system",
          },
          ...prev,
        ]);
      }
    }

    prepareDataset();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const tick = async () => {
      const currentReadings = readingsRef.current;
      if (!simulator.hasDataset()) return;

      const reading = simulator.next(currentReadings, settings);
      const prediction = predictTurbidity(
        [...currentReadings, reading],
        settings.thresholds.criticalMin,
        settings.predictionAggressiveness,
      );
      const enriched: WaterReading = {
        ...reading,
        status: classifyTurbidity(reading.turbidity, settings.thresholds),
        prediction: prediction.label,
        predictionConfidence: prediction.confidence,
      };
      const generatedAlerts = evaluateAlerts(enriched, currentReadings, settings);
      const logBatch: SystemLog[] = [
        {
          id: crypto.randomUUID(),
          severity: "Informational",
          message: `ESP32 CSV packet: ${enriched.turbidity} NTU | level ${enriched.waterLevel}% | flow ${enriched.flowRate} L/min`,
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

      setReadings((prev) => [...prev.slice(-149), enriched]);
      setAlerts((prev) => [...generatedAlerts, ...prev].slice(0, 40));
      setLogs((prev) => [...logBatch, ...prev].slice(0, 300));

      await Promise.allSettled([
        insertWaterReading(enriched),
        insertPrediction({
          readingId: enriched.id,
          label: prediction.label,
          confidence: prediction.confidence,
          projectedNTU: prediction.projectedNTU,
        }),
        insertAlerts(generatedAlerts),
        insertLogs(logBatch),
      ]);
    };

    if (!isLive || !isDatasetReady) return;
    tick();
    timerRef.current = setInterval(tick, settings.refreshIntervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isDatasetReady, isLive, settings]);

  const latest = readings.at(-1);
  const healthScore = useMemo(() => {
    if (!latest) return 100;
    const turbidityPenalty = Math.min(50, Math.max(0, latest.turbidity - 35) * 0.7);
    const flowPenalty = latest.flowRate < 12 || latest.flowRate > 25 ? 15 : 0;
    const levelPenalty = latest.waterLevel < 58 || latest.waterLevel > 80 ? 12 : 0;
    return Math.round(Math.max(0, 100 - turbidityPenalty - flowPenalty - levelPenalty));
  }, [latest]);

  const waterQualityScore = useMemo(() => Math.max(0, Math.min(100, healthScore + 5)), [healthScore]);
  const uptimeHours = useMemo(
    () => ((readings.length * settings.refreshIntervalMs) / (1000 * 60 * 60)).toFixed(2),
    [readings.length, settings.refreshIntervalMs],
  );

  return {
    alerts,
    healthScore,
    isLive,
    latest,
    logs,
    readings,
    settings,
    setIsLive,
    setSettings,
    isDatasetReady,
    uptimeHours,
    waterQualityScore,
  };
}
