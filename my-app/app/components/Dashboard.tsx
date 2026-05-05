"use client";

type Screen = "dashboard" | "settings" | "logs";
type MetricStatus = "Stable" | "Low" | "High" | "Normal" | "Clear" | "Cloudy" | "Very Cloudy";
type AlertStatus = "Warning" | "Critical";

type DashboardProps = {
  accessToken: string;
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
};

const sensorLogs = [
  { created_at: "12:00 PM", turbidity: 34, water_level: 68, flow_rate: 21 },
  { created_at: "12:05 PM", turbidity: 44, water_level: 69, flow_rate: 20 },
  { created_at: "12:10 PM", turbidity: 38, water_level: 70, flow_rate: 21 },
  { created_at: "12:15 PM", turbidity: 58, water_level: 70, flow_rate: 19 },
  { created_at: "12:20 PM", turbidity: 62, water_level: 71, flow_rate: 20 },
  { created_at: "12:25 PM", turbidity: 55, water_level: 72, flow_rate: 19 },
  { created_at: "12:30 PM", turbidity: 70, water_level: 72, flow_rate: 18 },
  { created_at: "12:35 PM", turbidity: 72, water_level: 73, flow_rate: 18 },
  { created_at: "12:40 PM", turbidity: 86, water_level: 73, flow_rate: 17 },
  { created_at: "12:45 PM", turbidity: 98, water_level: 72, flow_rate: 18 },
  { created_at: "12:50 PM", turbidity: 110, water_level: 72, flow_rate: 18 },
  { created_at: "12:55 PM", turbidity: 121, water_level: 72, flow_rate: 18 },
];

const latestReading = sensorLogs[sensorLogs.length - 1];
const turbidityStatus = getTurbidityStatus(latestReading.turbidity);

const alerts = [
  {
    title: "High Turbidity Detected",
    detail: "121 NTU exceeds safe limit",
    timestamp: "12:55 PM",
    status: "Critical" as AlertStatus,
  },
  {
    title: "Cloudy Range Entered",
    detail: "72 NTU is approaching the critical threshold",
    timestamp: "12:35 PM",
    status: "Warning" as AlertStatus,
  },
];

