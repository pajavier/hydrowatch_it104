import { getDataSupabaseClient } from "@/lib/supabase/browser";
import { PredictionLabel, SystemAlert, SystemLog, WaterReading } from "@/types/hydrowatch";

export async function insertWaterReading(reading: WaterReading) {
  const client = getDataSupabaseClient();
  if (!client) return;
  await client.from("water_readings").insert({
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
  const client = getDataSupabaseClient();
  if (!client) return;
  await client.from("predictions").insert({
    reading_id: prediction.readingId,
    label: prediction.label,
    confidence: prediction.confidence,
    projected_ntu: prediction.projectedNTU,
  });
}

export async function insertAlerts(alerts: SystemAlert[]) {
  const client = getDataSupabaseClient();
  if (!client || alerts.length === 0) return;
  await client.from("alerts").insert(
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
  const client = getDataSupabaseClient();
  if (!client || logs.length === 0) return;
  await client.from("system_logs").insert(
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
