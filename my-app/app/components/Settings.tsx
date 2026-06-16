"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ContainerType, EngineSettings, EnvironmentSettings, LightCondition, WaterType } from "@/types/hydrowatch";
import { motion, type Variants } from "framer-motion";

type SettingsProps = {
  accessToken: string;
  environmentSettings: EnvironmentSettings | null;
  settings: EngineSettings;
  onSaveEnvironment: (settings: Omit<EnvironmentSettings, "id" | "userId" | "createdAt" | "updatedAt">) => Promise<EnvironmentSettings>;
  onSave: (settings: EngineSettings) => void;
};

type DeviceStatusResponse = {
  ok: boolean;
  database?: {
    sensor_status?: string | null;
    last_reading_at?: string | null;
    last_successful_post_at?: string | null;
    consecutive_failures?: number | null;
    signal_strength_dbm?: number | null;
    current_ssid?: string | null;
    current_ip_address?: string | null;
    device_id?: string | null;
    mac_address?: string | null;
    firmware_version?: string | null;
    setup_mode?: boolean | null;
    updated_at?: string | null;
  } | null;
  device?: {
    status?: string;
    ssid?: string;
    ipAddress?: string;
    rssi?: number;
    lastSeen?: string;
    firmwareVersion?: string;
    deviceId?: string;
    macAddress?: string;
    setupMode?: boolean;
  } | null;
  directReachable?: boolean;
};

const lightConditionOptions: LightCondition[] = ["Present", "Not Present"];
const waterTypeOptions: WaterType[] = ["Distilled Water", "Tap Water", "River Water", "Lake Water", "Ground Water", "Other"];
const containerTypeOptions: ContainerType[] = ["Glass", "Plastic", "Beaker", "Bottle", "Laboratory Tube", "Other"];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

