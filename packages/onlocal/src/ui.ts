import { colors } from "./utils";
// @ts-ignore
import tinyFont from "./components/tiny.json";

export function renderLogo(text: string = "ONLOCAL"): string {
  const chars = tinyFont.chars as Record<string, string[]>;
  const lines: string[] = Array(tinyFont.lines).fill("");
  // The tiny.json has letterspace as an array of strings, usually [" ", " "] for 2 lines
  const space = tinyFont.letterspace || [" ", " "];

  for (const char of text.toUpperCase()) {
    const charData = chars[char] || chars[" "];
    if (charData) {
        for (let i = 0; i < tinyFont.lines; i++) {
            lines[i] += charData[i] + space[i];
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
