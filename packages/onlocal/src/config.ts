import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { parse, stringify } from "yaml";

export interface Config {
  tunnel: {
    domain: string;
  };
  server: {
    port?: number;
  };
}

export const DEFAULT_CONFIG: Config = {
  tunnel: {
    domain: "wss://onlocal.dev",
  },
  server: {
    port: 3000,
  },
};

export const CONFIG_PATH = join(homedir(), ".onlocal", "config.yml");

export function loadConfig(): Config {
  try {
    if (!existsSync(CONFIG_PATH)) {
      // Create default config if it doesn't exist
      saveConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }

    const fileContents = readFileSync(CONFIG_PATH, "utf8");
    const parsed = parse(fileContents) as Partial<Config>;
    
    // Merge with default to ensure all fields exist
    return {
      tunnel: {
        domain: parsed.tunnel?.domain || DEFAULT_CONFIG.tunnel.domain,
      },
      server: {
        port: parsed.server?.port || DEFAULT_CONFIG.server.port,
      },
    };
  } catch (error) {
    // If error reading/parsing, return default but warn?
    // For now, just return default
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: Config): void {
  try {
    const dir = dirname(CONFIG_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    writeFileSync(CONFIG_PATH, stringify(config), "utf8");
  } catch (error) {
    console.error("Failed to save config:", error);
    throw error;
  }
}
