import { EngineSettings, SystemAlert, WaterReading } from "@/types/hydrowatch";
import { anomalyScore } from "@/utils/hydrowatch-analytics";
import { createUtcTimestamp } from "@/utils/time-format";

function createAlert(alert: Omit<SystemAlert, "id" | "timestamp">): SystemAlert {
  return {
    ...alert,
    id: crypto.randomUUID(),
    timestamp: createUtcTimestamp(),
  };
}

export function evaluateAlerts(
  reading: WaterReading,
  history: WaterReading[],
  settings: EngineSettings,
): SystemAlert[] {
  const alerts: SystemAlert[] = [];
  const latest = [...history.slice(-6), reading];
  const turbidityValues = latest.map((x) => x.turbidity);

  if (reading.turbidity >= 51) {
    alerts.push(
      createAlert({
        severity: "Critical",
        title: "Critical Turbidity",
        type: "high_turbidity",
        message: `High turbidity detected at ${reading.turbidity} NTU.`,
        action: "Inspect intake filter and flush line immediately.",
        ntuValue: reading.turbidity,
      }),
    );
  }

  const slope =
    latest.length >= 2
      ? latest[latest.length - 1].turbidity - latest[latest.length - 2].turbidity
      : 0;
  if (slope >= 10 * settings.alertSensitivity) {
    alerts.push(
      createAlert({
        severity: "Warning",
        title: "Rapid Increase",
        type: "rapid_increase",
        message: `Rapid rise detected (+${slope.toFixed(1)} NTU).`,
        action: "Increase sampling frequency and verify upstream conditions.",
        ntuValue: reading.turbidity,
      }),
    );
  }

  if (reading.turbidity >= 81) {
    alerts.push(
      createAlert({
        severity: "Critical",
        title: "Critical Value Detected",
        type: "high_turbidity",
        message: `Critical turbidity value reached ${reading.turbidity} NTU.`,
        action: "Stop downstream distribution and perform immediate water quality inspection.",
        ntuValue: reading.turbidity,
      }),
    );
  }

  const score = anomalyScore(turbidityValues);
  if (score > 2.8) {
    alerts.push(
      createAlert({
        severity: "Informational",
        title: "Sensor Stability Check",
        type: "sensor_stability",
        message: "Sensor instability signature detected.",
        action: "Run self-test and inspect probe cabling.",
        ntuValue: reading.turbidity,
      }),
    );
  }

  return alerts;
}
