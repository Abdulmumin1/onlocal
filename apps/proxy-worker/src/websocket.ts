export function isWebSocketUpgrade(upgradeHeader: string | null | undefined): boolean {
  return upgradeHeader?.toLowerCase() === "websocket";
}
