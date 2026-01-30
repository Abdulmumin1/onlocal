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
  ${colors.dim}$${colors.reset} onlocal config      ${colors.dim}# Configure settings${colors.reset}

${colors.bold}ARGUMENTS${colors.reset}
  ${colors.yellow}<port>${colors.reset}    Local port to expose ${colors.dim}(optional, defaults to config)${colors.reset}

${colors.bold}EXAMPLES${colors.reset}
  ${colors.dim}$${colors.reset} onlocal 3000        ${colors.dim}# Expose localhost:3000${colors.reset}
  ${colors.dim}$${colors.reset} onlocal             ${colors.dim}# Expose default port${colors.reset}
  ${colors.dim}$${colors.reset} onlocal config      ${colors.dim}# Update configuration${colors.reset}

${colors.bold}MORE INFO${colors.reset}
  ${colors.dim}https://onlocal.dev${colors.reset}
`);
}

const arg = process.argv[2];

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
    
    let port = parseInt(arg as string);
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

    let tunnel = new TunnelClient({ port, domain: tunnelDomain });
    tunnel.start();

    if (process.stdin.isTTY) {
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);

        process.stdin.on("keypress", (_str, key) => {
            if (key.ctrl && key.name === "c") {
                process.exit();
            }
            if (key.name === "r") {
                tunnel.forceReconnect();
            }
        });
    }
}
