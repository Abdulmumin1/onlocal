import { $ } from "bun";
import { mkdir } from "node:fs/promises";

// Ensure dist directory exists
await mkdir("dist/bin", { recursive: true });

const targets = [
  { target: "bun-linux-x64", suffix: "linux-x64" },
  { target: "bun-linux-arm64", suffix: "linux-arm64" },
  { target: "bun-windows-x64", suffix: "windows-x64.exe" },
  { target: "bun-darwin-x64", suffix: "darwin-x64" },
  { target: "bun-darwin-arm64", suffix: "darwin-arm64" },
];

console.log("Building binaries...");

for (const { target, suffix } of targets) {
  const outfile = `dist/bin/onlocal-${suffix}`;
  console.log(`Building for ${target}...`);
  await $`bun build ./src/cli.ts --compile --target ${target} --outfile ${outfile}`;
}

console.log("Build complete!");
