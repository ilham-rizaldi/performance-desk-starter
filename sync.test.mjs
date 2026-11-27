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
    case "/sleep-service/sleep/dailySleepSummariesByDate": {
      const start = Date.parse(date + "T00:00:00Z"), end = start + 8 * 3600000;
      return Response.json([{ calendarDate: date, sleepTimeSeconds: 27000, sleepStartTimestampGMT: start, sleepEndTimestampGMT: end,
        sleepStartTimestampLocal: start + 7 * 3600000, sleepEndTimestampLocal: end + 7 * 3600000,
        deepSleepSeconds: 7200, lightSleepSeconds: 14400, remSleepSeconds: 5400, awakeSleepSeconds: 1800,
        sleepScores: { overall: { value: 80, qualifierKey: "GOOD" } }, sleepNeed: { actual: 480 } }]);
    }
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
  assert.equal(g.wellness[0].sleepDetails.bed, "07:00");
  assert.equal(g.wellness[0].sleepDetails.wake, "15:00");
  assert.equal(g.wellness[0].sleepDetails.offset, 420);
  assert.equal(g.wellness[0].sleepDetails.need, 480);
  assert.equal(g.wellness[0].sleepDetails.deep, 120);
  assert.equal(g.wellness[0].sleepStatus, "GOOD");
  assert.equal(g.wellness[0].hrv, 58);
  assert.equal(g.wellness[0].restingHR, 51);
  assert.equal(g.wellness[0].bodyBattery, 82);
  assert.equal(i.wellness[0].form, -5);
  assert.equal(report.activities.length, 2);
  assert.equal(report.activities[0].sessionKey, report.activities[1].sessionKey);
  const merged = globalThis.PerformanceData.normalize(report).activities;
  assert.equal(merged.length, 1);
  assert.equal(merged[0].avgHR, 130);
  assert.deepEqual(merged[0].sourceReadings, [
    { source: "Garmin Connect", id: "41", minutes: 60, km: 24, avgWatts: 115, avgHR: null, timeBasis: "duration" },
    { source: "Intervals.icu", id: "g99", minutes: 3590 / 60, km: 24.01, avgWatts: null, avgHR: 130, timeBasis: "moving" },
  ]);
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

test("prediction availability uses comparable efforts on different days within the same sport and environment", () => {
  const { hasComparableEfforts, matchingEfforts, hrEstimate } = globalThis.PerformanceData;
  const ride = { date: "2026-01-01", sport: "Cycling", environment: "Outdoor", minutes: 10, effort: 100, bpm: 125 };
  const sameDay = { ...ride, effort: 106, bpm: 130 };
  const differentDay = { ...ride, date: "2026-01-02", effort: 116, bpm: 139 };
  const outdoor = rows => matchingEfforts(rows, "Cycling", "Outdoor");
  assert.equal(hasComparableEfforts(outdoor([ride, sameDay]), "Cycling"), false);
  assert.equal(hasComparableEfforts(outdoor([ride, { ...differentDay, effort: 160 }]), "Cycling"), false);
  assert.equal(hasComparableEfforts(outdoor([ride, { ...differentDay, environment: "Indoor" }]), "Cycling"), false);
  assert.equal(hasComparableEfforts(outdoor([ride, { ...differentDay, minutes: 7 }]), "Cycling"), false);
  assert.equal(hasComparableEfforts(outdoor([differentDay, ride]), "Cycling"), true);
  assert.equal(hrEstimate(outdoor([ride, differentDay]), 108, "Cycling").bpm, 132);
  assert.equal(hasComparableEfforts([{ ...ride, effort: 360 }, { ...differentDay, effort: 410 }], "Running"), true);
  assert.equal(hasComparableEfforts([{ ...ride, effort: 360 }, { ...differentDay, effort: 411 }], "Running"), false);
});

