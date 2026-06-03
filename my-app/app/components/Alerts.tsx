"use client";

import { SystemAlert } from "@/types/hydrowatch";
import { formatManilaDateTime, formatManilaTime } from "@/utils/time-format";

type AlertsProps = {
  alerts: SystemAlert[];
  onAcknowledgeAlert: (alertId: string) => void;
};

export function Alerts({ alerts, onAcknowledgeAlert }: AlertsProps) {
  const criticalAlerts = alerts.filter((alert) => alert.severity === "Critical");
  const warningAlerts = alerts.filter((alert) => alert.severity === "Warning");
  const informationalAlerts = alerts.filter((alert) => alert.severity === "Informational");
  const latestAlert = alerts[0] ?? null;

  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-extrabold">Alerts</h2>
          <p className="text-sm text-slate-400">Priority status feed for dangerous and caution-level water events</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-slate-300">
          {alerts.length} total
        </span>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <AlertMetric
          description="Immediate attention required"
          label="Critical"
          tone="critical"
          value={criticalAlerts.length}
        />
        <AlertMetric
          description="Watch closely and prepare action"
          label="Caution"
          tone="warning"
          value={warningAlerts.length}
        />
        <AlertMetric
          description={
            latestAlert
              ? `Latest at ${formatManilaTime(latestAlert.timestamp)}`
              : "No recent system notices"
          }
          label="Informational"
          tone="info"
          value={informationalAlerts.length}
        />
      </section>

      <section className="mt-5 rounded-3xl border border-white/10 bg-[#111A38] p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-sky-300">Alert Queue</p>
            <h3 className="mt-1 text-2xl font-extrabold">Realtime Severity Feed</h3>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <LegendChip label="Danger" tone="critical" />
            <LegendChip label="Caution" tone="warning" />
            <LegendChip label="Info" tone="info" />
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-400">
          Click <span className="font-semibold text-emerald-300">OK</span> after the water is already okay to remove the alert from the active feed.
        </p>

        {alerts.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-5 text-sm text-emerald-200">
            No active alerts. The system is either stable right now or the previous alerts were already marked okay.
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {alerts.map((alert) => {
              const tone = getAlertTone(alert.severity);

              return (
                <article
                  className={`rounded-2xl border px-4 py-4 shadow-lg shadow-black/10 transition-colors duration-300 ${tone.card}`}
                  key={alert.id}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] ${tone.badge}`}>
                          {alert.severity}
                        </span>
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                          {alert.type.replaceAll("_", " ")}
                        </span>
                      </div>
                      <h4 className="mt-3 text-lg font-extrabold text-white">{alert.title}</h4>
                      <p className="mt-2 text-sm text-slate-200">{alert.message}</p>
                      <p className="mt-2 text-sm font-medium text-slate-300">Recommended action: {alert.action}</p>
                    </div>

                    <div className="grid shrink-0 gap-2 sm:grid-cols-2 lg:w-[240px] lg:grid-cols-1">
                      <AlertDetail label="NTU Level" tone={tone.detail} value={`${alert.ntuValue} NTU`} />
                      <AlertDetail
                        label="Detected"
                        tone={tone.detail}
                        value={formatManilaDateTime(alert.timestamp)}
                      />
                      <button
                        className="rounded-2xl border border-emerald-300/30 bg-emerald-500/15 px-3 py-3 text-sm font-bold text-emerald-100 transition hover:bg-emerald-500/25"
                        onClick={() => onAcknowledgeAlert(alert.id)}
                        type="button"
                      >
                        OK
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function AlertMetric({
  description,
  label,
  tone,
  value,
}: {
  description: string;
  label: string;
  tone: "critical" | "warning" | "info";
  value: number;
}) {
  const styles =
    tone === "critical"
      ? "border-red-400/30 bg-red-500/10 text-red-200"
      : tone === "warning"
        ? "border-yellow-400/30 bg-yellow-500/10 text-yellow-100"
        : "border-sky-400/30 bg-sky-500/10 text-sky-100";

  return (
    <article className={`rounded-3xl border p-4 ${styles}`}>
      <p className="text-xs font-bold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-3 text-3xl font-extrabold text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-300">{description}</p>
    </article>
  );
}

function LegendChip({
  label,
  tone,
}: {
  label: string;
  tone: "critical" | "warning" | "info";
}) {
  const styles =
    tone === "critical"
      ? "border-red-400/30 bg-red-500/10 text-red-200"
      : tone === "warning"
        ? "border-yellow-400/30 bg-yellow-500/10 text-yellow-100"
        : "border-sky-400/30 bg-sky-500/10 text-sky-100";

  return <span className={`rounded-full border px-3 py-1 ${styles}`}>{label}</span>;
}

function AlertDetail({
  label,
  tone,
  value,
}: {
  label: string;
  tone: string;
  value: string;
}) {
  return (
    <div className={`rounded-2xl border px-3 py-3 ${tone}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function getAlertTone(severity: SystemAlert["severity"]) {
  if (severity === "Critical") {
    return {
      badge: "border border-red-300/30 bg-red-500/20 text-red-100",
      card: "border-red-400/25 bg-gradient-to-r from-red-500/18 via-[#17172D] to-[#17172D]",
      detail: "border-red-300/20 bg-red-500/8",
    };
  }

  if (severity === "Warning") {
    return {
      badge: "border border-yellow-300/30 bg-yellow-500/20 text-yellow-100",
      card: "border-yellow-400/25 bg-gradient-to-r from-yellow-500/15 via-[#17172D] to-[#17172D]",
      detail: "border-yellow-300/20 bg-yellow-500/8",
    };
  }

  return {
    badge: "border border-sky-300/30 bg-sky-500/20 text-sky-100",
    card: "border-sky-400/20 bg-gradient-to-r from-sky-500/15 via-[#17172D] to-[#17172D]",
    detail: "border-sky-300/20 bg-sky-500/8",
  };
}
