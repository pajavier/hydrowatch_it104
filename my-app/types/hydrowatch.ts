export type TurbidityStatus = "Safe" | "Slightly Cloudy" | "Cloudy" | "Very Cloudy";

export type PredictionLabel =
  | "Critical Condition Expected"
  | "Stable Trend"
  | "Rising Turbidity";

export type AlertSeverity = "Critical" | "Warning" | "Informational";

export type WaterReading = {
  id: string | number;
  turbidity: number;
  status: TurbidityStatus;
  prediction: PredictionLabel;
  predictionConfidence: number;
  projectedNTU?: number;
  predictionSlope?: number;
  predictedCriticalAt?: string | null;
  minutesToCritical?: number | null;
  createdAt: string;
};

export type PredictionResult = {
  label: PredictionLabel;
  confidence: number;
  projectedNTU: number;
  slope: number;
  predictedCriticalAt: string | null;
  minutesToCritical: number | null;
};

export type SystemAlert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  type: "high_turbidity" | "rapid_increase" | "sensor_stability";
  message: string;
  action: string;
  ntuValue: number;
  timestamp: string;
};

export type SystemLog = {
  id: string;
  severity: AlertSeverity;
  message: string;
  timestamp: string;
  category: "reading" | "alert" | "prediction" | "system";
};

export type ThresholdSettings = {
  clearMax: number;
  cloudyMax: number;
  criticalMin: number;
};

export type EngineSettings = {
  thresholds: ThresholdSettings;
  alertSensitivity: number;
  refreshIntervalMs: number;
  predictionAggressiveness: number;
};
