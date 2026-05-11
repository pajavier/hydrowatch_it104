import { createClient } from "@supabase/supabase-js";
import { AlertSeverity, PredictionLabel, ReadingSource, TurbidityStatus } from "@/types/hydrowatch";

type HydrowatchDatabase = {
  public: {
    Tables: {
      water_readings: {
        Row: Record<string, unknown>;
        Insert: {
          id: string;
          turbidity: number;
          water_level: number;
          flow_rate: number;
          status: TurbidityStatus;
          prediction: PredictionLabel;
          prediction_confidence: number;
          source: ReadingSource;
          created_at: string;
        };
        Update: Partial<HydrowatchDatabase["public"]["Tables"]["water_readings"]["Insert"]>;
      };
      predictions: {
        Row: Record<string, unknown>;
        Insert: {
          reading_id: string;
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
          severity: AlertSeverity;
          type: "high_turbidity" | "rapid_increase" | "sensor_disconnect" | "flow_anomaly" | "water_level_abnormal";
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
          severity: AlertSeverity;
          category: "reading" | "alert" | "prediction" | "system";
          message: string;
          created_at: string;
        };
        Update: Partial<HydrowatchDatabase["public"]["Tables"]["system_logs"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

let client: ReturnType<typeof createClient<HydrowatchDatabase>> | null = null;

export function getDataSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client ??= createClient<HydrowatchDatabase>(url, key);
  return client;
}
