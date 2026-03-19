import { colors } from "./utils";
import { TunnelClient } from "./Client";
import * as readline from "readline";
import { intro, text, outro, spinner } from "@clack/prompts";
import { loadConfig, saveConfig, CONFIG_PATH } from "./config";
import { renderLogo, renderBox } from "./ui";

function showHelp() {
  console.log(renderLogo());
  console.log(`
${colors.bold}USAGE${colors.reset}
  ${colors.dim}$${colors.reset} onlocal ${colors.yellow}<port>${colors.reset}
  ${colors.dim}$${colors.reset} onlocal ${colors.yellow}<port>${colors.reset} --client ${colors.yellow}<client-id>${colors.reset}
  ${colors.dim}$${colors.reset} onlocal config      ${colors.dim}# Configure settings${colors.reset}

${colors.bold}ARGUMENTS${colors.reset}
  ${colors.yellow}<port>${colors.reset}    Local port to expose ${colors.dim}(optional, defaults to config)${colors.reset}

${colors.bold}OPTIONS${colors.reset}
  ${colors.yellow}--client <client-id>${colors.reset}    Reserve a custom subdomain ${colors.dim}(min 7 lowercase letters/numbers)${colors.reset}

${colors.bold}EXAMPLES${colors.reset}
  ${colors.dim}$${colors.reset} onlocal 3000        ${colors.dim}# Expose localhost:3000${colors.reset}
  ${colors.dim}$${colors.reset} onlocal 9798 --client owostack ${colors.dim}# Expose as owostack.onlocal.dev${colors.reset}
  ${colors.dim}$${colors.reset} onlocal             ${colors.dim}# Expose default port${colors.reset}
  ${colors.dim}$${colors.reset} onlocal config      ${colors.dim}# Update configuration${colors.reset}

${colors.bold}MORE INFO${colors.reset}
  ${colors.dim}https://onlocal.dev${colors.reset}
`);
}

const args = process.argv.slice(2);
const arg = args[0];
const CLIENT_ID_PATTERN = /^[a-z0-9]{7,}$/;

function getHttpBaseUrl(domain: string): string {
  return domain
    .replace(/^wss:\/\//, "https://")
    .replace(/^ws:\/\//, "http://")
    .replace(/\/+$/, "");
}

async function verifyClientIdAvailability(domain: string, clientId: string) {
  const baseUrl = getHttpBaseUrl(domain);
  const response = await fetch(
    `${baseUrl}/client-id/${encodeURIComponent(clientId)}/status`
  );

  if (!response.ok) {
    if (response.status === 409) {
      throw new Error(
        `Client ID '${clientId}' is already taken or currently in use.`
      );
    }

    const text = await response.text();
    throw new Error(text || "Failed to verify client ID availability.");
  }
}

if (arg === "-h" || arg === "--help") {
  showHelp();
  process.exit(0);
}

if (arg === "config") {
  (async () => {
    console.clear();
    intro(`${colors.cyan} onlocal configuration ${colors.reset}`);

    const currentConfig = loadConfig();

    const domain = await text({
      message: "Tunnel Domain (WebSocket URL)",
      placeholder: "wss://onlocal.dev",
      defaultValue: currentConfig.tunnel.domain,
      initialValue: currentConfig.tunnel.domain,
    });

    if (typeof domain === "symbol") process.exit(0);

    const port = await text({
        message: "Default Local Port",
        placeholder: "3000",
        defaultValue: String(currentConfig.server.port || 3000),
        initialValue: String(currentConfig.server.port || 3000),
        validate: (value) => {
            if (isNaN(Number(value))) return "Please enter a valid number";
        }
    });

    if (typeof port === "symbol") process.exit(0);

    const s = spinner();
    s.start("Saving configuration...");

    saveConfig({
      tunnel: { domain: domain as string },
      server: { port: Number(port) },
    });

    s.stop("Configuration saved!");
    
    outro(`Config saved to ${CONFIG_PATH}`);
    process.exit(0);
  })();
} else {
    // Run tunnel
    const config = loadConfig();

    let port: number | undefined;
    let clientId: string | undefined;

    for (let index = 0; index < args.length; index++) {
        const value = args[index];

        if (value === undefined) {
            continue;
        }

        if (value === "--client") {
            const nextValue = args[index + 1];
            if (!nextValue) {
                console.error(`${colors.red}Error: Missing value for --client.${colors.reset}`);
                process.exit(1);
            }
            clientId = nextValue;
            index++;
            continue;
        }

        if (value.startsWith("--")) {
            console.error(`${colors.red}Error: Unknown option '${value}'.${colors.reset}`);
            showHelp();
            process.exit(1);
        }

        if (port === undefined) {
            port = parseInt(value, 10);
            continue;
        }

        console.error(`${colors.red}Error: Unexpected argument '${value}'.${colors.reset}`);
        showHelp();
        process.exit(1);
    }

    if (clientId && !CLIENT_ID_PATTERN.test(clientId)) {
        console.error(
            `${colors.red}Error: --client must be at least 7 characters and contain only lowercase letters and numbers.${colors.reset}`
        );
        process.exit(1);
    }

    if (!port || isNaN(port)) {
        if (config.server.port) {
            port = config.server.port;
        } else {
            console.error(`${colors.red}Error: No port specified and no default port in config.${colors.reset}`);
            showHelp();
            process.exit(1);
        }
    }

    const tunnelDomain = process.env.TUNNEL_DOMAIN || config.tunnel.domain || "wss://onlocal.dev";

    console.clear();
    console.log(renderLogo());
    console.log(""); // spacer

    (async () => {
        if (clientId) {
            await verifyClientIdAvailability(tunnelDomain, clientId);
        }

        let tunnel = new TunnelClient({ port, domain: tunnelDomain, clientId });
        tunnel.start();
        let isShuttingDown = false;

        const shutdownAndExit = async (exitCode: number) => {
            if (isShuttingDown) {
                return;
            }

            isShuttingDown = true;
            await tunnel.shutdown();

            if (process.stdin.isTTY) {
                process.stdin.setRawMode(false);
            }

            process.exit(exitCode);
        };

        process.on("SIGINT", () => {
            void shutdownAndExit(0);
        });

        process.on("SIGTERM", () => {
            void shutdownAndExit(0);
        });

        if (process.stdin.isTTY) {
            readline.emitKeypressEvents(process.stdin);
            process.stdin.setRawMode(true);

            process.stdin.on("keypress", (_str, key) => {
                if (key.ctrl && key.name === "c") {
                    void shutdownAndExit(0);
                }
                if (key.name === "r") {
                    tunnel.forceReconnect();
                }
                if (key.name === "q" || key.name === "escape") {
                    console.log(`${colors.gray}Goodbye!${colors.reset}`);
                    void shutdownAndExit(0);
                }
            });
        }
    })().catch((error) => {
        const message = error instanceof Error ? error.message : "Failed to start tunnel.";
        console.error(`${colors.red}Error: ${message}${colors.reset}`);
        process.exit(1);
    });
}