export function Dashboard({
  accessToken,
  onNavigate,
  onLogout,
}: DashboardProps) {
  const isDashboardLoading = false;

  return (
    <main className="min-h-screen bg-[#070B1A] text-white lg:flex">
      <Sidebar onLogout={onLogout} onNavigate={onNavigate} />

      <section className="min-w-0 flex-1">
        <TopHeader />

        {isDashboardLoading ? (
          <DashboardSkeleton />
        ) : (
          <div className="mx-auto grid max-w-7xl gap-5 px-4 pb-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="space-y-5">
              <HeroCard />

              <section className="grid gap-4 md:grid-cols-3">
                <MetricCard
                  accent="blue"
                  icon={<WaterIcon />}
                  label="Water Level"
                  sparkline={sensorLogs.map((log) => log.water_level)}
                  status="Stable"
                  trend="increase"
                  trendValue="+4%"
                  value={`${latestReading.water_level}%`}
                />
                <MetricCard
                  accent="blue"
                  icon={<FlowIcon />}
                  label="Flow Rate"
                  sparkline={sensorLogs.map((log) => log.flow_rate)}
                  status="Normal"
                  trend="decrease"
                  trendValue="-2 L/min"
                  value={`${latestReading.flow_rate} L/min`}
                />
                <MetricCard
                  accent="red"
                  icon={<GaugeIcon />}
                  label="Turbidity"
                  sparkline={sensorLogs.map((log) => log.turbidity)}
                  status={turbidityStatus}
                  trend="increase"
                  trendValue="+23 NTU"
                  value={`${latestReading.turbidity} NTU`}
                />
              </section>

              <ChartPanel />
            </section>

            <aside className="space-y-5">
              <AlertsPanel />
              <QuickInfoPanel accessToken={accessToken} />
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}

function Sidebar({
  onNavigate,
  onLogout,
}: {
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
}) {
  return (
    <aside className="border-b border-white/10 bg-[#0D1430]/95 px-4 py-4 backdrop-blur lg:sticky lg:top-0 lg:flex lg:min-h-screen lg:w-64 lg:flex-col lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
      <div className="flex items-center justify-between gap-4 lg:block">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#38BDF8] to-[#7C3AED] shadow-lg shadow-sky-500/20">
            <DropletIcon />
          </div>
          <div>
            <h1 className="text-lg font-extrabold">Hydrowatch</h1>
            <p className="text-xs font-semibold text-slate-400">
              Station Control
            </p>
          </div>
        </div>
      </div>

      <nav className="mt-5 flex gap-2 overflow-x-auto lg:mt-8 lg:flex-col lg:overflow-visible">
        <NavButton active icon={<DashboardIcon />} label="Dashboard" />
        <NavButton icon={<LogsIcon />} label="Logs" onClick={() => onNavigate("logs")} />
        <NavButton
          icon={<SettingsIcon />}
          label="Settings"
          onClick={() => onNavigate("settings")}
        />
      </nav>

      <button
        className="mt-5 rounded-2xl border border-red-400/35 px-4 py-2.5 text-sm font-bold text-red-300 transition hover:bg-red-500/10 lg:mt-auto"
        onClick={onLogout}
      >
        Logout
      </button>
    </aside>
  );
}

function TopHeader() {
  return (
    <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6">
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight">Dashboard</h2>
        <p className="text-sm font-medium text-slate-400">
          Live analytics for your water monitoring system
        </p>
      </div>
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/10 font-extrabold text-sky-200 shadow-lg shadow-black/20">
        H
      </div>
    </header>
  );
}

function HeroCard() {
  return (
    <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.24),transparent_32%),linear-gradient(135deg,#162452,#111832)] p-6 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-sky-300">
            Water Monitoring Station
          </p>
          <h3 className="mt-3 text-4xl font-extrabold">{turbidityStatus}</h3>
          <p className="mt-3 max-w-xl text-sm font-medium leading-6 text-slate-300">
            Turbidity has crossed the safe operating range. Review recent
            readings, verify filters, and inspect the station intake.
          </p>
        </div>
        <div className="rounded-3xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-right">
          <p className="text-sm font-bold text-red-300">Current Turbidity</p>
          <p className="text-5xl font-extrabold">{latestReading.turbidity}</p>
          <p className="text-xs font-bold text-slate-400">NTU</p>
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  accent,
  icon,
  label,
  sparkline,
  status,
  trend,
  trendValue,
  value,
}: {
  accent: "blue" | "red";
  icon: React.ReactNode;
  label: string;
  sparkline: number[];
  status: MetricStatus;
  trend: "increase" | "decrease";
  trendValue: string;
  value: string;
}) {
  const isCritical = status === "Very Cloudy" || status === "High";
  const isWarning = status === "Cloudy";
  const accentColor = accent === "red" ? "#F87171" : "#38BDF8";

  return (
    <article className="group rounded-[24px] border border-white/10 bg-[#111A38] p-5 shadow-xl shadow-black/10 transition hover:-translate-y-0.5 hover:border-white/20">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${accentColor}22`, color: accentColor }}
          >
            {icon}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-400">{label}</p>
            <p className="text-2xl font-extrabold">{value}</p>
          </div>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${
            trend === "increase"
              ? "bg-red-500/10 text-red-300"
              : "bg-sky-500/10 text-sky-300"
          }`}
        >
          {trend === "increase" ? "Up" : "Down"} {trendValue}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <StatusBadge isCritical={isCritical} isWarning={isWarning} status={status} />
        <Sparkline color={accentColor} values={sparkline} />
      </div>
    </article>
  );
}

function ChartPanel() {
  return (
    <section className="rounded-[28px] border border-white/10 bg-[#111A38] p-5 shadow-xl shadow-black/10">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-extrabold">Turbidity Trend</h3>
          <p className="text-sm font-medium text-slate-400">
            Historical NTU values with threshold coloring
          </p>
        </div>
        <StatusBadge isCritical status={turbidityStatus} />
      </div>
      <div className="h-80 rounded-3xl border border-white/10 bg-[#0B1128] p-4">
        <LineChart readings={sensorLogs} />
      </div>
    </section>
  );
}

function AlertsPanel() {
  return (
    <section className="rounded-[28px] border border-white/10 bg-[#111A38] p-5 shadow-xl shadow-black/10">
      <h3 className="text-xl font-extrabold">Alerts</h3>
      <p className="mb-4 text-sm font-medium text-slate-400">
        Recent threshold events
      </p>
      <div className="space-y-3">
        {alerts.map((alert) => (
          <AlertCard
            detail={alert.detail}
            key={`${alert.title}-${alert.timestamp}`}
            status={alert.status}
            timestamp={alert.timestamp}
            title={alert.title}
          />
        ))}
      </div>
    </section>
  );
}

function QuickInfoPanel({ accessToken }: { accessToken: string }) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-[#111A38] p-5 shadow-xl shadow-black/10">
      <h3 className="text-xl font-extrabold">Quick Info</h3>
      <div className="mt-4 space-y-3 text-sm">
        <InfoRow label="Latest reading" value={`${latestReading.turbidity} NTU`} />
        <InfoRow label="System status" value={turbidityStatus} />
        <InfoRow label="Last updated" value={latestReading.created_at} />
        <InfoRow label="Session" value={`${accessToken.slice(0, 12)}...`} />
      </div>
    </section>
  );
}

