"use client";

import { ReactNode, useEffect, useState } from "react";
import { EnvironmentSettings, MonitoringSession, SystemAlert, WaterReading } from "@/types/hydrowatch";
import { analyzeTurbidityRegression } from "@/utils/hydrowatch-analytics";
import { formatManilaDateTime, formatManilaTime, getUtcTimestampMs } from "@/utils/time-format";
import { getWaterSampleState, WaterSampleVisualization } from "./WaterSampleVisualization";

type Props = {
  accessToken: string;
  readings: WaterReading[];
  alerts: SystemAlert[];
  environmentSettings: EnvironmentSettings | null;
  monitoringError: string | null;
  monitoringSession: MonitoringSession | null;
  onAcknowledgeAlert: (alertId: string) => void;
  onConfigureEnvironment: () => void;
  onStartMonitoring: () => Promise<unknown>;
  onStopMonitoring: () => Promise<void>;
  isLive: boolean;
  isLoadingMonitoring: boolean;
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
  environmentSettings,
  monitoringError,
  monitoringSession,
  onAcknowledgeAlert,
  onConfigureEnvironment,
  onStartMonitoring,
  onStopMonitoring,
  isLoadingMonitoring,
  isLoadingReadings,
  readingsError,
  healthScore,
  waterQualityScore,
  uptimeHours,
}: Props) {
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [controlError, setControlError] = useState<string | null>(null);
  const latest = readings.at(-1);
  const isMonitoringActive = monitoringSession?.status === "active";
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

        <MonitoringControl
          environmentSettings={environmentSettings}
          error={controlError ?? monitoringError}
          isLoading={isLoadingMonitoring}
          isMonitoringActive={isMonitoringActive}
          onConfigureEnvironment={onConfigureEnvironment}
          onStartMonitoring={async () => {
            setControlError(null);
            try {
              await onStartMonitoring();
            } catch (error) {
              setControlError(error instanceof Error ? error.message : "Unable to start monitoring.");
            }
          }}
          onStopMonitoring={async () => {
            setControlError(null);
            try {
              await onStopMonitoring();
            } catch (error) {
              setControlError(error instanceof Error ? error.message : "Unable to stop monitoring.");
            }
          }}
        />

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

function MonitoringControl({
  environmentSettings,
  error,
  isLoading,
  isMonitoringActive,
  onConfigureEnvironment,
  onStartMonitoring,
  onStopMonitoring,
}: {
  environmentSettings: EnvironmentSettings | null;
  error: string | null;
  isLoading: boolean;
  isMonitoringActive: boolean;
  onConfigureEnvironment: () => void;
  onStartMonitoring: () => Promise<unknown>;
  onStopMonitoring: () => Promise<void>;
}) {
  const status = isMonitoringActive ? "Monitoring" : environmentSettings ? "Ready" : "Stopped";
  const statusClass = isMonitoringActive
    ? "bg-emerald-500/20 text-emerald-200 ring-emerald-300/30"
    : environmentSettings
      ? "bg-sky-500/20 text-sky-200 ring-sky-300/30"
      : "bg-amber-500/20 text-amber-100 ring-amber-300/30";

  return (
    <section className="mb-4 rounded-3xl border border-white/10 bg-[#111A38] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-2xl font-extrabold">Monitoring Control</h3>
            <span className={`rounded-full px-3 py-1 text-xs font-extrabold ring-1 ${statusClass}`}>
              {status}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-300">
            {isMonitoringActive
              ? "Monitoring Active"
              : "Monitoring is currently stopped. Configure the environment settings before starting a new collection session."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!environmentSettings && (
            <button
              className="rounded-xl border border-sky-300/30 px-4 py-2 text-sm font-bold text-sky-100 transition hover:bg-sky-500/10"
              type="button"
              onClick={onConfigureEnvironment}
            >
              Configure Environment
            </button>
          )}
          {environmentSettings && !isMonitoringActive && (
            <button
              className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-extrabold text-[#071225] transition hover:bg-emerald-300 disabled:opacity-60"
              type="button"
              disabled={isLoading}
              onClick={() => void onStartMonitoring()}
            >
              Start Monitoring
            </button>
          )}
          {isMonitoringActive && (
            <button
              className="rounded-xl border border-red-300/30 px-4 py-2 text-sm font-bold text-red-100 transition hover:bg-red-500/10 disabled:opacity-60"
              type="button"
              disabled={isLoading}
              onClick={() => void onStopMonitoring()}
            >
              Stop Monitoring
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <StationStat label="Light Condition" value={environmentSettings?.lightCondition ?? "Environment Configuration Required"} />
        <StationStat label="Water Type" value={environmentSettings?.waterType ?? "Not configured"} />
        <StationStat label="Container Type" value={environmentSettings?.containerType ?? "Not configured"} />
      </div>
      {environmentSettings && (
        <p className="mt-3 text-sm text-slate-400">
          Environment: {environmentSettings.lightCondition}, {environmentSettings.waterType}, {environmentSettings.containerType}
        </p>
      )}
      {error && <p className="mt-3 text-sm font-semibold text-red-300">{error}</p>}
    </section>
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
  const analytics = buildTrendAnalytics(readings);
  const latest = analytics.latest;

  return (
    <section className="mt-4 rounded-3xl border border-white/10 bg-[#111A38] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-extrabold">Turbidity Trend</h3>
          <p className="mt-1 text-sm text-slate-400">Actual readings, regression prediction, and moving average.</p>
        </div>
        <div className="min-w-[190px] rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-right">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">Current Turbidity</p>
          <p className="mt-1 text-3xl font-extrabold text-white">{latest ? `${formatNtu(latest.turbidity, 2)} NTU` : "-- NTU"}</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-[#0B1128] p-3">
        <Trend analytics={analytics} tone={tone} />
      </div>

      <ReadingStatistics analytics={analytics} />
      <RegressionAnalysis analytics={analytics} />
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
function Trend({ analytics, tone }: { analytics: TrendAnalytics; tone: "normal" | "warning" | "critical" }) {
  const [tooltip, setTooltip] = useState<TrendPoint | null>(null);
  const w = 860;
  const h = 300;
  const px = 58;
  const py = 30;
  const plotW = w - px * 2;
  const plotH = h - py * 2;
  const points = analytics.points;
  const hasTrend = points.length >= 1;
  const actualStroke = tone === "critical" ? "#F87171" : tone === "warning" ? "#FACC15" : "#22D3EE";

  if (!hasTrend) {
    const placeholderTicks = [0, 1, 2, 3, 4].map((tick) => ({
      label: tick.toFixed(2),
      y: h - py - (tick / 4) * plotH,
    }));
    return (
      <div className="relative h-80 text-sm text-slate-400">
        <svg className="h-full w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          {placeholderTicks.map((tick) => (
            <g key={tick.label}>
              <line x1={px} x2={w - px} y1={tick.y} y2={tick.y} stroke="rgba(148, 163, 184, 0.14)" strokeDasharray="4 8" />
              <text x={px - 12} y={tick.y + 4} fill="#94A3B8" fontSize="12" textAnchor="end">
                {tick.label}
              </text>
            </g>
          ))}
          <line x1={px} x2={px} y1={py} y2={h - py} stroke="rgba(148, 163, 184, 0.35)" />
          <line x1={px} x2={w - px} y1={h - py} y2={h - py} stroke="rgba(148, 163, 184, 0.35)" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="font-bold text-slate-200">No turbidity readings available yet.</p>
          <p className="mt-1">Start monitoring to begin collecting readings.</p>
        </div>
      </div>
    );
  }

  const scaledPoints = points.map((point, index) => {
    const x = points.length === 1 ? px + plotW / 2 : px + (index / (points.length - 1)) * plotW;
    const toY = (value: number) => h - py - ((value - analytics.yMin) / (analytics.yMax - analytics.yMin)) * plotH;
    return {
      ...point,
      x,
      actualY: toY(point.actual),
      predictedY: toY(point.predicted),
      movingAverageY: toY(point.movingAverage),
    };
  });

  if (scaledPoints.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.actualY) || !Number.isFinite(point.predictedY) || !Number.isFinite(point.movingAverageY))) {
    console.warn("[HydroWatch Dashboard] Trend skipped because chart points are invalid", {
      readingsLength: analytics.readingCount,
      validPoints: scaledPoints.length,
      latestReading: analytics.latest ?? null,
      latestTurbidity: analytics.latest?.turbidity ?? null,
    });
    return <span>No turbidity readings available.</span>;
  }

  const actualPath = toSmoothPath(scaledPoints.map((point) => ({ x: point.x, y: point.actualY })));
  const predictedPath = toSmoothPath(scaledPoints.map((point) => ({ x: point.x, y: point.predictedY })));
  const movingAveragePath = toSmoothPath(scaledPoints.map((point) => ({ x: point.x, y: point.movingAverageY })));

  return (
    <div className="relative">
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold text-slate-300">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-cyan-300" />Actual Reading</span>
        <span className="inline-flex items-center gap-2"><span className="h-px w-8 border-t-2 border-dashed border-purple-300" />Prediction</span>
        <span className="inline-flex items-center gap-2"><span className="h-1 w-8 rounded-full bg-white/80" />Moving Average</span>
      </div>

      <svg className="h-80 w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" onMouseLeave={() => setTooltip(null)}>
        {analytics.yTicks.map((tick) => (
          <g key={tick}>
            <line x1={px} x2={w - px} y1={h - py - ((tick - analytics.yMin) / (analytics.yMax - analytics.yMin)) * plotH} y2={h - py - ((tick - analytics.yMin) / (analytics.yMax - analytics.yMin)) * plotH} stroke="rgba(148, 163, 184, 0.14)" strokeDasharray="4 8" />
            <text x={px - 12} y={h - py - ((tick - analytics.yMin) / (analytics.yMax - analytics.yMin)) * plotH + 4} fill="#94A3B8" fontSize="12" textAnchor="end">
              {formatNtu(tick, 2)}
            </text>
          </g>
        ))}
        <line x1={px} x2={px} y1={py} y2={h - py} stroke="rgba(148, 163, 184, 0.35)" />
        <line x1={px} x2={w - px} y1={h - py} y2={h - py} stroke="rgba(148, 163, 184, 0.35)" />
        <path d={predictedPath} fill="none" stroke="#C084FC" strokeDasharray="12 10" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" opacity="0.62" />
        <path d={movingAveragePath} fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" opacity="0.72" />
        <path d={actualPath} fill="none" stroke={actualStroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" className="transition-all duration-700 ease-out" />
        {scaledPoints.map((point) => (
          <g key={point.reading.id}>
            <circle
              className="transition-all duration-700 ease-out"
              cx={point.x}
              cy={point.actualY}
              fill="#22D3EE"
              onMouseEnter={() => setTooltip(point)}
              onFocus={() => setTooltip(point)}
              r="5.5"
              stroke="#0B1128"
              strokeWidth="2.5"
              tabIndex={0}
            />
          </g>
        ))}
        {scaledPoints.map((point, index) => {
          if (index % Math.max(1, Math.ceil(points.length / 5)) !== 0 && index !== points.length - 1) return null;
          return (
            <text key={`${point.reading.id}-time`} x={point.x} y={h - 8} fill="#94A3B8" fontSize="11" textAnchor="middle">
              {formatManilaTime(point.reading.createdAt)}
            </text>
          );
        })}
      </svg>

      {tooltip && (
        <div
          className="pointer-events-none absolute max-w-[220px] rounded-xl border border-white/10 bg-[#020617]/95 p-3 text-xs shadow-2xl"
          style={{
            left: `${Math.min(82, Math.max(4, (tooltip.x / w) * 100))}%`,
            top: `${Math.min(68, Math.max(8, (tooltip.actualY / h) * 100))}%`,
            transform: "translate(-50%, -110%)",
          }}
        >
          <p className="font-bold text-slate-300">Time:</p>
          <p className="mb-2 text-white">{formatManilaTime(tooltip.reading.createdAt)}</p>
          <p className="font-bold text-cyan-200">Actual:</p>
          <p className="mb-2 text-white">{formatNtu(tooltip.actual, 2)} NTU</p>
          <p className="font-bold text-purple-200">Predicted:</p>
          <p className="mb-2 text-white">{formatNtu(tooltip.predicted, 2)} NTU</p>
          <p className="font-bold text-slate-200">Moving Average:</p>
          <p className="mb-2 text-white">{formatNtu(tooltip.movingAverage, 2)} NTU</p>
          <p className="font-bold text-slate-300">Difference:</p>
          <p className="text-white">{formatSignedNtu(tooltip.actual - tooltip.predicted, 2)} NTU</p>
        </div>
      )}
    </div>
  );
}

function ReadingStatistics({ analytics }: { analytics: TrendAnalytics }) {
  return (
    <div className="mt-4">
      <h4 className="font-extrabold">Reading Statistics</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AnalysisStat label="Minimum Reading" value={analytics.stats ? `${formatNtu(analytics.stats.min, 2)} NTU` : "-- NTU"} tone="normal" />
        <AnalysisStat label="Maximum Reading" value={analytics.stats ? `${formatNtu(analytics.stats.max, 2)} NTU` : "-- NTU"} tone="normal" />
        <AnalysisStat label="Average Reading" value={analytics.stats ? `${formatNtu(analytics.stats.average, 2)} NTU` : "-- NTU"} tone="normal" />
        <AnalysisStat label="Latest Reading" value={analytics.latest ? `${formatNtu(analytics.latest.turbidity, 2)} NTU` : "-- NTU"} tone="normal" />
      </div>
    </div>
  );
}

function RegressionAnalysis({ analytics }: { analytics: TrendAnalytics }) {
  const health = analytics.health;

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h4 className="font-extrabold">Regression Analysis</h4>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-extrabold ring-1 ${health.className}`}>{health.label}</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <RegressionStat label="RMSE" value={analytics.metrics ? `${formatNtu(analytics.metrics.rmse, 3)} NTU` : "-- NTU"} description="Average prediction error magnitude" />
        <RegressionStat label="MAE" value={analytics.metrics ? `${formatNtu(analytics.metrics.mae, 3)} NTU` : "-- NTU"} description="Average absolute prediction error" />
        <RegressionStat label="R² Score" value={analytics.metrics ? formatNtu(analytics.metrics.rSquared, 2) : "--"} description="Regression fit quality" />
        <RegressionStat label="Prediction Confidence" value={analytics.metrics ? `${Math.round(analytics.metrics.confidence)}%` : "--"} description={analytics.metrics?.confidenceLabel ?? "Waiting for readings"} />
      </div>
    </div>
  );
}

function RegressionStat({ description, label, value }: { description: string; label: string; value: string }) {
  return (
    <article className="min-w-0 rounded-2xl border border-white/10 bg-[#0B1128] px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 truncate text-2xl font-extrabold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{description}</p>
    </article>
  );
}

type TrendPoint = {
  actual: number;
  movingAverage: number;
  predicted: number;
  reading: WaterReading;
  x: number;
  actualY: number;
};

type TrendAnalytics = {
  health: {
    className: string;
    label: string;
  };
  latest: WaterReading | null;
  metrics: {
    confidence: number;
    confidenceLabel: string;
    mae: number;
    rSquared: number;
    rmse: number;
  } | null;
  points: TrendPoint[];
  readingCount: number;
  stats: {
    average: number;
    max: number;
    min: number;
  } | null;
  yMax: number;
  yMin: number;
  yTicks: number[];
};

function buildTrendAnalytics(readings: WaterReading[]): TrendAnalytics {
  const validReadings = readings.filter((reading) => Number.isFinite(reading.turbidity));
  const latest = validReadings.at(-1) ?? null;
  const fallbackHealth = trendHealth(0);

  if (validReadings.length === 0) {
    return {
      health: fallbackHealth,
      latest,
      metrics: null,
      points: [],
      readingCount: 0,
      stats: null,
      yMax: 4,
      yMin: 0,
      yTicks: [0, 1, 2, 3, 4],
    };
  }

  const actualValues = validReadings.map((reading) => reading.turbidity);
  const stats = {
    average: average(actualValues),
    max: Math.max(...actualValues),
    min: Math.min(...actualValues),
  };
  const regression = analyzeTurbidityRegression(validReadings);
  const movingAverage = actualValues.map((_, index) => average(actualValues.slice(Math.max(0, index - 2), index + 1)));
  const predictedValues = regression.points.map((point) => Math.max(0, regression.intercept + regression.slope * point.x));
  const points = validReadings.map((reading, index) => ({
    actual: reading.turbidity,
    actualY: 0,
    movingAverage: movingAverage[index],
    predicted: predictedValues[index],
    reading,
    x: 0,
  }));
  const residuals = points.map((point) => point.actual - point.predicted);
  const rmse = Math.sqrt(average(residuals.map((value) => value * value)));
  const mae = average(residuals.map((value) => Math.abs(value)));
  const confidence = Math.max(0, 100 - (stats.average > 0 ? (rmse / stats.average) * 100 : 100));
  const minValue = Math.min(...actualValues, ...predictedValues);
  const maxValue = Math.max(...actualValues, ...predictedValues);
  const yMin = Math.max(0, minValue - 0.2);
  const yMax = maxValue + 0.2;

  return {
    health: trendHealth(regression.slope),
    latest,
    metrics: {
      confidence,
      confidenceLabel: confidence >= 90 ? "High" : confidence >= 70 ? "Medium" : "Low",
      mae,
      rSquared: regression.rSquared,
      rmse,
    },
    points,
    readingCount: validReadings.length,
    stats,
    yMax,
    yMin,
    yTicks: makeTicks(yMin, yMax),
  };
}

function trendHealth(slope: number) {
  if (slope < 0.05) {
    return { className: "bg-emerald-500/15 text-emerald-200 ring-emerald-300/30", label: "🟢 Stable" };
  }
  if (slope < 0.15) {
    return { className: "bg-yellow-500/15 text-yellow-100 ring-yellow-300/30", label: "🟡 Slight Increase" };
  }
  if (slope < 0.30) {
    return { className: "bg-orange-500/15 text-orange-100 ring-orange-300/30", label: "🟠 Rising Turbidity" };
  }

  return { className: "bg-red-500/15 text-red-100 ring-red-300/30", label: "🔴 Critical Increase" };
}

function toSmoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;

    const previous = points[index - 1];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, "");
}

function makeTicks(min: number, max: number) {
  const span = Math.max(0.01, max - min);
  const step = Math.max(0.01, Number((span / 4).toFixed(2)));

  return Array.from({ length: 5 }, (_, index) => Number((min + step * index).toFixed(2)));
}

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

function formatNtu(value: number, digits: number) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function formatSignedNtu(value: number, digits: number) {
  if (!Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function getDeviceStatus(lastReadingTimestamp: string, now = Date.now()) {
  const seconds =
    (now - getUtcTimestampMs(lastReadingTimestamp)) / 1000;

  // Allow 40 seconds of inactivity (8x the 5-second send interval) before marking OFFLINE
  // This accounts for WiFi reconnection attempts and network delays
  return seconds <= 40 ? "LIVE" : "OFFLINE";
}
