import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.turbidity !== "number") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    message: "ESP32 payload accepted",
    receivedAt: new Date().toISOString(),
  });
}
