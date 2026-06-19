import { getDataSupabaseClient } from "@/lib/supabase/browser";
import {
  ContainerType,
  EnvironmentSettings,
  LightCondition,
  MonitoringSession,
  PredictionLabel,
  SystemAlert,
  SystemLog,
  WaterReading,
  WaterType,
} from "@/types/hydrowatch";
import { classifyTurbidity } from "@/utils/hydrowatch-analytics";
import { createUtcTimestamp } from "@/utils/time-format";

export type WaterReadingRow = {
  id: string | number;
  user_id: string;
  turbidity: number | string;
  created_at: string;
  light_condition?: LightCondition | null;
  water_type?: WaterType | null;
  container_type?: ContainerType | null;
  water_volume_ml?: number | string | null;
};

export type SystemLogRow = {
  id: string;
  user_id: string;
  severity: SystemLog["severity"];
  category: SystemLog["category"];
  message: string;
  created_at: string;
};

export type AlertRow = {
  action: string;
  created_at: string;
  device_id?: string | null;
  id: string;
  message: string;
  severity: SystemAlert["severity"];
  type: SystemAlert["type"];
  user_id: string;
};

export type NewWaterReadingInput = {
  accessToken: string;
  turbidity: number;
  createdAt?: string;
  userId: string;
};

type UserScope = {
  accessToken: string;
  userId: string;
};

