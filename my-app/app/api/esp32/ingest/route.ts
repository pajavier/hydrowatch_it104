import { NextRequest, NextResponse } from "next/server";
import { ingestEsp32Reading, parseEsp32ReadingPayload } from "@/services/iot-ingestion";
import { createUtcTimestamp } from "@/utils/time-format";

export async function GET() {
  return NextResponse.json({
    ok: true,
    receivedAt: createUtcTimestamp(),
    config: {
      hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasActiveSensorUserId: Boolean(process.env.ACTIVE_SENSOR_USER_ID),
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  let payload: ReturnType<typeof parseEsp32ReadingPayload>;

  try {
    payload = parseEsp32ReadingPayload(body);
  } catch (error) {
    console.warn("[HydroWatch Ingestion] Invalid ESP32 payload", {
      body,
      error: error instanceof Error ? error.message : error,
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid ESP32 payload" },
      { status: 400 },
    );
  }

  try {
    const reading = await ingestEsp32Reading(payload);

    return NextResponse.json({
      ok: true,
      reading,
      receivedAt: createUtcTimestamp(),
    });
  } catch (error) {
    console.error("[HydroWatch Ingestion] Failed to store ESP32 reading", {
      error,
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasActiveSensorUserId: Boolean(process.env.ACTIVE_SENSOR_USER_ID),
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to store ESP32 reading",
        details: process.env.NODE_ENV === "production" ? undefined : serializeIngestionError(error),
      },
      { status: 500 },
    );
  }
}

function serializeIngestionError(error: unknown) {
  if (typeof error !== "object" || error === null) return error;

  return {
    name: "name" in error ? error.name : undefined,
    message: "message" in error ? error.message : undefined,
    code: "code" in error ? error.code : undefined,
    details: "details" in error ? error.details : undefined,
    hint: "hint" in error ? error.hint : undefined,
  };
}
