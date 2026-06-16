"use client";

import { useMemo, useState } from "react";
import { SystemLog } from "@/types/hydrowatch";
import { createUtcTimestamp, formatManilaDateInput, formatManilaDateTime } from "@/utils/time-format";
import { motion } from "framer-motion";

type LogsProps = {
  logs: SystemLog[];
};

export function Logs({ logs }: LogsProps) {
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<"all" | "Critical" | "Warning" | "Informational">("all");
  const [date, setDate] = useState("");

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
    const fileTimestamp = createUtcTimestamp().replace(/[:.]/g, "-");
    const link = document.createElement("a");
    link.href = url;
    link.download = `hydrowatch_logs_${fileTimestamp}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-4"
    >
      <motion.div variants={itemVariants} className="mb-5">
        <h2 className="text-2xl font-bold">System Logs</h2>
        <p className="text-sm text-slate-400">View and export raw event logs from the system</p>
      </motion.div>

      <motion.section variants={itemVariants} className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111A38] to-[#0B1128] p-5 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <input className="h-10 rounded-xl border border-white/10 bg-[#0B1128] px-3 py-2 text-sm" placeholder="Search logs..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="h-10 rounded-xl border border-white/10 bg-[#0B1128] px-3 py-2 text-sm" value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
            <option value="all">All severities</option><option value="Critical">Critical</option><option value="Warning">Warning</option><option value="Informational">Informational</option>
            </select>
            <input className="h-10 rounded-xl border border-white/10 bg-[#0B1128] px-3 py-2 text-sm" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <button className="h-10 rounded-xl bg-sky-400 px-4 text-sm font-extrabold text-[#071225] transition hover:bg-sky-300" onClick={exportCsv}>Export CSV</button>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-[#0B1128]/50">
          <table className="w-full text-sm">
            <thead className="border-b border-white/10 bg-white/5 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left font-medium tracking-wider">Time</th>
                <th className="px-4 py-3 text-left font-medium tracking-wider">Severity</th>
                <th className="px-4 py-3 text-left font-medium tracking-wider">Category</th>
                <th className="px-4 py-3 text-left font-medium tracking-wider">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.length === 0 ? (
                <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                    {logs.length === 0 ? "No system logs have been recorded yet." : "No logs match the current filters."}
                  </td>
                </motion.tr>
              ) : (
                filtered.map((log) => (
                  <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="transition-colors hover:bg-white/5" key={log.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-300">{formatManilaDateTime(log.timestamp)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                        log.severity === 'Critical' ? 'bg-red-500/20 text-red-200' :
                        log.severity === 'Warning' ? 'bg-amber-500/20 text-amber-200' :
                        'bg-sky-500/20 text-sky-200'
                      }`}>{log.severity}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-400">{log.category}</td>
                    <td className="px-4 py-3 text-slate-200">{log.message}</td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.section>
    </motion.div>
  );
}