type EnvironmentSettingsRow = {
  id: string;
  user_id: string;
  light_condition: LightCondition;
  water_type: WaterType;
  container_type: ContainerType;
  water_volume_ml: number | string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type MonitoringSessionRow = {
  id: string;
  user_id: string;
  status: "active" | "stopped";
  started_at: string;
  stopped_at: string | null;
  created_at: string;
};

function numberOrFallback(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toWaterReading(row: WaterReadingRow): WaterReading {
  const turbidity = numberOrFallback(row.turbidity, 0);
  const waterVolumeMl =
    row.water_volume_ml === null || row.water_volume_ml === undefined
      ? null
      : numberOrFallback(row.water_volume_ml, 0);

  if (!row.id || row.turbidity === undefined || !row.created_at) {
    console.warn("[HydroWatch Supabase] water_readings row has missing fields", {
      hasId: Boolean(row.id),
      hasTurbidity: row.turbidity !== undefined,
      hasCreatedAt: Boolean(row.created_at),
      row,
    });
  }

  return {
    id: row.id,
    turbidity,
    status: classifyTurbidity(turbidity),
    prediction: "Stable Trend",
    predictionConfidence: 62,
    createdAt: row.created_at,
    lightCondition: row.light_condition ?? null,
    waterType: row.water_type ?? null,
    containerType: row.container_type ?? null,
    waterVolumeMl,
  };
}

function toSystemLog(row: SystemLogRow): SystemLog {
  return {
    id: row.id,
    severity: row.severity,
    category: row.category,
    message: row.message,
    timestamp: row.created_at,
  };
}

function toSystemAlert(row: AlertRow): SystemAlert {
  return {
    id: row.id,
    severity: row.severity,
    title: getAlertTitle(row),
    type: row.type,
    message: row.message,
    action: row.action,
    deviceId: row.device_id ?? null,
    timestamp: row.created_at,
  };
}

function getAlertTitle(row: Pick<AlertRow, "severity" | "type">) {
  if (row.type === "rapid_increase") return "Rapid Increase";
  if (row.type === "sensor_stability") return "Sensor Stability Check";
  if (row.severity === "Critical") return "Critical Turbidity";
  return "Turbidity Alert";
}

function toEnvironmentSettings(row: EnvironmentSettingsRow): EnvironmentSettings {
  const waterVolumeMl =
    row.water_volume_ml === null || row.water_volume_ml === undefined
      ? null
      : numberOrFallback(row.water_volume_ml, 0);

  return {
    id: row.id,
    userId: row.user_id,
    lightCondition: row.light_condition,
    waterType: row.water_type,
    containerType: row.container_type,
    waterVolumeMl,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMonitoringSession(row: MonitoringSessionRow): MonitoringSession {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    createdAt: row.created_at,
  };
}

export async function fetchWaterReadings(scope: UserScope, limit = 150): Promise<WaterReading[]> {
  console.info("[HydroWatch Supabase] fetchWaterReadings started", {
    table: "water_readings",
    expectedColumns: ["id", "user_id", "turbidity", "created_at", "light_condition", "water_type", "container_type", "water_volume_ml"],
    limit,
    userId: scope.userId,
  });

  const client = getDataSupabaseClient(scope.accessToken);
  if (!client) {
    console.error("[HydroWatch Supabase] fetchWaterReadings aborted: data client is null");
    throw new Error("Supabase environment variables are not configured.");
  }

  const initialResult = await client
    .from("water_readings")
    .select("id,user_id,turbidity,created_at,light_condition,water_type,container_type,water_volume_ml")
    .eq("user_id", scope.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const result = isMissingEnvironmentSnapshotColumnError(initialResult.error)
    ? await (async () => {
      const missingColumnError = initialResult.error;
      if (!missingColumnError) return initialResult;

      console.warn("[HydroWatch Supabase] Environment snapshot columns are missing; falling back to legacy water_readings shape", {
        message: missingColumnError.message,
        code: missingColumnError.code,
        nextAction: "Run supabase/20260609_esp32_wifi_configuration.sql to store environment metadata with future readings.",
      });

      return client
        .from("water_readings")
        .select("id,user_id,turbidity,created_at")
        .eq("user_id", scope.userId)
        .order("created_at", { ascending: false })
        .limit(limit);
    })()
    : initialResult;

  const { data, error } = result;

  if (error) {
    console.error("[HydroWatch Supabase] fetchWaterReadings query error", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  console.info("[HydroWatch Supabase] fetchWaterReadings query result", {
    returnedRows: data?.length ?? 0,
    newestRow: data?.[0] ?? null,
    oldestReturnedRow: data?.at(-1) ?? null,
    userId: scope.userId,
  });

  const readings = [...(data ?? [])]
    .reverse()
    .map((row) => toWaterReading(row as WaterReadingRow));

  console.info("[HydroWatch Supabase] fetchWaterReadings mapped readings", {
    mappedCount: readings.length,
    latestReading: readings.at(-1) ?? null,
  });

  return readings;
}

function isMissingEnvironmentSnapshotColumnError(error: unknown): error is { code: "42703"; message: string } {
  if (typeof error !== "object" || error === null || !("message" in error)) return false;
  const message = typeof error.message === "string" ? error.message : "";
  return (
    "code" in error &&
    error.code === "42703" &&
    (
      message.includes("water_readings.light_condition") ||
      message.includes("water_readings.water_type") ||
      message.includes("water_readings.container_type") ||
      message.includes("water_readings.water_volume_ml")
    )
  );
}

export async function fetchSystemLogs(scope: UserScope, limit = 300): Promise<SystemLog[]> {
  console.info("[HydroWatch Supabase] fetchSystemLogs started", {
    table: "system_logs",
    expectedColumns: ["id", "user_id", "severity", "category", "message", "created_at"],
    limit,
    userId: scope.userId,
  });

  const client = getDataSupabaseClient(scope.accessToken);
  if (!client) {
    console.error("[HydroWatch Supabase] fetchSystemLogs aborted: data client is null");
    throw new Error("Supabase environment variables are not configured.");
  }

  const { data, error } = await client
    .from("system_logs")
    .select("id,user_id,severity,category,message,created_at")
    .eq("user_id", scope.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[HydroWatch Supabase] fetchSystemLogs query error", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  const logs = (data ?? []).map((row) => toSystemLog(row as SystemLogRow));

  console.info("[HydroWatch Supabase] fetchSystemLogs mapped logs", {
    mappedCount: logs.length,
    latestLog: logs[0] ?? null,
  });

  return logs;
}

export async function fetchLatestAlert(scope: UserScope): Promise<SystemAlert | null> {
  console.info("[HydroWatch Supabase] fetchLatestAlert started", {
    table: "alerts",
    limit: 1,
    userId: scope.userId,
  });

  const client = getDataSupabaseClient(scope.accessToken);
  if (!client) {
    console.error("[HydroWatch Supabase] fetchLatestAlert aborted: data client is null");
    throw new Error("Supabase environment variables are not configured.");
  }

  const { data, error } = await client
    .from("alerts")
    .select("id,user_id,device_id,severity,type,message,action,created_at")
    .eq("user_id", scope.userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("[HydroWatch Supabase] fetchLatestAlert query error", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  const latestAlert = data?.[0] ? toSystemAlert(data[0] as AlertRow) : null;

  console.info("[HydroWatch Supabase] fetchLatestAlert mapped alert", {
    latestAlert,
  });

  return latestAlert;
}

export async function insertEsp32WaterReading(input: NewWaterReadingInput) {
  const client = getDataSupabaseClient(input.accessToken);
  if (!client) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const { data, error } = await client
    .from("water_readings")
    .insert({
      user_id: input.userId,
      turbidity: input.turbidity,
      created_at: input.createdAt ?? createUtcTimestamp(),
    })
    .select("id,user_id,turbidity,created_at")
    .single();

  if (error) throw error;
  return data ? toWaterReading(data as WaterReadingRow) : null;
}

export async function fetchEnvironmentSettings(scope: UserScope): Promise<EnvironmentSettings | null> {
  const client = getDataSupabaseClient(scope.accessToken);
  if (!client) throw new Error("Supabase environment variables are not configured.");

  const { data, error } = await client
    .from("environment_settings")
    .select("id,user_id,light_condition,water_type,container_type,water_volume_ml,notes,created_at,updated_at")
    .eq("user_id", scope.userId)
    .maybeSingle();

  if (error) throw error;
  return data ? toEnvironmentSettings(data as EnvironmentSettingsRow) : null;
}

export async function saveEnvironmentSettings(
  scope: UserScope,
  settings: Omit<EnvironmentSettings, "id" | "userId" | "createdAt" | "updatedAt">,
): Promise<EnvironmentSettings> {
  const client = getDataSupabaseClient(scope.accessToken);
  if (!client) throw new Error("Supabase environment variables are not configured.");

  const { data, error } = await client
    .from("environment_settings")
    .upsert(
      {
        user_id: scope.userId,
        light_condition: settings.lightCondition,
        water_type: settings.waterType,
        container_type: settings.containerType,
        water_volume_ml: settings.waterVolumeMl ?? null,
        notes: settings.notes?.trim() ? settings.notes.trim() : null,
        updated_at: createUtcTimestamp(),
      },
      { onConflict: "user_id" },
    )
    .select("id,user_id,light_condition,water_type,container_type,water_volume_ml,notes,created_at,updated_at")
    .single();

  if (error) throw error;
  return toEnvironmentSettings(data as EnvironmentSettingsRow);
}

export async function fetchActiveMonitoringSession(scope: UserScope): Promise<MonitoringSession | null> {
  const client = getDataSupabaseClient(scope.accessToken);
  if (!client) throw new Error("Supabase environment variables are not configured.");

  const { data, error } = await client
    .from("monitoring_sessions")
    .select("id,user_id,status,started_at,stopped_at,created_at")
    .eq("user_id", scope.userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  return data ? toMonitoringSession(data as MonitoringSessionRow) : null;
}

export async function startMonitoringSession(scope: UserScope): Promise<MonitoringSession> {
  const client = getDataSupabaseClient(scope.accessToken);
  if (!client) throw new Error("Supabase environment variables are not configured.");

  const now = createUtcTimestamp();
  await client
    .from("monitoring_sessions")
    .update({ status: "stopped", stopped_at: now })
    .eq("user_id", scope.userId)
    .eq("status", "active");

  const { data, error } = await client
    .from("monitoring_sessions")
    .insert({
      user_id: scope.userId,
      status: "active",
      started_at: now,
      created_at: now,
    })
    .select("id,user_id,status,started_at,stopped_at,created_at")
    .single();

  if (error) throw error;
  return toMonitoringSession(data as MonitoringSessionRow);
}

export async function stopMonitoringSession(scope: UserScope): Promise<void> {
  const client = getDataSupabaseClient(scope.accessToken);
  if (!client) throw new Error("Supabase environment variables are not configured.");

  const now = createUtcTimestamp();
  const { error } = await client
    .from("monitoring_sessions")
    .update({ status: "stopped", stopped_at: now })
    .eq("user_id", scope.userId)
    .eq("status", "active");

  if (error) throw error;
}

export async function insertPrediction(prediction: {
  accessToken: string;
  readingId: string | number;
  label: PredictionLabel;
  confidence: number;
  projectedNTU: number;
  userId: string;
}) {
  const supabase = getDataSupabaseClient(prediction.accessToken);
  if (!supabase) return;
  console.info("[HydroWatch Supabase] Inserting derived row", {
    destinationTable: "predictions",
    readingId: prediction.readingId,
    readingIdType: typeof prediction.readingId,
  });
  const payload = {
    user_id: prediction.userId,
    reading_id: prediction.readingId,
    label: prediction.label,
    confidence: prediction.confidence,
    projected_ntu: prediction.projectedNTU,
  };
  const { data, error } = await supabase
    .from("predictions")
    .insert(payload);

  if (error) {
    console.error("Prediction insert failed:", error);
    throw error;
  }

  return data;
}

export async function insertAlerts(alerts: SystemAlert[], scope: UserScope) {
  const client = getDataSupabaseClient(scope.accessToken);
  if (!client || alerts.length === 0) return;
  console.info("[HydroWatch Supabase] Inserting derived rows", {
    destinationTable: "alerts",
    count: alerts.length,
    hasReadingId: false,
  });
  await client.from("alerts").insert(
    alerts.map((alert) => ({
      id: alert.id,
      user_id: scope.userId,
      severity: alert.severity,
      type: alert.type,
      message: alert.message,
      action: alert.action,
      created_at: alert.timestamp,
    })),
  );
}

export async function insertLogs(logs: SystemLog[], scope: UserScope) {
  const client = getDataSupabaseClient(scope.accessToken);
  if (!client || logs.length === 0) return;
  console.info("[HydroWatch Supabase] Inserting derived rows", {
    destinationTable: "system_logs",
    count: logs.length,
    hasReadingId: false,
  });
  await client.from("system_logs").insert(
    logs.map((log) => ({
      id: log.id,
      user_id: scope.userId,
      severity: log.severity,
      category: log.category,
      message: log.message,
      created_at: log.timestamp,
    })),
  );
}

export function subscribeToWaterReadings(
  scope: UserScope,
  onInsert: (payload: unknown) => void,
) {
  console.info("[HydroWatch Realtime] subscribeToWaterReadings starting", {
    schema: "public",
    table: "water_readings",
    event: "INSERT",
    userId: scope.userId,
  });

  const client = getDataSupabaseClient(scope.accessToken);
  if (!client) {
    console.error("[HydroWatch Realtime] Subscription aborted: data client is null");
    return () => undefined;
  }

  const channel = client
    .channel("hydrowatch-water-readings")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "water_readings",
        filter: `user_id=eq.${scope.userId}`,
      },
      (payload) => {
        console.info("[HydroWatch Realtime] INSERT payload received", payload);
        onInsert(payload);
      },
    )
    .subscribe((status, error) => {
      const statusDetails = {
        status,
        error: error
          ? {
              message: error.message,
              name: error.name,
            }
          : null,
      };

      if (status === "SUBSCRIBED") {
        console.info("[HydroWatch Realtime] Channel subscribed", statusDetails);
        return;
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("[HydroWatch Realtime] Channel connection issue", statusDetails);
      }
    });

  return () => {
    console.info("[HydroWatch Realtime] Removing water_readings channel");
    client.removeChannel(channel);
  };
}

export function subscribeToAlerts(
  scope: UserScope,
  onInsert: (alert: SystemAlert) => void,
) {
  console.info("[HydroWatch Realtime] subscribeToAlerts starting", {
    schema: "public",
    table: "alerts",
    event: "INSERT",
    userId: scope.userId,
  });

  const client = getDataSupabaseClient(scope.accessToken);
  if (!client) {
    console.error("[HydroWatch Realtime] Alert subscription aborted: data client is null");
    return () => undefined;
  }

  const channel = client
    .channel("hydrowatch-alerts")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "alerts",
        filter: `user_id=eq.${scope.userId}`,
      },
      (payload) => {
        console.info("[HydroWatch Realtime] Alert INSERT payload received", payload);
        const row = (payload as { new?: unknown }).new;
        if (!row || typeof row !== "object") {
          console.warn("[HydroWatch Realtime] Alert payload did not include a valid new row", payload);
          return;
        }

        onInsert(toSystemAlert(row as AlertRow));
      },
    )
    .subscribe((status, error) => {
      const statusDetails = {
        status,
        error: error
          ? {
              message: error.message,
              name: error.name,
            }
          : null,
      };

      if (status === "SUBSCRIBED") {
        console.info("[HydroWatch Realtime] Alert channel subscribed", statusDetails);
        return;
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("[HydroWatch Realtime] Alert channel connection issue", statusDetails);
      }
    });

  return () => {
    console.info("[HydroWatch Realtime] Removing alerts channel");
    client.removeChannel(channel);
  };
}

export function waterReadingFromRealtimePayload(payload: unknown) {
  const row = (payload as { new?: unknown }).new;
  if (!row || typeof row !== "object") {
    console.warn("[HydroWatch Realtime] Payload did not include a valid new row", payload);
    return null;
  }

  console.info("[HydroWatch Realtime] Mapping realtime row", row);
  return toWaterReading(row as WaterReadingRow);
}
