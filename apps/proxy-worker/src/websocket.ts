export function isWebSocketUpgrade(upgradeHeader: string | null | undefined): boolean {
  return upgradeHeader?.toLowerCase() === "websocket";
}

export function getWebSocketConnectionParams(request: Request): {
  providedClientId?: string;
  reconnectToken?: string;
  connectionId?: string;
} {
  const url = new URL(request.url);
  const providedClientId = url.searchParams.get("clientId") ?? undefined;
  const reconnectToken = url.searchParams.get("token") ?? undefined;
  const connectionId = url.searchParams.get("connectionId") ?? undefined;

  return {
    providedClientId,
    reconnectToken,
    connectionId,
  };
}

export function resolveReconnectToken(reconnectToken?: string): string {
  return reconnectToken ?? crypto.randomUUID();
}
