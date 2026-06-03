import {
  PredictionResult,
  TurbidityStatus,
  WaterReading,
} from "@/types/hydrowatch";
import { getUtcTimestampMs } from "@/utils/time-format";

const FALLBACK_READING_INTERVAL_MINUTES = 5 / 60;
const REGRESSION_WINDOW_SIZE = 12;

export function classifyTurbidity(value: number): TurbidityStatus {
  if (value <= 5) return "Safe";
  if (value <= 20) return "Slightly Cloudy";
  if (value <= 50) return "Cloudy";
  return "Very Cloudy";
}

export function predictTurbidity(
  readings: WaterReading[],
  criticalMin: number,
  aggressiveness: number,
): PredictionResult {
  const last = readings.slice(-REGRESSION_WINDOW_SIZE);
  const latest = last.at(-1) ?? readings.at(-1);
  if (last.length < 3) {
    return {
      label: "Stable Trend",
      confidence: 62,
      projectedNTU: latest?.turbidity ?? 0,
      slope: 0,
      predictedCriticalAt: null,
      minutesToCritical: null,
    };
  }

  const { averageStepMinutes, points } = toRegressionWindow(last);
  const { intercept, rSquared, slope } = linearRegression(points);
  const latestPoint = points.at(-1);
  const latestTurbidity = latest?.turbidity ?? 0;

  if (!latestPoint) {
    return {
      label: "Stable Trend",
      confidence: 62,
      projectedNTU: latestTurbidity,
      slope: 0,
      predictedCriticalAt: null,
      minutesToCritical: null,
    };
  }

  const futureIntervals = Math.max(1, Math.round(2 + aggressiveness));
  const forecastX = latestPoint.x + averageStepMinutes * futureIntervals;
  const projectedNTU = Math.max(0, intercept + slope * forecastX);
  const projectedDelta = projectedNTU - latestTurbidity;
  const currentReadingIsCritical = latestTurbidity >= criticalMin;
  const thresholdCrossingX = slope > 0 ? (criticalMin - intercept) / slope : null;
  const minutesToCritical =
    currentReadingIsCritical
      ? 0
      : thresholdCrossingX !== null &&
          Number.isFinite(thresholdCrossingX) &&
          thresholdCrossingX > latestPoint.x
        ? Number((thresholdCrossingX - latestPoint.x).toFixed(2))
        : null;
  const predictedCriticalAt =
    currentReadingIsCritical
      ? latest?.createdAt ?? null
      : minutesToCritical !== null && latest
        ? new Date(getUtcTimestampMs(latest.createdAt) + minutesToCritical * 60 * 1000).toISOString()
        : null;

  const confidence = computePredictionConfidence({
    criticalMin,
    sampleCount: last.length,
    projectedDelta,
    projectedNTU,
    rSquared,
  });

  if (currentReadingIsCritical || projectedNTU >= criticalMin) {
    return {
      confidence: Math.round(confidence),
      projectedNTU: Math.round(projectedNTU),
      slope: Number(slope.toFixed(2)),
      label: "Critical Condition Expected",
      predictedCriticalAt,
      minutesToCritical,
    };
  }

  if (projectedDelta >= 2 || (minutesToCritical !== null && minutesToCritical <= 60)) {
    return {
      label: "Rising Turbidity",
      confidence: Math.round(confidence),
      projectedNTU: Math.round(projectedNTU),
      slope: Number(slope.toFixed(2)),
      predictedCriticalAt,
      minutesToCritical,
    };
  }

  return {
    label: "Stable Trend",
    confidence: Math.round(confidence),
    projectedNTU: Math.round(projectedNTU),
    slope: Number(slope.toFixed(2)),
    predictedCriticalAt,
    minutesToCritical,
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

function computePredictionConfidence({
  criticalMin,
  projectedDelta,
  projectedNTU,
  rSquared,
  sampleCount,
}: {
  criticalMin: number;
  projectedDelta: number;
  projectedNTU: number;
  rSquared: number;
  sampleCount: number;
}) {
  const fitContribution = Math.max(0, Math.min(25, rSquared * 25));
  const sampleContribution = Math.min(15, sampleCount * 1.5);
  const trendContribution = Math.min(12, Math.abs(projectedDelta) * 3);
  const riskContribution = Math.max(0, Math.min(10, ((projectedNTU - criticalMin) / criticalMin) * 40));

  return Math.max(
    55,
    Math.min(97, 50 + fitContribution + sampleContribution + trendContribution + riskContribution),
  );
}

function linearRegression(points: Array<{ x: number; y: number }>) {
  const count = points.length;
  const sumX = points.reduce((total, point) => total + point.x, 0);
  const sumY = points.reduce((total, point) => total + point.y, 0);
  const sumXY = points.reduce((total, point) => total + point.x * point.y, 0);
  const sumX2 = points.reduce((total, point) => total + point.x * point.x, 0);
  const denominator = count * sumX2 - sumX * sumX;
  const slope = denominator === 0 ? 0 : (count * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / count;
  const meanY = sumY / count;
  const ssTot = points.reduce((total, point) => total + Math.pow(point.y - meanY, 2), 0);
  const ssRes = points.reduce(
    (total, point) => total + Math.pow(point.y - (intercept + slope * point.x), 2),
    0,
  );
  const rSquared = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return { intercept, rSquared, slope };
}

function toRegressionWindow(readings: WaterReading[]) {
  const timestamps = readings.map((reading) => getUtcTimestampMs(reading.createdAt));
  const firstTimestamp = timestamps[0];
  const hasValidTimeAxis =
    Number.isFinite(firstTimestamp) &&
    timestamps.every((timestamp) => Number.isFinite(timestamp)) &&
    new Set(timestamps).size > 1;

  const fallbackPoints = readings.map((reading, index) => ({
    x: index * FALLBACK_READING_INTERVAL_MINUTES,
    y: reading.turbidity,
  }));

  if (!hasValidTimeAxis) {
    return {
      averageStepMinutes: FALLBACK_READING_INTERVAL_MINUTES,
      points: fallbackPoints,
    };
  }

  const points = readings.map((reading, index) => ({
    x: Math.max(0, (timestamps[index] - firstTimestamp) / 60000),
    y: reading.turbidity,
  }));
  const intervals = points
    .slice(1)
    .map((point, index) => point.x - points[index].x)
    .filter((interval) => Number.isFinite(interval) && interval > 0);
  const averageStepMinutes =
    intervals.length > 0
      ? intervals.reduce((total, interval) => total + interval, 0) / intervals.length
      : FALLBACK_READING_INTERVAL_MINUTES;

  return {
    averageStepMinutes,
    points,
  };
}
