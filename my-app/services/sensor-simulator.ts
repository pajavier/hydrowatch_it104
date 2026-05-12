import { EngineSettings, WaterReading } from "@/types/hydrowatch";
import { classifyTurbidity, predictTurbidity } from "@/utils/hydrowatch-analytics";
import { DatasetReading } from "./simulation-dataset";

export class SensorSimulator {
  private cursor = 0;
  private dataset: DatasetReading[] = [];

  setDataset(dataset: DatasetReading[]) {
    this.dataset = dataset;
    this.cursor = 0;
  }

  hasDataset() {
    return this.dataset.length > 0;
  }

  next(history: WaterReading[], settings: EngineSettings): WaterReading {
    if (!this.hasDataset()) {
      throw new Error("Sensor simulator has no CSV dataset loaded.");
    }

    const sample = this.dataset[this.cursor];
    this.cursor = (this.cursor + 1) % this.dataset.length;

    const draft = [...history.slice(-50)].concat({
      id: crypto.randomUUID(),
      turbidity: sample.turbidity,
      waterLevel: sample.waterLevel,
      flowRate: sample.flowRate,
      status: "Clear",
      prediction: "Stable Trend",
      predictionConfidence: 60,
      source: "esp32",
      createdAt: new Date().toISOString(),
    });
    const prediction = predictTurbidity(
      draft,
      settings.thresholds.criticalMin,
      settings.predictionAggressiveness,
    );

    return {
      id: crypto.randomUUID(),
      turbidity: sample.turbidity,
      waterLevel: sample.waterLevel,
      flowRate: sample.flowRate,
      status: classifyTurbidity(sample.turbidity, settings.thresholds),
      prediction: prediction.label,
      predictionConfidence: prediction.confidence,
      source: "esp32",
      createdAt: new Date().toISOString(),
    };
  }
}
