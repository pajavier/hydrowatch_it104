import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getActiveSensorUserId } from "@/config/hydrowatch-admin";
import { createUtcTimestamp } from "@/utils/time-format";

/**
 * Health Check Endpoint for ESP32
 * Returns current sensor status and last reading timestamp
 * Helps ESP32 determine if it's properly connected
 */

function getServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase configuration");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET() {
  const supabase = getServerSupabaseClient();
  const sensorUserId = getActiveSensorUserId();
  const currentTime = createUtcTimestamp();

  try {
    // Get sensor health status
    const { data: healthData, error: healthError } = await supabase
      .from("sensor_health")
      .select(
        "sensor_status,last_reading_at,last_successful_post_at,consecutive_failures,signal_strength_dbm",
      )
      .eq("user_id", sensorUserId)
      .single();

    if (healthError && healthError.code !== "PGRST116") {
      throw healthError;
    }

    // Get latest reading
    const { data: latestReadings, error: readingError } = await supabase
      .from("water_readings")
      .select("id,turbidity,created_at")
      .eq("user_id", sensorUserId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (readingError) throw readingError;

    const latestReading = latestReadings?.[0];
    const lastReadingTime = latestReading?.created_at
      ? new Date(latestReading.created_at).getTime()
      : null;
    const currentTimeMs = new Date(currentTime).getTime();
    const secondsSinceLastReading = lastReadingTime
      ? (currentTimeMs - lastReadingTime) / 1000
      : null;

    const isHealthy = healthData?.sensor_status === "ONLINE" && secondsSinceLastReading !== null && secondsSinceLastReading <= 40;

    return NextResponse.json({
      ok: true,
      timestamp: currentTime,
      sensorStatus: {
        healthy: isHealthy,
        status: healthData?.sensor_status || "UNKNOWN",
        lastReadingAt: latestReading?.created_at || null,
        secondsSinceLastReading: secondsSinceLastReading || null,
        consecutiveFailures: healthData?.consecutive_failures || 0,
        signalStrength: healthData?.signal_strength_dbm || null,
      },
      latestReading: latestReading
        ? {
            id: latestReading.id,
            turbidity: latestReading.turbidity,
            createdAt: latestReading.created_at,
          }
        : null,
      recommendations:
        isHealthy ? [] : generateRecommendations(healthData, secondsSinceLastReading),
    });
  } catch (error) {
    console.error("[HydroWatch Health Check] Error", {
      error: error instanceof Error ? error.message : error,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to retrieve sensor health status",
        details: process.env.NODE_ENV === "production" ? undefined : error,
      },
      { status: 500 },
    );
  }
}

function generateRecommendations(
  healthData: { consecutive_failures?: number } | null,
  secondsSinceLastReading: number | null,
): string[] {
  const recommendations: string[] = [];

  if (secondsSinceLastReading === null) {
    recommendations.push("No readings received yet. Verify sensor is powered and connected.");
    return recommendations;
  }

  if (secondsSinceLastReading > 40) {
    recommendations.push("Last reading was over 40 seconds ago. Check WiFi connection.");
    recommendations.push("Verify the ingestion endpoint URL is correct.");
    recommendations.push("Check ESP32 serial logs for connection errors.");
  }

  if ((healthData?.consecutive_failures || 0) > 3) {
    recommendations.push("Multiple consecutive failures detected.");
    recommendations.push("Restart the ESP32 device.");
    recommendations.push("Verify network connectivity at the sensor location.");
  }

  return recommendations;
}
