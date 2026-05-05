"use client";

import { useState } from "react";

type SettingsProps = {
  accessToken: string;
  onNavigate: (screen: "dashboard" | "settings" | "logs") => void;
};

export function Settings({ accessToken, onNavigate }: SettingsProps) {
  const [clearMax, setClearMax] = useState(49);
  const [warningMin, setWarningMin] = useState(50);
  const [warningMax, setWarningMax] = useState(75);
  const [criticalMin, setCriticalMin] = useState(76);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);

  return (
    <main className="min-h-screen bg-[#070B1A] text-white">
      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <button
              className="mb-4 rounded-2xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
              onClick={() => onNavigate("dashboard")}
            >
              Back to Dashboard
            </button>
            <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
            <p className="text-sm font-medium text-slate-400">
              Configure turbidity thresholds and alert delivery.
            </p>
          </div>
          <button
            className="rounded-2xl bg-sky-400 px-5 py-3 text-sm font-extrabold text-slate-950 shadow-lg shadow-sky-500/20 transition hover:bg-sky-300"
            type="button"
          >
            Save Settings
          </button>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-[28px] border border-white/10 bg-[#111A38] p-5 shadow-xl shadow-black/10">
            <div className="mb-5">
              <h2 className="text-xl font-extrabold">Turbidity Thresholds</h2>
              <p className="text-sm font-medium text-slate-400">
                NTU ranges determine Clear, Cloudy, and Very Cloudy status
                labels.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <ThresholdInput
                color="#38BDF8"
                label="Clear maximum"
                onChange={setClearMax}
                suffix="NTU"
                value={clearMax}
              />
              <ThresholdInput
                color="#FBBF24"
                label="Warning minimum"
                onChange={setWarningMin}
                suffix="NTU"
                value={warningMin}
              />
              <ThresholdInput
                color="#FBBF24"
                label="Warning maximum"
                onChange={setWarningMax}
                suffix="NTU"
                value={warningMax}
              />
              <ThresholdInput
                color="#F87171"
                label="Critical minimum"
                onChange={setCriticalMin}
                suffix="NTU"
                value={criticalMin}
              />
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <RangePreview
                color="#38BDF8"
                label="Clear"
                value={`0-${clearMax} NTU`}
              />
              <RangePreview
                color="#FBBF24"
                label="Cloudy"
                value={`${warningMin}-${warningMax} NTU`}
              />
              <RangePreview
                color="#F87171"
                label="Very Cloudy"
                value={`${criticalMin}+ NTU`}
              />
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-[28px] border border-white/10 bg-[#111A38] p-5 shadow-xl shadow-black/10">
              <h2 className="text-xl font-extrabold">Alerts</h2>
              <p className="mb-4 text-sm font-medium text-slate-400">
                Toggle real-time warning behavior.
              </p>
              <div className="space-y-3">
                <ToggleRow
                  checked={alertsEnabled}
                  label="Enable alerts"
                  onChange={setAlertsEnabled}
                />
                <ToggleRow
                  checked={soundEnabled}
                  label="Sound notifications"
                  onChange={setSoundEnabled}
                />
                <ToggleRow
                  checked={emailEnabled}
                  label="Email notifications"
                  onChange={setEmailEnabled}
                />
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-[#111A38] p-5 shadow-xl shadow-black/10">
              <h2 className="text-xl font-extrabold">Session</h2>
              <p className="mt-3 rounded-2xl bg-white/[0.04] p-3 text-xs font-semibold text-slate-400">
                Token: {accessToken.slice(0, 18)}...
              </p>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

function ThresholdInput({
  color,
  label,
  onChange,
  suffix,
  value,
}: {
  color: string;
  label: string;
  onChange: (value: number) => void;
  suffix: string;
  value: number;
}) {
  return (
    <label className="block rounded-3xl border border-white/10 bg-[#0B1128] p-4">
      <span className="flex items-center gap-2 text-sm font-bold text-slate-300">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        {label}
      </span>
      <div className="mt-3 flex h-12 items-center rounded-2xl border border-white/10 bg-white/[0.04] px-3 focus-within:border-sky-300/60">
        <input
          className="min-w-0 flex-1 bg-transparent text-lg font-extrabold text-white outline-none"
          min="0"
          onChange={(event) => onChange(Number(event.target.value))}
          type="number"
          value={value}
        />
        <span className="text-sm font-bold text-slate-500">{suffix}</span>
      </div>
    </label>
  );
}

function RangePreview({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-sm font-bold text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-extrabold" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function ToggleRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.04] px-4 py-3">
      <span className="text-sm font-bold text-slate-300">{label}</span>
      <button
        aria-pressed={checked}
        className={`relative h-7 w-12 rounded-full transition ${
          checked ? "bg-sky-400" : "bg-slate-700"
        }`}
        onClick={() => onChange(!checked)}
        type="button"
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </button>
    </label>
  );
}
