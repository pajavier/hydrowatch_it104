import Papa from "papaparse";
import { DatasetReading } from "@/services/simulation-dataset";

const DATASET_PATHS = [
  "/data/water_readings.csv",
  "/data/waterReadingDataSet.csv",
];

type CsvRow = Record<string, string | number | null | undefined>;

function normalizeKey(key: string) {
  return key.trim().toLowerCase().replace(/\s+/g, "_");
}

function readNumber(row: CsvRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value === null || value === undefined || value === "") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function readString(row: CsvRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && `${value}`.trim() !== "") {
      return `${value}`;
    }
  }
  return null;
}

function normalizeRow(row: CsvRow) {
  return Object.entries(row).reduce<CsvRow>((normalized, [key, value]) => {
    normalized[normalizeKey(key)] = value;
    return normalized;
  }, {});
}

function fallbackWaterLevel(turbidity: number, index: number) {
  return Math.max(45, Math.min(86, Math.round(78 - turbidity * 0.16 + Math.sin(index / 5) * 3)));
}

function fallbackFlowRate(turbidity: number, index: number) {
  return Number(Math.max(7, Math.min(27, 22 - turbidity * 0.07 + Math.cos(index / 4) * 1.5)).toFixed(1));
}

function toDatasetReading(rawRow: CsvRow, index: number): DatasetReading | null {
  const row = normalizeRow(rawRow);
  const turbidity = readNumber(row, ["turbidity", "ntu"]);

  if (turbidity === null) return null;

  return {
    createdAt: readString(row, ["created_at", "createdat", "timestamp", "time"]) ?? undefined,
    turbidity: Number(turbidity.toFixed(2)),
    waterLevel:
      readNumber(row, ["water_level", "waterlevel", "level"]) ?? fallbackWaterLevel(turbidity, index),
    flowRate:
      readNumber(row, ["flow_rate", "flowrate", "flow"]) ?? fallbackFlowRate(turbidity, index),
  };
}

async function fetchDatasetCsv() {
  for (const path of DATASET_PATHS) {
    const response = await fetch(path, { cache: "no-store" });
    if (response.ok) {
      return response.text();
    }
  }

  throw new Error(`CSV dataset not found at ${DATASET_PATHS.join(" or ")}`);
}

export async function loadWaterReadingsCsv(): Promise<DatasetReading[]> {
  const csv = await fetchDatasetCsv();

  const parsed = Papa.parse<CsvRow>(csv, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
    transformHeader: normalizeKey,
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error(parsed.errors[0].message);
  }

  return parsed.data
    .map((row, index) => toDatasetReading(row, index))
    .filter((reading): reading is DatasetReading => reading !== null);
}
