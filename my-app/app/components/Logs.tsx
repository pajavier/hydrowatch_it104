"use client";

type LogsProps = {
  accessToken: string;
  onNavigate: (screen: "dashboard" | "settings" | "logs") => void;
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

export function Logs({ accessToken, onNavigate }: LogsProps) {
  const recentLogs = [...sensorLogs].reverse();

  return (
    <main className="min-h-screen bg-[#070B1A] text-white">
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <button
              className="mb-4 rounded-2xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
              onClick={() => onNavigate("dashboard")}
            >
              Back to Dashboard
            </button>
            <h1 className="text-3xl font-extrabold tracking-tight">Logs</h1>
            <p className="text-sm font-medium text-slate-400">
              Complete sensor history from turbidity, water level, and flow
              sensors.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-[#111A38] px-5 py-4 text-right shadow-xl shadow-black/10">
            <p className="text-xs font-bold text-slate-400">Authenticated</p>
            <p className="font-extrabold text-sky-200">
              {accessToken.slice(0, 12)}...
            </p>
          </div>
        </header>

        <section className="mb-5 grid gap-4 md:grid-cols-3">
          <SummaryCard label="Total Logs" value={String(sensorLogs.length)} />
          <SummaryCard
            label="Latest Turbidity"
            tone="critical"
            value={`${sensorLogs[sensorLogs.length - 1].turbidity} NTU`}
          />
          <SummaryCard
            label="Last Updated"
            value={sensorLogs[sensorLogs.length - 1].created_at}
          />
        </section>

        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[#111A38] shadow-xl shadow-black/10">
          <div className="border-b border-white/10 p-5">
            <h2 className="text-xl font-extrabold">Sensor Logs</h2>
            <p className="text-sm font-medium text-slate-400">
              Values use the same fields as the data source:
              turbidity, water_level, flow_rate, created_at.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3">Time</th>
                  <th className="px-5 py-3">Turbidity</th>
                  <th className="px-5 py-3">Water Level</th>
                  <th className="px-5 py-3">Flow Rate</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {recentLogs.map((log) => (
                  <tr
                    className="transition hover:bg-white/[0.03]"
                    key={log.created_at}
                  >
                    <td className="px-5 py-4 font-bold text-slate-300">
                      {log.created_at}
                    </td>
                    <td className="px-5 py-4 font-extrabold">
                      <span style={{ color: getChartColor(log.turbidity) }}>
                        {log.turbidity} NTU
                      </span>
                    </td>
                    <td className="px-5 py-4">{log.water_level}%</td>
                    <td className="px-5 py-4">{log.flow_rate} L/min</td>
                    <td className="px-5 py-4">
                      <StatusBadge turbidity={log.turbidity} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  tone = "normal",
  value,
}: {
  label: string;
  tone?: "normal" | "critical";
  value: string;
}) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-[#111A38] p-5 shadow-xl shadow-black/10">
      <p className="text-sm font-bold text-slate-400">{label}</p>
      <p
        className={`mt-2 text-3xl font-extrabold ${
          tone === "critical" ? "text-red-300" : "text-white"
        }`}
      >
        {value}
      </p>
    </article>
  );
}

function StatusBadge({ turbidity }: { turbidity: number }) {
  const status =
    turbidity >= 76 ? "Critical" : turbidity >= 50 ? "Warning" : "Normal";

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-extrabold ${
        status === "Critical"
          ? "bg-red-500/10 text-red-300"
          : status === "Warning"
            ? "bg-yellow-400/10 text-yellow-300"
            : "bg-sky-500/10 text-sky-300"
      }`}
    >
      {status}
    </span>
  );
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
