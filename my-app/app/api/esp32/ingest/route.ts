import { NextRequest, NextResponse } from "next/server";
import { ingestEsp32Reading, parseEsp32ReadingPayload } from "@/services/iot-ingestion";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  let payload: ReturnType<typeof parseEsp32ReadingPayload>;

  try {
    payload = parseEsp32ReadingPayload(body);
  } catch (error) {
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
      receivedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to store ESP32 reading" },
      { status: 500 },
    );
  }
}
