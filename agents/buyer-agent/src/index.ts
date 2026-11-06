import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { log } from "./logger.js";

export type StopFlag = { stopped: boolean };

export const defaultIntervalMs = 5_000;

export async function runLoop(intervalMs: number, stop: StopFlag): Promise<void> {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error("intervalMs must be a positive number");
  }
  loadConfig();
  log("started");
  while (!stop.stopped) {
    log("tick");
    await wait(intervalMs, stop);
  }
  log("stopped");
}

async function wait(ms: number, stop: StopFlag): Promise<void> {
  const ends = Date.now() + ms;
  while (!stop.stopped && Date.now() < ends) {
    const slice = Math.min(50, ends - Date.now());
    await new Promise((resolve) => setTimeout(resolve, slice));
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const stop: StopFlag = { stopped: false };
  process.on("SIGINT", () => {
    stop.stopped = true;
  });
  runLoop(defaultIntervalMs, stop).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "agent failed";
    console.error(message);
    process.exitCode = 1;
  });
}
