#!/usr/bin/env node

const intervalSeconds = parseIntervalSeconds(process.env.UPDATE_INTERVAL_SECONDS);

async function main() {
  while (true) {
    const startedAt = new Date().toISOString();
    console.log(`[${startedAt}] starting subscription update`);

    try {
      const module = await import("./vps-update.mjs");
      await module.runUpdate();
      console.log(`[${new Date().toISOString()}] subscription update finished`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] subscription update failed`);
      console.error(error.stack || error);
    }

    console.log(`sleeping ${intervalSeconds}s before next update`);
    await sleep(intervalSeconds * 1000);
  }
}

function parseIntervalSeconds(value) {
  const parsed = Number(value || 1800);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("UPDATE_INTERVAL_SECONDS must be a positive number.");
  }
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