test("sync extracts paired streams once and keeps measured ceiling time", async () => {
  const time = Array.from({ length: 781 }, (_, i) => i);
  const ride = { ...intervalsActivity, type: "VirtualRide", device_watts: true };
  const streams = [
    { type: "time", data: time },
    { type: "heartrate", data: time.map(t => t >= 600 ? 146 : 130) },
    { type: "watts", data: time.map(() => 120) },
  ];
  let attempts = 0;
  async function request(input, options) {
    const { pathname, searchParams } = new URL(input);
    if (pathname.endsWith("/activities")) return Response.json([ride]);
    if (pathname.endsWith("/streams.json")) {
      attempts++;
      assert.equal(searchParams.get("types"), "time,heartrate,watts");
      return Response.json(streams);
    }
    if (pathname.endsWith("/events")) return Response.json([]);
    return mockProvider(input, options);
  }
  const auth = { kind: "key", value: "test-key" };
  const first = await syncIntervals(auth, new Date(), request);
  const next = await syncIntervals(auth, new Date(), request, first);
  assert.equal(attempts, 1);
  const report = buildReport(new Map([["intervals", next]]));
  const { normalize, workoutActual } = globalThis.PerformanceData;
  const [block] = normalize(report).efforts;
  assert.equal(block.environment, "Indoor");
  assert.equal(block.offsetSeconds, 300);
  assert.equal(block.peakHR, 146);
  const plan = { date, sport: "Cycling", environment: "Indoor", target: 120, ceiling: 145, savedAt: block.sessionStart - 1 };
  const result = workoutActual([block], plan);
  assert.equal(result.state, "matched");
  assert.equal(result.bpm, 139.6);
  assert.equal(result.measuredSeconds, 480);
  assert.equal(result.secondsOver, 180);
  assert.equal(workoutActual([block], { ...plan, savedAt: block.sessionStart + 1 }).state, "waiting");
});

test("workout forecast uses earlier days only and blocks stale recovery decisions", () => {
  const { workoutForecast, workoutAdjustment, recoveryAssessment } = globalThis.PerformanceData;
  const plan = { date: "2026-11-27", sport: "Running", environment: "Outdoor", target: 600 };
  const block = { sport: "Running", environment: "Outdoor", minutes: 8 };
  const efforts = [
    { ...block, date: "2026-11-24", effort: 590, bpm: 130 },
    { ...block, date: "2026-11-25", effort: 610, bpm: 134 },
    { ...block, date: plan.date, effort: 600, bpm: 190 },
    { ...block, date: "2026-11-26", effort: 600, bpm: 190, environment: "Indoor" },
  ];
  assert.equal(workoutForecast(efforts, plan).bpm, 132);
  const data = { date: plan.date, wellness: [
    { date: "2026-11-25", source: "Garmin Connect", readiness: 82, recoveryHours: 1 },
    { date: "2026-11-26", source: "Garmin Connect", readiness: 18, recoveryHours: 29 },
    { date: plan.date, source: "Garmin Connect", readiness: 32, recoveryHours: 14 },
  ] };
  assert.equal(workoutAdjustment(data, plan.date, 40).minutes, 25);
  assert.equal(workoutAdjustment(data, "2026-11-28", 40).minutes, null);
  assert.equal(recoveryAssessment(data, "2026-11-25").level, "start");
  assert.deepEqual(recoveryAssessment(data, "2026-11-26").reasons, ["readiness", "timer"]);
  assert.equal(recoveryAssessment(data, "2026-11-26").level, "rest");
  assert.equal(recoveryAssessment(data, plan.date).level, "easy");
  assert.equal(recoveryAssessment(data, "2026-11-24").level, "partial");
});