export function Settings({ accessToken, environmentSettings, settings, onSave, onSaveEnvironment }: SettingsProps) {
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatusResponse | null>(null);
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [isDeviceLoading, setIsDeviceLoading] = useState(false);
  const [deviceMessage, setDeviceMessage] = useState<string | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const device = useMemo(() => {
    const direct = deviceStatus?.device;
    const database = deviceStatus?.database;
    const rssi = toNullableNumber(direct?.rssi ?? database?.signal_strength_dbm);

    return {
      status: direct?.status ?? database?.sensor_status ?? "UNKNOWN",
      ssid: nonEmptyText(direct?.ssid ?? database?.current_ssid, "Not connected"),
      ipAddress: nonEmptyText(direct?.ipAddress ?? database?.current_ip_address, "Unknown"),
      lastSeen: database?.updated_at ?? database?.last_reading_at ?? direct?.lastSeen ?? null,
      rssi,
      signalStrength: formatSignalStrength(rssi),
      firmwareVersion: nonEmptyText(direct?.firmwareVersion ?? database?.firmware_version, "Unknown"),
      deviceId: nonEmptyText(direct?.deviceId ?? database?.device_id, "Unknown"),
      macAddress: nonEmptyText(direct?.macAddress ?? database?.mac_address, "Unknown"),
      setupMode: direct?.setupMode ?? database?.setup_mode ?? false,
      directReachable: Boolean(deviceStatus?.directReachable),
    };
  }, [deviceStatus]);

  const refreshDeviceStatus = useCallback(async (options?: { quiet?: boolean }) => {
    if (!options?.quiet) {
      setIsDeviceLoading(true);
      setDeviceError(null);
    }

    try {
      const response = await fetch("/api/esp32/device/status", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = (await response.json()) as DeviceStatusResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load ESP32 status.");
      setDeviceStatus(payload);
    } catch (error) {
      if (!options?.quiet) {
        setDeviceError(error instanceof Error ? error.message : "Unable to load ESP32 status.");
      }
    } finally {
      if (!options?.quiet) setIsDeviceLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refreshDeviceStatus({ quiet: true }), 0);
    const timer = window.setInterval(() => void refreshDeviceStatus({ quiet: true }), 10000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [refreshDeviceStatus]);

  const submitWifiConfiguration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsDeviceLoading(true);
    setDeviceError(null);
    setDeviceMessage(null);

    try {
      const response = await fetch("/api/esp32/device/wifi", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ssid, password }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Unable to save WiFi configuration.");
      setPassword("");
      setDeviceMessage("WiFi configuration sent. The ESP32 will reconnect automatically.");
      await refreshDeviceStatus({ quiet: true });
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : "Unable to save WiFi configuration.");
    } finally {
      setIsDeviceLoading(false);
    }
  };

  const runDeviceAction = async (action: "restart" | "clear-wifi") => {
    setIsDeviceLoading(true);
    setDeviceError(null);
    setDeviceMessage(null);

    try {
      const response = await fetch(`/api/esp32/device/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Device command failed.");
      setDeviceMessage(action === "restart" ? "Restart command sent." : "WiFi credentials cleared. Device will boot into setup mode.");
      await refreshDeviceStatus({ quiet: true });
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : "Device command failed.");
    } finally {
      setIsDeviceLoading(false);
    }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-4"
    >
      <motion.div variants={itemVariants} className="mb-5">
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-sm text-slate-400">Configure system, environment, and device parameters</p>
      </motion.div>

      <motion.div variants={itemVariants} className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-500/20 to-indigo-600/10 p-5 shadow-xl backdrop-blur-md transition-all hover:shadow-2xl hover:shadow-indigo-500/10">
          <h3 className="mb-4 text-lg font-semibold">Engine Thresholds</h3>
          <NumericInput
            label="Clear max"
            value={settings.thresholds.clearMax}
            onChange={(v) => onSave({ ...settings, thresholds: { ...settings.thresholds, clearMax: v } })}
          />
          <NumericInput
            label="Cloudy max"
            value={settings.thresholds.cloudyMax}
            onChange={(v) => onSave({ ...settings, thresholds: { ...settings.thresholds, cloudyMax: v } })}
          />
          <NumericInput
            label="Critical min"
            value={settings.thresholds.criticalMin}
            onChange={(v) => onSave({ ...settings, thresholds: { ...settings.thresholds, criticalMin: v } })}
          />
        </section>

        <section className="rounded-3xl border border-teal-400/20 bg-gradient-to-br from-teal-500/20 to-emerald-600/10 p-5 shadow-xl backdrop-blur-md transition-all hover:shadow-2xl hover:shadow-emerald-500/10">
          <h3 className="mb-4 text-lg font-semibold">Environment Settings</h3>
          <EnvironmentSettingsForm
            key={environmentSettings?.updatedAt ?? environmentSettings?.id ?? "new"}
            environmentSettings={environmentSettings}
            onSaveEnvironment={onSaveEnvironment}
          />
          <p className="mt-4 text-center text-xs text-slate-400">Session token: {accessToken.slice(0, 10)}...</p>
        </section>
      </motion.div>

      <motion.section variants={itemVariants} className="mt-4 rounded-3xl border border-slate-400/20 bg-gradient-to-br from-slate-500/15 to-slate-600/10 p-5 shadow-xl backdrop-blur-md transition-all hover:shadow-2xl hover:shadow-slate-500/10">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">ESP32 WiFi Configuration</h3>
            <p className="mt-1 text-sm text-slate-400">Update network access without reflashing the firmware.</p>
          </div>
          <button
            className="rounded-xl border border-white/10 px-3 py-2 text-sm font-bold text-sky-200 transition hover:bg-white/10 disabled:opacity-50"
            type="button"
            onClick={() => void refreshDeviceStatus()}
            disabled={isDeviceLoading}
          >
            Refresh
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatusItem label="Device status" value={formatStatus(device.status, device.directReachable)} />
          <StatusItem label="Connected SSID" value={device.ssid} />
          <StatusItem label="Device IP Address" value={device.ipAddress} />
          <StatusItem label="Last Seen" value={formatTimestamp(device.lastSeen)} />
          <StatusItem label="Signal Strength" value={device.signalStrength} />
          <StatusItem label="Firmware Version" value={device.firmwareVersion} />
          <StatusItem label="Device ID" value={device.deviceId} />
          <StatusItem label="MAC Address" value={device.macAddress} />
        </div>

        <form className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_auto]" onSubmit={submitWifiConfiguration}>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">WiFi SSID</span>
            <input
              className="w-full rounded-xl bg-[#0B1128] px-3 py-2"
              value={ssid}
              onChange={(event) => setSsid(event.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">WiFi Password</span>
            <input
              className="w-full rounded-xl bg-[#0B1128] px-3 py-2"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password is never displayed"
            />
          </label>
          <button
            className="self-end rounded-xl bg-sky-400 px-4 py-2 font-extrabold text-[#071225] transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={isDeviceLoading}
          >
            Save Configuration
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded-xl border border-white/10 px-3 py-2 text-sm font-bold text-slate-100 transition hover:bg-white/10 disabled:opacity-50"
            type="button"
            onClick={() => setSsid(device.ssid === "Not connected" ? "" : device.ssid)}
            disabled={isDeviceLoading}
          >
            Change WiFi
          </button>
          <button
            className="rounded-xl border border-red-300/30 px-3 py-2 text-sm font-bold text-red-200 transition hover:bg-red-500/10 disabled:opacity-50"
            type="button"
            onClick={() => void runDeviceAction("clear-wifi")}
            disabled={isDeviceLoading}
          >
            Forget WiFi
          </button>
          <button
            className="rounded-xl border border-white/10 px-3 py-2 text-sm font-bold text-slate-100 transition hover:bg-white/10 disabled:opacity-50"
            type="button"
            onClick={() => void runDeviceAction("restart")}
            disabled={isDeviceLoading}
          >
            Restart Device
          </button>
        </div>

        {device.setupMode && (
          <p className="mt-3 rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-100">
            Setup mode is active. Connect to HydroWatch-Setup to configure WiFi locally.
          </p>
        )}
        {deviceMessage && <p className="mt-3 text-sm font-semibold text-sky-200">{deviceMessage}</p>}
        {deviceError && <p className="mt-3 text-sm font-semibold text-red-300">{deviceError}</p>}
      </motion.section>
    </motion.div>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B1128]/50 px-4 py-3">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-1 break-words text-base font-bold text-slate-100">{value}</p>
    </div>
  );
}

function SelectInput({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-slate-300">{label}</span>
      <select
        className="w-full rounded-xl bg-[#0B1128] px-3 py-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function EnvironmentSettingsForm({
  environmentSettings,
  onSaveEnvironment,
}: {
  environmentSettings: EnvironmentSettings | null;
  onSaveEnvironment: (settings: Omit<EnvironmentSettings, "id" | "userId" | "createdAt" | "updatedAt">) => Promise<EnvironmentSettings>;
}) {
  const [lightCondition, setLightCondition] = useState<LightCondition>(environmentSettings?.lightCondition ?? "Present");
  const [waterType, setWaterType] = useState<WaterType>(environmentSettings?.waterType ?? "Tap Water");
  const [containerType, setContainerType] = useState<ContainerType>(environmentSettings?.containerType ?? "Glass");
  const [waterVolumeMl, setWaterVolumeMl] = useState(
    environmentSettings?.waterVolumeMl === null || environmentSettings?.waterVolumeMl === undefined
      ? ""
      : String(environmentSettings.waterVolumeMl),
  );
  const [notes, setNotes] = useState(environmentSettings?.notes ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submitEnvironmentSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const parsedVolume = waterVolumeMl.trim() ? Number(waterVolumeMl) : null;
      if (parsedVolume !== null && (!Number.isFinite(parsedVolume) || parsedVolume < 0)) {
        throw new Error("Water volume must be a positive number.");
      }

      await onSaveEnvironment({
        lightCondition,
        waterType,
        containerType,
        waterVolumeMl: parsedVolume,
        notes,
      });
      setMessage("Environment settings saved. Future readings will use this configuration.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save environment settings.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <form className="grid gap-3" onSubmit={submitEnvironmentSettings}>
        <SelectInput label="Light Condition" value={lightCondition} options={lightConditionOptions} onChange={(value) => setLightCondition(value as LightCondition)} />
        <SelectInput label="Water Type" value={waterType} options={waterTypeOptions} onChange={(value) => setWaterType(value as WaterType)} />
        <SelectInput label="Container Type" value={containerType} options={containerTypeOptions} onChange={(value) => setContainerType(value as ContainerType)} />
        <label className="block">
          <span className="mb-1 block text-sm text-slate-300">Water Volume (mL)</span>
          <input
            className="w-full rounded-xl bg-[#0B1128] px-3 py-2"
            min="0"
            step="0.1"
            type="number"
            value={waterVolumeMl}
            onChange={(event) => setWaterVolumeMl(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-300">Additional Notes</span>
          <textarea
            className="min-h-24 w-full rounded-xl bg-[#0B1128] px-3 py-2"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <button
          className="rounded-xl bg-sky-400 px-4 py-2 font-extrabold text-[#071225] transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save Environment"}
        </button>
      </form>
      {message && <p className="mt-3 text-sm font-semibold text-sky-200">{message}</p>}
      {errorMessage && <p className="mt-3 text-sm font-semibold text-red-300">{errorMessage}</p>}
    </>
  );
}

function formatStatus(status: string, directReachable: boolean) {
  if (directReachable) return "Online";
  if (status === "ONLINE") return "Online";
  if (status === "OFFLINE") return "Offline";
  return "Unknown";
}

function formatTimestamp(timestamp?: string | null) {
  if (!timestamp) return "Unknown";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatSignalStrength(rssi: number | null) {
  return rssi === null ? "Unknown" : `${rssi} dBm`;
}

function nonEmptyText(value: string | null | undefined, fallback: string) {
  return value && value.trim() ? value : fallback;
}

function toNullableNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
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
