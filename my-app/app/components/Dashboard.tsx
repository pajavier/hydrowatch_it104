"use client";

import { ReactNode } from "react";
import { SystemAlert, WaterReading } from "@/types/hydrowatch";

type Screen = "dashboard" | "settings" | "logs";
type Props = {
  accessToken: string;
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
  readings: WaterReading[];
  alerts: SystemAlert[];
  isLive: boolean;
  healthScore: number;
  waterQualityScore: number;
  uptimeHours: string;
};

export function Dashboard({
  accessToken,
  onNavigate,
  onLogout,
  readings,
  alerts,
  isLive,
  healthScore,
  waterQualityScore,
  uptimeHours,
}: Props) {
  const latest = readings.at(-1);
  const trend = readings.length > 1 ? latest!.turbidity - readings[readings.length - 2].turbidity : 0;
  const statusTone = latest?.status === "Very Cloudy" ? "critical" : latest?.status === "Cloudy" ? "warning" : "normal";
  const statusBadge = getStatusBadge(statusTone);

  return (
    <main className="min-h-screen bg-[#070B1A] text-white lg:flex">
      <aside className="border-r border-white/10 bg-[#0D1430]/95 p-5 lg:w-64">
        <h1 className="text-xl font-extrabold">Hydrowatch</h1>
        <p className="text-xs text-slate-400">Station Control</p>
        <div className="mt-6 space-y-2">
          <NavButton active label="Dashboard" />
          <NavButton label="Logs" onClick={() => onNavigate("logs")} />
          <NavButton label="Settings" onClick={() => onNavigate("settings")} />
        </div>
        <button className="mt-8 w-full rounded-xl border border-red-400/35 px-3 py-2 text-red-300" onClick={onLogout}>
          Logout
        </button>
      </aside>
      <section className="flex-1 p-5">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-extrabold">Dashboard</h2>
            <p className="text-sm text-slate-400">Real-time analytics and simulated ESP32 telemetry</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${isLive ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-700 text-slate-300"}`}>
            {isLive ? "LIVE" : "PAUSED"}
          </span>
        </div>

        {!latest ? <div className="h-40 animate-pulse rounded-3xl bg-white/10" /> : (
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
              <Metric label="Turbidity" value={`${latest.turbidity} NTU`} tone={statusTone} sub={`Trend ${trend >= 0 ? "+" : ""}${trend.toFixed(1)} NTU`} />
              <Metric label="Water Level" value={`${latest.waterLevel}%`} sub="Tank level" />
              <Metric label="Flow Rate" value={`${latest.flowRate} L/min`} tone={latest.flowRate < 10 || latest.flowRate > 26 ? "warning" : "normal"} sub="Pipeline flow" />
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
                      <p className="text-sm font-bold">{alert.severity} - {alert.message}</p>
                      <p className="text-xs text-slate-400">{alert.action}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{new Date(alert.timestamp).toLocaleTimeString()}</p>
                    </div>
                  ))}
                </Panel>
                <Panel title="Quick Info">
                  <Info label="Health Score" value={`${healthScore}%`} />
                  <Info label="Water Quality" value={`${waterQualityScore}%`} />
                  <Info label="Uptime" value={`${uptimeHours} hrs`} />
                  <Info label="Latest Packet" value={`${latest.source.toUpperCase()} ${latest.turbidity} NTU`} />
                  <Info label="Session" value={`${accessToken.slice(0, 10)}...`} />
                </Panel>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function NavButton({ label, onClick, active = false }: { label: string; onClick?: () => void; active?: boolean }) {
  return <button className={`w-full rounded-xl px-3 py-2 text-left ${active ? "bg-sky-400/15 text-sky-200" : "text-slate-300 hover:bg-white/10"}`} onClick={onClick}>{label}</button>;
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
  }).join(" ");
  return (
    <svg className="h-full w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" points={points} className="transition-all duration-700 ease-out" />
    </svg>
  );
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
