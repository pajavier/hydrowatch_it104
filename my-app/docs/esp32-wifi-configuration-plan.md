# ESP32 WiFi Configuration Implementation Plan

## What changed

- The Settings page includes an ESP32 WiFi Configuration section with device status, SSID, IP address, last seen, RSSI, firmware version, device ID, and MAC address.
- Authenticated dashboard API routes proxy device commands to the ESP32:
  - `GET /api/esp32/device/status`
  - `GET /api/esp32/device/wifi`
  - `POST /api/esp32/device/wifi`
  - `POST /api/esp32/device/restart`
  - `POST /api/esp32/device/clear-wifi`
- The ESP32 stores WiFi credentials in Preferences/NVS and starts `HydroWatch-Setup` when credentials are missing or repeatedly fail.
- A physical reset button on GPIO0 clears WiFi credentials after a 5 second hold.
- Ingestion still posts turbidity readings to `/api/esp32/ingest`; metadata was added for device health only.

## Required deployment settings

- Set `HYDROWATCH_DEVICE_API_KEY` in the Next.js environment.
- Set the same value in `hydrowatchDeviceApiKey` inside `app/firmware/esp32-turbidity.ino` before flashing the new firmware.
- Optional fallback: set `HYDROWATCH_ESP32_HOST` if the dashboard has not yet learned the ESP32 IP from ingestion metadata.
- Apply `supabase/20260609_esp32_wifi_configuration.sql` to existing Supabase projects.

## First-time setup

1. Flash the updated firmware once.
2. Power on the ESP32.
3. If no WiFi credentials exist, connect a phone or laptop to `HydroWatch-Setup`.
4. Open `http://192.168.4.1`.
5. Enter the WiFi SSID and password.
6. The ESP32 stores credentials in NVS, restarts, connects, and resumes HydroWatch ingestion.

## Future WiFi changes

1. Sign in to HydroWatch.
2. Open Settings.
3. Enter the new WiFi SSID and password in ESP32 WiFi Configuration.
4. Click Save Configuration.
5. The dashboard sends the change to the ESP32 through authenticated API routes.
6. The ESP32 stores the new credentials and restarts into the new network.

## Backward compatibility

- Existing turbidity readings, calibration, prediction logic, dashboard charts, Supabase ingestion, and HTTPS/HTTP posting behavior are unchanged.
- Existing ESP32 deployments keep working with hardcoded credentials until the new firmware is flashed.
- Existing database deployments need only the additive migration; no old columns or data are removed.

## Security notes

- Saved WiFi passwords are never returned by firmware endpoints and are never displayed in the UI.
- Dashboard routes require a valid Supabase user session before device commands are allowed.
- Firmware routes require `X-HydroWatch-Key`.
- Preferences/NVS is used for credential storage. For production devices, enable ESP32 NVS encryption in the board security/partition configuration so stored credentials are encrypted at rest.

## Feasible next enhancements

- Nearby WiFi scan endpoint and SSID picker.
- OTA firmware upload with signed images.
- Multiple saved WiFi profiles.
- Firmware version checker.
- Remote diagnostics, logs, reconnect history, and device health trend charts.
