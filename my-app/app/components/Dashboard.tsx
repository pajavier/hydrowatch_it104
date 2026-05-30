"use client";

import { ReactNode } from "react";
import { SystemAlert, WaterReading } from "@/types/hydrowatch";

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
  const statusBadge = getStatusBadge(statusTone);
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

        {isLoadingReadings ? <div className="h-40 animate-pulse rounded-3xl bg-white/10" /> : !latest ? (
          <>
            <section className="rounded-3xl border border-white/10 bg-[#111A38] p-5 transition-colors duration-700">
              <p className="text-sm uppercase tracking-[0.2em] text-sky-300">Water Monitoring Station</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h3 className="text-4xl font-extrabold">Waiting for readings</h3>
                <span className="rounded-full bg-slate-700 px-3 py-1 text-xs font-bold text-slate-300">
                  0 NTU
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-300">
                {readingsError
                  ? `Unable to load Supabase readings: ${readingsError}`
                  : "No ESP32 sensor readings are available yet. New Supabase inserts will appear here automatically."}
              </p>
            </section>

            <section className="mt-4 grid gap-4 md:grid-cols-3">
              <Metric label="Current NTU Reading" value="-- NTU" sub="Waiting for ESP32" />
              <Metric label="Water Condition Status" value="Pending" sub="No turbidity sample" />
              <Metric label="Prediction Status" value="Pending" sub="Trend unavailable" />
            </section>

            <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-3xl border border-white/10 bg-[#111A38] p-5">
                <h3 className="font-extrabold">Turbidity Trend</h3>
                <div className="mt-4 flex h-72 items-center justify-center rounded-2xl bg-[#0B1128] p-3 text-sm text-slate-400">
                  No turbidity readings yet.
                </div>
              </div>
              <div className="space-y-4">
                <Panel title="Alerts">
                  <p className="text-sm text-slate-400">No active alerts.</p>
                </Panel>
                <Panel title="Quick Info">
                  <Info label="Health Score" value={`${healthScore}%`} />
                  <Info label="Water Quality" value={`${waterQualityScore}%`} />
                  <Info label="Uptime" value={`${uptimeHours} hrs`} />
                  <Info label="Alert Summary" value="0 active" />
                  <Info label="Latest Reading" value="Waiting" />
                  <Info label="Session" value={`${accessToken.slice(0, 10)}...`} />
                </Panel>
              </div>
            </section>
          </>
        ) : (
          <>
            <section className={`rounded-3xl border bg-[#111A38] p-5 transition-colors duration-700 ${statusBadge.heroBorder}`}>
              <p className="text-sm uppercase tracking-[0.2em] text-sky-300">Water Monitoring Station</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h3 className="text-4xl font-extrabold">{latest.status}</h3>
                <span className={`rounded-full px-3 py-1 text-xs font-bold transition-colors duration-700 ${statusBadge.className}`}>
                  {latest.turbidity} NTU
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-300">
                {latest.prediction} with {latest.predictionConfidence}% confidence. Latest ESP32 packet received {new Date(latest.createdAt).toLocaleTimeString()}.
              </p>
            </section>

            <section className="mt-4 grid gap-4 md:grid-cols-3">
              <Metric label="Current NTU Reading" value={`${latest.turbidity} NTU`} tone={statusTone} sub={`Trend ${trend >= 0 ? "+" : ""}${trend.toFixed(1)} NTU`} />
              <Metric label="Water Condition Status" value={latest.status} tone={statusTone} sub="Turbidity classification" />
              <Metric label="Prediction Status" value={latest.prediction} tone={latest.prediction === "Critical Condition Expected" ? "critical" : latest.prediction === "Rising Turbidity" ? "warning" : "normal"} sub={`${latest.predictionConfidence}% confidence`} />
            </section>

            <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-3xl border border-white/10 bg-[#111A38] p-5">
                <h3 className="font-extrabold">Turbidity Trend</h3>
                <div className="mt-4 h-72 rounded-2xl bg-[#0B1128] p-3">
                  <Trend readings={readings.slice(-30)} tone={statusTone} />
                </div>
              </div>
              <div className="space-y-4">
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
                  <Info label="Latest Reading" value={`${latest.turbidity} NTU`} />
                  <Info label="Session" value={`${accessToken.slice(0, 10)}...`} />
                </Panel>
                <Panel title="Recent Turbidity Events">
                  {latestEvents.map((event) => (
                    <Info
                      key={event.id}
                      label={new Date(event.createdAt).toLocaleTimeString()}
                      value={`${event.turbidity} NTU`}
                    />
                  ))}
                </Panel>
              </div>
            </section>
          </>
        )}
    </>
  );
}
function Metric({ label, value, sub, tone = "normal" }: { label: string; value: string; sub: string; tone?: "normal" | "warning" | "critical" }) {
  const c = tone === "critical" ? "text-red-300" : tone === "warning" ? "text-yellow-300" : "text-sky-200";
  return <article className="rounded-2xl border border-white/10 bg-[#111A38] p-4 transition-colors duration-700"><p className="text-sm text-slate-400">{label}</p><p className={`text-2xl font-extrabold transition-colors duration-700 ${c}`}>{value}</p><p className="text-xs text-slate-500">{sub}</p></article>;
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
function getStatusBadge(tone: "normal" | "warning" | "critical") {
  if (tone === "critical") {
    return {
      className: "bg-red-500/20 text-red-200 ring-1 ring-red-400/40",
      heroBorder: "border-red-400/35",
    };
  }
  if (tone === "warning") {
    return {
      className: "bg-yellow-400/20 text-yellow-200 ring-1 ring-yellow-300/40",
      heroBorder: "border-yellow-300/30",
    };
  }
  return {
    className: "bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-300/35",
    heroBorder: "border-white/10",
  };
}
