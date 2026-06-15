import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getActiveSensorUserId } from "@/config/hydrowatch-admin";
import { Database } from "@/types/database.types";

export type DeviceCommand = "status" | "wifi" | "restart" | "clear-wifi";

type SensorHealthRecord = {
  current_ip_address?: string | null;
  device_ip_address?: string | null;
};

export function getServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase configuration");
  }

  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function requireHydrowatchUser(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  }

  const supabase = getServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { error: NextResponse.json({ error: "Invalid session" }, { status: 401 }) };
  }

  return { supabase, userId: data.user.id };
}

export async function getRegisteredDeviceIp() {
  const supabase = getServerSupabaseClient();
  const sensorUserId = getActiveSensorUserId();
  const { data, error } = await supabase
    .from("sensor_health")
    .select("current_ip_address,device_ip_address")
    .eq("user_id", sensorUserId)
    .single();

  if (error && error.code !== "PGRST116") throw error;

  const row = data as SensorHealthRecord | null;
  return row?.current_ip_address ?? row?.device_ip_address ?? process.env.HYDROWATCH_ESP32_HOST ?? null;
}

export async function proxyEsp32Request(
  command: DeviceCommand,
  init?: {
    body?: unknown;
    method?: "GET" | "POST";
  },
) {
  const host = await getRegisteredDeviceIp();
  if (!host) {
    return NextResponse.json(
      { error: "ESP32 IP address is not registered yet. Wait for a reading or set HYDROWATCH_ESP32_HOST." },
      { status: 503 },
    );
  }

  const apiKey = process.env.HYDROWATCH_DEVICE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "HYDROWATCH_DEVICE_API_KEY is required for device commands." },
      { status: 500 },
    );
  }

  const baseUrl = host.startsWith("http://") || host.startsWith("https://") ? host : `http://${host}`;
  const response = await fetch(`${baseUrl}/api/${command}`, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "X-HydroWatch-Key": apiKey,
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(8000),
  });

  const payload = await response.json().catch(() => null);
  return NextResponse.json(payload ?? { ok: response.ok }, { status: response.status });
}
