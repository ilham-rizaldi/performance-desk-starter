import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSyncServer } from "./sync.mjs";
import { buildReport, dateRange, syncGarmin, syncIntervals } from "./providers.mjs";
import "./data.js";
import { combineReference, projectReference } from "./reference.mjs";

const { reportDate: date } = dateRange();
const garminActivity = { activityId: 41, activityType: { typeKey: "road_biking" },
  startTimeLocal: date + " 08:00:00", startTimeGMT: date + " 08:00:00", duration: 3600, distance: 24000, avgPower: 115 };
const intervalsActivity = { id: "g99", source: "GARMIN_CONNECT", type: "Ride", start_date_local: date + "T08:00:00",
  start_date: date + "T08:00:00Z", moving_time: 3590, distance: 24010, average_heartrate: 130 };
const stravaMirror = { ...intervalsActivity, id: "s7", source: "STRAVA" };
let challenge;
function mockProvider(input, options) {
  const url = new URL(input);
  switch (url.pathname) {
    case "/personalapitoken-service/personal-api/personal-api-key/token":
      assert.equal(options.headers.Authorization, "ApiKey garmin-test-key");
      return new Response("garmin.mock.token\n", { headers: { "Content-Type": "text/plain" } });
    case "/usersummary-service/v2/dailysummaries":
      return Response.json({ data: [{ calendarDate: date, heartRate: { restingValue: 51 }, bodyBattery: { latestValue: 82, maxValue: 96 } }] });
    case "/sleep-service/sleep/dailySleepSummariesByDate":
      return Response.json([{ calendarDate: date, sleepTimeSeconds: 27000, sleepScores: { overall: { value: 80 } } }]);
    case "/activitylist-service/activities/search/activities":
      return Response.json([garminActivity]);
    case "/api/v1/athlete/0/wellness":
      return Response.json([{ id: date, ctl: 30, atl: 35 }]);
    case "/api/v1/athlete/0/activities":
      return Response.json([intervalsActivity, stravaMirror]);
    case "/api/oauth/token":
      assert.equal(options.body.get("client_id"), "test-client");
      assert.equal(createHash("sha256").update(options.body.get("code_verifier")).digest("base64url"), challenge);
      return Response.json({ access_token: "intervals-oauth-test", scope: "ACTIVITY:READ,WELLNESS:READ" });
    case "/api/v1/disconnect-app":
      assert.equal(options.method, "DELETE");
      return new Response(null, { status: 204 });
    default:
      if (url.pathname.startsWith("/hrv-service/")) return Response.json({ hrvSummaries: [{ calendarDate: date, lastNightAvg: 58 }] });
      throw Error("Unexpected provider path");
  }
}

test("rejects a Garmin token response that is not a bearer token", async () => {
  const request = async () => new Response("<html>Sign in</html>");
  await assert.rejects(syncGarmin({ value: "test-key" }, new Date(), request),
    { status: 502, message: "Garmin did not return a usable access token." });
});

test("builds a dated report with matched sessions, restricted activity sources and no inferred efforts", async () => {
  const g = await syncGarmin({ value: "garmin-test-key" }, new Date(), mockProvider);
  const i = await syncIntervals({ kind: "key", value: "intervals-test-key" }, new Date(), mockProvider);
  const report = buildReport(new Map([["garmin", g], ["intervals", i]]));
  assert.equal(g.wellness[0].sleepMinutes, 450);
  assert.equal(g.wellness[0].hrv, 58);
  assert.equal(g.wellness[0].restingHR, 51);
  assert.equal(g.wellness[0].bodyBattery, 82);
  assert.equal(i.wellness[0].form, -5);
  assert.equal(report.activities.length, 2);
  assert.equal(report.activities[0].sessionKey, report.activities[1].sessionKey);
  assert.deepEqual(report.efforts, []);
});

