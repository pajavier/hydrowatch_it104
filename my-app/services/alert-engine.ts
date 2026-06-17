import { EngineSettings, SystemAlert, WaterReading } from "@/types/hydrowatch";
import { anomalyScore } from "@/utils/hydrowatch-analytics";

function createAlert(reading: WaterReading, alert: Omit<SystemAlert, "id" | "timestamp">): SystemAlert {
  return {
    ...alert,
    id: createStableAlertId(reading, alert),
    timestamp: reading.createdAt,
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
      createAlert(reading, {
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
      createAlert(reading, {
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
      createAlert(reading, {
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
      createAlert(reading, {
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

function createStableAlertId(reading: WaterReading, alert: Omit<SystemAlert, "id" | "timestamp">) {
  return stableUuidFromString([
    reading.id,
    reading.createdAt,
    alert.severity,
    alert.title,
    alert.type,
    alert.ntuValue,
  ].join("|"));
}

function stableUuidFromString(value: string) {
  const [a, b, c, d] = cyrb128(value);
  const part1 = hex32(a);
  const part2 = hex16(b >>> 16);
  const part3 = hex16((b & 0x0fff) | 0x4000);
  const part4 = hex16(((c >>> 16) & 0x3fff) | 0x8000);
  const part5 = `${hex16(c & 0xffff)}${hex32(d)}`;

  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

function cyrb128(value: string) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;

  for (let index = 0; index < value.length; index += 1) {
    const k = value.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 = (h1 ^ h2 ^ h3 ^ h4) >>> 0;
  h2 = (h2 ^ h1) >>> 0;
  h3 = (h3 ^ h1) >>> 0;
  h4 = (h4 ^ h1) >>> 0;

  return [h1, h2, h3, h4];
}

function hex32(value: number) {
  return value.toString(16).padStart(8, "0");
}

function hex16(value: number) {
  return (value & 0xffff).toString(16).padStart(4, "0");
}
