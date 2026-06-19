#include <WiFi.h>
#include <WiFiClient.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Adafruit_ADS1X15.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Preferences.h>
#include <WebServer.h>

Adafruit_ADS1115 ads;
WebServer server(80);

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

Adafruit_SSD1306 display(
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  &Wire,
  -1
);

Preferences preferences;

String currentSSID = "";
String currentPassword = "";


const char* firmwareVersion = "2.0.0";
const char* hydrowatchIngestUrl = "https://hydrowatch-it-104.vercel.app/api/esp32/ingest";


const unsigned long readingIntervalMs = 5000;
const unsigned long httpTimeoutMs = 5000;

const int maxRetries = 4;
const unsigned long retryDelayMs[] = {1000, 2000, 4000, 8000};


const float ADC_MIN = 1800.0;
const float ADC_MAX = 4050.0;
const float NTU_MIN = 0.0;
const float NTU_MAX = 1800.0;

const char* DEFAULT_WIFI_SSID = "Cyber_Central_2";
const char* DEFAULT_WIFI_PASSWORD = "N1ghTnDay!";

unsigned long lastReadingMs = 0;
unsigned long lastSuccessfulPostMs = 0;

double lastValidReading = 0.0;
int consecutiveFailures = 0;

void handleStatus() {

  String json = "{";

  json += "\"status\":\"ONLINE\",";
  json += "\"ssid\":\"" + WiFi.SSID() + "\",";
  json += "\"ipAddress\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"firmwareVersion\":\"2.0.0\"";

  json += "}";

  server.send(200, "application/json", json);
}


void saveWifiCredentials(String ssid, String password) {
  size_t savedSsidBytes = preferences.putString("ssid", ssid);
  size_t savedPasswordBytes = preferences.putString("password", password);

  currentSSID = ssid;
  currentPassword = password;

  Serial.println("Saved credentials:");
  Serial.println(preferences.getString("ssid", ""));
  Serial.print("Saved password length: ");
  Serial.println(preferences.getString("password", "").length());
  Serial.print("Preferences write bytes SSID/PASSWORD: ");
  Serial.print(savedSsidBytes);
  Serial.print("/");
  Serial.println(savedPasswordBytes);
}

void loadWifiCredentials() {
  currentSSID = preferences.getString("ssid", "");
  currentPassword = preferences.getString("password", "");

  Serial.print("Loaded SSID: ");
  Serial.println(currentSSID);
  Serial.print("Loaded password length: ");
  Serial.println(currentPassword.length());
}

