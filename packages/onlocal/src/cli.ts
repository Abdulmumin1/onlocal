import { colors } from "./utils";
import { TunnelClient } from "./Client";
import * as readline from "readline";

function showHelp() {
  console.log(`
${colors.bold}${colors.cyan}  ┌─────────────────────────────────────┐
  │            onlocal                  │
  │   Expose localhost to the internet  │
  └─────────────────────────────────────┘${colors.reset}

${colors.bold}USAGE${colors.reset}
  ${colors.dim}$${colors.reset} onlocal ${colors.yellow}<port>${colors.reset}

${colors.bold}ARGUMENTS${colors.reset}
  ${colors.yellow}<port>${colors.reset}    Local port to expose ${colors.dim}(required)${colors.reset}

${colors.bold}EXAMPLES${colors.reset}
  ${colors.dim}$${colors.reset} onlocal 3000        ${colors.dim}# Expose localhost:3000${colors.reset}
  ${colors.dim}$${colors.reset} onlocal 8080        ${colors.dim}# Expose localhost:8080${colors.reset}

${colors.bold}MORE INFO${colors.reset}
  ${colors.dim}https://onlocal.dev${colors.reset}
`);
}

const arg = process.argv[2];

if (arg === "-h" || arg === "--help") {
  showHelp();
  process.exit(0);
}

const port = parseInt(arg as string);
if (!port || isNaN(port)) {
  showHelp();
  process.exit(1);
}

const tunnelDomain = process.env.TUNNEL_DOMAIN || "wss://onlocal.dev";
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
