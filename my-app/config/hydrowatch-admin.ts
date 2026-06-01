export function getActiveSensorUserId() {
  const userId = process.env.ACTIVE_SENSOR_USER_ID;

  if (!userId) {
    throw new Error("ACTIVE_SENSOR_USER_ID is required for ESP32 ingestion.");
  }

  return userId;
}
