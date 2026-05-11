export type IngestionMessage = {
  stationId: string;
  turbidity: number;
  waterLevel: number;
  flowRate: number;
  timestamp: string;
};

export type IngestionHandler = (message: IngestionMessage) => void;

export function subscribeToMqttPlaceholder(handler: IngestionHandler) {
  const interval = setInterval(() => {
    handler({
      stationId: "station-alpha",
      turbidity: 0,
      waterLevel: 0,
      flowRate: 0,
      timestamp: new Date().toISOString(),
    });
  }, 60000);
  return () => clearInterval(interval);
}
