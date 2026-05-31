import { createClient } from "@supabase/supabase-js";
import { createUtcTimestamp } from "@/utils/time-format";
export type Esp32ReadingPayload = {
  turbidity: number;
  createdAt?: string;
};

function getServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase server environment variables are not configured.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function parseEsp32ReadingPayload(body: unknown): Esp32ReadingPayload {
  const turbidity = Number((body as { turbidity?: unknown } | null)?.turbidity);
  const createdAt = (body as { createdAt?: unknown } | null)?.createdAt;

  if (!Number.isFinite(turbidity) || turbidity < 0) {
    throw new Error("Payload must include a non-negative numeric turbidity value.");
  }

  if (createdAt !== undefined && typeof createdAt !== "string") {
    throw new Error("createdAt must be an ISO timestamp string when provided.");
  }

  return {
    turbidity,
    createdAt,
  };
}

export async function ingestEsp32Reading(payload: Esp32ReadingPayload) {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase
    .from("water_readings")
    .insert({
      turbidity: payload.turbidity,
      created_at: payload.createdAt ?? createUtcTimestamp(),
    })
    .select("id,turbidity,created_at")
    .single();

  if (error) throw error;
  return data;
}
