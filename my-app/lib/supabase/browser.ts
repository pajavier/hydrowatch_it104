import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database.types";

export type HydrowatchDatabase = Database;

let client: ReturnType<typeof createClient<Database>> | null = null;
let clientAccessToken: string | null = null;

export function getDataSupabaseClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  console.info("[HydroWatch Supabase] Client initialization check", {
    hasUrl: Boolean(url),
    hasAnonKey: Boolean(key),
    urlHost: safeHost(url),
    reusedClient: Boolean(client && clientAccessToken === accessToken),
  });

  if (!url || !key) {
    console.error("[HydroWatch Supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return null;
  }

  if (!client || clientAccessToken !== accessToken) {
    client = createClient<Database>(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
    clientAccessToken = accessToken;
    client.realtime.setAuth(accessToken);
  }

  console.info("[HydroWatch Supabase] Data client ready", {
    urlHost: safeHost(url),
  });

  return client;
}

function safeHost(url?: string) {
  if (!url) return null;

  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}
