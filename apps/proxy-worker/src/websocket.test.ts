import { describe, expect, it } from "vitest";
import { isWebSocketUpgrade } from "./websocket";

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