function LineChart({
  readings,
}: {
  readings: Array<{
    created_at: string;
    turbidity: number;
    water_level: number;
    flow_rate: number;
  }>;
}) {
  const chartWidth = 760;
  const chartHeight = 250;
  const padding = 36;
  const maxReading = 150;
  const usableWidth = chartWidth - padding * 2;
  const usableHeight = chartHeight - padding * 2;
  const points = readings.map((reading, index) => {
    const x = padding + (index / (readings.length - 1)) * usableWidth;
    const y =
      padding +
      usableHeight -
      (Math.min(reading.turbidity, maxReading) / maxReading) * usableHeight;

    return { x, y, ...reading };
  });
  const pointString = points.map((point) => `${point.x},${point.y}`).join(" ");
  const areaString = `${padding},${chartHeight - padding} ${pointString} ${
    chartWidth - padding
  },${chartHeight - padding}`;

  return (
    <div className="h-full w-full">
      <svg
        aria-label="Turbidity trend chart"
        className="h-[calc(100%-1.75rem)] w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      >
        {[150, 100, 50, 0].map((label) => {
          const y =
            padding + usableHeight - (label / maxReading) * usableHeight;

          return (
            <g key={label}>
              <line
                stroke="#334155"
                strokeDasharray="6 8"
                strokeOpacity="0.75"
                strokeWidth="1.5"
                x1={padding}
                x2={chartWidth - padding}
                y1={y}
                y2={y}
              />
              <text
                fill="#94A3B8"
                fontSize="12"
                fontWeight="700"
                textAnchor="end"
                x={padding - 8}
                y={y + 4}
              >
                {label}
              </text>
            </g>
          );
        })}
        <polygon fill="#7F1D1D" opacity="0.22" points={areaString} />
        <polyline
          fill="none"
          points={pointString}
          stroke="#F87171"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="5"
        />
        {points.map((point, index) => (
          <g key={`${point.created_at}-${point.turbidity}`}>
            <circle
              cx={point.x}
              cy={point.y}
              fill={getChartColor(point.turbidity)}
              r="6"
              stroke="#0B1128"
              strokeWidth="3"
            >
              <title>
                {point.created_at}: {point.turbidity} NTU
              </title>
            </circle>
            {index % 2 === 0 || index === points.length - 1 ? (
              <text
                fill="#CBD5E1"
                fontSize="11"
                fontWeight="700"
                textAnchor="middle"
                x={point.x}
                y={chartHeight - 8}
              >
                {point.created_at.replace(" PM", "")}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-xs font-extrabold text-slate-300">
        <ChartLegend color="#38BDF8" label="Normal" />
        <ChartLegend color="#FBBF24" label="Warning" />
        <ChartLegend color="#F87171" label="Critical" />
      </div>
    </div>
  );
}

function Sparkline({ color, values }: { color: string; values: number[] }) {
  const width = 110;
  const height = 42;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;

      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      className="h-11 w-28"
      preserveAspectRatio="none"
      viewBox={`0 0 ${width} ${height}`}
    >
      <polyline
        fill="none"
        points={points}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4"
      />
    </svg>
  );
}

function StatusBadge({
  isCritical = false,
  isWarning = false,
  status,
}: {
  isCritical?: boolean;
  isWarning?: boolean;
  status: string;
}) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-extrabold ${
        isCritical
          ? "bg-red-500/10 text-red-300"
          : isWarning
            ? "bg-yellow-400/10 text-yellow-300"
            : "bg-sky-500/10 text-sky-300"
      }`}
    >
      {status}
    </span>
  );
}

function AlertCard({
  title,
  detail,
  timestamp,
  status,
}: {
  title: string;
  detail: string;
  timestamp: string;
  status: AlertStatus;
}) {
  const isCritical = status === "Critical";

  return (
    <div
      className={`rounded-2xl border p-4 ${
        isCritical
          ? "border-red-400/30 bg-red-500/10"
          : "border-yellow-300/30 bg-yellow-400/10"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={`font-extrabold ${
            isCritical ? "text-red-300" : "text-yellow-200"
          }`}
        >
          {title}
        </p>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
            isCritical ? "bg-red-400 text-white" : "bg-yellow-300 text-slate-950"
          }`}
        >
          {status}
        </span>
      </div>
      <p className="mt-2 text-sm font-medium text-slate-300">{detail}</p>
      <p className="mt-3 text-xs font-extrabold text-slate-500">{timestamp}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.04] px-4 py-3">
      <span className="font-medium text-slate-400">{label}</span>
      <span className="font-extrabold text-slate-100">{value}</span>
    </div>
  );
}

function NavButton({
  active = false,
  icon,
  label,
  onClick,
}: {
  active?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      className={`flex shrink-0 items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-sm font-extrabold transition ${
        active
          ? "bg-sky-400/15 text-sky-200 shadow-lg shadow-sky-500/10"
          : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
      }`}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function ChartLegend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto grid max-w-7xl gap-5 px-4 pb-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {[1, 2, 3, 4].map((item) => (
        <div
          className="h-40 animate-pulse rounded-[28px] bg-white/[0.06]"
          key={item}
        />
      ))}
    </div>
  );
}

function getTurbidityStatus(value: number): MetricStatus {
  if (value >= 76) {
    return "Very Cloudy";
  }

  if (value >= 50) {
    return "Cloudy";
  }

  return "Clear";
}

function getChartColor(value: number) {
  if (value >= 76) {
    return "#F87171";
  }

  if (value >= 50) {
    return "#FBBF24";
  }

  return "#38BDF8";
}

function DropletIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 3c0 5-6 6.8-6 12a6 6 0 1 0 12 0c0-5.2-6-7-6-12Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 5h7v6H4V5Zm9 0h7v14h-7V5ZM4 13h7v6H4v-6Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function LogsIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M6 5h12M6 12h12M6 19h8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M19 12a7.7 7.7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8.6 8.6 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a8.6 8.6 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7.7 7.7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8.6 8.6 0 0 0 1.7 1l.3 3.1h5l.3-3.1a8.6 8.6 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function WaterIcon() {
  return <DropletIcon />;
}

function FlowIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 8h12a4 4 0 0 1 0 8H8m0 0 3-3m-3 3 3 3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function GaugeIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M5 17a8 8 0 1 1 14 0M12 17l4-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
