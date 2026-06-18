import { NextRequest, NextResponse } from "next/server";
import { getActiveSensorUserId } from "@/config/hydrowatch-admin";
import { getServerSupabaseClient, normalizeEsp32Host, requireHydrowatchUser } from "@/services/esp32-device-api";
import { createUtcTimestamp } from "@/utils/time-format";

export async function POST(req: NextRequest) {
  const auth = await requireHydrowatchUser(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const host = typeof body?.host === "string" ? normalizeEsp32Host(body.host) : null;

  if (!host) {
    return NextResponse.json({ error: "Enter a valid ESP32 host or IP address." }, { status: 400 });
  }

  const supabase = getServerSupabaseClient();
  const sensorUserId = getActiveSensorUserId();
  const now = createUtcTimestamp();

  const { data: existing, error: selectError } = await supabase
    .from("sensor_health")
    .select("id")
    .eq("user_id", sensorUserId)
    .limit(1)
    .maybeSingle();

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  const payload = {
    current_ip_address: host,
    device_ip_address: host,
    updated_at: now,
  };

  const result = existing
    ? await supabase.from("sensor_health").update(payload).eq("user_id", sensorUserId)
    : await supabase.from("sensor_health").insert({
        ...payload,
        user_id: sensorUserId,
        sensor_status: "UNKNOWN",
      });

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, host });
}
