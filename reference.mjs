import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const garmin = "Garmin Connect", intervals = "Intervals.icu";
const sport = { Ride: "Cycling", Run: "Running", "Weight Training": "Strength" };
const environment = { indoor: "Indoor", outdoor: "Outdoor" };
const minutes = value => Number.isFinite(value) ? value / 60 : undefined;
const wellnessKey = row => [row.source, row.date].join("|");
const activityKey = row => [row.source, row.id].join("|");
const pairs = fields => Object.entries(fields).filter(([, value]) => value != null);

function mergeRows(older, newer, key) {
  const rows = new Map(older.map(row => [key(row), row]));
  for (const row of newer) {
    const id = key(row);
    rows.set(id, { ...rows.get(id), ...Object.fromEntries(pairs(row)) });
  }
  return [...rows.values()];
}

export function projectReference(original) {
  if (original?.schemaVersion !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(original.date ?? "")) {
    throw Error("Choose a verified Performance Desk archive.");
  }
  const history = (original.wellnessHistory?.rows ?? []).map(row => ({ date: row.date, source: garmin,
    restingHR: row.rhrBpm, hrv: row.hrvMs, hrv7d: row.hrv7dMs, sleepMinutes: row.sleepMinutes, sleepScore: row.sleepScore,
    readiness: row.readiness, recoveryHours: Number.isFinite(row.recoveryTimeMinutes) ? row.recoveryTimeMinutes / 60 : undefined,
    bodyBatteryHigh: row.bodyBatteryHigh, bodyBatteryLow: row.bodyBatteryLow }));
  const loads = (original.garminLoadHistory?.rows ?? []).map(row => ({ date: row.date, source: garmin, acuteLoad: row.acute,
    chronicLoad: row.chronic, loadRatio: row.ratio, optimalLow: row.optimalLow, optimalHigh: row.optimalHigh }));
  const status = (original.trainingStatusHistory?.heat ?? []).map(row => ({ date: row.date, source: garmin, heat: row.value }));
  const vo2 = (original.performance?.vo2History ?? []).filter(row => row.source === garmin && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && /run|general/i.test(row.sport ?? ""))
    .map(row => ({ date: row.date, source: garmin, vo2: row.value }));
  const w = original.wellness ?? {};
  const latest = { date: w.date ?? original.date, source: garmin, restingHR: w.restingHr, hrv: w.rawHrvMs, hrv7d: w.hrv7dMs,
    sleepMinutes: w.sleepMinutes, sleepScore: w.sleepScore, readiness: w.readiness,
    recoveryHours: Number.isFinite(w.recoveryTimeMinutes) ? w.recoveryTimeMinutes / 60 : undefined,
    bodyBattery: w.bodyBattery, bodyBatteryHigh: w.bodyBatteryDailyHigh, bodyBatteryLow: w.bodyBatteryDailyLow,
    acuteLoad: w.garminAcuteLoad, chronicLoad: w.garminChronicLoad, loadRatio: w.garminLoadRatio,
    vo2: w.vo2Max, heat: w.heatAcclimationPercent,
    trainingStatus: w.trainingStatus, loadFocusStatus: w.loadFocus, trainingStatusSince: w.trainingStatusSince,
    hrvStatus: w.hrvStatus, readinessStatus: w.readinessStatus, sleepStatus: w.sleepScoreStatus, loadStatus: w.garminAcuteLoadStatus };
  const fitness = [...(original.baseHistory?.intervalsDaily ?? []), original.intervals].filter(row => row?.date)
    .map(row => ({ date: row.date, source: intervals, fitness: row.fitness, fatigue: row.fatigue,
      form: row.form ?? (Number.isFinite(row.fitness) && Number.isFinite(row.fatigue) ? row.fitness - row.fatigue : null) }));

  const lifts = new Map((original.baseHistory?.strengthVolume?.sessionDetails ?? []).map(row => [String(row.activityId), row.volumeKg]));
  const activities = (original.activities ?? []).flatMap(row => {
    const id = row.externalIds?.garmin;
    if (row.source !== garmin || id == null || row.classification === "non-training" || !sport[row.sport]) return [];
    return [{ id: String(id), date: row.date, name: row.name, source: garmin, sport: sport[row.sport],
      environment: environment[row.environment], minutes: minutes(row.timerSeconds ?? row.movingSeconds),
      km: row.distanceKm, avgHR: row.averageHr, avgWatts: row.measuredPowerWatts ?? row.averageRunningPowerWatts,
      liftedKg: lifts.get(String(id)) }];
  });
  const efforts = (original.predictionEvidence?.blocks ?? []).filter(row => row.source === "Garmin original FIT" && sport[row.sport])
    .map(row => ({ date: row.date, source: garmin, sport: sport[row.sport], environment: environment[row.environment],
      minutes: minutes(row.durationSeconds), bpm: row.hrBpm, peakHR: row.peakHrBpm, watts: row.powerWatts, paceSeconds: row.paceSecondsPerKm }));
  const context = { date: original.date, capturedAt: original.capturedAt,
    sleep: { date: latest.date, bed: w.bedTimeLocal, wake: w.wakeTimeLocal, deep: w.deepSleepMinutes, light: w.lightSleepMinutes,
      rem: w.remSleepMinutes, awake: w.awakeMinutes, score: w.sleepScore, need: w.sleepNeedMinutes },
    records: (original.performance?.records ?? []).filter(row => row.source === garmin)
      .map(({ date, label, sport, value, unit, source }) => ({ date, label, sport, value, unit, source })),
    pacing: Object.fromEntries(["cycling","running"].flatMap(key => {
      const p = original.coaching?.pacing?.[key];
      if (!p) return [];
      const evidenceDates = Object.fromEntries(Object.entries(p.evidence ?? {}).map(([field, evidence]) => [field, evidence.date]));
      return [[key, { minutes: p.minutes, power: p.powerWatts, pace: p.paceSecondsPerKm, hr: p.hrBpm,
        ceiling: p.hrCeiling, steps: p.stepsMinutes, adjustment: p.adjustment, evidenceDates }]];
    })),
    plan: original.coaching?.nextSession && {
      date: original.coaching.nextSession.date, name: original.coaching.nextSession.name, minutes: original.coaching.nextSession.minutes,
      target: original.coaching.nextSession.target, condition: original.coaching.nextSession.condition,
      alternative: original.coaching.nextSession.alternative, steps: original.coaching.nextSession.steps?.map(({ name, minutes, detail }) => ({ name, minutes, detail })),
    },
    archive: [{ date: original.date, title: original.coaching?.headline }, ...(original.baseHistory?.snapshots ?? [])
      .map(row => ({ date: row.date, title: row.coaching?.headline }))],
    loadFocus: original.trainingMix?.garminLoadFocus && { end: original.trainingMix.garminLoadFocus.end,
      buckets: original.trainingMix.garminLoadFocus.buckets?.map(({ key, points, targetLow, targetHigh }) => ({ key, points, targetLow, targetHigh })) },
    thresholds: (original.thresholdReview?.rows ?? []).map(({ title, value, unit, status, detail, evidence }) => ({ title, value, unit, status, detail, date: evidence?.date })),
  };
  const wellness = [history, loads, status, vo2, [latest], fitness].reduce((left, right) => mergeRows(left, right, wellnessKey), []);
  return { version: 1, reportDate: original.date, wellness, activities, efforts, context };
}

export function combineReference(live, reference, activeSources) {
  if (!reference || reference.version !== 1) return live;
  const available = row => activeSources.includes(row.source) && row.date <= live.reportDate;
  const garminAvailable = activeSources.includes(garmin) && reference.reportDate <= live.reportDate;
  return {
    ...live,
    wellness: mergeRows((reference.wellness ?? []).filter(available), live.wellness, wellnessKey),
    activities: mergeRows((reference.activities ?? []).filter(available), live.activities, activityKey),
    efforts: [...(reference.efforts ?? []).filter(available), ...live.efforts],
    context: garminAvailable ? reference.context : undefined,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw Error("Run node reference.mjs /path/to/a/private-performance-desk-report.json");
  const folder = fileURLToPath(new URL("./.private/", import.meta.url));
  const reference = projectReference(JSON.parse(await readFile(process.argv[2], "utf8")));
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await writeFile(join(folder, "performance-desk-reference.json"), JSON.stringify(reference), { mode: 0o600 });
  console.log("Prepared the encrypted-report viewer’s private data for the local starter.");
}
