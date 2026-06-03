/*
  HydroWatch ESP32 Turbidity Sensor with Robust Connection Handling

  Flow:
  Turbidity Sensor -> ESP32 -> WiFi -> Supabase -> HydroWatch Dashboard

  Board: ESP32 Dev Module
  Sensor input: GPIO36
  
  Features:
  - WiFi auto-reconnect with exponential backoff
  - Reading validation and filtering
  - Proper ADC calibration (0-4095 range)
*/

#include <WiFi.h>
#include <WiFiClient.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// WiFi credentials
const char* ssid = "Cyber_Central_2";
const char* password = "N1ghTnDay!";

// HydroWatch ingestion endpoint.
// The server assigns readings to ACTIVE_SENSOR_USER_ID.
// For local testing, run Next.js on the LAN and use your computer's Wi-Fi IP.
const char* hydrowatchIngestUrl = "http://192.168.1.35:3000/api/esp32/ingest";

const int turbidityPin = 36;
const unsigned long readingIntervalMs = 5000;
const unsigned long wifiConnectTimeoutMs = 10000;  // 10 second timeout for WiFi connect
const unsigned long httpTimeoutMs = 5000;          // 5 second timeout for HTTP

// Exponential backoff for retries: 1s, 2s, 4s, 8s (max 8s)
const int maxRetries = 4;
const unsigned long retryDelayMs[] = {1000, 2000, 4000, 8000};

// Calibration values for turbidity sensor
// These map ADC readings (0-4095) to NTU values (0-5)
const float ADC_MIN = 100.0;    // ADC value at 0 NTU (clear water)
const float ADC_MAX = 2900.0;   // ADC value at 5 NTU (turbid water)
const float NTU_MIN = 0.0;
const float NTU_MAX = 5.0;

unsigned long lastReadingMs = 0;
unsigned long lastSuccessfulPostMs = 0;
double lastValidReading = 0.0;
int consecutiveFailures = 0;

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n\n[HydroWatch] System starting...");
  connectToWiFi();
}

void loop() {
  unsigned long currentMs = millis();

  if (currentMs - lastReadingMs >= readingIntervalMs) {
    lastReadingMs = currentMs;

    double reading = readTurbidity();
    if (isValidReading(reading)) {
      postTurbidityToSupabase(reading);
      lastValidReading = reading;  // Cache for future use
    } else {
      Serial.println("[HydroWatch] Reading out of range, skipping post");
    }
  }

  // Auto-reconnect WiFi if disconnected for too long (60 seconds)
  if (WiFi.status() != WL_CONNECTED && (currentMs - lastSuccessfulPostMs) > 60000) {
    Serial.println("[HydroWatch] WiFi disconnected for >60s, attempting reconnect...");
    connectToWiFi();
  }
}

void connectToWiFi() {
  Serial.println("[HydroWatch] Connecting to WiFi...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  unsigned long connectStartMs = millis();
  int dotCount = 0;

  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - connectStartMs > wifiConnectTimeoutMs) {
      Serial.println();
      Serial.println("[HydroWatch] WiFi connection timeout!");
      return;
    }
    
    delay(500);
    Serial.print(".");
    dotCount++;
    if (dotCount >= 20) {
      Serial.println();
      dotCount = 0;
    }
  }

  Serial.println();
  Serial.println("[HydroWatch] WiFi Connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  Serial.print("Signal Strength: ");
  Serial.print(WiFi.RSSI());
  Serial.println(" dBm");
}

void postTurbidityToSupabase(double reading) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HydroWatch] WiFi disconnected, reconnecting...");
    connectToWiFi();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[HydroWatch] WiFi reconnect failed, skipping post");
      consecutiveFailures++;
      return;
    }
  }

  // Retry loop with exponential backoff
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
      return;  // Success!
    }
  }

  // All retries failed
  consecutiveFailures++;
  Serial.print("[HydroWatch] All retries failed. Consecutive failures: ");
  Serial.println(consecutiveFailures);
}

bool postToEndpoint(double reading) {
  HTTPClient http;
  WiFiClient client;
  String ingestUrl = hydrowatchIngestUrl;
  
  http.setTimeout(httpTimeoutMs);

  bool connectedToEndpoint = false;
  if (ingestUrl.startsWith("https://")) {
    WiFiClientSecure secureClient;
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
  // Take multiple readings and average for stability
  const int sampleCount = 5;
  float totalAdc = 0;
  
  for (int i = 0; i < sampleCount; i++) {
    totalAdc += analogRead(turbidityPin);
    delay(10);  // Small delay between samples
  }
  
  float avgAdc = totalAdc / sampleCount;
  
  // Calibration: Map ADC reading to NTU
  // Linear interpolation between calibration points
  double turbidity;
  if (avgAdc <= ADC_MIN) {
    turbidity = NTU_MIN;
  } else if (avgAdc >= ADC_MAX) {
    turbidity = NTU_MAX;
  } else {
    // Linear mapping
    turbidity = NTU_MIN + (avgAdc - ADC_MIN) / (ADC_MAX - ADC_MIN) * (NTU_MAX - NTU_MIN);
  }

  Serial.print("[HydroWatch] Raw ADC: ");
  Serial.print(avgAdc, 1);
  Serial.print(" -> Turbidity: ");
  Serial.print(turbidity, 2);
  Serial.println(" NTU");

  return turbidity;
}

bool isValidReading(double reading) {
  // Validate that reading is within expected range
  if (!isfinite(reading)) {
    Serial.println("[HydroWatch] Invalid reading: not finite");
    return false;
  }
  
  if (reading < NTU_MIN || reading > NTU_MAX * 1.5) {  // Allow 50% margin for sensor drift
    Serial.print("[HydroWatch] Reading out of range: ");
    Serial.println(reading);
    return false;
  }
  
  return true;
}

