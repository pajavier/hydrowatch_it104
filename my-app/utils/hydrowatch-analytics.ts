import {
  PredictionResult,
  TurbidityStatus,
  WaterReading,
  ThresholdSettings,
} from "@/types/hydrowatch";

export function classifyTurbidity(
  value: number,
  thresholds: ThresholdSettings,
): TurbidityStatus {
  if (value >= thresholds.criticalMin) {
    return "Very Cloudy";
  }
  if (value > thresholds.clearMax) {
    return "Cloudy";
  }
  return "Clear";
}

export function predictTurbidity(
  readings: WaterReading[],
  criticalMin: number,
  aggressiveness: number,
): PredictionResult {
  const last = readings.slice(-8);
  if (last.length < 3) {
    return {
      label: "Stable Trend",
      confidence: 62,
      projectedNTU: readings.at(-1)?.turbidity ?? 0,
      slope: 0,
    };
  }

  const values = last.map((r) => r.turbidity);
  const weightedSlope = values.reduce((acc, value, index) => {
    if (index === 0) return acc;
    const weight = 0.6 + index / values.length;
    return acc + (value - values[index - 1]) * weight;
  }, 0) / (values.length - 1);

  const movingAverage =
    values.slice(-5).reduce((sum, n) => sum + n, 0) / Math.min(5, values.length);
  const projectedNTU = movingAverage + weightedSlope * (2 + aggressiveness);
  const riseRisk = Math.max(0, (projectedNTU - criticalMin) / criticalMin);
  const confidence = Math.max(
    55,
    Math.min(99, 62 + riseRisk * 120 + Math.abs(weightedSlope) * 3),
  );

  if (projectedNTU >= criticalMin) {
    return {
      label: "Critical Condition Expected",
      confidence: Math.round(confidence),
      projectedNTU: Math.round(projectedNTU),
      slope: Number(weightedSlope.toFixed(2)),
    };
  }

  if (weightedSlope >= 3) {
    return {
      label: "Rising Turbidity",
      confidence: Math.round(confidence),
      projectedNTU: Math.round(projectedNTU),
      slope: Number(weightedSlope.toFixed(2)),
    };
  }

  return {
    label: "Stable Trend",
    confidence: Math.round(100 - Math.min(40, Math.abs(weightedSlope) * 5)),
    projectedNTU: Math.round(projectedNTU),
    slope: Number(weightedSlope.toFixed(2)),
  };
}

export function anomalyScore(values: number[]) {
  if (values.length < 4) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const latest = values.at(-1) ?? mean;
  return stdDev === 0 ? 0 : Math.abs((latest - mean) / stdDev);
}
