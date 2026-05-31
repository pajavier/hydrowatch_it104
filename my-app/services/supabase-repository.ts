import { getDataSupabaseClient } from "@/lib/supabase/browser";
import { PredictionLabel, SystemAlert, SystemLog, WaterReading } from "@/types/hydrowatch";
import { classifyTurbidity } from "@/utils/hydrowatch-analytics";
import { createUtcTimestamp } from "@/utils/time-format";

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

export async function fetchWaterReadings(limit = 150): Promise<WaterReading[]> {
  console.info("[HydroWatch Supabase] fetchWaterReadings started", {
    table: "water_readings",
    expectedColumns: ["id", "turbidity", "created_at"],
    limit,
  });

  const client = getDataSupabaseClient();
  if (!client) {
    console.error("[HydroWatch Supabase] fetchWaterReadings aborted: data client is null");
    throw new Error("Supabase environment variables are not configured.");
  }

  const { data, error } = await client
    .from("water_readings")
    .select("id,turbidity,created_at")
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
  });

  const readings = (data ?? []).slice(-limit).map((row) => toWaterReading(row as WaterReadingRow));

  console.info("[HydroWatch Supabase] fetchWaterReadings mapped readings", {
    mappedCount: readings.length,
    latestReading: readings.at(-1) ?? null,
  });

  return readings;
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
      created_at: input.createdAt ?? createUtcTimestamp(),
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
  console.info("[HydroWatch Realtime] subscribeToWaterReadings starting", {
    schema: "public",
    table: "water_readings",
    event: "INSERT",
  });

  const client = getDataSupabaseClient();
  if (!client) {
    console.error("[HydroWatch Realtime] Subscription aborted: data client is null");
    return () => undefined;
  }

  const channel = client
    .channel("hydrowatch-water-readings")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "water_readings" },
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
