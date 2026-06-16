#include <WiFi.h>
#include <WiFiClient.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Preferences.h>
#include <WebServer.h>
#include <Adafruit_ADS1X15.h>

Adafruit_ADS1115 ads;

const char* firmwareVersion = "2.0.0";
const char* setupApSsid = "HydroWatch-Setup";
const char* hydrowatchIngestUrl = "http://172.20.10.4:3000/api/esp32/ingest";

const char* hydrowatchDeviceApiKey = "change-this-device-key";

const int wifiResetButtonPin = 0;
const unsigned long resetHoldMs = 5000;
const unsigned long readingIntervalMs = 5000;
const unsigned long wifiConnectTimeoutMs = 10000;
const unsigned long httpTimeoutMs = 5000;

const int maxRetries = 4;
const unsigned long retryDelayMs[] = {1000, 2000, 4000, 8000};
const int maxWifiConnectAttempts = 3;

const float ADC_MIN = 100.0;
const float ADC_MAX = 2900.0;
const float NTU_MIN = 0.0;
const float NTU_MAX = 300.0;

Preferences preferences;
WebServer server(80);

unsigned long lastReadingMs = 0;
unsigned long lastSuccessfulPostMs = 0;
unsigned long resetButtonPressedAtMs = 0;
double lastValidReading = 0.0;
int consecutiveFailures = 0;
bool setupMode = false;
bool webServerStarted = false;

void setup() {
  Serial.begin(115200);
  delay(100);
  Wire.begin(21, 22);          // SDA, SCL

  if (!ads.begin()) {
    Serial.println("[HydroWatch] ADS1115 not found!");
    while (1) {
      delay(1000);
    }
  }

  ads.setGain(GAIN_ONE);       // +/-4.096V (0.125mV/bit)

  Serial.println("[HydroWatch] ADS1115 initialized.");
  
  Serial.println("\n\n[HydroWatch] System starting...");

  pinMode(wifiResetButtonPin, INPUT_PULLUP);

  if (!preferences.begin("hydrowatch", false)) {
    Serial.println("[HydroWatch] Preferences init failed!");
  }

  if (connectToSavedWiFi()) {
    startDeviceApi();
    return;
  }

  if (startSetupMode()) {
    startDeviceApi();
  }
}

void loop() {
  if (webServerStarted) {
    server.handleClient();
  }
  handleWifiResetButton();

  if (setupMode) {
    delay(5);
    return;
  }

  unsigned long currentMs = millis();

  if (currentMs - lastReadingMs >= readingIntervalMs) {
    lastReadingMs = currentMs;

    double reading = readTurbidity();
    if (isValidReading(reading)) {
      postTurbidityToSupabase(reading);
      lastValidReading = reading;
    } else {
      Serial.println("[HydroWatch] Reading out of range, skipping post");
    }
  }

  if (WiFi.status() != WL_CONNECTED && (currentMs - lastSuccessfulPostMs) > 60000) {
    Serial.println("[HydroWatch] WiFi disconnected for >60s, attempting reconnect...");
    if (!connectToSavedWiFi()) {
      if (startSetupMode()) {
        startDeviceApi();
      }
    }
  }
}

bool connectToSavedWiFi() {
  String savedSsid = preferences.getString("ssid", "");
  String savedPassword = preferences.getString("password", "");

  if (savedSsid.length() == 0) {
    Serial.println("[HydroWatch] No saved WiFi credentials.");
    return false;
  }

  for (int attempt = 1; attempt <= maxWifiConnectAttempts; attempt++) {
    Serial.print("[HydroWatch] Connecting to WiFi attempt ");
    Serial.print(attempt);
    Serial.print("/");
    Serial.println(maxWifiConnectAttempts);

    WiFi.mode(WIFI_STA);
    WiFi.begin(savedSsid.c_str(), savedPassword.c_str());

    unsigned long connectStartMs = millis();
    int dotCount = 0;

    while (WiFi.status() != WL_CONNECTED) {
      handleWifiResetButton();

      if (millis() - connectStartMs > wifiConnectTimeoutMs) {
        Serial.println();
        Serial.println("[HydroWatch] WiFi connection timeout.");
        break;
      }

      delay(500);
      Serial.print(".");
      dotCount++;
      if (dotCount >= 20) {
        Serial.println();
        dotCount = 0;
      }
    }

    if (WiFi.status() == WL_CONNECTED) {
      setupMode = false;
      Serial.println();
      Serial.println("[HydroWatch] WiFi Connected!");
      Serial.print("SSID: ");
      Serial.println(WiFi.SSID());
      Serial.print("IP Address: ");
      Serial.println(WiFi.localIP());
      Serial.print("Signal Strength: ");
      Serial.print(WiFi.RSSI());
      Serial.println(" dBm");
      return true;
    }

    WiFi.disconnect(true);
    delay(retryDelayMs[min(attempt - 1, maxRetries - 1)]);
  }

  Serial.println("[HydroWatch] Saved WiFi credentials failed repeatedly.");
  return false;
}

