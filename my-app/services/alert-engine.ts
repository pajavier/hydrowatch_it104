import { EngineSettings, SystemAlert, WaterReading } from "@/types/hydrowatch";
import { anomalyScore } from "@/utils/hydrowatch-analytics";

function createAlert(alert: Omit<SystemAlert, "id" | "timestamp">): SystemAlert {
  return {
    ...alert,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
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

  if (reading.turbidity >= settings.thresholds.criticalMin) {
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

  if (reading.turbidity >= settings.thresholds.criticalMin + 30) {
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

  if (reading.flowRate < 10 || reading.flowRate > 26) {
    alerts.push(
      createAlert({
        severity: "Warning",
        title: "Flow Anomaly",
        type: "flow_anomaly",
        message: `Flow anomaly at ${reading.flowRate} L/min.`,
        action: "Check valve state and pump operation.",
        ntuValue: reading.turbidity,
      }),
    );
  }

  if (reading.waterLevel < 55 || reading.waterLevel > 82) {
    alerts.push(
      createAlert({
        severity: "Warning",
        title: "Water Level Abnormal",
        type: "water_level_abnormal",
        message: `Water level abnormal at ${reading.waterLevel}%.`,
        action: "Inspect tank level sensor and inlet feed.",
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
        type: "sensor_disconnect",
        message: "Sensor instability signature detected.",
        action: "Run self-test and inspect probe cabling.",
        ntuValue: reading.turbidity,
      }),
    );
  }

  return alerts;
}
