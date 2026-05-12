export type TurbidityStatus = "Clear" | "Cloudy" | "Very Cloudy";

export type PredictionLabel =
  | "Critical Condition Expected"
  | "Stable Trend"
  | "Rising Turbidity";

export type AlertSeverity = "Critical" | "Warning" | "Informational";

export type ReadingSource = "simulated" | "esp32";

export type WaterReading = {
  id: string;
  turbidity: number;
  waterLevel: number;
  flowRate: number;
  status: TurbidityStatus;
  prediction: PredictionLabel;
  predictionConfidence: number;
  source: ReadingSource;
  createdAt: string;
};

export type PredictionResult = {
  label: PredictionLabel;
  confidence: number;
  projectedNTU: number;
  slope: number;
};

export type SystemAlert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  type:
    | "high_turbidity"
    | "rapid_increase"
    | "sensor_disconnect"
    | "flow_anomaly"
    | "water_level_abnormal";
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
