import { describe, expect, it } from "vitest";
import {
  getWebSocketConnectionParams,
  isWebSocketUpgrade,
  resolveReconnectToken,
} from "./websocket";

describe("isWebSocketUpgrade", () => {
  it("accepts websocket upgrades regardless of casing", () => {
    expect(isWebSocketUpgrade("websocket")).toBe(true);
    expect(isWebSocketUpgrade("WebSocket")).toBe(true);
    expect(isWebSocketUpgrade("WEBSOCKET")).toBe(true);
  });

  it("rejects non-websocket upgrade values", () => {
    expect(isWebSocketUpgrade(undefined)).toBe(false);
    expect(isWebSocketUpgrade(null)).toBe(false);
    expect(isWebSocketUpgrade("h2c")).toBe(false);
  });
});

describe("getWebSocketConnectionParams", () => {
  it("reads websocket control params from the raw request url", () => {
    const request = new Request(
      "https://onlocal.dev/ws?clientId=owostack1&token=abc123&connectionId=conn-1"
    );

    expect(getWebSocketConnectionParams(request)).toEqual({
      providedClientId: "owostack1",
      reconnectToken: "abc123",
      connectionId: "conn-1",
    });
  });

  it("returns undefined for missing websocket control params", () => {
    const request = new Request("https://onlocal.dev/ws");

    expect(getWebSocketConnectionParams(request)).toEqual({
      providedClientId: undefined,
      reconnectToken: undefined,
      connectionId: undefined,
    });
  });
});

describe("resolveReconnectToken", () => {
  it("preserves a provided reconnect token", () => {
    expect(resolveReconnectToken("abc123")).toBe("abc123");
  });

  it("generates a reconnect token when one is missing", () => {
    const generatedToken = resolveReconnectToken();

    expect(generatedToken).toHaveLength(36);
  });
});
