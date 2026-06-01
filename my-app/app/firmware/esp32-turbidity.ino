/*
  HydroWatch ESP32 Turbidity Sensor

  Flow:
  Turbidity Sensor -> ESP32 -> WiFi -> Supabase -> HydroWatch Dashboard

  Board: ESP32 Dev Module
  Sensor input: GPIO36
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// WiFi credentials
const char* ssid = "Cyber_Central_2";
const char* password = "N1ghTnDay!";

// HydroWatch ingestion endpoint.
// The server assigns readings to ACTIVE_SENSOR_USER_ID.
const char* hydrowatchIngestUrl = "https://your-hydrowatch-app.example.com/api/esp32/ingest";

const int turbidityPin = 36;
const unsigned long readingIntervalMs = 5000;

unsigned long lastReadingMs = 0;
double turbidity = 0.0;

void connectToWiFi() {
  Serial.println("Connecting to WiFi...");

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi Connected");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}

void postTurbidityToSupabase(double reading) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Supabase POST Failed");
    Serial.println("WiFi is disconnected. Reconnecting...");
    connectToWiFi();
    return;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;

  if (!http.begin(client, hydrowatchIngestUrl)) {
    Serial.println("Supabase POST Failed");
    return;
  }

  http.addHeader("Content-Type", "application/json");

  String payload = "{\"turbidity\":";
  payload += String(reading, 2);
  payload += "}";

  int httpStatus = http.POST(payload);

  Serial.print("HTTP Status: ");
  Serial.println(httpStatus);

 if (httpStatus >= 200 && httpStatus < 300) {
  Serial.println("Supabase POST Success");
  Serial.println(http.getString());
} else {
    Serial.println("Supabase POST Failed");
    String response = http.getString();
    if (response.length() > 0) {
      Serial.println(response);
    }
  }

  http.end();
}

double readTurbidity() {
  int rawAdc = analogRead(turbidityPin);
  turbidity = map(rawAdc, 0, 2800, 5, 1);

  Serial.print("Raw ADC: ");
  Serial.println(rawAdc);
  Serial.print("Turbidity: ");
  Serial.print(turbidity, 1);
  Serial.println(" NTU");

  return turbidity;
}

void setup() {
  Serial.begin(115200);
  connectToWiFi();
}

void loop() {
  unsigned long currentMs = millis();

  if (currentMs - lastReadingMs >= readingIntervalMs) {
    lastReadingMs = currentMs;

    double reading = readTurbidity();
    postTurbidityToSupabase(reading);
  }
}
