"use client";

import { EngineSettings } from "@/types/hydrowatch";

type SettingsProps = {
  accessToken: string;
  settings: EngineSettings;
  onSave: (settings: EngineSettings) => void;
};

export function Settings({ accessToken, settings, onSave }: SettingsProps) {
  return (
    <>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-[#111A38] p-4">
            <h2 className="mb-3 text-xl font-extrabold">Thresholds</h2>
            <NumericInput label="Clear max" value={settings.thresholds.clearMax} onChange={(v) => onSave({ ...settings, thresholds: { ...settings.thresholds, clearMax: v } })} />
            <NumericInput label="Cloudy max" value={settings.thresholds.cloudyMax} onChange={(v) => onSave({ ...settings, thresholds: { ...settings.thresholds, cloudyMax: v } })} />
            <NumericInput label="Critical min" value={settings.thresholds.criticalMin} onChange={(v) => onSave({ ...settings, thresholds: { ...settings.thresholds, criticalMin: v } })} />
          </section>
          <section className="rounded-2xl border border-white/10 bg-[#111A38] p-4">
            <h2 className="mb-3 text-xl font-extrabold">Engine</h2>
            <NumericInput label="Alert sensitivity" value={settings.alertSensitivity} step={0.1} onChange={(v) => onSave({ ...settings, alertSensitivity: v })} />
            <NumericInput label="Auto-refresh ms" value={settings.refreshIntervalMs} step={500} onChange={(v) => onSave({ ...settings, refreshIntervalMs: v })} />
            <NumericInput label="Prediction aggressiveness" value={settings.predictionAggressiveness} step={0.1} onChange={(v) => onSave({ ...settings, predictionAggressiveness: v })} />
            <p className="mt-4 text-xs text-slate-400">Session token: {accessToken.slice(0, 10)}...</p>
          </section>
        </div>
    </>
  );
}

function NumericInput({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm text-slate-300">{label}</span>
      <input className="w-full rounded-xl bg-[#0B1128] px-3 py-2" type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
