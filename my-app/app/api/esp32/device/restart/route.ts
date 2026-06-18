import { NextRequest } from "next/server";
import { proxyEsp32Request, requireHydrowatchUser } from "@/services/esp32-device-api";

export async function POST(req: NextRequest) {
  const auth = await requireHydrowatchUser(req);
  if ("error" in auth) return auth.error;

  return proxyEsp32Request("restart", { method: "POST", acceptNetworkDrop: true });
}
