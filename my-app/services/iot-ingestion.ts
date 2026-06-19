import { createClient } from "@supabase/supabase-js";
import { getActiveSensorUserId } from "@/config/hydrowatch-admin";
import { HYDROWATCH_SENSOR_ID } from "@/config/hydrowatch-sensor";
import { evaluateAlerts } from "@/services/alert-engine";
import { sendAlertEmail } from "@/services/alert-notifications";
import { ContainerType, EngineSettings, LightCondition, SystemLog, WaterReading, WaterType } from "@/types/hydrowatch";
import { Database } from "@/types/database.types";
import { classifyTurbidity, predictTurbidity } from "@/utils/hydrowatch-analytics";
import { createUtcTimestamp } from "@/utils/time-format";

export type Esp32ReadingPayload = {
  turbidity: number;
  createdAt?: string;
  deviceId?: string;
  firmwareVersion?: string;
  macAddress?: string;
  ipAddress?: string;
  ssid?: string;
  rssi?: number;
  setupMode?: boolean;
};

const ingestionSettings: EngineSettings = {
  thresholds: { clearMax: 5, cloudyMax: 50, criticalMin: 51 },
  alertSensitivity: 1,
  refreshIntervalMs: 2500,
  predictionAggressiveness: 1,
};
const ALERT_DUPLICATE_WINDOW_MINUTES = 30;

type WaterReadingRecord = {
  created_at: string;
  id: string | number;
  turbidity: number | string;
  user_id: string;
  light_condition?: LightCondition | null;
  water_type?: WaterType | null;
  container_type?: ContainerType | null;
  water_volume_ml?: number | string | null;
};

type OwnerWaterReading = WaterReading & {
  userId: string;
};

type ActiveMonitoringContext = {
  environment: {
    light_condition: LightCondition;
    water_type: WaterType;
    container_type: ContainerType;
    water_volume_ml: number | string | null;
  };
  session: {
    id: string;
  };
};

function getServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for ESP32 ingestion.");
  }

  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function parseEsp32ReadingPayload(body: unknown): Esp32ReadingPayload {
  const turbidity = Number((body as { turbidity?: unknown } | null)?.turbidity);
  const createdAt = (body as { createdAt?: unknown } | null)?.createdAt;
  const source = body as Record<string, unknown> | null;

  if (!Number.isFinite(turbidity) || turbidity < 0) {
    throw new Error("Payload must include a non-negative numeric turbidity value.");
  }

  // Validate turbidity is within expected range (0-5 NTU for sensor, allow 50% margin)
  if (turbidity < 0 || turbidity > 100) {
      throw new Error(
          `Invalid turbidity value: ${turbidity} NTU. Expected range is 0-100 NTU.`
      );
  }
  
  if (createdAt !== undefined && typeof createdAt !== "string") {
    throw new Error("createdAt must be an ISO timestamp string when provided.");
  }

  return {
    turbidity,
    createdAt,
    deviceId: getOptionalString(source, "deviceId"),
    firmwareVersion: getOptionalString(source, "firmwareVersion"),
    macAddress: getOptionalString(source, "macAddress"),
    ipAddress: getOptionalString(source, "ipAddress"),
    ssid: getOptionalString(source, "ssid"),
    rssi: getOptionalNumber(source, "rssi"),
    setupMode: typeof source?.setupMode === "boolean" ? source.setupMode : undefined,
  };
}

type ServerSupabaseClient = ReturnType<typeof getServerSupabaseClient>;
type SensorHealthInsert = Database["public"]["Tables"]["sensor_health"]["Insert"];
type SensorHealthUpdate = Database["public"]["Tables"]["sensor_health"]["Update"];
type AlertInsert = Database["public"]["Tables"]["alerts"]["Insert"];
type AlertRow = Database["public"]["Tables"]["alerts"]["Row"];

export async function ingestEsp32Reading(payload: Esp32ReadingPayload) {
  const supabase = getServerSupabaseClient();
  const assignedUserId = getActiveSensorUserId();
  const createdAt = payload.createdAt ?? createUtcTimestamp();

  console.info("[HydroWatch Ingestion] ESP32 reading ingest started", {
    assignedUserId,
    turbidity: payload.turbidity,
    createdAt,
  });

  const monitoring = await fetchActiveMonitoringContext(supabase, assignedUserId);
  if (!monitoring) {
    console.info("[HydroWatch Ingestion] Reading ignored because monitoring is stopped or environment is not configured", {
      assignedUserId,
      turbidity: payload.turbidity,
      createdAt,
    });
    await updateSensorHealth(supabase, assignedUserId, "success", payload);
    return {
      stored: false,
      ignored: true,
      reason: "Monitoring is stopped or environment settings are not configured.",
      turbidity: payload.turbidity,
      created_at: createdAt,
    };
  }

  const history = await fetchAssignedUserReadingHistory(assignedUserId);
  const { data, error } = await supabase
    .from("water_readings")
    .insert({
      user_id: assignedUserId,
      turbidity: payload.turbidity,
      created_at: createdAt,
      light_condition: monitoring.environment.light_condition,
      water_type: monitoring.environment.water_type,
      container_type: monitoring.environment.container_type,
      water_volume_ml: monitoring.environment.water_volume_ml,
      monitoring_session_id: monitoring.session.id,
    })
    .select("id,user_id,turbidity,created_at,light_condition,water_type,container_type,water_volume_ml")
    .single();

  if (error) throw error;

  const typedData = data as WaterReadingRecord | null;

  console.info("[HydroWatch Ingestion] ESP32 reading stored", {
    assignedUserId,
    insertedReading: typedData ?? null,
    insertedReadingId: typedData?.id ?? null,
    insertedReadingIdType: typeof typedData?.id,
    historyCount: history.length,
  });

  // Update sensor health tracking
  await updateSensorHealth(supabase, assignedUserId, "success", payload);

  await storeDerivedOwnerData(toWaterReading(typedData as WaterReadingRecord), history, getAlertDeviceId(payload));
  return typedData;
}