void connectToWiFi() {

  if (currentSSID.length() == 0) {
    Serial.println("No WiFi credentials saved.");
    return;
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(currentSSID.c_str(), currentPassword.c_str());

  Serial.print("Connecting");

  unsigned long start = millis();

  while (WiFi.status() != WL_CONNECTED &&
         millis() - start < 15000) {

    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {

    Serial.println();
    Serial.println("WiFi Connected!");

    Serial.print("IP: ");
    Serial.println(WiFi.localIP());

  } else {

    Serial.println();
    Serial.println("WiFi connection failed.");
  }
}

void handleWifi() {

  String body = server.arg("plain");

  String ssid = extractJsonString(body, "ssid");
  String password = extractJsonString(body, "password");

  Serial.println("=== WIFI UPDATE RECEIVED ===");
  Serial.println(body);
  Serial.print("SSID: ");
  Serial.println(ssid);
  Serial.print("PASSWORD: ");
  Serial.println(maskSecret(password));
  Serial.print("PASSWORD LENGTH: ");
  Serial.println(password.length());

  if (ssid.length() == 0 || password.length() == 0) {
    server.send(
      400,
      "application/json",
      "{\"error\":\"Missing credentials\"}"
    );

    return;
  }

  saveWifiCredentials(ssid, password);

  server.send(
    200,
    "application/json",
    "{\"success\":true}"
  );

  delay(1000);

  ESP.restart();
}

void handleRestart() {

  server.send(
    200,
    "application/json",
    "{\"success\":true}"
  );

  delay(1000);

  ESP.restart();
}

void handleClearWifi() {

  preferences.remove("ssid");
  preferences.remove("password");

  server.send(
    200,
    "application/json",
    "{\"success\":true}"
  );

  delay(1000);

  ESP.restart();
}


void setup() {
  Serial.begin(115200);
  delay(100);

  Serial.println("========== HYDROWATCH ESP32 ==========");
  Serial.println("Firmware 2.0.0");

  Wire.begin(21, 22);

  if(!display.begin(
    SSD1306_SWITCHCAPVCC,
    0x3C
  )) {

  Serial.println("OLED not found");
  while(true);
  }

  display.clearDisplay();

  display.setTextSize(1);
  display.setTextColor(WHITE);

  display.setCursor(0,0);
  display.println("HydroWatch");

  display.display();

  delay(2000);

  display.clearDisplay();

  display.setTextSize(2);
  display.setCursor(0,0);
  display.println("OLED OK");

  display.display();

  Serial.println("OLED TEST DISPLAYED");

  delay(5000);

  if (!ads.begin()) {
    Serial.println("ADS1115 not found!");
    while (1);
  }

  ads.setGain(GAIN_ONE);

  Serial.println("ADS1115 Ready");

  Serial.println();
  Serial.println("HydroWatch Starting...");

preferences.begin("wifi", false);

loadWifiCredentials();

Serial.println("Preferences empty?");
Serial.println(currentSSID.length() == 0);

if (currentSSID.length() == 0) {

  saveWifiCredentials(
    DEFAULT_WIFI_SSID,
    DEFAULT_WIFI_PASSWORD
  );

  loadWifiCredentials();
}

connectToWiFi();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("WiFi Connected!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    lastSuccessfulPostMs = millis();
  } else {
    Serial.println("WiFi not connected after boot. Device API will start when WiFi reconnects.");
  }

server.on("/api/status", HTTP_GET, handleStatus);

server.on("/api/wifi", HTTP_POST, handleWifi);

server.on("/api/restart", HTTP_POST, handleRestart);

server.on("/api/clear-wifi", HTTP_POST, handleClearWifi);

  server.begin();

  Serial.println("Device API Started");
}

void updateOLED(
  float turbidity,
  float voltage,
  int adc
) {

  display.clearDisplay();

  display.setTextColor(WHITE);

  display.setTextSize(2);
  display.setCursor(0,0);
  display.println("TEST");

  display.setTextSize(1);
  display.setCursor(0,25);
  display.print("ADC:");
  display.println(adc);

  display.setCursor(0,40);
  display.print("NTU:");
  display.println(turbidity);

  display.display();
}

void loop() {
  server.handleClient();

  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("WiFi Lost. Reconnecting...");

    WiFi.disconnect();
    WiFi.begin(
      currentSSID.c_str(),
      currentPassword.c_str()
    );

    unsigned long start = millis();

    while (WiFi.status() != WL_CONNECTED &&
           millis() - start < 10000) {

      delay(500);
      Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\nReconnected!");
    }

    return;
  }

  if (millis() - lastReadingMs >= readingIntervalMs) {

    lastReadingMs = millis();

    double reading = readTurbidity();

    if (isValidReading(reading)) {

      postTurbidityToSupabase(reading);

    } else {

      Serial.println("Invalid Reading");

    }
  }
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

String maskSecret(String value) {
  if (value.length() == 0) return "";

  String masked = "";
  for (int i = 0; i < value.length(); i++) {
    masked += "*";
  }
  return masked;
}

double readTurbidity() {

int16_t adc = ads.readADC_SingleEnded(0);

float voltage = ads.computeVolts(adc);

Serial.print("ADC: ");
Serial.print(adc);

Serial.print(" Voltage: ");
Serial.println(voltage, 4);

  Serial.print("ADC: ");
  Serial.print(adc);

  Serial.print("   Voltage: ");
  Serial.print(voltage, 3);
  Serial.println(" V");

  float turbidity =
    ((4301.0 - adc) / (4301.0 - 1800.0)) * 100.0;

  if (turbidity < 0) turbidity = 0;
  if (turbidity > 100) turbidity = 100;

updateOLED(
  turbidity,
  voltage,
  adc
);

return turbidity;
} 

bool isValidReading(double reading) {
  return !isnan(reading) &&
         reading >= NTU_MIN &&
         reading <= NTU_MAX;
}

bool postToEndpoint(double reading) {

  WiFiClientSecure client;
  client.setInsecure();     // Skip SSL certificate verification

  HTTPClient http;

  http.setTimeout(httpTimeoutMs);

  if (!http.begin(client, hydrowatchIngestUrl)) {
    Serial.println("Failed to connect to server.");
    return false;
  }

  http.addHeader("Content-Type", "application/json");

  String payload = "{";
  payload += "\"turbidity\":";
  payload += String(reading, 2);
  payload += ",";
  payload += "\"firmwareVersion\":\"";
  payload += firmwareVersion;
  payload += "\"";
  payload += "}";

  Serial.println("Sending:");
  Serial.println(payload);

  int httpCode = http.POST(payload);

  if (httpCode > 0) {

    Serial.print("HTTP Code: ");
    Serial.println(httpCode);

    String response = http.getString();

    Serial.println(response);

    http.end();

    return httpCode >= 200 && httpCode < 300;
  }

  Serial.print("HTTP Error: ");
  Serial.println(http.errorToString(httpCode));

  http.end();

  return false;
}

void postTurbidityToSupabase(double reading) {

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected.");
    return;
  }

  for (int attempt = 0; attempt <= maxRetries; attempt++) {

    if (attempt > 0) {

      unsigned long delayMs = retryDelayMs[attempt - 1];

      Serial.print("Retry ");
      Serial.print(attempt);
      Serial.print(" after ");
      Serial.print(delayMs);
      Serial.println(" ms");

      delay(delayMs);
    }

    if (postToEndpoint(reading)) {

      lastSuccessfulPostMs = millis();
      consecutiveFailures = 0;

      Serial.println("Reading uploaded successfully.");

      return;
    }
  }

  consecutiveFailures++;

  Serial.print("Upload failed. Consecutive failures: ");
  Serial.println(consecutiveFailures);
}
