"use client";

import { ReactNode } from "react";
import { SystemAlert, WaterReading } from "@/types/hydrowatch";
import { WaterSampleVisualization } from "./WaterSampleVisualization";

type Props = {
  accessToken: string;
  readings: WaterReading[];
  alerts: SystemAlert[];
  isLive: boolean;
  isLoadingReadings: boolean;
  readingsError: string | null;
  healthScore: number;
  waterQualityScore: number;
  uptimeHours: string;
};

export function Dashboard({
  accessToken,
  readings,
  alerts,
  isLive,
  isLoadingReadings,
  readingsError,
  healthScore,
  waterQualityScore,
  uptimeHours,
}: Props) {
  const latest = readings.at(-1);
  const trend = readings.length > 1 ? latest!.turbidity - readings[readings.length - 2].turbidity : 0;
  const statusTone = latest?.status === "Very Cloudy" ? "critical" : latest?.status === "Cloudy" || latest?.status === "Slightly Cloudy" ? "warning" : "normal";
  const latestEvents = readings.slice(-5).reverse();

  return (
    <>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-extrabold">Dashboard</h2>
            <p className="text-sm text-slate-400">Real-time analytics from ESP32 telemetry</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${isLive ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-700 text-slate-300"}`}>
            {isLive ? "LIVE" : "PAUSED"}
          </span>
        </div>

        {isLoadingReadings ? <div className="h-[420px] animate-pulse rounded-3xl bg-white/10" /> : !latest ? (
          <>
            <WaterSampleVisualization />

            <PredictionAnalysis
              confidence="--"
              forecastSummary={
                readingsError
                  ? `Unable to load Supabase readings: ${readingsError}`
                  : "Waiting for ESP32 turbidity readings."
              }
              tone="normal"
              trend="Pending"
            />

            <TrendPanel readings={[]} tone="normal" />

            <SupportingPanels
              accessToken={accessToken}
              alerts={alerts}
              healthScore={healthScore}
              latestEvents={latestEvents}
              latestReading="Waiting"
              uptimeHours={uptimeHours}
              waterQualityScore={waterQualityScore}
            />
          </>
        ) : (
          <>
            <WaterSampleVisualization reading={latest} />

            <PredictionAnalysis
              confidence={`${latest.predictionConfidence}%`}
              forecastSummary={latest.prediction}
              tone={latest.prediction === "Critical Condition Expected" ? "critical" : latest.prediction === "Rising Turbidity" ? "warning" : "normal"}
              trend={`${trend >= 0 ? "+" : ""}${trend.toFixed(2)} NTU`}
            />

            <TrendPanel readings={readings.slice(-30)} tone={statusTone} />

            <SupportingPanels
              accessToken={accessToken}
              alerts={alerts}
              healthScore={healthScore}
              latestEvents={latestEvents}
              latestReading={`${latest.turbidity} NTU`}
              uptimeHours={uptimeHours}
              waterQualityScore={waterQualityScore}
            />
          </>
        )}
    </>
  );
}

function PredictionAnalysis({
  confidence,
  forecastSummary,
  tone,
  trend,
}: {
  confidence: string;
  forecastSummary: string;
  tone: "normal" | "warning" | "critical";
  trend: string;
}) {
  const accent = tone === "critical" ? "text-red-300" : tone === "warning" ? "text-yellow-300" : "text-sky-200";

  return (
    <section className="mt-4 rounded-3xl border border-white/10 bg-[#111A38] p-5 transition-colors duration-700">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-sky-300">Prediction Analysis</p>
          <h3 className="mt-1 text-2xl font-extrabold">Forecast Overview</h3>
        </div>
        <span className={`text-sm font-bold ${accent}`}>{forecastSummary}</span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <AnalysisStat label="Trend" value={trend} tone={tone} />
        <AnalysisStat label="Confidence" value={confidence} tone={tone} />
        <AnalysisStat label="Forecast Summary" value={forecastSummary} tone={tone} />
      </div>
    </section>
  );
}

function AnalysisStat({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "normal" | "warning" | "critical";
  value: string;
}) {
  const c = tone === "critical" ? "text-red-300" : tone === "warning" ? "text-yellow-300" : "text-sky-200";

  return (
    <article className="min-w-0 rounded-2xl border border-white/10 bg-[#0B1128] px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={`mt-2 truncate text-xl font-extrabold ${c}`}>{value}</p>
    </article>
  );
}

function TrendPanel({
  readings,
  tone,
}: {
  readings: WaterReading[];
  tone: "normal" | "warning" | "critical";
}) {
  return (
    <section className="mt-4 rounded-3xl border border-white/10 bg-[#111A38] p-5">
      <h3 className="font-extrabold">Turbidity Trend</h3>
      <div className="mt-4 flex h-72 items-center justify-center rounded-2xl bg-[#0B1128] p-3 text-sm text-slate-400">
        {readings.length < 2 ? "No turbidity readings yet." : <Trend readings={readings} tone={tone} />}
      </div>
    </section>
  );
}

function SupportingPanels({
  accessToken,
  alerts,
  healthScore,
  latestEvents,
  latestReading,
  uptimeHours,
  waterQualityScore,
}: {
  accessToken: string;
  alerts: SystemAlert[];
  healthScore: number;
  latestEvents: WaterReading[];
  latestReading: string;
  uptimeHours: string;
  waterQualityScore: number;
}) {
  return (
    <section className="mt-4 grid gap-4 lg:grid-cols-3">
      <Panel title="Alerts">
        {alerts.length === 0 && <p className="text-sm text-slate-400">No active alerts.</p>}
        {alerts.slice(0, 5).map((alert) => (
          <div className="mb-2 rounded-xl bg-white/5 p-3 transition-colors duration-500" key={alert.id}>
            <p className="text-sm font-bold">{alert.severity} - {alert.title}</p>
            <p className="text-xs text-slate-300">{alert.message}</p>
            <p className="text-xs text-slate-400">NTU {alert.ntuValue} - {alert.action}</p>
            <p className="mt-1 text-[11px] text-slate-500">{new Date(alert.timestamp).toLocaleTimeString()}</p>
          </div>
        ))}
      </Panel>
      <Panel title="Quick Info">
        <Info label="Monitoring Health" value={`${healthScore}%`} />
        <Info label="Water Quality" value={`${waterQualityScore}%`} />
        <Info label="Alert Summary" value={`${alerts.length} active`} />
        <Info label="Uptime" value={`${uptimeHours} hrs`} />
        <Info label="Latest Reading" value={latestReading} />
        <Info label="Session" value={`${accessToken.slice(0, 10)}...`} />
      </Panel>
      <Panel title="Recent Turbidity Events">
        {latestEvents.length === 0 && <p className="text-sm text-slate-400">No recent events.</p>}
        {latestEvents.map((event) => (
          <Info
            key={event.id}
            label={new Date(event.createdAt).toLocaleTimeString()}
            value={`${event.turbidity} NTU`}
          />
        ))}
      </Panel>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-3xl border border-white/10 bg-[#111A38] p-4"><h4 className="mb-3 font-extrabold">{title}</h4>{children}</section>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <div className="mb-2 flex justify-between rounded-xl bg-white/5 px-3 py-2 text-sm"><span className="text-slate-400">{label}</span><span className="font-bold">{value}</span></div>;
}
function Trend({ readings, tone }: { readings: WaterReading[]; tone: "normal" | "warning" | "critical" }) {
  if (readings.length < 2) return null;
  const w = 800;
  const h = 220;
  const p = 24;
  const max = 160;
  const stroke = tone === "critical" ? "#F87171" : tone === "warning" ? "#FACC15" : "#7DD3FC";
  const points = readings.map((r, i) => {
    const x = p + (i / (readings.length - 1)) * (w - p * 2);
    const y = h - p - (Math.min(r.turbidity, max) / max) * (h - p * 2);
    return `${x},${y}`;
  });
  return (
    <svg className="h-full w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" points={points.join(" ")} className="transition-all duration-700 ease-out" />
      {readings.map((reading, index) => {
        const [cx, cy] = points[index].split(",").map(Number);
        return (
          <circle
            className="transition-all duration-700 ease-out"
            cx={cx}
            cy={cy}
            fill={getPointColor(reading.status)}
            key={reading.id}
            r="5"
            stroke="#0B1128"
            strokeWidth="2"
          />
        );
      })}
    </svg>
  );
}
function getPointColor(status: WaterReading["status"]) {
  if (status === "Very Cloudy") return "#F87171";
  if (status === "Cloudy") return "#FACC15";
  return "#34D399";
}