async function fetchActiveMonitoringContext(
  supabase: ServerSupabaseClient,
  userId: string,
): Promise<ActiveMonitoringContext | null> {
  const [environmentResult, sessionResult] = await Promise.all([
    supabase
      .from("environment_settings")
      .select("light_condition,water_type,container_type,water_volume_ml")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("monitoring_sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (environmentResult.error) throw environmentResult.error;
  if (sessionResult.error) throw sessionResult.error;
  if (!environmentResult.data || !sessionResult.data) return null;

  return {
    environment: environmentResult.data as ActiveMonitoringContext["environment"],
    session: sessionResult.data as ActiveMonitoringContext["session"],
  };
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

async function storeDerivedOwnerData(reading: OwnerWaterReading, history: WaterReading[], deviceId: string) {
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
    projectedNTU: prediction.projectedNTU,
    predictionSlope: prediction.slope,
    predictedCriticalAt: prediction.predictedCriticalAt,
    minutesToCritical: prediction.minutesToCritical,
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
      message: formatPredictionMessage(prediction),
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
    deviceId,
  });
  const alertsResult = await insertAlertsWithSuppression(supabase, generatedAlerts, reading.userId, deviceId);

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

  const results = [predictionResult, alertsResult, logsResult];
  console.info("[HydroWatch Ingestion] Derived write results", {
    predictions: summarizeSupabaseResult(predictionResult),
    alerts: summarizeSupabaseResult(alertsResult),
    systemLogs: summarizeSupabaseResult(logsResult),
  });

  const derivedError = results.find((result) => "error" in result && result.error)?.error;
  if (derivedError) throw derivedError;
}

async function insertAlertsWithSuppression(
  supabase: ServerSupabaseClient,
  alerts: ReturnType<typeof evaluateAlerts>,
  userId: string,
  deviceId: string,
) {
  if (alerts.length === 0) {
    return { data: null, error: null };
  }

  const insertedRows: AlertRow[] = [];

  for (const alert of alerts) {
    const decision = await getAlertInsertDecision(supabase, alert, userId, deviceId);

    if (decision.suppressed) {
      console.info("[HydroWatch Alerts] Duplicate alert suppressed", {
        deviceId,
        type: alert.type,
        severity: alert.severity,
        windowMinutes: ALERT_DUPLICATE_WINDOW_MINUTES,
      });
      continue;
    }

    const insertPayload: AlertInsert = {
      id: alert.id,
      user_id: userId,
      device_id: deviceId,
      severity: alert.severity,
      type: alert.type,
      message: alert.message,
      action: alert.action,
      created_at: alert.timestamp,
    };
    const { data, error } = await supabase
      .from("alerts")
      .insert(insertPayload)
      .select("id,user_id,device_id,severity,type,message,action,created_at")
      .single();

    if (error) {
      return { data: insertedRows, error };
    }

    insertedRows.push(data as AlertRow);

    if (shouldSendAlertEmail(alert, decision.reason)) {
      await sendAlertEmail({ alert: { ...alert, deviceId }, deviceId, supabase, userId });
    }
  }

  return { data: insertedRows, error: null };
}

async function getAlertInsertDecision(
  supabase: ServerSupabaseClient,
  alert: ReturnType<typeof evaluateAlerts>[number],
  userId: string,
  deviceId: string,
): Promise<{ reason: "critical_spike" | "duplicate" | "normal" | "severity_escalation"; suppressed: boolean }> {
  const duplicateWindowStart = new Date(Date.now() - ALERT_DUPLICATE_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("alerts")
    .select("id,severity,type,device_id,created_at")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .eq("type", alert.type)
    .gte("created_at", duplicateWindowStart)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const recentAlerts = (data ?? []) as Pick<AlertRow, "created_at" | "device_id" | "id" | "severity" | "type">[];
  const isSeverityEscalation = recentAlerts.some(
    (recentAlert) => severityRank(alert.severity) > severityRank(recentAlert.severity),
  );
  if (isSeverityEscalation) {
    return { reason: "severity_escalation", suppressed: false };
  }

  if (isCriticalSpike(alert)) {
    return { reason: "critical_spike", suppressed: false };
  }

  const isDuplicate = recentAlerts.some((recentAlert) => recentAlert.severity === alert.severity);
  if (isDuplicate) {
    return { reason: "duplicate", suppressed: true };
  }

  return { reason: "normal", suppressed: false };
}

function shouldSendAlertEmail(
  alert: ReturnType<typeof evaluateAlerts>[number],
  reason: "critical_spike" | "duplicate" | "normal" | "severity_escalation",
) {
  return reason !== "duplicate" && (alert.severity === "Critical" || reason === "severity_escalation");
}

function isCriticalSpike(alert: ReturnType<typeof evaluateAlerts>[number]) {
  return alert.severity === "Critical" && alert.type === "high_turbidity" && alert.title === "Critical Value Detected";
}

function severityRank(severity: "Critical" | "Informational" | "Warning") {
  if (severity === "Critical") return 3;
  if (severity === "Warning") return 2;
  return 1;
}

function getAlertDeviceId(payload: Esp32ReadingPayload) {
  return payload.deviceId ?? payload.macAddress ?? HYDROWATCH_SENSOR_ID;
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
  const waterVolumeMl =
    row.water_volume_ml === null || row.water_volume_ml === undefined
      ? null
      : Number(row.water_volume_ml);

  return {
    id: row.id,
    userId: row.user_id,
    turbidity: Number.isFinite(turbidity) ? turbidity : 0,
    status: classifyTurbidity(Number.isFinite(turbidity) ? turbidity : 0),
    prediction: "Stable Trend",
    predictionConfidence: 62,
    createdAt: row.created_at,
    lightCondition: row.light_condition ?? null,
    waterType: row.water_type ?? null,
    containerType: row.container_type ?? null,
    waterVolumeMl: Number.isFinite(waterVolumeMl) ? waterVolumeMl : null,
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

async function updateSensorHealth(
  supabase: ServerSupabaseClient,
  userId: string,
  status: "success" | "failure",
  payload?: Esp32ReadingPayload,
) {
  const now = createUtcTimestamp();

  try {
    const { data: existing } = await supabase
      .from("sensor_health")
      .select("id,consecutive_failures,last_successful_post_at")
      .eq("user_id", userId)
      .single();

    const typedExisting = existing as {
      id: string;
      consecutive_failures?: number;
      last_successful_post_at?: string | null;
    } | null;

    if (typedExisting) {
      const updateData: SensorHealthUpdate = {
        updated_at: now,
        sensor_status: status === "success" ? "ONLINE" : "OFFLINE",
        last_reading_at: now,
        last_successful_post_at: status === "success" ? now : typedExisting.last_successful_post_at,
        consecutive_failures: status === "success" ? 0 : (typedExisting.consecutive_failures || 0) + 1,
        signal_strength_dbm: payload?.rssi,
        current_ssid: payload?.ssid,
        current_ip_address: payload?.ipAddress,
        device_id: payload?.deviceId,
        mac_address: payload?.macAddress,
        firmware_version: payload?.firmwareVersion,
        setup_mode: payload?.setupMode ?? false,
      };

      const { error } = await supabase
        .from("sensor_health")
        .update(updateData)
        .eq("user_id", userId);

      if (error) {
        console.error("[HydroWatch Ingestion] Failed to update sensor health", {
          userId,
          error: error.message,
        });
      }
    } else {
      const insertData: SensorHealthInsert = {
        user_id: userId,
        last_reading_at: now,
        last_successful_post_at: status === "success" ? now : null,
        consecutive_failures: status === "success" ? 0 : 1,
        sensor_status: status === "success" ? "ONLINE" : "OFFLINE",
        signal_strength_dbm: payload?.rssi,
        current_ssid: payload?.ssid,
        current_ip_address: payload?.ipAddress,
        device_ip_address: payload?.ipAddress,
        device_id: payload?.deviceId,
        mac_address: payload?.macAddress,
        firmware_version: payload?.firmwareVersion,
        setup_mode: payload?.setupMode ?? false,
        updated_at: now,
      };

      const { error } = await supabase.from("sensor_health").insert(insertData);

      if (error) {
        console.error("[HydroWatch Ingestion] Failed to create sensor health record", {
          userId,
          error: error.message,
        });
      }
    }
  } catch (error) {
    console.error("[HydroWatch Ingestion] Error updating sensor health", {
      userId,
      error: error instanceof Error ? error.message : error,
    });
  }
}

function getOptionalString(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getOptionalNumber(source: Record<string, unknown> | null, key: string) {
  const value = Number(source?.[key]);
  return Number.isFinite(value) ? value : undefined;
}