bool startSetupMode() {
  setupMode = true;
  WiFi.disconnect(true);
  WiFi.mode(WIFI_AP);

  if (!WiFi.softAP(setupApSsid)) {
    Serial.println("[HydroWatch] Failed to start setup AP.");
    return false;
  }

  Serial.println("[HydroWatch] Setup mode active.");
  Serial.print("Connect to AP: ");
  Serial.println(setupApSsid);
  Serial.print("Setup IP: ");
  Serial.println(WiFi.softAPIP());
  return true;
}

void startDeviceApi() {
  if (webServerStarted) {
    return;
  }

  const char* headerKeys[] = {"X-HydroWatch-Key"};
  server.collectHeaders(headerKeys, 1);
  server.on("/", HTTP_GET, handleSetupPage);
  server.on("/setup", HTTP_POST, handleSetupSubmit);
  server.on("/api/status", HTTP_GET, handleApiStatus);
  server.on("/api/wifi", HTTP_GET, handleApiStatus);
  server.on("/api/wifi", HTTP_POST, handleApiWifi);
  server.on("/api/restart", HTTP_POST, handleApiRestart);
  server.on("/api/clear-wifi", HTTP_POST, handleApiClearWifi);
  server.onNotFound(handleNotFound);
  server.begin();
  webServerStarted = true;
  Serial.println("[HydroWatch] Device API started on port 80.");
}

void handleSetupPage() {
  String html = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<title>HydroWatch Setup</title>";
  html += "<style>body{font-family:Arial,sans-serif;background:#071225;color:white;padding:24px;max-width:520px;margin:auto}";
  html += "input,button{box-sizing:border-box;width:100%;padding:12px;margin:8px 0;border-radius:10px;border:0}";
  html += "button{background:#38bdf8;color:#071225;font-weight:800}</style></head><body>";
  html += "<h1>HydroWatch Setup</h1><p>Enter the WiFi network for this ESP32.</p>";
  html += "<form method='post' action='/setup'><input name='ssid' placeholder='WiFi SSID' required>";
  html += "<input name='password' type='password' placeholder='WiFi Password'>";
  html += "<button type='submit'>Save and Connect</button></form></body></html>";
  server.send(200, "text/html", html);
}

void handleSetupSubmit() {
  String newSsid = server.arg("ssid");
  String newPassword = server.arg("password");
  saveWifiCredentials(newSsid, newPassword);
  server.send(200, "text/html", "<p>Saved. HydroWatch ESP32 is restarting...</p>");
  delay(800);
  ESP.restart();
}

void handleApiStatus() {
  if (!isAuthorizedRequest()) return;
  server.send(200, "application/json", deviceStatusJson());
}

void handleApiWifi() {
  if (!isAuthorizedRequest()) return;

  String body = server.arg("plain");
  String newSsid = extractJsonString(body, "ssid");
  String newPassword = extractJsonString(body, "password");

  if (newSsid.length() == 0) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"WiFi SSID is required\"}");
    return;
  }

  saveWifiCredentials(newSsid, newPassword);
  server.send(200, "application/json", "{\"ok\":true,\"message\":\"WiFi credentials saved. Restarting.\"}");
  delay(800);
  ESP.restart();
}

void handleApiRestart() {
  if (!isAuthorizedRequest()) return;
  server.send(200, "application/json", "{\"ok\":true,\"message\":\"Restarting device\"}");
  delay(500);
  ESP.restart();
}

