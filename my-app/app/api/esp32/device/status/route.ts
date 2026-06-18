import { NextRequest, NextResponse } from "next/server";
import { getActiveSensorUserId } from "@/config/hydrowatch-admin";
import { getServerSupabaseClient, proxyEsp32Request, requireHydrowatchUser } from "@/services/esp32-device-api";

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

  const directStatus = await proxyEsp32Request("status").catch((directError) => {
    console.warn("[HydroWatch Device] Direct ESP32 status failed", directError);
    return null;
  });
  const directPayload = directStatus ? await directStatus.json().catch(() => null) : null;
  const isUnsupportedFirmware = directPayload?.code === "ESP32_REMOTE_MANAGEMENT_UNSUPPORTED";

  return NextResponse.json({
    ok: true,
    database: healthData ?? null,
    device: directPayload?.ok ? directPayload.device ?? directPayload : null,
    directReachable: Boolean(directPayload?.ok),
    remoteManagementSupported: !isUnsupportedFirmware,
    managementMessage: isUnsupportedFirmware ? "ESP32 firmware does not support remote management." : null,
  });
}
