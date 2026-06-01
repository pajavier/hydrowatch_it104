import { createClient } from "@supabase/supabase-js";
import { getActiveSensorUserId } from "@/config/hydrowatch-admin";
import { evaluateAlerts } from "@/services/alert-engine";
import { EngineSettings, SystemLog, WaterReading } from "@/types/hydrowatch";
import { classifyTurbidity, predictTurbidity } from "@/utils/hydrowatch-analytics";
import { createUtcTimestamp } from "@/utils/time-format";

export type Esp32ReadingPayload = {
  turbidity: number;
  createdAt?: string;
};

const ingestionSettings: EngineSettings = {
  thresholds: { clearMax: 5, cloudyMax: 50, criticalMin: 51 },
  alertSensitivity: 1,
  refreshIntervalMs: 2500,
  predictionAggressiveness: 1,
};

type WaterReadingRecord = {
  created_at: string;
  id: string | number;
  turbidity: number | string;
  user_id: string;
};

type OwnerWaterReading = WaterReading & {
  userId: string;
};

function getServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for ESP32 ingestion.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function parseEsp32ReadingPayload(body: unknown): Esp32ReadingPayload {
  const turbidity = Number((body as { turbidity?: unknown } | null)?.turbidity);
  const createdAt = (body as { createdAt?: unknown } | null)?.createdAt;

  if (!Number.isFinite(turbidity) || turbidity < 0) {
    throw new Error("Payload must include a non-negative numeric turbidity value.");
  }

  if (createdAt !== undefined && typeof createdAt !== "string") {
    throw new Error("createdAt must be an ISO timestamp string when provided.");
  }

  return {
    turbidity,
    createdAt,
  };
}

export async function ingestEsp32Reading(payload: Esp32ReadingPayload) {
  const supabase = getServerSupabaseClient();
  const assignedUserId = getActiveSensorUserId();
  const createdAt = payload.createdAt ?? createUtcTimestamp();

  const history = await fetchAssignedUserReadingHistory(assignedUserId);
  const { data, error } = await supabase
    .from("water_readings")
    .insert({
      user_id: assignedUserId,
      turbidity: payload.turbidity,
      created_at: createdAt,
    })
    .select("id,user_id,turbidity,created_at")
    .single();

  if (error) throw error;

  await storeDerivedOwnerData(toWaterReading(data as WaterReadingRecord), history);
  return data;
}

async function fetchAssignedUserReadingHistory(userId: string) {
  const supabase = getServerSupabaseClient();
  const { data, error } = await supabase
    .from("water_readings")
    .select("id,user_id,turbidity,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;
  return ((data ?? []) as WaterReadingRecord[]).reverse().map(toWaterReading);
}

async function storeDerivedOwnerData(reading: OwnerWaterReading, history: WaterReading[]) {
  const supabase = getServerSupabaseClient();
  const prediction = predictTurbidity(
    [...history, reading],
    ingestionSettings.thresholds.criticalMin,
    ingestionSettings.predictionAggressiveness,
  );
  const enrichedReading: WaterReading = {
    ...reading,
    prediction: prediction.label,
    predictionConfidence: prediction.confidence,
  };
  const generatedAlerts = evaluateAlerts(enrichedReading, history, ingestionSettings);
  const logBatch: SystemLog[] = [
    {
      id: crypto.randomUUID(),
      severity: "Informational",
      message: `ESP32 reading received: ${enrichedReading.turbidity} NTU`,
      timestamp: enrichedReading.createdAt,
      category: "reading",
    },
    {
      id: crypto.randomUUID(),
      severity: prediction.label === "Critical Condition Expected" ? "Warning" : "Informational",
      message: `${prediction.label} (${prediction.confidence}% confidence, projected ${prediction.projectedNTU} NTU)`,
      timestamp: enrichedReading.createdAt,
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

  const results = await Promise.all([
    supabase.from("predictions").insert({
      user_id: reading.userId,
      reading_id: reading.id,
      label: prediction.label,
      confidence: prediction.confidence,
      projected_ntu: prediction.projectedNTU,
    }),
    generatedAlerts.length > 0
      ? supabase.from("alerts").insert(
          generatedAlerts.map((alert) => ({
            id: alert.id,
            user_id: reading.userId,
            severity: alert.severity,
            type: alert.type,
            message: alert.message,
            action: alert.action,
            created_at: alert.timestamp,
          })),
        )
      : Promise.resolve({ error: null }),
    supabase.from("system_logs").insert(
      logBatch.map((log) => ({
        id: log.id,
        user_id: reading.userId,
        severity: log.severity,
        category: log.category,
        message: log.message,
        created_at: log.timestamp,
      })),
    ),
  ]);

  const derivedError = results.find((result) => "error" in result && result.error)?.error;
  if (derivedError) throw derivedError;
}

function toWaterReading(row: WaterReadingRecord): OwnerWaterReading {
  const turbidity = Number(row.turbidity);

  return {
    id: String(row.id),
    userId: row.user_id,
    turbidity: Number.isFinite(turbidity) ? turbidity : 0,
    status: classifyTurbidity(Number.isFinite(turbidity) ? turbidity : 0),
    prediction: "Stable Trend",
    predictionConfidence: 62,
    createdAt: row.created_at,
  };
}
