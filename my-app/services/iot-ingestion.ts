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

  console.info("[HydroWatch Ingestion] ESP32 reading ingest started", {
    assignedUserId,
    turbidity: payload.turbidity,
    createdAt,
  });

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

  console.info("[HydroWatch Ingestion] ESP32 reading stored", {
    assignedUserId,
    insertedReading: data ?? null,
    insertedReadingId: data?.id ?? null,
    insertedReadingIdType: typeof data?.id,
    historyCount: history.length,
  });

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
  console.info("[HydroWatch Ingestion] Assigned user reading history loaded", {
    assignedUserId: userId,
    queryResultCount: data?.length ?? 0,
    latestRow: data?.[0] ?? null,
  });
  return ((data ?? []) as WaterReadingRecord[]).reverse().map(toWaterReading);
}

async function storeDerivedOwnerData(reading: OwnerWaterReading, history: WaterReading[]) {
  const supabase = getServerSupabaseClient();
  console.info("[HydroWatch Ingestion] Derived writes starting", {
    insertedReadingId: reading.id,
    insertedReadingIdType: typeof reading.id,
    destinationTables: ["predictions", "alerts", "system_logs"],
  });

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

  console.info("[HydroWatch Ingestion] Inserting derived row", {
    destinationTable: "predictions",
    readingId: reading.id,
    readingIdType: typeof reading.id,
  });
  const predictionPayload = {
    user_id: reading.userId,
    reading_id: reading.id,
    label: prediction.label,
    confidence: prediction.confidence,
    projected_ntu: prediction.projectedNTU,
  };
  let predictionResult = await supabase.from("predictions").insert(predictionPayload);

  if (isUuidCastError(predictionResult.error)) {
    console.error("[HydroWatch Ingestion] predictions.reading_id rejected the water_readings.id value", {
      destinationTable: "predictions",
      readingId: reading.id,
      readingIdType: typeof reading.id,
      error: summarizeSupabaseResult(predictionResult),
      nextAction: "Retrying prediction insert without reading_id. Apply 20260601_align_reading_id_types.sql to restore the foreign key link.",
    });

    const predictionWithoutReadingId = {
      user_id: predictionPayload.user_id,
      label: predictionPayload.label,
      confidence: predictionPayload.confidence,
      projected_ntu: predictionPayload.projected_ntu,
    };
    predictionResult = await supabase.from("predictions").insert(predictionWithoutReadingId);
  }

  console.info("[HydroWatch Ingestion] Inserting derived rows", {
    destinationTable: "alerts",
    count: generatedAlerts.length,
    hasReadingId: false,
  });
  const alertsResult = generatedAlerts.length > 0
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
    : Promise.resolve({ data: null, error: null });

  console.info("[HydroWatch Ingestion] Inserting derived rows", {
    destinationTable: "system_logs",
    count: logBatch.length,
    hasReadingId: false,
  });
  const logsResult = await supabase.from("system_logs").insert(
    logBatch.map((log) => ({
      id: log.id,
      user_id: reading.userId,
      severity: log.severity,
      category: log.category,
      message: log.message,
      created_at: log.timestamp,
    })),
  );

  const resolvedAlertsResult = await alertsResult;
  const results = [predictionResult, resolvedAlertsResult, logsResult];
  console.info("[HydroWatch Ingestion] Derived write results", {
    predictions: summarizeSupabaseResult(predictionResult),
    alerts: summarizeSupabaseResult(resolvedAlertsResult),
    systemLogs: summarizeSupabaseResult(logsResult),
  });

  const derivedError = results.find((result) => "error" in result && result.error)?.error;
  if (derivedError) throw derivedError;
}

function summarizeSupabaseResult(result: { error?: unknown }) {
  const error = result.error;
  if (!error) return { ok: true };

  return {
    ok: false,
    error:
      typeof error === "object" && error !== null
        ? {
            code: "code" in error ? error.code : undefined,
            message: "message" in error ? error.message : undefined,
            details: "details" in error ? error.details : undefined,
            hint: "hint" in error ? error.hint : undefined,
          }
        : error,
  };
}

function isUuidCastError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "22P02"
  );
}

function toWaterReading(row: WaterReadingRecord): OwnerWaterReading {
  const turbidity = Number(row.turbidity);

  return {
    id: row.id,
    userId: row.user_id,
    turbidity: Number.isFinite(turbidity) ? turbidity : 0,
    status: classifyTurbidity(Number.isFinite(turbidity) ? turbidity : 0),
    prediction: "Stable Trend",
    predictionConfidence: 62,
    createdAt: row.created_at,
  };
}
