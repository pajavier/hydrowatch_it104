import { getDataSupabaseClient } from "@/lib/supabase/browser";
import { DatasetReading } from "@/services/simulation-dataset";
import { PredictionLabel, SystemAlert, SystemLog, WaterReading } from "@/types/hydrowatch";
import { classifyTurbidity } from "@/utils/hydrowatch-analytics";

type InsertableTable = {
  insert: (values: unknown) => PromiseLike<unknown>;
};

function tableFor(name: "water_readings" | "predictions" | "alerts" | "system_logs") {
  const client = getDataSupabaseClient();
  if (!client) return null;
  return client.from(name) as unknown as InsertableTable;
}

function numberOrFallback(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toDatasetReading(row: {
  created_at?: string;
  turbidity: number | string;
  water_level?: number | string | null;
  flow_rate?: number | string | null;
}): DatasetReading {
  const turbidity = numberOrFallback(row.turbidity, 0);
  const fallbackWaterLevel = Math.max(45, Math.min(86, Math.round(78 - turbidity * 0.16)));
  const fallbackFlowRate = Number(Math.max(7, Math.min(27, 22 - turbidity * 0.07)).toFixed(1));

  return {
    createdAt: row.created_at,
    turbidity,
    waterLevel: numberOrFallback(row.water_level, fallbackWaterLevel),
    flowRate: numberOrFallback(row.flow_rate, fallbackFlowRate),
  };
}

export async function importCsvReadingsToSupabase(readings: DatasetReading[]) {
  const client = getDataSupabaseClient();
  if (!client || readings.length === 0) return { inserted: 0, skipped: true };

  const { count, error: countError } = await client
    .from("water_readings")
    .select("*", { count: "exact", head: true });

  if (countError) throw countError;
  if ((count ?? 0) > 0) return { inserted: 0, skipped: true };

  const now = Date.now();
  const rows = readings.map((reading, index) => ({
    turbidity: reading.turbidity,
    water_level: reading.waterLevel,
    flow_rate: reading.flowRate,
    status: classifyTurbidity(reading.turbidity, {
      clearMax: 49,
      cloudyMax: 75,
      criticalMin: 76,
    }),
    source: "simulated" as const,
    created_at:
      reading.createdAt ??
      new Date(now + index * 1000).toISOString(),
  }));

  const { error } = await client.from("water_readings").insert(rows as never[]);
  if (error) throw error;

  return { inserted: rows.length, skipped: false };
}

export async function fetchWaterReadingsDataset(): Promise<DatasetReading[]> {
  const client = getDataSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from("water_readings")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map(toDatasetReading);
}

export async function insertWaterReading(reading: WaterReading) {
  const table = tableFor("water_readings");
  if (!table) return;
  await table.insert({
    id: reading.id,
    turbidity: reading.turbidity,
    water_level: reading.waterLevel,
    flow_rate: reading.flowRate,
    status: reading.status,
    prediction: reading.prediction,
    prediction_confidence: reading.predictionConfidence,
    source: reading.source,
    created_at: reading.createdAt,
  });
}

export async function insertPrediction(prediction: {
  readingId: string;
  label: PredictionLabel;
  confidence: number;
  projectedNTU: number;
}) {
  const table = tableFor("predictions");
  if (!table) return;
  await table.insert({
    reading_id: prediction.readingId,
    label: prediction.label,
    confidence: prediction.confidence,
    projected_ntu: prediction.projectedNTU,
  });
}

export async function insertAlerts(alerts: SystemAlert[]) {
  const table = tableFor("alerts");
  if (!table || alerts.length === 0) return;
  await table.insert(
    alerts.map((alert) => ({
      id: alert.id,
      severity: alert.severity,
      type: alert.type,
      message: alert.message,
      action: alert.action,
      created_at: alert.timestamp,
    })),
  );
}

export async function insertLogs(logs: SystemLog[]) {
  const table = tableFor("system_logs");
  if (!table || logs.length === 0) return;
  await table.insert(
    logs.map((log) => ({
      id: log.id,
      severity: log.severity,
      category: log.category,
      message: log.message,
      created_at: log.timestamp,
    })),
  );
}

export function subscribeToWaterReadings(onInsert: (payload: unknown) => void) {
  const client = getDataSupabaseClient();
  if (!client) return () => undefined;
  const channel = client
    .channel("hydrowatch-water-readings")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "water_readings" },
      onInsert,
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}
