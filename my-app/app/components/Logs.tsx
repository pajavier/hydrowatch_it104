"use client";

import { useMemo, useState } from "react";
import { SystemLog, WaterReading } from "@/types/hydrowatch";
import { createUtcTimestamp, formatManilaDateInput, formatManilaDateTime } from "@/utils/time-format";

type LogsProps = {
  accessToken: string;
  readings: WaterReading[];
  logs: SystemLog[];
};

export function Logs({ accessToken, readings, logs }: LogsProps) {
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<"all" | "Critical" | "Warning" | "Informational">("all");
  const [date, setDate] = useState("");

  const filtered = useMemo(
    () =>
      logs.filter((log) => {
        const severityMatch = severity === "all" || log.severity === severity;
        const searchMatch = search === "" || log.message.toLowerCase().includes(search.toLowerCase());
        const dateMatch = date === "" || formatManilaDateInput(log.timestamp) === date;
        return severityMatch && searchMatch && dateMatch;
      }),
    [logs, search, severity, date],
  );

  const exportCsv = () => {
    const rows = [
      ["timestamp", "severity", "category", "message"].join(","),
      ...filtered.map((l) => [l.timestamp, l.severity, l.category, `"${l.message.replace(/"/g, '""')}"`].join(",")),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hydrowatch_logs_${createUtcTimestamp()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input className="rounded-xl bg-[#111A38] px-3 py-2" placeholder="Search logs" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="rounded-xl bg-[#111A38] px-3 py-2" value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
            <option value="all">All severities</option><option value="Critical">Critical</option><option value="Warning">Warning</option><option value="Informational">Informational</option>
          </select>
          <input className="rounded-xl bg-[#111A38] px-3 py-2" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="rounded-xl bg-sky-400 px-3 py-2 font-bold text-slate-900" onClick={exportCsv}>Export CSV</button>
        </div>
        <p className="mb-4 text-xs text-slate-400">Session {accessToken.slice(0, 10)}... | Readings {readings.length} | Logs {filtered.length}</p>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#111A38]">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr><th className="px-3 py-2 text-left">Time</th><th className="px-3 py-2 text-left">Severity</th><th className="px-3 py-2 text-left">Category</th><th className="px-3 py-2 text-left">Message</th></tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr className="border-t border-white/10" key={log.id}>
                  <td className="px-3 py-2">{formatManilaDateTime(log.timestamp)}</td>
                  <td className="px-3 py-2">{log.severity}</td>
                  <td className="px-3 py-2">{log.category}</td>
                  <td className="px-3 py-2">{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </>
  );
}
