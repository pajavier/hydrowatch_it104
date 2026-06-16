"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { EnvironmentSettings, MonitoringSession, SystemAlert, WaterReading } from "@/types/hydrowatch";
import { analyzeTurbidityRegression } from "@/utils/hydrowatch-analytics";
import { formatManilaDateTime, formatManilaTime, getUtcTimestampMs } from "@/utils/time-format";
import { getWaterSampleState, WaterSampleVisualization } from "./WaterSampleVisualization";
import { motion } from "framer-motion";

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

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }
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
  isLive,
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
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-4"
    >
        <motion.div variants={itemVariants} className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Dashboard</h2>
            <p className="text-sm text-slate-400">Real-time analytics from ESP32 telemetry</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${
            deviceStatus === "LIVE"
              ? "bg-emerald-500/20 text-emerald-300 ring-emerald-300/30"
              : "bg-red-500/20 text-red-300 ring-red-300/35"
          }`}>
            {deviceStatus}
          </span>
        </motion.div>

        <motion.div variants={itemVariants} className="w-full overflow-x-auto pb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="grid min-w-[1024px] grid-cols-12 gap-4 xl:min-w-0">
            <div className="col-span-4 flex flex-col gap-4">
              <motion.div variants={itemVariants} className="flex-1">
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
              </motion.div>
              <motion.div variants={itemVariants} className="flex-1">
                {!isLoadingReadings && !hasValidLatestReading && (
                  <PredictionAnalysis
                    abnormalEta="Pending"
                    confidence="--"
                    forecastSummary={
                      readingsError
                        ? `Unable to load Supabase readings: ${readingsError}`
                        : "Waiting for ESP32 turbidity readings."
                    }
                    projectedNtu="--"
                    tone="normal"
                    trend="Pending"
                  />
                )}
                {!isLoadingReadings && hasValidLatestReading && (
                  <PredictionAnalysis
                    abnormalEta={abnormalEta}
                    confidence={`${latest!.predictionConfidence}%`}
                    forecastSummary={latest!.prediction}
                    projectedNtu={`${latest!.projectedNTU ?? latest!.turbidity} NTU`}
                    tone={latest!.prediction === "Critical Condition Expected" ? "critical" : latest!.prediction === "Rising Turbidity" ? "warning" : "normal"}
                    trend={`${trend >= 0 ? "+" : ""}${trend.toFixed(2)} NTU`}
                  />
                )}
              </motion.div>
            </div>

            <motion.div variants={itemVariants} className="col-span-8 flex flex-col gap-4">
              {isLoadingReadings ? (
                <div className="h-full min-h-[420px] animate-pulse rounded-[2rem] bg-white/10" />
              ) : !hasValidLatestReading ? (
                <WaterMonitoringStation
                  accessToken={accessToken}
                  alerts={alerts}
                  healthScore={healthScore}
                  latestEvents={latestEvents}
                  latestReading="Waiting for reading"
                  onAcknowledgeAlert={onAcknowledgeAlert}
                  uptimeHours={uptimeHours}
                  waterQualityScore={waterQualityScore}
                />
              ) : (
                <WaterMonitoringStation
                  accessToken={accessToken}
                  alerts={alerts}
                  healthScore={healthScore}
                  latestEvents={latestEvents}
                  latestReading={`${latest!.turbidity} NTU`}
                  onAcknowledgeAlert={onAcknowledgeAlert}
                  reading={latest}
                  uptimeHours={uptimeHours}
                  waterQualityScore={waterQualityScore}
                />
              )}
            </motion.div>

            <motion.div variants={itemVariants} className="col-span-12">
              {isLoadingReadings ? (
                <div className="h-[300px] animate-pulse rounded-[2rem] bg-white/10" />
              ) : !hasValidLatestReading ? (
                <TrendPanel 
                  readings={[]} 
                  tone="normal"
                  healthScore={healthScore}
                  waterQualityScore={waterQualityScore}
                  alertsCount={alerts.length}
                  deviceStatus={deviceStatus}
                  isMonitoringActive={isMonitoringActive}
                  uptimeHours={uptimeHours}
                  isLive={isLive}
                />
              ) : (
                <TrendPanel 
                  readings={readings.slice(-30)} 
                  tone={statusTone} 
                  healthScore={healthScore}
                  waterQualityScore={waterQualityScore}
                  alertsCount={alerts.length}
                  deviceStatus={deviceStatus}
                  isMonitoringActive={isMonitoringActive}
                  uptimeHours={uptimeHours}
                  isLive={isLive}
                />
              )}
            </motion.div>
          </div>
        </motion.div>
    </motion.div>
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
    ? "bg-emerald-500/15 text-emerald-200 ring-emerald-300/30"
    : environmentSettings
      ? "bg-sky-500/15 text-sky-200 ring-sky-300/30"
      : "bg-amber-500/15 text-amber-100 ring-amber-300/30";

  return (
    <section className="flex h-full flex-col justify-between rounded-[2rem] border border-sky-400/20 bg-gradient-to-br from-sky-500/20 to-blue-600/10 p-5 shadow-lg backdrop-blur-md">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">Monitoring Control</h3>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ring-1 ${statusClass}`}>
              {status}
            </span>
          </div>
        <p className="mt-2 text-xs text-slate-300">
            {isMonitoringActive
              ? "Monitoring Active"
            : "Monitoring is currently stopped. Configure settings before starting."}
          </p>
        </div>

      <div className="mt-4 flex flex-col gap-2">
        <StationStat compact label="Light Condition" value={environmentSettings?.lightCondition ?? "Required"} />
        <StationStat compact label="Water Type" value={environmentSettings?.waterType ?? "Not configured"} />
        <StationStat compact label="Container Type" value={environmentSettings?.containerType ?? "Not configured"} />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {error && <p className="mb-2 text-xs font-semibold text-red-300">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {!environmentSettings && (
            <button
              className="w-full rounded-xl border border-sky-300/30 px-4 py-2 text-sm font-bold text-sky-100 transition hover:bg-sky-500/10"
              type="button"
              onClick={onConfigureEnvironment}
            >
              Configure Environment
            </button>
          )}
          {environmentSettings && !isMonitoringActive && (
            <button
              className="w-full rounded-xl bg-emerald-400 px-4 py-2 text-sm font-extrabold text-[#071225] transition hover:bg-emerald-300 disabled:opacity-60"
              type="button"
              disabled={isLoading}
              onClick={() => void onStartMonitoring()}
            >
              Start Monitoring
            </button>
          )}
          {isMonitoringActive && (
            <button
              className="w-full rounded-xl border border-red-300/30 px-4 py-2 text-sm font-bold text-red-100 transition hover:bg-red-500/10 disabled:opacity-60"
              type="button"
              disabled={isLoading}
              onClick={() => void onStopMonitoring()}
            >
              Stop Monitoring
            </button>
          )}
        </div>
      </div>
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
    <section className={`flex h-full flex-col rounded-[2rem] border bg-gradient-to-br from-cyan-500/15 to-teal-600/5 p-5 shadow-2xl shadow-black/25 backdrop-blur-md transition-colors duration-700 ${sampleState.ring}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-sky-300">Water Station</p>
          <h3 className="text-lg font-semibold">Live Sample</h3>
        </div>
        <span className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ring-1 ${sampleState.text}`}>
          {sampleState.badge}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <StationStat compact label="Current NTU" value={reading ? `${ntu.toFixed(2)} NTU` : "-- NTU"} />
        <StationStat compact label="Condition" value={sampleState.condition} />
        <StationStat compact label="Last Reading" value={lastReading} />
      </div>

      <div className="mt-4 grid flex-1 items-center gap-4 lg:grid-cols-2">
        <div className="flex h-full items-center justify-center rounded-2xl bg-[#0B1128]/30">
          <WaterSampleVisualization reading={reading} />
        </div>

        <div className="flex h-full flex-col gap-3">
          <StationPanel title="Quick Info">
            <Info label="Health" value={`${healthScore}%`} />
            <Info label="Quality" value={`${waterQualityScore}%`} />
            <Info label="Alerts" value={`${alerts.length} active`} />
            <Info label="Uptime" value={`${uptimeHours} hrs`} />
            <Info label="Latest" value={latestReading} />
            <Info label="Session" value={`${accessToken.slice(0, 10)}...`} />
          </StationPanel>

          <StationPanel title="Alerts">
            <div className="max-h-[140px] overflow-y-auto pr-2">
              {alerts.length === 0 && <p className="text-xs text-slate-400">No active alerts.</p>}
              {alerts.map((alert) => (
                <div className="mb-2 rounded-xl bg-white/5 p-2 transition-colors duration-500" key={alert.id}>
                  <p className="text-xs font-bold">{alert.severity} - {alert.title}</p>
                  <p className="text-[10px] text-slate-300">{alert.message}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-[9px] text-slate-500">{formatManilaTime(alert.timestamp)}</p>
                    <button
                      className="rounded-full border border-emerald-300/30 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold text-emerald-100 transition hover:bg-emerald-500/25"
                      onClick={() => onAcknowledgeAlert(alert.id)}
                      type="button"
                    >
                      OK
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </StationPanel>
        </div>
      </div>
    </section>
  );
}

function StationStat({ compact, label, value }: { compact?: boolean; label: string; value: string }) {
  return (
    <article className={`min-w-0 rounded-2xl border border-white/10 bg-[#0B1128]/50 ${compact ? "px-3 py-2" : "px-4 py-4"}`}>
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={`truncate font-bold text-white ${compact ? "mt-1 text-base" : "mt-2 text-lg"}`}>{value}</p>
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
    <section className="flex h-full flex-col justify-between rounded-[2rem] border border-purple-400/20 bg-gradient-to-br from-indigo-500/20 to-violet-600/10 p-5 backdrop-blur-md transition-colors duration-700">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-sky-300">Prediction</p>
        <h3 className="text-lg font-semibold">Forecast</h3>
        <p className={`mt-1 text-xs font-bold ${accent}`}>{forecastSummary}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <AnalysisStat compact label="Delta" value={trend} tone={tone} />
        <AnalysisStat compact label="Confidence" value={confidence} tone={tone} />
        <AnalysisStat compact label="Projected" value={projectedNtu} tone={tone} />
        <AnalysisStat compact label="Abnormal ETA" value={abnormalEta} tone={tone} />
      </div>
    </section>
  );
}

function AnalysisStat({
  compact,
  label,
  tone,
  value,
}: {
  compact?: boolean;
  label: string;
  tone: "normal" | "warning" | "critical";
  value: string;
}) {
  const c = tone === "critical" ? "text-red-300" : tone === "warning" ? "text-yellow-300" : "text-sky-200";

  return (
    <article className={`min-w-0 rounded-2xl border border-white/10 bg-[#0B1128]/50 ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={`truncate font-bold ${c} ${compact ? "mt-1 text-base" : "mt-2 text-lg"}`}>{value}</p>
    </article>
  );
}

function TrendPanel({
  readings,
  tone,
  healthScore,
  waterQualityScore,
  alertsCount,
  deviceStatus,
  isMonitoringActive,
  uptimeHours,
  isLive,
}: {
  readings: WaterReading[];
  tone: "normal" | "warning" | "critical";
  healthScore: number;
  waterQualityScore: number;
  alertsCount: number;
  deviceStatus: string;
  isMonitoringActive: boolean;
  uptimeHours: string;
  isLive: boolean;
}) {
  const analytics = buildTrendAnalytics(readings);
  const [activePage, setActivePage] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (!carouselRef.current) return;
    const width = carouselRef.current.offsetWidth;
    const scrollLeft = carouselRef.current.scrollLeft;
    const page = Math.round(scrollLeft / width);
    if (page !== activePage) setActivePage(page);
  };

  const scrollToPage = (page: number) => {
    if (!carouselRef.current) return;
    const width = carouselRef.current.offsetWidth;
    carouselRef.current.scrollTo({ left: width * page, behavior: "smooth" });
  };

  const latest = analytics.latest;

  return (
    <section className="rounded-[2rem] border border-white/10 bg-[#111A38]/60 p-5 shadow-xl backdrop-blur-md">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Turbidity Trend</h3>
          <p className="text-xs text-slate-400">Actual readings, regression prediction, and moving average.</p>
        </div>
        <div className="min-w-[160px] rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200">Current Turbidity</p>
          <p className="text-2xl font-extrabold text-white">{latest ? `${formatNtu(latest.turbidity, 2)} NTU` : "-- NTU"}</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-[#0B1128]/50 p-2">
        <Trend analytics={analytics} tone={tone} />
      </div>

      <div className="group relative mt-8">
        <button
          onClick={() => scrollToPage(Math.max(0, activePage - 1))}
          className={`absolute -left-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-[#111A38]/90 border border-white/10 p-3 text-white shadow-2xl backdrop-blur-md transition-all duration-300 hover:scale-110 hover:bg-slate-800 hover:shadow-cyan-500/20 ${activePage === 0 ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'}`}
          aria-label="Previous Page"
        >
          <ChevronIcon direction="left" />
        </button>

        <div 
          ref={carouselRef} 
          onScroll={handleScroll}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth pb-4 pt-2 gap-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {/* Page 1: Water Quality Overview */}
          <div className="min-w-full w-full flex-shrink-0 snap-center grid grid-cols-2 md:grid-cols-4 grid-rows-2 gap-3 lg:gap-4">
            <MetricBentoCard className="col-span-2 row-span-2" gradientClass="bg-gradient-to-br from-cyan-500/20 via-blue-600/10 to-transparent border-cyan-400/30">
              <p className="text-xs font-bold uppercase tracking-wider text-cyan-200/80">Current Turbidity</p>
              <div className="mt-4">
                <p className="text-6xl md:text-7xl font-extrabold text-white drop-shadow-md">{formatNtu(analytics.latest?.turbidity ?? NaN, 2)}</p>
                <p className="mt-2 text-xs font-medium text-cyan-100/60">NTU (Nephelometric Turbidity Units)</p>
              </div>
            </MetricBentoCard>
            <MetricBentoCard gradientClass="bg-gradient-to-br from-emerald-500/10 to-teal-600/5 border-emerald-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/70">Water Status</p>
              <p className="mt-1 text-xl font-bold text-white">{analytics.latest?.status || "Unknown"}</p>
            </MetricBentoCard>
            <MetricBentoCard gradientClass="bg-gradient-to-br from-purple-500/10 to-indigo-600/5 border-purple-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-300/70">Trend Direction</p>
              <p className="mt-1 text-lg font-bold text-white truncate">{analytics.health.label.replace(/^[^\w\s]+/, '').trim() || "Pending"}</p>
            </MetricBentoCard>
            <MetricBentoCard gradientClass="bg-gradient-to-br from-blue-500/10 to-sky-600/5 border-blue-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-300/70">Quality Score</p>
              <p className="mt-1 text-xl font-bold text-white">{waterQualityScore}%</p>
            </MetricBentoCard>
            <MetricBentoCard gradientClass="bg-gradient-to-br from-amber-500/10 to-orange-600/5 border-amber-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300/70">Latest Reading</p>
              <p className="mt-1 text-lg font-bold text-white">{analytics.latest ? formatManilaTime(analytics.latest.createdAt) : "--:--"}</p>
            </MetricBentoCard>
          </div>

          {/* Page 2: Machine Learning Analytics */}
          <div className="min-w-full w-full flex-shrink-0 snap-center grid grid-cols-2 md:grid-cols-4 grid-rows-2 gap-3 lg:gap-4">
            <MetricBentoCard className="col-span-2 row-span-2" gradientClass="bg-gradient-to-br from-purple-500/20 via-fuchsia-600/10 to-transparent border-purple-400/30">
              <p className="text-xs font-bold uppercase tracking-wider text-purple-200/80">Prediction Confidence</p>
              <div className="mt-4">
                <p className="text-6xl md:text-7xl font-extrabold text-white drop-shadow-md">{analytics.metrics ? `${Math.round(analytics.metrics.confidence)}%` : "--"}</p>
                <p className="mt-2 text-xs font-medium text-purple-100/60">ML Model Reliability Rating</p>
              </div>
            </MetricBentoCard>
            <MetricBentoCard gradientClass="bg-white/5 border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">RMSE</p>
              <p className="mt-1 text-xl font-bold text-white">{analytics.metrics ? formatNtu(analytics.metrics.rmse, 3) : "--"}</p>
            </MetricBentoCard>
            <MetricBentoCard gradientClass="bg-white/5 border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">MAE</p>
              <p className="mt-1 text-xl font-bold text-white">{analytics.metrics ? formatNtu(analytics.metrics.mae, 3) : "--"}</p>
            </MetricBentoCard>
            <MetricBentoCard gradientClass="bg-white/5 border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">R² Score</p>
              <p className="mt-1 text-xl font-bold text-white">{analytics.metrics ? formatNtu(analytics.metrics.rSquared, 2) : "--"}</p>
            </MetricBentoCard>
            <MetricBentoCard gradientClass="bg-white/5 border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Forecast Result</p>
              <p className="mt-1 text-lg font-bold text-white truncate">{analytics.metrics?.confidenceLabel ?? "Waiting"}</p>
            </MetricBentoCard>
          </div>

          {/* Page 3: Water Statistics */}
          <div className="min-w-full w-full flex-shrink-0 snap-center grid grid-cols-2 md:grid-cols-3 grid-rows-2 gap-3 lg:gap-4">
            <MetricBentoCard gradientClass="bg-gradient-to-br from-blue-500/10 to-cyan-600/5 border-blue-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-300/70">Minimum NTU</p>
              <p className="mt-2 text-3xl font-extrabold text-white">{analytics.stats ? formatNtu(analytics.stats.min, 2) : "--"}</p>
            </MetricBentoCard>
            <MetricBentoCard gradientClass="bg-gradient-to-br from-orange-500/10 to-red-600/5 border-orange-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-orange-300/70">Maximum NTU</p>
              <p className="mt-2 text-3xl font-extrabold text-white">{analytics.stats ? formatNtu(analytics.stats.max, 2) : "--"}</p>
            </MetricBentoCard>
            <MetricBentoCard gradientClass="bg-gradient-to-br from-emerald-500/10 to-teal-600/5 border-emerald-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/70">Average NTU</p>
              <p className="mt-2 text-3xl font-extrabold text-white">{analytics.stats ? formatNtu(analytics.stats.average, 2) : "--"}</p>
            </MetricBentoCard>
            <MetricBentoCard gradientClass="bg-gradient-to-br from-sky-500/10 to-blue-600/5 border-sky-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-300/70">Latest NTU</p>
              <p className="mt-2 text-3xl font-extrabold text-white">{analytics.latest ? formatNtu(analytics.latest.turbidity, 2) : "--"}</p>
            </MetricBentoCard>
            <MetricBentoCard gradientClass="bg-gradient-to-br from-indigo-500/10 to-violet-600/5 border-indigo-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-300/70">Data Points</p>
              <p className="mt-2 text-3xl font-extrabold text-white">{analytics.readingCount}</p>
            </MetricBentoCard>
            <MetricBentoCard gradientClass="bg-gradient-to-br from-pink-500/10 to-rose-600/5 border-pink-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-pink-300/70">Trend Summary</p>
              <p className="mt-2 text-2xl font-extrabold text-white truncate">{analytics.health.label.replace(/^[^\w\s]+/, '').trim() || "Pending"}</p>
            </MetricBentoCard>
          </div>

          {/* Page 4: System Health */}
          <div className="min-w-full w-full flex-shrink-0 snap-center grid grid-cols-2 md:grid-cols-3 grid-rows-2 gap-3 lg:gap-4">
            <MetricBentoCard gradientClass="bg-white/5 border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Monitoring Status</p>
              <p className="mt-2 text-2xl font-extrabold text-white">{isMonitoringActive ? "Active" : "Stopped"}</p>
            </MetricBentoCard>
            <MetricBentoCard gradientClass="bg-white/5 border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sensor Status</p>
              <p className="mt-2 text-2xl font-extrabold text-white">{deviceStatus}</p>
            </MetricBentoCard>
            <MetricBentoCard gradientClass="bg-white/5 border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Data Stream</p>
              <p className="mt-2 text-2xl font-extrabold text-white">{isLive ? "Live" : "Delayed"}</p>
            </MetricBentoCard>
            <MetricBentoCard gradientClass="bg-white/5 border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Session Uptime</p>
              <p className="mt-2 text-2xl font-extrabold text-white">{uptimeHours}h</p>
            </MetricBentoCard>
            <MetricBentoCard gradientClass="bg-white/5 border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Alert Count</p>
              <p className="mt-2 text-2xl font-extrabold text-white">{alertsCount}</p>
            </MetricBentoCard>
            <MetricBentoCard gradientClass="bg-white/5 border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">System Health</p>
              <p className="mt-2 text-2xl font-extrabold text-white">{healthScore}%</p>
            </MetricBentoCard>
          </div>
        </div>

        <button
          onClick={() => scrollToPage(Math.min(3, activePage + 1))}
          className={`absolute -right-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-[#111A38]/90 border border-white/10 p-3 text-white shadow-2xl backdrop-blur-md transition-all duration-300 hover:scale-110 hover:bg-slate-800 hover:shadow-cyan-500/20 ${activePage === 3 ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'}`}
          aria-label="Next Page"
        >
          <ChevronIcon direction="right" />
        </button>

        <div className="flex justify-center items-center gap-2 mt-4">
          {[0, 1, 2, 3].map((idx) => (
            <button
              key={idx}
              onClick={() => scrollToPage(idx)}
              className={`h-2 rounded-full transition-all duration-500 ease-out ${activePage === idx ? 'w-8 bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.7)]' : 'w-2 bg-white/20 hover:bg-white/40'}`}
              aria-label={`Go to page ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function StationPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col rounded-2xl border border-white/10 bg-[#0B1128]/50 p-3">
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      {children}
    </section>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return <div className="mb-2 flex justify-between rounded-xl bg-white/5 px-3 py-2 text-xs"><span className="text-slate-400">{label}</span><span className="font-bold">{value}</span></div>;
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

function MetricBentoCard({
  children,
  className = "",
  gradientClass = "bg-[#0B1128]/50 border-white/5",
}: {
  children: ReactNode;
  className?: string;
  gradientClass?: string;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.03 }}
      transition={{ duration: 0.3 }}
      className={`flex flex-col justify-between rounded-[1.5rem] border p-4 shadow-lg backdrop-blur-md transition-shadow hover:shadow-2xl ${gradientClass} ${className}`}
    >
      {children}
    </motion.div>
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

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      {direction === "left" ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      )}
    </svg>
  );
}