test("manual reports accept only the same two providers as automatic sync", () => {
  const { normalize, providers } = globalThis.PerformanceData;
  const rows = ["Garmin Connect", "Intervals.icu", "Strava"].map(source => ({
    date, source, sport: "Cycling", id: source, minutes: 30,
  }));
  const report = normalize({
    version: 1, reportDate: date, timezone: "UTC", activities: rows, wellness: [], efforts: [],
  });
  assert.deepEqual(providers, ["Garmin Connect", "Intervals.icu"]);
  assert.deepEqual(report.activities.map(row => row.source), providers);
});

test("a private archive fills historical gaps without replacing live readings or reopening a disconnected source", () => {
  const reference = projectReference({
    schemaVersion: 1, date, wellness: { date, restingHr: 51, readiness: 74, bodyBattery: 70 },
    intervals: { date, fitness: 31, fatigue: 36 },
    activities: [{ date, source: "Garmin Connect", sport: "Ride", externalIds: { garmin: "41" }, name: "Archive ride", timerSeconds: 3600 }],
  });
  const live = {
    version: 1, reportDate: date, timezone: "UTC", wellness: [{ date, source: "Garmin Connect", restingHR: 49, readiness: null }],
    activities: [{ date, source: "Garmin Connect", sport: "Cycling", id: "41", minutes: 59 }],
    efforts: [],
  };
  const merged = combineReference(live, reference, ["Garmin Connect"]);
  assert.deepEqual(merged.wellness.map(row => [row.restingHR, row.readiness]), [[49, 74]]);
  assert.deepEqual(merged.activities.map(row => [row.name, row.minutes]), [["Archive ride", 59]]);
  assert.equal(merged.context.date, date);
  assert.equal(combineReference({ ...live, wellness: [], activities: [] }, reference, ["Intervals.icu"]).context, undefined);
});

test("authorizes both routes, rejects unsafe origins and removes the disconnected data", async t => {
  const directory = await mkdtemp(join(tmpdir(), "performance-desk-sync-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const server = await createSyncServer({ directory, port: 0, request: mockProvider, client: { id: "test-client" } });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const root = "http://127.0.0.1:" + server.address().port;
  const get = path => fetch(root + path, { headers: { "X-Performance-Desk": "1" } });
  const post = (path, body, origin = root) => fetch(root + path, {
    method: "POST", headers: { Origin: origin, "X-Performance-Desk": "1", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal((await fetch(root + "/api/state")).status, 403);
  assert.equal((await get("/.private/connections.json")).status, 404);
  assert.equal((await post("/api/garmin/connect", { key: "garmin-test-key" }, "https://example.test")).status, 403);
  const connection = await post("/api/garmin/connect", { key: "garmin-test-key" });
  assert.equal(connection.status, 200);
  const body = await connection.json();
  assert.equal(body.connections[0].connected, true);
  assert.equal(body.report.wellness[0].restingHR, 51);
  assert.doesNotMatch(JSON.stringify(body), /garmin-test-key|garmin\.mock\.token/);
  assert.match(await readFile(join(directory, "connections.json"), "utf8"), /garmin-test-key/);
  const approved = new URL((await (await post("/api/intervals/authorize", {})).json()).url);
  challenge = approved.searchParams.get("code_challenge");
  assert.equal(approved.origin, "https://intervals.icu");
  assert.equal(approved.searchParams.get("scope"), "ACTIVITY:READ,WELLNESS:READ");
  assert.equal((await get("/api/intervals/callback?state=unrelated")).status, 403);
  const callback = await fetch(root + "/api/intervals/callback?code=mock-code&state=" + approved.searchParams.get("state"), { redirect: "manual" });
  assert.equal(callback.status, 303);
  const reloaded = await (await get("/api/state")).json();
  assert.equal(reloaded.connections[1].connected, true);
  assert.equal(reloaded.report.wellness.find(row => row.source === "Intervals.icu").fitness, 30);
  assert.equal((await post("/api/intervals/disconnect", {})).status, 200);
  assert.equal((await (await post("/api/garmin/disconnect", {})).json()).report, null);
  assert.deepEqual(JSON.parse(await readFile(join(directory, "connections.json"), "utf8")), {});
});
