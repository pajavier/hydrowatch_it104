import { getDataSupabaseClient } from "@/lib/supabase/browser";
import { PredictionLabel, SystemAlert, SystemLog, WaterReading } from "@/types/hydrowatch";
import { classifyTurbidity } from "@/utils/hydrowatch-analytics";

export type WaterReadingRow = {
  id: string;
  turbidity: number | string;
  created_at: string;
};

export type NewWaterReadingInput = {
  turbidity: number;
  createdAt?: string;
};

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

function toWaterReading(row: WaterReadingRow): WaterReading {
  const turbidity = numberOrFallback(row.turbidity, 0);

  return {
    id: row.id,
    turbidity,
    status: classifyTurbidity(turbidity),
    prediction: "Stable Trend",
    predictionConfidence: 62,
    createdAt: row.created_at,
  };
}

export async function fetchWaterReadings(limit = 150): Promise<WaterReading[]> {
  const client = getDataSupabaseClient();
  if (!client) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const { data, error } = await client
    .from("water_readings")
    .select("id,turbidity,created_at")
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).slice(-limit).map((row) => toWaterReading(row as WaterReadingRow));
}

export async function insertEsp32WaterReading(input: NewWaterReadingInput) {
  const client = getDataSupabaseClient();
  if (!client) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const { data, error } = await client
    .from("water_readings")
    .insert({
      turbidity: input.turbidity,
      created_at: input.createdAt ?? new Date().toISOString(),
    } as never)
    .select("id,turbidity,created_at")
    .single();

  if (error) throw error;
  return data ? toWaterReading(data as WaterReadingRow) : null;
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

export function waterReadingFromRealtimePayload(payload: unknown) {
  const row = (payload as { new?: unknown }).new;
  if (!row || typeof row !== "object") return null;
  return toWaterReading(row as WaterReadingRow);
}