test("coaching combines dated load, Form and HRV without changing the rest or missing-data guardrails", () => {
  const { trainingAssessment, workoutAdjustment } = globalThis.PerformanceData;
  const earlier = "2026-11-25", middle = "2026-11-26", latest = "2026-11-27";
  const recovery = { source: "Garmin Connect", readiness: 83, recoveryHours: 1, optimalLow: 300, optimalHigh: 600 };
  const data = { date: latest, wellness: [
    { ...recovery, date: earlier, acuteLoad: 650 },
    { ...recovery, date: middle, acuteLoad: 500, hrvStatus: "Unbalanced" },
    { date: middle, source: "Intervals.icu", form: -31 },
    { ...recovery, date: latest, acuteLoad: 528, hrvStatus: "Balanced" },
    { date: latest, source: "Intervals.icu", form: -11.3 },
  ] };
  assert.deepEqual(trainingAssessment(data, earlier).cautions, ["Acute Load was above your personal range."]);
  assert.equal(trainingAssessment(data, middle).level, "easy");
  assert.equal(trainingAssessment(data, middle).cautions.length, 2);
  assert.equal(trainingAssessment(data, latest).level, "start");
  assert.equal(workoutAdjustment(data, latest, 40).minutes, 40);
  data.wellness[3].readiness = 18;
  assert.equal(trainingAssessment(data, latest).level, "rest");
  assert.equal(workoutAdjustment(data, latest, 40).minutes, null);
  data.wellness[3].readiness = null;
  data.wellness[3].recoveryHours = null;
  assert.equal(trainingAssessment(data, latest).level, "partial");
});

test("weekly progress matches HR bands and a gentler target needs measured peaks", () => {
  const { weeklyEffort, gentlerWorkoutTarget } = globalThis.PerformanceData;
  const block = { sport: "Cycling", environment: "Outdoor", minutes: 8, bpm: 134, peakHR: 144 };
  const efforts = [
    { ...block, date: "2026-11-16", effort: 90 },
    { ...block, date: "2026-11-19", effort: 93 },
    { ...block, date: "2026-11-22", effort: 98 },
    { ...block, date: "2026-11-24", effort: 100 },
    { ...block, date: "2026-11-25", effort: 180, bpm: 163 },
  ];
  const plan = { date: "2026-11-27", sport: block.sport, environment: block.environment, ceiling: 145, target: 110 };
  const trend = weeklyEffort(efforts, plan.date, plan.sport, plan.environment);
  assert.equal(trend.current, 99);
  assert.equal(trend.previous, 91.5);
  assert.equal(gentlerWorkoutTarget(efforts, plan), 100);
  assert.equal(gentlerWorkoutTarget(efforts, { ...plan, ceiling: 140 }), null);
});

test("Adaptive Workout uses the dated plan and reports measured ceiling exceedances", () => {
  const { workoutDefaults, workoutForecast, gentlerWorkoutTarget } = globalThis.PerformanceData;
  const context = {
    pacing: { cycling: { power: [90, 105], minutes: 40, ceiling: 150 }, running: { pace: [570, 660], minutes: 30, ceiling: 150 } },
    plan: { date: "2026-11-27", name: "Easy aerobic spin", sport: "Ride", minutes: 35,
      target: "85–95 W in the easy block. HR ceiling 145 bpm.",
      alternative: "If you prefer to run, do 20–25 minutes at 10:30–11:30/km. Walk sooner if HR approaches 145 bpm." },
  };
  assert.deepEqual(workoutDefaults(context, "Cycling", "2026-11-27"), { target: 85, ceiling: 145, minutes: 35 });
  assert.deepEqual(workoutDefaults(context, "Running", "2026-11-27"), { target: 690, ceiling: 145, minutes: 20 });
  assert.deepEqual(workoutDefaults(context, "Cycling", "2026-11-28"), { target: 90, ceiling: 150, minutes: 40 });
  const plan = { date: "2026-11-27", sport: "Cycling", environment: "Outdoor", target: 90, ceiling: 145 };
  const block = { ...plan, minutes: 8, bpm: 130, peakHR: 146 };
  const rows = [
    { ...block, date: "2026-11-23", effort: 86, peakHR: 144 },
    { ...block, date: "2026-11-24", effort: 90, peakHR: 144 },
    { ...block, date: "2026-11-25", effort: 92 },
  ];
  assert.equal(workoutForecast(rows, plan).daysOverCeiling, 1);
  assert.equal(workoutForecast(rows, plan).measuredPeakDays, 3);
  assert.equal(gentlerWorkoutTarget(rows, { ...plan, target: 95 }), null);
});

