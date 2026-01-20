#!/usr/bin/env bun
/**
 * WebSocket passthrough test client
 *
 * Usage:
 *   1. Start the echo server:    bun test/ws-echo-server.ts 3000
 *   2. Start the proxy worker:   cd apps/proxy-worker && bun run dev
 *   3. Start the CLI:            bun packages/onlocal/index.ts 3000
 *   4. Run this test:            bun test/ws-test-client.ts <tunnel-url>
 *
 * Example: bun test/ws-test-client.ts abc123.localhost:8787
 */

const tunnelHost = process.argv[2];

if (!tunnelHost) {
  console.log("Usage: bun test/ws-test-client.ts <tunnel-host>");
  console.log("Example: bun test/ws-test-client.ts abc123.localhost:8787");
  process.exit(1);
}

const wsUrl = `ws://${tunnelHost}/socket`;
console.log(`\n🧪 Testing WebSocket passthrough to: ${wsUrl}\n`);

const tests = {
  passed: 0,
  failed: 0,
};

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    tests.passed++;
  } else {
    console.log(`  ❌ ${message}`);
    tests.failed++;
  }
}

async function runTests() {
  console.log("1️⃣ Test: WebSocket Connection");

  const ws = new WebSocket(wsUrl);

  const connected = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 5000);
    ws.onopen = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    ws.onerror = () => {
      clearTimeout(timeout);
      resolve(false);
    };
  });

  assert(connected, "WebSocket connected successfully");

  if (!connected) {
    console.log("\n❌ Cannot proceed - connection failed");
    process.exit(1);
  }

  // Wait for initial "connected" message
  const initialMessage = await new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout")), 5000);
    ws.onmessage = (event) => {
      clearTimeout(timeout);
      resolve(JSON.parse(event.data as string));
    };
  });

  assert(initialMessage.type === "connected", "Received initial 'connected' message");
  assert(initialMessage.path === "/socket", "Path correctly passed through");

  console.log("\n2️⃣ Test: Text Message Echo");

  const textMessagePromise = new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout")), 5000);
    ws.onmessage = (event) => {
      clearTimeout(timeout);
      resolve(JSON.parse(event.data as string));
    };
  });

  ws.send(JSON.stringify({ hello: "world" }));

  const textResponse = await textMessagePromise;
  assert(textResponse.type === "echo", "Received echo response");
  assert(textResponse.received?.hello === "world", "Message content preserved");

  console.log("\n3️⃣ Test: Multiple Messages");

  const messages = ["msg1", "msg2", "msg3"];
  const responses: any[] = [];

  const multiMessagePromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout")), 5000);
    let count = 0;
    ws.onmessage = (event) => {
      responses.push(JSON.parse(event.data as string));
      count++;
      if (count === messages.length) {
        clearTimeout(timeout);
        resolve();
      }
    };
  });

  for (const msg of messages) {
    ws.send(JSON.stringify({ msg }));
  }

  await multiMessagePromise;
  assert(responses.length === 3, "Received all 3 echo responses");
  assert(responses.every(r => r.type === "echo"), "All responses are echo type");

  console.log("\n4️⃣ Test: WebSocket Close");

  const closePromise = new Promise<CloseEvent>((resolve) => {
    ws.onclose = resolve;
  });

  ws.close(1000, "Test complete");

  const closeEvent = await closePromise;
  assert(closeEvent.code === 1000, "Clean close with code 1000");

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log(`\n📊 Test Results: ${tests.passed} passed, ${tests.failed} failed`);

  if (tests.failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
