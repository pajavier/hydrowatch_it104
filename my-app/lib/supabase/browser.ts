import { createClient } from "@supabase/supabase-js";
import { AlertSeverity, PredictionLabel } from "@/types/hydrowatch";

export type HydrowatchDatabase = {
  public: {
    Tables: {
      water_readings: {
        Row: {
          id: string | number;
          user_id: string;
          turbidity: number | string;
          created_at: string;
        };
        Insert: {
          id?: string | number;
          user_id: string;
          turbidity: number;
          created_at?: string;
        };
        Update: Partial<HydrowatchDatabase["public"]["Tables"]["water_readings"]["Insert"]>;
      };
      predictions: {
        Row: Record<string, unknown>;
        Insert: {
          user_id: string;
          reading_id: string | number;
          label: PredictionLabel;
          confidence: number;
          projected_ntu: number;
        };
        Update: Partial<HydrowatchDatabase["public"]["Tables"]["predictions"]["Insert"]>;
      };
      alerts: {
        Row: Record<string, unknown>;
        Insert: {
          id: string;
          user_id: string;
          severity: AlertSeverity;
          type: "high_turbidity" | "rapid_increase" | "sensor_stability";
          message: string;
          action: string;
          created_at: string;
        };
        Update: Partial<HydrowatchDatabase["public"]["Tables"]["alerts"]["Insert"]>;
      };
      system_logs: {
        Row: Record<string, unknown>;
        Insert: {
          id: string;
          user_id: string;
          severity: AlertSeverity;
          category: "reading" | "alert" | "prediction" | "system";
          message: string;
          created_at: string;
        };
        Update: Partial<HydrowatchDatabase["public"]["Tables"]["system_logs"]["Insert"]>;
      };
      sensor_health: {
        Row: {
          id: string;
          user_id: string;
          last_reading_at: string;
          last_successful_post_at: string | null;
          consecutive_failures: number;
          sensor_status: "ONLINE" | "OFFLINE";
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          last_reading_at?: string;
          last_successful_post_at?: string | null;
          consecutive_failures?: number;
          sensor_status?: "ONLINE" | "OFFLINE";
          updated_at?: string;
        };
        Update: Partial<HydrowatchDatabase["public"]["Tables"]["sensor_health"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

let client: ReturnType<typeof createClient<HydrowatchDatabase>> | null = null;
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
    client = createClient<HydrowatchDatabase>(url, key, {
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
