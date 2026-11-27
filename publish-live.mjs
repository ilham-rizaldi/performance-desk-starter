import { readFile } from "node:fs/promises";
import { setTimeout as wait } from "node:timers/promises";
import { syncGarmin, syncIntervals } from "./providers.mjs";

const endpoint = "https://performance-desk-report.ilhamngeprint.chatgpt.site/api/starter";
const config = JSON.parse(await readFile(new URL("./.private/hosted-publisher.json", import.meta.url), "utf8"));
if (!/^[A-Za-z0-9_-]{43}$/.test(config.publisher ?? "") || !config.garminKey || !config.intervalsKey) {
  throw new Error("Private connection configuration is incomplete.");
}
const watch = process.argv.includes("--watch");
const timeZone = "Asia/Jakarta";
const readers = {
  garmin: { read: syncGarmin, key: config.garminKey, period: 60 * 60000 },
  intervals: { read: syncIntervals, key: config.intervalsKey, period: 15 * 60000 },
};
const headers = { Authorization: "Bearer " + config.publisher, "Content-Type": "application/json" };
const next = {};
let handledRequest = 0;

async function publish(manual = false) {
  const now = Date.now();
  const entries = Object.entries(readers).filter(([id]) => manual || now >= (next[id] ?? 0));
  if (!entries.length) return true;
  const result = await Promise.allSettled(entries.map(async ([id, reader]) => {
    const { wellness, activities, calendar, notices } = await reader.read({ kind: "key", value: reader.key },
      new Date(now), fetch, undefined, { timeZone, includeEfforts: false });
    return [id, { syncedAt: Date.now(), data: { wellness, activities, calendar, notices } }];
  }));
  const ready = [];
  result.forEach((item, index) => {
    const [id, reader] = entries[index];
    if (item.status === "fulfilled") ready.push(item.value);
    else {
      next[id] = Math.max(now + 5 * 60000, item.reason?.retryAt ?? 0);
      console.warn(id + " did not sync. The last successful snapshot remains available.");
    }
  });
  if (ready.length) {
    const response = await fetch(endpoint, { method: "PUT", headers, redirect: "error", signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ type: "provider-snapshots", sources: Object.fromEntries(ready) }) });
    if (!response.ok) throw new Error("The private viewer rejected the snapshot (HTTP " + response.status + ").");
    const { accepted } = await response.json();
    if (!ready.every(([id]) => accepted?.includes(id))) throw new Error("The private viewer did not confirm every snapshot.");
    for (const [id] of ready) next[id] = now + readers[id].period;
    console.log("Private dashboard refreshed at " + new Date().toISOString() + " · " + ready.map(([id]) => id).join(", "));
  }
  return result.every(item => item.status === "fulfilled");
}

try {
  if (!await publish() && !watch) process.exitCode = 1;
} catch (error) {
  console.warn("The initial private publish did not complete.");
  if (!watch) process.exitCode = 1;
}
if (watch) {
  for (;;) {
    await wait(60000);
    try {
      const response = await fetch(endpoint + "?sync-request=1", { headers, redirect: "error", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Could not check refresh requests.");
      const { requestedAt } = await response.json();
      const manual = Number.isSafeInteger(requestedAt) && requestedAt > handledRequest && Date.now() - requestedAt < 10 * 60000;
      if (manual) handledRequest = requestedAt;
      await publish(manual);
    } catch {
      console.warn("The private sync check failed. It will retry in one minute.");
    }
  }
}
