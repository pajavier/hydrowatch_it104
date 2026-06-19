import { NextRequest, NextResponse } from "next/server";
import { getActiveSensorUserId } from "@/config/hydrowatch-admin";
import { getServerSupabaseClient, proxyEsp32Request, requireHydrowatchUser } from "@/services/esp32-device-api";

const onlineWindowMs = 60_000;

type SensorHealthStatus = {
  sensor_status?: "ONLINE" | "OFFLINE" | "UNKNOWN" | null;
  last_reading_at?: string | null;
  last_successful_post_at?: string | null;
  consecutive_failures?: number | null;
  signal_strength_dbm?: number | string | null;
  current_ssid?: string | null;
  current_ip_address?: string | null;
  device_ip_address?: string | null;
  device_id?: string | null;
  mac_address?: string | null;
  firmware_version?: string | null;
  setup_mode?: boolean | null;
  updated_at?: string | null;
};

function isMissingSensorHealthTableError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "PGRST205" || error.code === "42P01")
  );
}

export async function GET(req: NextRequest) {
  const auth = await requireHydrowatchUser(req);
  console.log("[ESP32 STATUS]", {
    hasSession: auth.hasSession,
    userId: auth.userId,
    cookiesPresent: auth.cookiesPresent,
  });
  if ("error" in auth) return auth.error;

  const supabase = getServerSupabaseClient();
  const sensorUserId = getActiveSensorUserId();
  const { data: healthData, error } = await supabase
    .from("sensor_health")
    .select(
      "sensor_status,last_reading_at,last_successful_post_at,consecutive_failures,signal_strength_dbm,current_ssid,current_ip_address,device_ip_address,device_id,mac_address,firmware_version,setup_mode,updated_at",
    )
    .eq("user_id", sensorUserId)
    .single();

  if (error && error.code !== "PGRST116") {
    if (isMissingSensorHealthTableError(error)) {
      return NextResponse.json(
        { error: "Missing sensor_health table. Apply supabase/20260609_esp32_wifi_configuration.sql in Supabase, then reload the schema cache." },
        { status: 503 },
      );
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const health = (healthData ?? null) as SensorHealthStatus | null;
  const lastSeen = health?.last_successful_post_at ?? health?.last_reading_at ?? null;
  const resolvedStatus = getDeviceStatus(lastSeen, health?.setup_mode ?? false);
  const currentIpAddress = health?.current_ip_address ?? null;
  const fallbackIpAddress = health?.device_ip_address ?? null;
  const deviceIpAddress = currentIpAddress ?? fallbackIpAddress ?? null;

  const directStatus = await proxyEsp32Request("status").catch((directError) => {
    console.warn("[HydroWatch Device] Direct ESP32 status failed", directError);
    return null;
  });
  const directPayload = directStatus ? await directStatus.json().catch(() => null) : null;
  const isUnsupportedFirmware = directPayload?.code === "ESP32_REMOTE_MANAGEMENT_UNSUPPORTED";

  return NextResponse.json({
    ok: true,
    status: resolvedStatus,
    device_ip_address: deviceIpAddress,
    current_ip_address: currentIpAddress,
    fallback_ip_address: fallbackIpAddress,
    connected_ssid: health?.current_ssid ?? null,
    firmware_version: health?.firmware_version ?? null,
    last_seen: lastSeen,
    database: health
      ? {
          ...health,
          sensor_status: resolvedStatus,
        }
      : null,
    device: directPayload?.ok ? directPayload.device ?? directPayload : null,
    directReachable: Boolean(directPayload?.ok),
    remoteManagementSupported: !isUnsupportedFirmware,
    managementMessage: isUnsupportedFirmware ? "ESP32 firmware does not support remote management." : null,
  });
}

function getDeviceStatus(lastSeen: string | null, setupMode: boolean) {
  if (setupMode) return "OFFLINE";
  if (!lastSeen) return "UNKNOWN";

  const lastSeenMs = new Date(lastSeen).getTime();
  if (!Number.isFinite(lastSeenMs)) return "UNKNOWN";

  return Date.now() - lastSeenMs <= onlineWindowMs ? "ONLINE" : "OFFLINE";
}
