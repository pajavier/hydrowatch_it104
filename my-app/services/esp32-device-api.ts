import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getActiveSensorUserId } from "@/config/hydrowatch-admin";
import { Database } from "@/types/database.types";

export type DeviceCommand = "status" | "wifi" | "restart" | "clear-wifi";

type SensorHealthRecord = {
  current_ip_address?: string | null;
  device_ip_address?: string | null;
};

export function normalizeEsp32Host(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const candidate = trimmed.startsWith("http://") || trimmed.startsWith("https://")
    ? trimmed
    : `http://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname) {
    return null;
  }

  if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) {
    return null;
  }

  return trimmed.replace(/\/+$/, "");
}

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

function getServerAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase auth configuration");
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
  const cookiesPresent = req.cookies.getAll().length > 0;
  if (!token) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      hasSession: false,
      userId: null,
      cookiesPresent,
    };
  }

  const authClient = getServerAuthClient();
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      hasSession: false,
      userId: null,
      cookiesPresent,
    };
  }

  return {
    supabase: getServerSupabaseClient(),
    userId: data.user.id,
    hasSession: true,
    cookiesPresent,
  };
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
    acceptNetworkDrop?: boolean;
  },
) {
  const host = await getRegisteredDeviceIp();
  if (!host) {
    return NextResponse.json(
      { error: "ESP32 host not available." },
      { status: 503 },
    );
  }

  const apiKey = process.env.HYDROWATCH_DEVICE_API_KEY;
  const baseUrl = host.startsWith("http://") || host.startsWith("https://") ? host : `http://${host}`;
  let response: Response;
  try {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (apiKey) {
      headers.set("X-HydroWatch-Key", apiKey);
    }

    if (command === "wifi") {
      console.log("[ESP32 WIFI PROXY]", {
        url: `${baseUrl}/api/${command}`,
        method: init?.method ?? "GET",
        body: summarizeProxyBody(init?.body),
      });
    }

    response = await fetch(`${baseUrl}/api/${command}`, {
      method: init?.method ?? "GET",
      headers,
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    if (init?.acceptNetworkDrop) {
      return NextResponse.json(
        {
          ok: true,
          accepted: true,
          warning: formatEsp32ContactError(error),
          message: "Command sent. The ESP32 may be restarting or changing WiFi.",
        },
        { status: 202 },
      );
    }

    return NextResponse.json(
      {
        error: formatEsp32ContactError(error),
      },
      { status: 502 },
    );
  }

  const responseText = await response.text().catch(() => "");
  const payload = parseJsonObject(responseText);
  if (response.status === 404 || responseText.toLowerCase().includes("not found")) {
    return NextResponse.json(
      {
        ok: false,
        code: "ESP32_REMOTE_MANAGEMENT_UNSUPPORTED",
        error: "ESP32 firmware does not support remote management.",
      },
      { status: 501 },
    );
  }

  return NextResponse.json(payload ?? { ok: response.ok }, { status: response.status });
}

function parseJsonObject(value: string) {
  if (!value.trim()) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function formatEsp32ContactError(error: unknown) {
  if (!(error instanceof Error)) return "Unable to contact ESP32.";
  if (error.name === "TimeoutError" || error.name === "AbortError") {
    return "Unable to contact ESP32 before the request timed out.";
  }

  return `Unable to contact ESP32: ${error.message}`;
}

function summarizeProxyBody(body: unknown) {
  if (!body || typeof body !== "object") return body;

  const candidate = body as { ssid?: unknown; password?: unknown };
  if (typeof candidate.password !== "string") return body;

  return {
    ...candidate,
    password: "*".repeat(candidate.password.length),
    passwordLength: candidate.password.length,
  };
}