void handleApiClearWifi() {
  if (!isAuthorizedRequest()) return;
  clearWifiCredentials();
  server.send(200, "application/json", "{\"ok\":true,\"message\":\"WiFi credentials cleared. Restarting into setup mode.\"}");
  delay(500);
  ESP.restart();
}

void handleNotFound() {
  if (setupMode) {
    handleSetupPage();
    return;
  }

  server.send(404, "application/json", "{\"ok\":false,\"error\":\"Not found\"}");
}

bool isAuthorizedRequest() {
  if (String(hydrowatchDeviceApiKey) == "change-this-device-key") {
    server.send(500, "application/json", "{\"ok\":false,\"error\":\"Device API key is not configured\"}");
    return false;
  }

  String providedKey = server.header("X-HydroWatch-Key");
  if (providedKey != String(hydrowatchDeviceApiKey)) {
    server.send(401, "application/json", "{\"ok\":false,\"error\":\"Unauthorized\"}");
    return false;
  }

  return true;
}

void saveWifiCredentials(String newSsid, String newPassword) {
  preferences.putString("ssid", newSsid);
  preferences.putString("password", newPassword);
  Serial.print("[HydroWatch] Saved WiFi credentials for SSID: ");
  Serial.println(newSsid);
}

void clearWifiCredentials() {
  preferences.remove("ssid");
  preferences.remove("password");
  Serial.println("[HydroWatch] WiFi credentials cleared.");
}

void handleWifiResetButton() {
  bool isPressed = digitalRead(wifiResetButtonPin) == LOW;

  if (!isPressed) {
    resetButtonPressedAtMs = 0;
    return;
  }

  if (resetButtonPressedAtMs == 0) {
    resetButtonPressedAtMs = millis();
    return;
  }

  if (millis() - resetButtonPressedAtMs >= resetHoldMs) {
    clearWifiCredentials();
    delay(200);
    ESP.restart();
  }
}

void postTurbidityToSupabase(double reading) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HydroWatch] WiFi disconnected, reconnecting...");
    if (!connectToSavedWiFi()) {
      Serial.println("[HydroWatch] WiFi reconnect failed, entering setup mode");
      consecutiveFailures++;
      if (startSetupMode()) {
        startDeviceApi();
      }
      return;
    }
  }

  for (int attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      unsigned long delayMs = retryDelayMs[attempt - 1];
      Serial.print("[HydroWatch] Retry ");
      Serial.print(attempt);
      Serial.print(" (");
      Serial.print(delayMs);
      Serial.println("ms delay)");
      delay(delayMs);
    }

    if (postToEndpoint(reading)) {
      lastSuccessfulPostMs = millis();
      consecutiveFailures = 0;
      return;
    }
  }

  consecutiveFailures++;
  Serial.print("[HydroWatch] All retries failed. Consecutive failures: ");
  Serial.println(consecutiveFailures);
}