test("live blocks replace archive blocks for the same activity only", () => {
  const archive = projectReference({
    schemaVersion: 1, date: "2026-11-27",
    predictionEvidence: { blocks: ["1", "2"].map(activityId => ({
      date: "2026-11-26", activityId, sport: "Ride", environment: "outdoor", source: "Garmin original FIT",
      durationSeconds: 480, hrBpm: 130, powerWatts: 90,
    })) },
  });
  const live = { reportDate: "2026-11-27", wellness: [], activities: [],
    efforts: [{ ...archive.efforts[0], watts: 95 }] };
  const report = combineReference(live, archive, ["Garmin Connect"]);
  assert.deepEqual(report.efforts.map(row => [row.activityId, row.watts]), [["2", 90], ["1", 95]]);
});

test("archived strength records retain per-exercise evidence without double-counting a live session", () => {
  const { normalize, strengthRecords } = globalThis.PerformanceData;
  const reference = projectReference({
    schemaVersion: 1, date: "2026-11-24", baseHistory: { strengthVolume: { sessionDetails: [
      { activityId: 1, date: "2026-11-23", volumeKg: 1600, exerciseSets: [
        { exercise: "Leg Press", weightKg: 100, reps: 9 }, { exercise: "Pull-up", reps: 5 }, { weightKg: 200, reps: 2 },
      ] },
      { activityId: 2, date: "2026-11-24", volumeKg: 1290, exerciseSets: [
        { exercise: "leg press", weightKg: 100, reps: 10 }, { exercise: "Leg Press", weightKg: 80, reps: 12 },
      ] },
    ] } },
  });
  const live = { version: 1, reportDate: "2026-11-24", timezone: "UTC", wellness: [], efforts: [],
    activities: [{ id: "2", date: "2026-11-24", source: "Garmin Connect", sport: "Strength", minutes: 32 }] };
  const { activities } = normalize(combineReference(live, reference, ["Garmin Connect"]));
  assert.equal(activities.length, 2);
  assert.equal(activities.reduce((sum, activity) => sum + activity.liftedKg, 0), 2890);
  assert.equal(activities[0].exerciseSets.find(row => !row.exercise).weightKg, 200);
  assert.deepEqual(strengthRecords(activities), [
    { exercise: "leg press", weightKg: 100, reps: 10, date: "2026-11-24" },
    { exercise: "Pull-up", weightKg: null, reps: 5, date: "2026-11-23" },
  ]);
});

test("Garmin night totals use live readings and retain only matching timestamped sleep stages", () => {
  const { normalize } = globalThis.PerformanceData;
  const calendar = "2026-11-27", start = Date.parse("2026-11-26T21:30:00+07:00"), end = start + 8 * 3600000;
  const segment = (stage, from, to) => ({ stage, startAt: new Date(start + from * 60000).toISOString(),
    endAt: new Date(start + to * 60000).toISOString() });
  const reference = projectReference({ schemaVersion: 1, date: calendar, wellness: {
    sleepScore: 90, bedTimeLocal: "21:30", wakeTimeLocal: "05:30", deepSleepMinutes: 130,
    sleepStageTimeline: { date: calendar, source: "Garmin Connect", segments: [
      segment("light", 0, 25), segment("deep", 26, 55), segment("awake", 50, 60), segment("rem", 481, 490),
    ] },
  } });
  const live = { version: 1, reportDate: calendar, timezone: "Asia/Jakarta", wellness: [
    { date: "2026-11-26", source: "Garmin Connect", sleepMinutes: 400, sleepDetails: { deep: 100 } },
    { date: calendar, source: "Garmin Connect", sleepScore: 93, sleepMinutes: 450, sleepDetails: { start, end, deep: 122 } },
  ], activities: [], efforts: [] };
  const { wellness } = normalize(combineReference(live, reference, ["Garmin Connect"]));
  assert.deepEqual(wellness[0].sleepDetails.segments, []);
  assert.equal(wellness[1].sleepScore, 93);
  assert.equal(wellness[1].sleepDetails.deep, 122);
  assert.equal(wellness[1].sleepDetails.bed, "21:30");
  assert.deepEqual(wellness[1].sleepDetails.segments.map(row => row.stage), ["light", "deep"]);
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
