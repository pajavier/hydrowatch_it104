import { NextRequest, NextResponse } from "next/server";
import { proxyEsp32Request, requireHydrowatchUser } from "@/services/esp32-device-api";

export async function GET(req: NextRequest) {
  const auth = await requireHydrowatchUser(req);
  if ("error" in auth) return auth.error;

  return proxyEsp32Request("status");
}

export async function POST(req: NextRequest) {
  const auth = await requireHydrowatchUser(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const ssid = typeof body?.ssid === "string" ? body.ssid.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!ssid) {
    return NextResponse.json({ error: "WiFi SSID is required." }, { status: 400 });
  }

  if (!password) {
    return NextResponse.json({ error: "WiFi password is required." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "WiFi password must be at least 8 characters." }, { status: 400 });
  }

  console.log("[ESP32 WIFI UPDATE]", {
    ssid,
    password: maskSecret(password),
    passwordLength: password.length,
  });

  return proxyEsp32Request("wifi", {
    method: "POST",
    body: { ssid, password },
    acceptNetworkDrop: true,
  });
}

function maskSecret(value: string) {
  return "*".repeat(value.length);
}
