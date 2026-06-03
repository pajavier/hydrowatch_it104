"use client";

import { ReactNode, useEffect, useState } from "react";
import { SystemAlert, WaterReading } from "@/types/hydrowatch";
import { formatManilaDateTime, formatManilaTime, getUtcTimestampMs } from "@/utils/time-format";
import { getWaterSampleState, WaterSampleVisualization } from "./WaterSampleVisualization";

type Props = {
  accessToken: string;
  readings: WaterReading[];
  alerts: SystemAlert[];
  onAcknowledgeAlert: (alertId: string) => void;
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
  onAcknowledgeAlert,
  isLive,
  isLoadingReadings,
  readingsError,
  healthScore,
  waterQualityScore,
  uptimeHours,
}: Props) {
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const latest = readings.at(-1);
  const hasValidLatestReading = Boolean(latest && Number.isFinite(latest.turbidity));
  const trend = hasValidLatestReading && readings.length > 1 ? latest!.turbidity - readings[readings.length - 2].turbidity : 0;
  const statusTone = latest?.status === "Very Cloudy" ? "critical" : latest?.status === "Cloudy" || latest?.status === "Slightly Cloudy" ? "warning" : "normal";
  const latestEvents = readings.slice(-5).reverse();
  const deviceStatus = hasValidLatestReading ? getDeviceStatus(latest!.createdAt, currentTime) : "OFFLINE";
  const abnormalEta = latest
    ? latest.predictedCriticalAt
      ? `${formatManilaDateTime(latest.predictedCriticalAt)}`
      : latest.prediction === "Critical Condition Expected"
        ? "Now"
        : "Not expected"
    : "Pending";

  console.info("[HydroWatch Dashboard] render", {
    readingsLength: readings.length,
    latestReading: latest ?? null,
    latestTurbidity: latest?.turbidity ?? null,
    isLoadingReadings,
    readingsError,
    isLive,
    deviceStatus,
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-extrabold">Dashboard</h2>
            <p className="text-sm text-slate-400">Real-time analytics from ESP32 telemetry</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${
            deviceStatus === "LIVE"
              ? "bg-emerald-500/20 text-emerald-300 ring-emerald-300/30"
              : "bg-red-500/20 text-red-300 ring-red-300/35"
          }`}>
            {deviceStatus}
          </span>
        </div>

        {isLoadingReadings ? <div className="h-[420px] animate-pulse rounded-3xl bg-white/10" /> : !hasValidLatestReading ? (
          <>
            <WaterMonitoringStation
              accessToken={accessToken}
              onAcknowledgeAlert={onAcknowledgeAlert}
              alerts={alerts}
              healthScore={healthScore}
              latestEvents={latestEvents}
              latestReading="Waiting for reading"
              uptimeHours={uptimeHours}
              waterQualityScore={waterQualityScore}
            />

            <PredictionAnalysis
              confidence="--"
              forecastSummary={
                readingsError
                  ? `Unable to load Supabase readings: ${readingsError}`
                  : "Waiting for ESP32 turbidity readings."
              }
              projectedNtu="--"
              abnormalEta="Pending"
              tone="normal"
              trend="Pending"
            />

            <TrendPanel readings={[]} tone="normal" />
          </>
        ) : (
          <>
            <WaterMonitoringStation
              accessToken={accessToken}
              onAcknowledgeAlert={onAcknowledgeAlert}
              alerts={alerts}
              healthScore={healthScore}
              latestEvents={latestEvents}
              latestReading={`${latest!.turbidity} NTU`}
              reading={latest}
              uptimeHours={uptimeHours}
              waterQualityScore={waterQualityScore}
            />

            <PredictionAnalysis
              confidence={`${latest!.predictionConfidence}%`}
              forecastSummary={latest!.prediction}
              projectedNtu={`${latest!.projectedNTU ?? latest!.turbidity} NTU`}
              abnormalEta={abnormalEta}
              tone={latest!.prediction === "Critical Condition Expected" ? "critical" : latest!.prediction === "Rising Turbidity" ? "warning" : "normal"}
              trend={`${trend >= 0 ? "+" : ""}${trend.toFixed(2)} NTU`}
            />

            <TrendPanel readings={readings.slice(-30)} tone={statusTone} />
          </>
        )}
    </>
  );
}

function WaterMonitoringStation({
  accessToken,
  onAcknowledgeAlert,
  alerts,
  healthScore,
  latestEvents,
  latestReading,
  reading,
  uptimeHours,
  waterQualityScore,
}: {
  accessToken: string;
  onAcknowledgeAlert: (alertId: string) => void;
  alerts: SystemAlert[];
  healthScore: number;
  latestEvents: WaterReading[];
  latestReading: string;
  reading?: WaterReading;
  uptimeHours: string;
  waterQualityScore: number;
}) {
  const hasValidReading = Boolean(reading && Number.isFinite(reading.turbidity));
  const ntu = hasValidReading ? reading!.turbidity : 0;
  const sampleState = getWaterSampleState(ntu, hasValidReading);
  const lastReading = reading
    ? formatManilaDateTime(reading.createdAt)
    : "Waiting for reading";

  return (
    <section className={`rounded-3xl border bg-[#111A38] p-5 shadow-2xl shadow-black/25 transition-colors duration-700 sm:p-6 ${sampleState.ring}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-sky-300">Water Monitoring Station</p>
          <h3 className="mt-1 text-3xl font-extrabold">Live Sample Overview</h3>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-extrabold ring-1 ${sampleState.text}`}>
          {sampleState.badge}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <StationStat label="Current NTU" value={reading ? `${ntu.toFixed(2)} NTU` : "-- NTU"} />
        <StationStat label="Condition" value={sampleState.condition} />
        <StationStat label="Last Reading" value={lastReading} />
      </div>

      <div className="mt-5 grid items-center gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(320px,1.05fr)]">
        <WaterSampleVisualization reading={reading} />

        <div className="grid gap-4">
          <StationPanel title="Alerts">
            {alerts.length === 0 && <p className="text-sm text-slate-400">No active alerts.</p>}
            {alerts.slice(0, 5).map((alert) => (
              <div className="mb-2 rounded-xl bg-white/5 p-3 transition-colors duration-500" key={alert.id}>
                <p className="text-sm font-bold">{alert.severity} - {alert.title}</p>
                <p className="text-xs text-slate-300">{alert.message}</p>
                <p className="text-xs text-slate-400">NTU {alert.ntuValue} - {alert.action}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-500">{formatManilaTime(alert.timestamp)}</p>
                  <button
                    className="rounded-full border border-emerald-300/30 bg-emerald-500/15 px-3 py-1 text-[11px] font-bold text-emerald-100 transition hover:bg-emerald-500/25"
                    onClick={() => onAcknowledgeAlert(alert.id)}
                    type="button"
                  >
                    OK
                  </button>
                </div>
              </div>
            ))}
          </StationPanel>

          <StationPanel title="Quick Info">
            <Info label="Monitoring Health" value={`${healthScore}%`} />
            <Info label="Water Quality" value={`${waterQualityScore}%`} />
            <Info label="Alert Summary" value={`${alerts.length} active`} />
            <Info label="Uptime" value={`${uptimeHours} hrs`} />
            <Info label="Latest Reading" value={latestReading} />
            <Info label="Session" value={`${accessToken.slice(0, 10)}...`} />
          </StationPanel>

          <StationPanel title="Recent Turbidity Events">
            {latestEvents.length === 0 && <p className="text-sm text-slate-400">No recent events.</p>}
            {latestEvents.map((event) => (
              <Info
                key={event.id}
                label={formatManilaTime(event.createdAt)}
                value={`${event.turbidity} NTU`}
              />
            ))}
          </StationPanel>
        </div>
      </div>
    </section>
  );
}

function StationStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="min-w-0 rounded-2xl border border-white/10 bg-[#0B1128] px-4 py-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 truncate text-xl font-extrabold text-white">{value}</p>
    </article>
  );
}

function PredictionAnalysis({
  abnormalEta,
  confidence,
  forecastSummary,
  projectedNtu,
  tone,
  trend,
}: {
  abnormalEta: string;
  confidence: string;
  forecastSummary: string;
  projectedNtu: string;
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

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AnalysisStat label="Recent Delta" value={trend} tone={tone} />
        <AnalysisStat label="Confidence" value={confidence} tone={tone} />
        <AnalysisStat label="Projected NTU" value={projectedNtu} tone={tone} />
        <AnalysisStat label="Abnormal ETA" value={abnormalEta} tone={tone} />
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
        {readings.length < 2 ? "No turbidity readings available." : <Trend readings={readings} tone={tone} />}
      </div>
    </section>
  );
}

function StationPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0B1128]/70 p-4">
      <h4 className="mb-3 font-extrabold">{title}</h4>
      {children}
    </section>
  );
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
    return { reading: r, x, y };
  }).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  if (points.length < 2) {
    console.warn("[HydroWatch Dashboard] Trend skipped because chart points are invalid", {
      readingsLength: readings.length,
      validPoints: points.length,
      latestReading: readings.at(-1) ?? null,
      latestTurbidity: readings.at(-1)?.turbidity ?? null,
    });
    return <span>No turbidity readings available.</span>;
  }

  const polylinePoints = points.map(({ x, y }) => `${x},${y}`).join(" ");
  return (
    <svg className="h-full w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" points={polylinePoints} className="transition-all duration-700 ease-out" />
      {points.map(({ reading, x: cx, y: cy }) => {
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
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

function getDeviceStatus(lastReadingTimestamp: string, now = Date.now()) {
  const seconds =
    (now - getUtcTimestampMs(lastReadingTimestamp)) / 1000;

  // Allow 40 seconds of inactivity (8x the 5-second send interval) before marking OFFLINE
  // This accounts for WiFi reconnection attempts and network delays
  return seconds <= 40 ? "LIVE" : "OFFLINE";
}
