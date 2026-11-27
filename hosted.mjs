import { buildReport, sources, syncGarmin, syncIntervals } from "./providers.mjs";
import { combineReference } from "./reference-data.mjs";

const githubOrigin = "https://ilham-rizaldi.github.io";
const timeZone = "Asia/Jakarta";
const providers = { garmin: syncGarmin, intervals: syncIntervals };
const intervals = { garmin: 60 * 60000, intervals: 15 * 60000 };
const refreshFloor = 5 * 60000;
const tokenFormat = /^[A-Za-z0-9_-]{43}$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const headers = {
  "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
  "Access-Control-Allow-Origin": githubOrigin, "Vary": "Origin", "X-Content-Type-Options": "nosniff",
};
const json = (body, status = 200) => Response.json(body, { status, headers });
const decode = value => Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), char => char.charCodeAt(0));
const encode = bytes => {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(binary);
};

async function authorized(request, env) {
  const token = request.headers.get("Authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token || !tokenFormat.test(env.STARTER_ACCESS_HASH ?? "")) return false;
  const expected = decode(env.STARTER_ACCESS_HASH);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token)));
  return digest.reduce((difference, byte, index) => difference | (byte ^ expected[index]), 0) === 0;
}

async function cacheKey(env) {
  if (!tokenFormat.test(env.STARTER_CACHE_KEY ?? "")) throw new Error("Cache key missing");
  return crypto.subtle.importKey("raw", decode(env.STARTER_CACHE_KEY), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function seal(value, key, name) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(name) }, key, encoder.encode(JSON.stringify(value)));
  return encode(iv) + "." + encode(new Uint8Array(bytes));
}

async function open(value, key, name) {
  if (!value) return null;
  const [iv, payload] = value.split(".").map(decode);
  const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(name) }, key, payload);
  return JSON.parse(decoder.decode(bytes));
}

const savedRows = db => db.prepare("SELECT id, attempted_at, synced_at, problem, payload FROM starter_cache").all();

async function setup(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS starter_cache (id TEXT PRIMARY KEY, attempted_at INTEGER NOT NULL, synced_at INTEGER, problem TEXT, payload TEXT)").run();
}

async function refresh(id, row, env, key, manual, now, fetchProvider) {
  const db = env.DB;
  const period = manual ? refreshFloor : intervals[id];
  if (now - (row?.attempted_at ?? 0) < period) return;
  const claimed = await db.prepare(
    "INSERT INTO starter_cache (id, attempted_at) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET attempted_at=excluded.attempted_at WHERE starter_cache.attempted_at<=? RETURNING id"
  ).bind(id, now, now - period).first();
  if (!claimed) return;
  try {
    const value = id === "garmin" ? env.STARTER_GARMIN_KEY : env.STARTER_INTERVALS_KEY;
    if (!value) throw new Error("Provider credential missing");
    const result = await providers[id]({ kind: "key", value }, new Date(now), fetchProvider, undefined, { timeZone, includeEfforts: false });
    const { wellness, activities, calendar, notices } = result;
    const payload = await seal({ wellness, activities, calendar, notices }, key, id);
    await db.prepare("UPDATE starter_cache SET synced_at=?, payload=?, problem=NULL WHERE id=? AND attempted_at=?")
      .bind(now, payload, id, now).run();
  } catch (error) {
    const problem = [401, 403].includes(error.status) ? "Provider access expired or was denied."
      : error.status === 429 ? "The provider requested a pause." : "The provider could not complete the latest sync.";
    await db.prepare("UPDATE starter_cache SET problem=? WHERE id=? AND attempted_at=?")
      .bind(problem, id, now).run();
  }
}

export async function starterRequest(request, env, { publisher = false, fetchProvider = fetch } = {}) {
  if (request.method === "OPTIONS" && request.headers.get("Origin") === githubOrigin) {
    return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "GET, POST",
      "Access-Control-Allow-Headers": "Authorization" } });
  }
  const referenceUpload = request.method === "PUT";
  if (referenceUpload ? !publisher : request.headers.get("Origin") !== githubOrigin || !await authorized(request, env)) {
    return json({ error: "Open your private Performance Desk bookmark." }, 403);
  }
  if (!["GET", "POST", "PUT"].includes(request.method)) return json({ error: "Method not allowed." }, 405);
  try {
    const key = await cacheKey(env);
    await setup(env.DB);
    const now = Date.now();
    if (referenceUpload) {
      const reader = request.body?.getReader();
      if (!reader) return json({ error: "Archive data required." }, 400);
      let size = 0, text = "";
      const stream = new TextDecoder("utf-8", { fatal: true });
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 750000) {
            await reader.cancel();
            return json({ error: "Archive exceeds the size limit." }, 413);
          }
          text += stream.decode(value, { stream: true });
        }
      } finally { reader.releaseLock(); }
      const reference = JSON.parse(text + stream.decode());
      if (reference?.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(reference.reportDate ?? "")
        || !Array.isArray(reference.wellness) || !Array.isArray(reference.activities) || !Array.isArray(reference.efforts)) {
        return json({ error: "Invalid reference archive." }, 400);
      }
      const payload = await seal(reference, key, "reference");
      await env.DB.prepare("INSERT INTO starter_cache VALUES ('reference',?,?,NULL,?) ON CONFLICT(id) DO UPDATE SET attempted_at=excluded.attempted_at, synced_at=excluded.synced_at, payload=excluded.payload")
        .bind(now, now, payload).run();
      return json({ date: reference.reportDate });
    }
    const readState = async () => new Map((await savedRows(env.DB)).results.map(row => [row.id, row]));
    let state = await readState();
    await Promise.all(Object.keys(providers).map(id => refresh(id, state.get(id), env, key, request.method === "POST", now, fetchProvider)));
    state = await readState();
    const cache = new Map();
    for (const id of Object.keys(providers)) {
      const snapshot = await open(state.get(id)?.payload, key, id);
      if (snapshot) cache.set(id, snapshot);
    }
    const reference = await open(state.get("reference")?.payload, key, "reference");
    return json({
      connections: Object.keys(providers).map(id => {
        const row = state.get(id);
        return { id, name: sources[id], connected: true, lastSync: row?.synced_at && new Date(row.synced_at).toISOString(),
          error: row?.problem, notices: cache.get(id)?.notices ?? [] };
      }),
      report: cache.size ? combineReference(buildReport(cache, new Date(now), timeZone), reference, [...cache.keys()].map(id => sources[id])) : null,
    });
  } catch {
    return json({ error: "The private dashboard could not be loaded." }, 503);
  }
}
