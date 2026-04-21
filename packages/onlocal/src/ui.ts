import { colors } from "./utils";
// @ts-ignore
import tinyFont from "./components/tiny.json";

export type SessionStatus = "connecting" | "online" | "reconnecting" | "offline";

export function renderLogo(text: string = "ONLOCAL"): string {
  const chars = tinyFont.chars as Record<string, string[]>;
  const lines: string[] = Array(tinyFont.lines).fill("");
  // The tiny.json has letterspace as an array of strings, usually [" ", " "] for 2 lines
  const space = tinyFont.letterspace || [" ", " "];

  for (const char of text.toUpperCase()) {
    const charData = chars[char] || chars[" "];
    if (charData) {
        for (let i = 0; i < tinyFont.lines; i++) {
            lines[i] += (charData[i] ?? "") + (space[i] ?? "");
        }
    }
  }

  // Use yellow for the logo as requested
  return lines.map(line => colors.yellow + line + colors.reset).join("\n");
}

export function renderBox(title: string, content: string[], footer?: string): string {
    const width = 50;
    const horizontal = "─".repeat(width - 2);
    
    let out = "";
    
    // Top
    out += `${colors.gray}┌${horizontal}┐${colors.reset}\n`;
    
    // Title (centered if possible, or just printed)
    // For now simple top border
    
    // Content
    for (const line of content) {
        const visibleLength = line.replace(/\x1b\[[0-9;]*m/g, "").length;
        const padding = Math.max(0, width - 4 - visibleLength);
        out += `${colors.gray}│${colors.reset}  ${line}${" ".repeat(padding)}${colors.gray}│${colors.reset}\n`;
    }

    // Divider if footer
    if (footer) {
        out += `${colors.gray}├${horizontal}┤${colors.reset}\n`;
        const visibleLength = footer.replace(/\x1b\[[0-9;]*m/g, "").length;
        const padding = Math.max(0, width - 4 - visibleLength);
         out += `${colors.gray}│${colors.reset}  ${footer}${" ".repeat(padding)}${colors.gray}│${colors.reset}\n`;
    }
    
    // Bottom
    out += `${colors.gray}└${horizontal}┘${colors.reset}\n`;
    
    return out;
}

export function renderTunnelSummary(url: string, port: number): string {
    return [
        `${colors.bold}${colors.yellow}${url}${colors.reset}`,
        `${colors.gray}Forwarding to ${colors.bold}localhost:${port}${colors.reset}`,
        `${colors.dim}Press 'r' to reconnect${colors.reset}`,
    ].join("\n");
}

export function renderSessionStatus(status: SessionStatus): string {
    switch (status) {
        case "online":
            return `${colors.green}●${colors.reset} Session ${colors.bold}online${colors.reset}`;
        case "reconnecting":
            return `${colors.yellow}◌${colors.reset} Session ${colors.bold}reconnecting${colors.reset}`;
        case "offline":
            return `${colors.gray}●${colors.reset} Session ${colors.bold}offline${colors.reset}`;
        case "connecting":
        default:
            return `${colors.yellow}◌${colors.reset} Session ${colors.bold}connecting${colors.reset}`;
    }
}
