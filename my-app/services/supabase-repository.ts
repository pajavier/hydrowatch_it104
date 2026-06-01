import { getDataSupabaseClient } from "@/lib/supabase/browser";
import { PredictionLabel, SystemAlert, SystemLog, WaterReading } from "@/types/hydrowatch";
import { classifyTurbidity } from "@/utils/hydrowatch-analytics";
import { createUtcTimestamp } from "@/utils/time-format";

export type WaterReadingRow = {
  id: string | number;
  user_id: string;
  turbidity: number | string;
  created_at: string;
};

export type SystemLogRow = {
  id: string;
  user_id: string;
  severity: SystemLog["severity"];
  category: SystemLog["category"];
  message: string;
  created_at: string;
};

export type NewWaterReadingInput = {
  accessToken: string;
  turbidity: number;
  createdAt?: string;
  userId: string;
};

type InsertableTable = {
  insert: (values: unknown) => PromiseLike<unknown>;
};

type UserScope = {
  accessToken: string;
  userId: string;
};

function tableFor(
  name: "water_readings" | "predictions" | "alerts" | "system_logs",
  accessToken: string,
) {
  const client = getDataSupabaseClient(accessToken);
  if (!client) return null;
  return client.from(name) as unknown as InsertableTable;
}

function numberOrFallback(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toWaterReading(row: WaterReadingRow): WaterReading {
  const turbidity = numberOrFallback(row.turbidity, 0);

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

export async function fetchWaterReadings(scope: UserScope, limit = 150): Promise<WaterReading[]> {
  console.info("[HydroWatch Supabase] fetchWaterReadings started", {
    table: "water_readings",
    expectedColumns: ["id", "user_id", "turbidity", "created_at"],
    limit,
    userId: scope.userId,
  });

  const client = getDataSupabaseClient(scope.accessToken);
  if (!client) {
    console.error("[HydroWatch Supabase] fetchWaterReadings aborted: data client is null");
    throw new Error("Supabase environment variables are not configured.");
  }

  const { data, error } = await client
    .from("water_readings")
    .select("id,user_id,turbidity,created_at")
    .eq("user_id", scope.userId)
    .order("created_at", { ascending: true });

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
    firstRow: data?.[0] ?? null,
    latestRow: data?.at(-1) ?? null,
    userId: scope.userId,
  });

  const readings = (data ?? []).slice(-limit).map((row) => toWaterReading(row as WaterReadingRow));

  console.info("[HydroWatch Supabase] fetchWaterReadings mapped readings", {
    mappedCount: readings.length,
    latestReading: readings.at(-1) ?? null,
  });

  return readings;
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
    } as never)
    .select("id,user_id,turbidity,created_at")
    .single();

  if (error) throw error;
  return data ? toWaterReading(data as WaterReadingRow) : null;
}

export async function insertPrediction(prediction: {
  accessToken: string;
  readingId: string | number;
  label: PredictionLabel;
  confidence: number;
  projectedNTU: number;
  userId: string;
}) {
  const table = tableFor("predictions", prediction.accessToken);
  if (!table) return;
  console.info("[HydroWatch Supabase] Inserting derived row", {
    destinationTable: "predictions",
    readingId: prediction.readingId,
    readingIdType: typeof prediction.readingId,
  });
  await table.insert({
    user_id: prediction.userId,
    reading_id: prediction.readingId,
    label: prediction.label,
    confidence: prediction.confidence,
    projected_ntu: prediction.projectedNTU,
  });
}

export async function insertAlerts(alerts: SystemAlert[], scope: UserScope) {
  const table = tableFor("alerts", scope.accessToken);
  if (!table || alerts.length === 0) return;
  console.info("[HydroWatch Supabase] Inserting derived rows", {
    destinationTable: "alerts",
    count: alerts.length,
    hasReadingId: false,
  });
  await table.insert(
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
  const table = tableFor("system_logs", scope.accessToken);
  if (!table || logs.length === 0) return;
  console.info("[HydroWatch Supabase] Inserting derived rows", {
    destinationTable: "system_logs",
    count: logs.length,
    hasReadingId: false,
  });
  await table.insert(
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
      console.info("[HydroWatch Realtime] Channel status", {
        status,
        error: error
          ? {
              message: error.message,
              name: error.name,
            }
          : null,
      });
    });

  return () => {
    console.info("[HydroWatch Realtime] Removing water_readings channel");
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
