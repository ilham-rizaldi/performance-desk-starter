import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { readFile, mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildReport, exchangeIntervals, revokeIntervals, sources, syncGarmin, syncIntervals } from "./providers.mjs";

const base = fileURLToPath(new URL(".", import.meta.url));
const inMinutes = minutes => minutes * 60000;
const providerIds = Object.keys(sources);
const periods = { garmin: inMinutes(60), intervals: inMinutes(15) };
const readers = { garmin: syncGarmin, intervals: syncIntervals };
const files = { "/": "index.html", "/index.html": "index.html", "/styles.css": "styles.css",
  "/data.js": "data.js", "/dashboard.js": "dashboard.js", "/connections.js": "connections.js" };
const types = { html: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8" };
const localOrigin = port => "http://127.0.0.1:" + port;
const headers = {
  "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
const privateDataError = Object.assign(new Error("This action must be opened on this computer."), { status: 403 });

async function readBody(req) {
  if (!req.headers["content-type"]?.startsWith("application/json")) throw Object.assign(Error("Expected a connection form."), { status: 415 });
  let text = "";
  for await (const part of req) {
    text += part;
    if (text.length > 4096) throw Object.assign(Error("The connection form is too large."), { status: 413 });
  }
  try { return JSON.parse(text); }
  catch { throw Object.assign(Error("The connection form could not be read."), { status: 400 }); }
}

function reply(res, status, body, extra = {}) {
  res.writeHead(status, { ...headers, "Content-Type": "application/json; charset=utf-8", ...extra });
  res.end(JSON.stringify(body));
}

function message(error) {
  return error.status ? error.message : "Connection could not be completed. Check your internet connection and try again.";
}

export async function createSyncServer({ port = 4176, directory = join(base, ".private"), request = fetch,
  client = { id: process.env.INTERVALS_CLIENT_ID, secret: process.env.INTERVALS_CLIENT_SECRET } } = {}) {
  const statePath = join(directory, "connections.json");
  let credentials = {};
  try {
    const saved = JSON.parse(await readFile(statePath, "utf8"));
    for (const provider of providerIds) {
      if (typeof saved?.[provider]?.value === "string" && ["key", "oauth"].includes(saved[provider].kind)) credentials[provider] = saved[provider];
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw Error("The local connection settings could not be read.");
  }
  const cache = new Map(), states = new Map(), busy = new Map(), connecting = new Set();
  let writeQueue = Promise.resolve(), pending;
  const status = provider => states.get(provider) ?? {};

  function setState(provider, data) { states.set(provider, { ...status(provider), ...data }); }

  function save(provider, credential) {
    const task = writeQueue.then(async () => {
      const next = { ...credentials };
      if (credential) next[provider] = credential;
      else delete next[provider];
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const temporary = statePath + ".tmp";
      await writeFile(temporary, JSON.stringify(next), { mode: 0o600 });
      await rename(temporary, statePath);
      credentials = next;
    });
    writeQueue = task.catch(() => {});
    return task;
  }

  function update(provider, snapshot) {
    cache.set(provider, snapshot);
    setState(provider, { lastSync: new Date().toISOString(), next: Date.now() + periods[provider],
      allowedAfter: Date.now() + inMinutes(1), error: null });
  }

  async function connect(provider, credential) {
    if (connecting.has(provider) || busy.has(provider)) throw Object.assign(Error("Wait for this source to finish syncing."), { status: 409 });
    connecting.add(provider);
    try {
      const snapshot = await readers[provider](credential, new Date(), request);
      await save(provider, credential);
      update(provider, snapshot);
    } finally {
      connecting.delete(provider);
    }
  }

  function sync(provider, manual = false) {
    const credential = credentials[provider];
    const state = status(provider);
    if (busy.has(provider)) return busy.get(provider);
    if (!credential || connecting.has(provider) || Date.now() < (state.allowedAfter ?? 0)
      || (!manual && Date.now() < (state.next ?? 0))) return Promise.resolve();
    const task = readers[provider](credential, new Date(), request).then(snapshot => {
      if (credentials[provider] === credential) update(provider, snapshot);
    }, error => {
      if (credentials[provider] !== credential) return;
      const allowedAfter = [401, 403].includes(error.status) ? Infinity
        : Math.max(Date.now() + inMinutes(1), error.retryAt || 0);
      setState(provider, { error: message(error), next: Date.now() + periods[provider], allowedAfter });
    }).finally(() => busy.delete(provider));
    busy.set(provider, task);
    return task;
  }

  function current() {
    return {
      connections: providerIds.map(id => ({ id, name: sources[id], connected: Boolean(credentials[id]),
        syncing: busy.has(id) || connecting.has(id), lastSync: status(id).lastSync, error: status(id).error,
        notices: cache.get(id)?.notices ?? [], oauth: id === "intervals" && Boolean(client.id) })),
      report: cache.size ? buildReport(cache, new Date(Math.max(...[...cache.keys()].map(id => Date.parse(status(id).lastSync))))) : null,
    };
  }

  const server = createServer(async (req, res) => {
    try {
      const origin = localOrigin(server.address()?.port ?? port);
      if (req.headers.host !== new URL(origin).host) throw privateDataError;
      const url = new URL(req.url, origin);
      if (req.method === "GET" && Object.hasOwn(files, url.pathname)) {
        const file = files[url.pathname];
        res.writeHead(200, { ...headers, "Content-Type": types[file.split(".").at(-1)] });
        res.end(await readFile(join(base, file)));
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/intervals/callback") {
        const state = url.searchParams.get("state");
        if (!pending || !state || state !== pending.state || Date.now() > pending.expires) throw privateDataError;
        const { verifier } = pending;
        pending = null;
        const code = url.searchParams.get("code");
        try {
          if (!code) throw Object.assign(Error("Intervals.icu approval was cancelled."), { status: 400 });
          const credential = await exchangeIntervals(code, verifier, client, request);
          try { await connect("intervals", credential); }
          catch (error) { await revokeIntervals(credential.value, request).catch(() => {}); throw error; }
        } catch (error) { setState("intervals", { error: message(error) }); }
        res.writeHead(303, { ...headers, Location: "/" });
        res.end();
        return;
      }
      if (req.headers["x-performance-desk"] !== "1" || (req.method === "POST" && req.headers.origin !== origin)) throw privateDataError;
      if (req.method === "GET" && url.pathname === "/api/state") return reply(res, 200, current());
      if (req.method !== "POST") return reply(res, 404, { error: "Page not found." });
      if (url.pathname === "/api/sync") {
        await Promise.all(providerIds.map(id => sync(id, true)));
        return reply(res, 200, current());
      }
      if (url.pathname === "/api/intervals/authorize" && client.id) {
        const verifier = randomBytes(32).toString("base64url"), state = randomBytes(32).toString("base64url");
        pending = { verifier, state, expires: Date.now() + inMinutes(10) };
        const query = new URLSearchParams({ client_id: client.id, redirect_uri: origin + "/api/intervals/callback",
          scope: "ACTIVITY:READ,WELLNESS:READ", state,
          code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
        return reply(res, 200, { url: "https://intervals.icu/oauth/authorize?" + query });
      }
      const route = /^\/api\/(garmin|intervals)\/(connect|disconnect)$/.exec(url.pathname);
      if (!route) return reply(res, 404, { error: "Page not found." });
      const [, provider, action] = route;
      if (action === "disconnect") {
        if (connecting.has(provider)) throw Object.assign(Error("Wait for this source to finish connecting."), { status: 409 });
        if (provider === "intervals") pending = null;
        const prev = credentials[provider];
        await save(provider, null);
        cache.delete(provider);
        states.delete(provider);
        if (prev?.kind === "oauth") {
          try { await revokeIntervals(prev.value, request); }
          catch { setState(provider, { error: "Disconnected here. Remove the app in Intervals.icu settings to revoke access there." }); }
        }
      } else {
        const body = await readBody(req);
        const key = typeof body?.key === "string" ? body.key.trim() : "";
        if (!/^[\x21-\x7e]{6,512}$/.test(key)) throw Object.assign(Error("Enter a valid API key."), { status: 400 });
        await connect(provider, { kind: "key", value: key });
      }
      return reply(res, 200, current());
    } catch (error) {
      if (!res.headersSent) reply(res, error.status ?? 500, { error: message(error) });
      else res.end();
    }
  });

  const timer = setInterval(() => { for (const provider of providerIds) void sync(provider); }, inMinutes(1));
  timer.unref();
  server.on("listening", () => { for (const provider of providerIds) void sync(provider); });
  server.on("close", () => clearInterval(timer));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const port = Number(process.env.PORT || 4176);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("Invalid local port.");
    const server = await createSyncServer({ port });
    server.listen(port, "127.0.0.1", () => console.log("Open " + localOrigin(port) + " in your browser."));
    server.on("error", () => { console.error("Cannot start Performance Desk. Check whether the local port is already in use."); process.exitCode = 1; });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