bool postToEndpoint(double reading) {
  HTTPClient http;
  WiFiClient client;
  WiFiClientSecure secureClient;
  String ingestUrl = hydrowatchIngestUrl;

  http.setTimeout(httpTimeoutMs);

  bool connectedToEndpoint = false;
  if (ingestUrl.startsWith("https://")) {
    secureClient.setInsecure();
    connectedToEndpoint = http.begin(secureClient, ingestUrl);
  } else {
    connectedToEndpoint = http.begin(client, ingestUrl);
  }

  if (!connectedToEndpoint) {
    Serial.println("[HydroWatch] Failed to open connection to endpoint");
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  String payload = "{\"turbidity\":";
  payload += String(reading, 2);
  payload += ",\"deviceId\":\"";
  payload += getDeviceId();
  payload += "\",\"firmwareVersion\":\"";
  payload += firmwareVersion;
  payload += "\",\"macAddress\":\"";
  payload += WiFi.macAddress();
  payload += "\",\"ipAddress\":\"";
  payload += WiFi.localIP().toString();
  payload += "\",\"ssid\":\"";
  payload += escapeJson(WiFi.SSID());
  payload += "\",\"rssi\":";
  payload += String(WiFi.RSSI());
  payload += ",\"setupMode\":";
  payload += setupMode ? "true" : "false";
  payload += "}";

  Serial.print("[HydroWatch] Posting: ");
  Serial.println(payload);

  int httpStatus = http.POST(payload);
  Serial.print("[HydroWatch] HTTP Status: ");
  Serial.println(httpStatus);

  if (httpStatus >= 200 && httpStatus < 300) {
    Serial.println("[HydroWatch] POST Success!");
    String response = http.getString();
    if (response.length() > 0) {
      Serial.println(response);
    }
    http.end();
    return true;
  } else {
    Serial.println("[HydroWatch] POST Failed!");
    String response = http.getString();
    if (response.length() > 0) {
      Serial.println(response);
    }
    http.end();
    return false;
  }
}

double readTurbidity() {

  const int sampleCount = 10;
  long total = 0;

  for (int i = 0; i < sampleCount; i++) {
    total += ads.readADC_SingleEnded(0);   // Read ADS1115 channel A0
    delay(10);
  }

  float rawADC = total / (float)sampleCount;

  // Gain ONE = 0.125mV per bit
  float voltage = rawADC * 0.125f / 1000.0f;

  // ======== CALIBRATION ========
  // Change these values after measuring your sensor.

  const float CLEAN_VOLTAGE = 4.20;
  const float DIRTY_VOLTAGE = 2.50;

  double turbidity;

  if (voltage >= CLEAN_VOLTAGE)
      turbidity = 0;

  else if (voltage <= DIRTY_VOLTAGE)
      turbidity = 200;

  else
      turbidity = (CLEAN_VOLTAGE - voltage) *
                  (200.0 / (CLEAN_VOLTAGE - DIRTY_VOLTAGE));

  Serial.print("[ADS1115] Raw: ");
  Serial.print(rawADC);

  Serial.print("  Voltage: ");
  Serial.print(voltage, 3);

  Serial.print(" V  Turbidity: ");
  Serial.print(turbidity, 2);
  Serial.println(" NTU");

  return turbidity;
}

bool isValidReading(double reading) {
  if (!isfinite(reading)) {
    Serial.println("[HydroWatch] Invalid reading: not finite");
    return false;
  }

  if (reading < 0 || reading > 1000) {
    Serial.print("[HydroWatch] Reading out of range: ");
    Serial.println(reading);
    return false;
  }

  return true;
}

String deviceStatusJson() {
  String json = "{\"ok\":true,\"device\":{";
  json += "\"status\":\"";
  json += (WiFi.status() == WL_CONNECTED ? "ONLINE" : "OFFLINE");
  json += "\",\"ssid\":\"";
  json += escapeJson(WiFi.status() == WL_CONNECTED ? WiFi.SSID() : "");
  json += "\",\"ipAddress\":\"";
  json += (WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : WiFi.softAPIP().toString());
  json += "\",\"rssi\":";
  json += (WiFi.status() == WL_CONNECTED ? String(WiFi.RSSI()) : "null");
  json += ",\"lastSeen\":\"";
  json += String(millis());
  json += "ms\",\"firmwareVersion\":\"";
  json += firmwareVersion;
  json += "\",\"deviceId\":\"";
  json += getDeviceId();
  json += "\",\"macAddress\":\"";
  json += WiFi.macAddress();
  json += "\",\"setupMode\":";
  json += setupMode ? "true" : "false";
  json += "}}";
  return json;
}

String getDeviceId() {
  uint64_t chipId = ESP.getEfuseMac();
  char id[24];
  snprintf(id, sizeof(id), "HW-%04X%08X", (uint16_t)(chipId >> 32), (uint32_t)chipId);
  return String(id);
}

String extractJsonString(String body, String key) {
  String marker = "\"" + key + "\"";
  int keyIndex = body.indexOf(marker);
  if (keyIndex < 0) return "";

  int colonIndex = body.indexOf(":", keyIndex + marker.length());
  if (colonIndex < 0) return "";

  int firstQuote = body.indexOf("\"", colonIndex + 1);
  if (firstQuote < 0) return "";

  String value = "";
  bool escaping = false;
  for (int i = firstQuote + 1; i < body.length(); i++) {
    char c = body.charAt(i);
    if (escaping) {
      value += c;
      escaping = false;
      continue;
    }
    if (c == '\\') {
      escaping = true;
      continue;
    }
    if (c == '"') break;
    value += c;
  }
  return value;
}

String escapeJson(String value) {
  value.replace("\\", "\\\\");
  value.replace("\"", "\\\"");
  return value;
}
