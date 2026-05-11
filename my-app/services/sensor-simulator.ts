import { EngineSettings, WaterReading } from "@/types/hydrowatch";
import { classifyTurbidity, predictTurbidity } from "@/utils/hydrowatch-analytics";

type Scenario =
  | "clear"
  | "moderate_cloudiness"
  | "heavy_spike"
  | "sensor_instability"
  | "gradual_contamination";

type SimulatorState = {
  scenario: Scenario;
  tick: number;
  turbidity: number;
  waterLevel: number;
  flowRate: number;
};

const scenarios: Scenario[] = [
  "clear",
  "moderate_cloudiness",
  "heavy_spike",
  "sensor_instability",
  "gradual_contamination",
];

function random(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export class SensorSimulator {
  private state: SimulatorState = {
    scenario: "clear",
    tick: 0,
    turbidity: 34,
    waterLevel: 72,
    flowRate: 20,
  };

  next(history: WaterReading[], settings: EngineSettings): WaterReading {
    if (this.state.tick % 18 === 0 && this.state.tick > 0) {
      this.state.scenario = scenarios[Math.floor(random(0, scenarios.length))];
    }

    this.state.tick += 1;
    const noise = random(-2.8, 2.8);
    const minuteWave = Math.sin(this.state.tick / 5) * 0.9;

    switch (this.state.scenario) {
      case "clear":
        this.state.turbidity = clamp(28 + random(-6, 8) + minuteWave + noise, 20, 49);
        this.state.flowRate = clamp(21 + random(-1.4, 1.2), 16, 25);
        this.state.waterLevel = clamp(70 + Math.sin(this.state.tick / 8) * 3 + random(-1, 1), 61, 79);
        break;
      case "moderate_cloudiness":
        this.state.turbidity = clamp(58 + random(-10, 12) + noise, 45, 82);
        this.state.flowRate = clamp(19 + random(-2, 1.5), 12, 24);
        this.state.waterLevel = clamp(68 + random(-2, 2), 60, 78);
        break;
      case "heavy_spike":
        this.state.turbidity = clamp(92 + random(-14, 30) + noise * 2, 66, 150);
        this.state.flowRate = clamp(17 + random(-4, 2), 9, 24);
        this.state.waterLevel = clamp(66 + random(-4, 3), 52, 80);
        break;
      case "sensor_instability":
        this.state.turbidity = clamp(this.state.turbidity + random(-18, 18), 18, 160);
        this.state.flowRate = clamp(this.state.flowRate + random(-5, 5), 8, 28);
        this.state.waterLevel = clamp(this.state.waterLevel + random(-4, 4), 50, 84);
        break;
      case "gradual_contamination":
        this.state.turbidity = clamp(this.state.turbidity + random(1.4, 4.7) + minuteWave, 30, 170);
        this.state.flowRate = clamp(18 + random(-1.8, 1.3), 11, 24);
        this.state.waterLevel = clamp(69 + random(-2, 2), 58, 80);
        break;
      default:
        break;
    }

    const draft = [...history.slice(-50)].concat({
      id: crypto.randomUUID(),
      turbidity: Math.round(this.state.turbidity),
      waterLevel: Math.round(this.state.waterLevel),
      flowRate: Number(this.state.flowRate.toFixed(1)),
      status: "Clear",
      prediction: "Stable Trend",
      predictionConfidence: 60,
      source: "simulated",
      createdAt: new Date().toISOString(),
    });
    const prediction = predictTurbidity(
      draft,
      settings.thresholds.criticalMin,
      settings.predictionAggressiveness,
    );

    const turbidity = Math.round(this.state.turbidity);
    return {
      id: crypto.randomUUID(),
      turbidity,
      waterLevel: Math.round(this.state.waterLevel),
      flowRate: Number(this.state.flowRate.toFixed(1)),
      status: classifyTurbidity(turbidity, settings.thresholds),
      prediction: prediction.label,
      predictionConfidence: prediction.confidence,
      source: "simulated",
      createdAt: new Date().toISOString(),
    };
  }
}
