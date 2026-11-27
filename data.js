(() => {
  "use strict";

  const providers = ["Garmin Connect", "Intervals.icu"];
  const sports = ["Cycling", "Running", "Strength"];
  const optimalLoadRatio = Object.freeze({ low: 0.8, high: 1.5 });
  const highRiskFormBelow = -30;
  const metricRanges = {
    readiness: [0, 100], bodyBattery: [0, 100], sleepScore: [0, 100], sleepMinutes: [0, 1440],
    restingHR: [1, 300], hrv: [1, 500], recoveryHours: [0, 240],
    acuteLoad: [0, 50000], chronicLoad: [0, 50000], loadRatio: [0, 25],
    bodyBatteryHigh: [0, 100], bodyBatteryLow: [0, 100], vo2: [1, 120], heat: [0, 100], hrv7d: [1, 500],
    optimalLow: [0, 50000], optimalHigh: [0, 50000],
    fitness: [0, 1000], fatigue: [0, 1000], form: [-1000, 1000],
  };

  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
  }

  function number(value, lower, upper) {
    return Number.isFinite(value) && value >= lower && value <= upper ? value : null;
  }

  const sleepStages = ["awake", "rem", "light", "deep"];
  function sleepDetails(row, archive) {
    const live = row.sleepDetails ?? {};
    const ranges = {
      deep: [0, 1440], light: [0, 1440], rem: [0, 1440], awake: [0, 1440], need: [1, 1440],
      restless: [0, 1440], awakenings: [0, 1440], overnightHR: [1, 300], spo2: [1, 100], respiration: [1, 100],
      start: [1, 8.64e15], end: [1, 8.64e15], offset: [-840, 840],
    };
    const clock = value => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
    const detail = Object.fromEntries(Object.entries(ranges).map(([key, [min, max]]) =>
      [key, number(live[key], min, max) ?? number(archive?.[key], min, max)]));
    for (const key of ["bed", "wake"]) detail[key] = clock(live[key]) ?? clock(archive?.[key]);

    const raw = Array.isArray(live.segments) ? live.segments : archive?.segments;
    const segments = [];
    if (Array.isArray(raw)) {
      const times = raw.flatMap(segment => {
        const zoned = value => typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
        if (!zoned(segment?.startAt) || !zoned(segment?.endAt)) return [];
        const start = Date.parse(segment?.startAt), end = Date.parse(segment?.endAt);
        return sleepStages.includes(segment?.stage) && Number.isFinite(start) && Number.isFinite(end) && end > start
          ? [{ stage: segment.stage, start, end }] : [];
      }).sort((a, b) => a.start - b.start);
      const hasWindow = detail.start != null && detail.end != null && detail.end > detail.start;
      if (times.length && times.at(-1).end - times[0].start <= 86400000) {
        for (const segment of times) {
          if (hasWindow && (segment.start < detail.start - 60000 || segment.end > detail.end + 60000)) continue;
          if (!segments.length || segment.start >= segments.at(-1).end) segments.push(segment);
        }
      }
    }
    return { ...detail, segments };
  }

  function normalizeExerciseSets(sets) {
    if (!Array.isArray(sets)) return null;
    const recorded = sets.flatMap(row => {
      const exercise = typeof row?.exercise === "string" ? row.exercise.trim().replace(/\s+/g, " ") : "";
      const weightKg = number(row?.weightKg, 0, 100000), reps = number(row?.reps, 1, 10000);
      return exercise || weightKg != null || reps != null ? [{ exercise, weightKg, reps }] : [];
    });
    return recorded.length ? recorded : null;
  }

  function strengthRecords(sessions) {
    const records = new Map();
    for (const session of sessions) {
      for (const set of session.exerciseSets ?? []) {
        if (!set.exercise) continue;
        const key = set.exercise.toLowerCase();
        const weight = set.reps == null ? null : set.weightKg;
        const current = records.get(key);
        const recorded = weight ?? -1;
        const previous = current?.weightKg ?? -1;
        if (!current || recorded > previous || recorded === previous && (set.reps ?? 0) > (current.reps ?? 0)) {
          records.set(key, { ...set, weightKg: weight, date: session.date });
        }
      }
    }
    return [...records.values()].sort((a, b) => a.exercise.localeCompare(b.exercise));
  }

  function normalize(raw) {
    if (!raw || raw.version !== 1 || !validDate(raw.reportDate)) throw Error("Choose a Performance Desk JSON report with a valid report date.");
    if (!["wellness", "activities", "efforts"].every(key => Array.isArray(raw[key]))) throw Error("The report needs wellness, activities and efforts lists. A list may be empty.");
    if (typeof raw.timezone !== "string") throw Error("The report is missing its time zone.");
    try { new Intl.DateTimeFormat("en", { timeZone: raw.timezone }); }
    catch { throw Error("The report time zone is invalid."); }

    const observed = row => row && validDate(row.date) && row.date <= raw.reportDate && providers.includes(row.source);
    const byDate = (left, right) => left.date.localeCompare(right.date);
    const labels = ["trainingStatus", "loadFocusStatus", "trainingStatusSince", "hrvStatus", "readinessStatus", "sleepStatus", "loadStatus"];
    const wellness = raw.wellness.filter(observed).map(row => {
      const normalized = {
        date: row.date,
        source: row.source,
        ...Object.fromEntries(labels.map(key => [key, typeof row[key] === "string" ? row[key] : null])),
        ...Object.fromEntries(Object.entries(metricRanges).map(([key, [low, high]]) => [key, number(row[key], low, high)])),
      };
      const archived = raw.context?.sleep?.date === row.date ? raw.context.sleep : null;
      if (row.source === providers[0] && (row.sleepDetails || archived)) {
        normalized.sleepDetails = sleepDetails(row, archived);
        normalized.sleepScore ??= number(archived?.score, 0, 100);
      }
      return normalized;
    }).sort(byDate);

    const sessions = new Map();
    const sourcePriority = source => providers.indexOf(source);
    const validSession = row => observed(row) && sports.includes(row.sport) && typeof row.id === "string" && row.id.trim().length > 0;
    for (const row of raw.activities.filter(validSession).sort((a, b) => sourcePriority(a.source) - sourcePriority(b.source))) {
      const key = typeof row.sessionKey === "string" && row.sessionKey.trim()
        ? JSON.stringify([row.date, row.sport, row.sessionKey.trim()]) : JSON.stringify([row.source, row.id.trim()]);
      const previous = sessions.get(key);
      const session = {
        date: row.date, sport: row.sport, id: row.id, source: row.source, name: typeof row.name === "string" ? row.name : null,
        environment: ["Indoor", "Outdoor"].includes(row.environment) ? row.environment : null,
        minutes: number(row.minutes, 0.1, 4320), km: number(row.km, 0.01, 1000),
        avgWatts: number(row.avgWatts, 1, 1500), avgHR: number(row.avgHR, 30, 260),
        liftedKg: number(row.liftedKg, 0, 100000),
        exerciseSets: row.sport === "Strength" ? normalizeExerciseSets(row.exerciseSets) : null,
      };
      const reading = { source: session.source, id: session.id, minutes: session.minutes, km: session.km,
        avgWatts: session.avgWatts, avgHR: session.avgHR,
        timeBasis: ["duration", "moving"].includes(row.timeBasis) ? row.timeBasis : null };
      if (!previous) {
        sessions.set(key, { ...session, sources: [row.source], sourceReadings: [reading] });
        continue;
      }
      if (!previous.sources.includes(row.source)) {
        previous.sources.push(row.source);
        previous.sourceReadings.push(reading);
      }
      for (const name of ["name", "environment", "minutes", "km", "avgWatts", "avgHR", "liftedKg", "exerciseSets"]) previous[name] ??= session[name];
    }
    const effortKeys = new Set();
    const efforts = [];
    for (const row of raw.efforts) {
      if (!observed(row) || !["Cycling", "Running"].includes(row.sport)
        || !["Indoor", "Outdoor"].includes(row.environment)) continue;
      const bpm = number(row.bpm, 30, 260);
      const peakHR = number(row.peakHR, bpm ?? 30, 260);
      const minutes = number(row.minutes, 5, 30);
      const effort = row.sport === "Cycling" ? number(row.watts, 1, 1000) : number(row.paceSeconds, 120, 1800);
      const activityId = typeof row.activityId === "string" ? row.activityId : null;
      const sessionStart = number(row.sessionStart, 1, 8.64e15);
      const offsetSeconds = number(row.offsetSeconds, 0, 86400);
      const hrSeconds = Array.isArray(row.hrSeconds) && row.hrSeconds.length <= 231 && row.hrSeconds.every(entry =>
        Array.isArray(entry) && Number.isInteger(entry[0]) && number(entry[0], 30, 260) != null
        && Number.isInteger(entry[1]) && entry[1] > 0
      ) && row.hrSeconds.reduce((sum, [, seconds]) => sum + seconds, 0) <= (minutes ?? 0) * 60 ? row.hrSeconds : null;
      const key = JSON.stringify([row.date, row.sport, row.environment, activityId, offsetSeconds, bpm, peakHR, minutes, effort]);
      if (bpm == null || minutes == null || effort == null || effortKeys.has(key)) continue;
      effortKeys.add(key);
      efforts.push({ date: row.date, sport: row.sport, source: row.source, environment: row.environment,
        bpm, peakHR, minutes, effort, activityId, sessionStart, offsetSeconds, hrSeconds,
        sessionKey: typeof row.sessionKey === "string" ? row.sessionKey : null });
    }
    const plannedWorkouts = Array.isArray(raw.plannedWorkouts) ? raw.plannedWorkouts.filter(row =>
      validDate(row?.date) && row.date >= raw.reportDate && typeof row.id === "string"
      && typeof row.name === "string" && ["Cycling", "Running"].includes(row.sport)).map(row => ({
      id: row.id, date: row.date, name: row.name, sport: row.sport, minutes: number(row.minutes, 1, 1440),
    })).sort(byDate) : [];
    return { date: raw.reportDate, timezone: raw.timezone, wellness, activities: [...sessions.values()].sort(byDate), efforts: efforts.sort(byDate),
      plannedWorkouts, context: raw.context && typeof raw.context === "object" ? raw.context : null };
  }

  function median(values) {
    const ordered = [...values].sort((a, b) => a - b);
    const center = (ordered.length - 1) / 2;
    return (ordered[Math.floor(center)] + ordered[Math.ceil(center)]) / 2;
  }

  function matchingEfforts(rows, sport, environment) {
    return rows.filter(row => row.sport === sport && row.environment === environment && row.minutes >= 8 && row.minutes <= 15);
  }

  function effortTolerance(target, sport) {
    return sport === "Cycling" ? Math.max(8, target * .07) : 25;
  }

  function hasComparableEfforts(rows, sport) {
    const ordered = [...rows].sort((a, b) => a.effort - b.effort);
    return ordered.some((row, i) => {
      const previous = ordered[i - 1];
      if (!previous || previous.date === row.date) return false;
      const midpoint = (previous.effort + row.effort) / 2;
      return (row.effort - previous.effort) / 2 <= effortTolerance(midpoint, sport);
    });
  }

  function hrEstimate(rows, target, sport) {
    if (!Number.isFinite(target) || target <= 0) return null;
    const tolerance = effortTolerance(target, sport);
    const window = rows.filter(row => Math.abs(row.effort - target) <= tolerance);
    const days = [...new Set(window.map(row => row.date))];
    if (days.length < 2 || target < Math.min(...window.map(row => row.effort)) || target > Math.max(...window.map(row => row.effort))) return null;
    const medians = days.map(date => median(window.filter(row => row.date === date).map(row => row.bpm)));
    return { bpm: Math.round(median(medians)), low: Math.round(Math.min(...medians)), high: Math.round(Math.max(...medians)), days: days.length };
  }

  function ceilingReference(rows, ceiling, sport) {
    if (!Number.isFinite(ceiling) || ceiling <= 0) return null;
    const daily = new Map();
    let missingPeak = 0;
    for (const row of rows) {
      if (row.peakHR == null) { missingPeak++; continue; }
      const values = daily.get(row.date) || [];
      daily.set(row.date, [...values, row]);
    }
    const days = [...daily.values()];
    if (!days.length) return null;
    const qualifying = days.map(day => {
      const efforts = day.filter(row => row.peakHR <= ceiling).map(row => row.effort);
      if (!efforts.length) return null;
      return sport === "Cycling" ? Math.max(...efforts) : Math.min(...efforts);
    }).filter(value => value != null);
    const reference = qualifying.length >= 2 ? (sport === "Cycling" ? Math.min(...qualifying) : Math.max(...qualifying)) : null;
    return { reference, days: days.length, qualifying: qualifying.length,
      over: days.filter(day => day.some(row => row.peakHR > ceiling)).length, missingPeak };
  }

  function useIdentifiedSessions(rows) {
    // Current streams can identify a session. Older archived blocks may have no ID.
    const identified = new Set(rows.filter(row => row.activityId).map(row => row.date));
    return rows.filter(row => row.activityId || !identified.has(row.date));
  }

  function priorWorkoutEfforts(rows, plan) {
    const start = new Date(Date.parse(plan.date) - 90 * 86400000).toISOString().slice(0, 10);
    const past = matchingEfforts(rows, plan.sport, plan.environment).filter(row => row.date < plan.date && row.date >= start);
    return useIdentifiedSessions(past);
  }

  function workoutForecast(rows, plan) {
    const comparable = priorWorkoutEfforts(rows, plan);
    const estimate = hrEstimate(comparable, plan.target, plan.sport);
    if (!estimate || !Number.isFinite(plan.ceiling)) return estimate;
    const peaks = comparable.filter(row => Math.abs(row.effort - plan.target) <= effortTolerance(plan.target, plan.sport)
      && row.peakHR != null);
    return { ...estimate, measuredPeakDays: new Set(peaks.map(row => row.date)).size,
      daysOverCeiling: new Set(peaks.filter(row => row.peakHR > plan.ceiling).map(row => row.date)).size };
  }

  function workoutDefaults(context, sport, date) {
    const cycling = sport === "Cycling";
    const pacing = context?.pacing?.[sport.toLowerCase()];
    const defaults = { target: cycling ? pacing?.power?.[0] : pacing?.pace?.[1], ceiling: pacing?.ceiling, minutes: pacing?.minutes };
    const plan = context?.plan;
    if (plan?.date !== date) return defaults;
    const primary = /ride|cycl|bike|spin/i.test(plan.sport ?? plan.name) ? "Cycling"
      : /run/i.test(plan.sport ?? plan.name) ? "Running" : null;
    const alternative = !cycling && primary === "Cycling" && /prefer to run/i.test(plan.alternative ?? "");
    if (primary !== sport && !alternative) return defaults;
    const text = String(alternative ? plan.alternative : plan.target ?? "");
    const hr = /(?:HR ceiling\s*|HR approaches\s*)(\d{2,3})\s*bpm/i.exec(text);
    const target = cycling ? /\b(\d{1,4})(?:\s*[–-]\s*\d{1,4})?\s*W\b/i.exec(text)
      : /\b(\d{1,2}):([0-5]\d)(?:\s*[–-]\s*(\d{1,2}):([0-5]\d))?\s*\/km\b/i.exec(text);
    const duration = alternative ? /\b(\d{1,3})(?:\s*[–-]\s*\d{1,3})?\s*min(?:utes)?\b/i.exec(text)?.[1] : plan.minutes;
    return {
      target: target ? (cycling ? number(+target[1], 1, 1000)
        : number(60 * +(target[3] ?? target[1]) + +(target[4] ?? target[2]), 120, 1800)) ?? defaults.target : defaults.target,
      ceiling: hr ? number(+hr[1], 40, 230) ?? defaults.ceiling : defaults.ceiling,
      minutes: number(Number(duration), 13, 90) ?? defaults.minutes,
    };
  }

  function recoveryReadingTime(report, date) {
    const stamp = report?.context?.date === date ? Date.parse(report.context.recoveryObservedAt) : NaN;
    return Number.isFinite(stamp) ? new Intl.DateTimeFormat("en-GB", {
      timeZone: report.timezone, hour: "2-digit", minute: "2-digit", timeZoneName: "short",
    }).format(stamp) : null;
  }

  function gentlerWorkoutTarget(rows, plan) {
    if (plan.target == null || plan.ceiling == null) return null;
    const comparable = priorWorkoutEfforts(rows, plan);
    const cycling = plan.sport === "Cycling";
    const observed = [...new Set(comparable.map(row => Math.round(row.effort)))];
    const candidates = observed.filter(target => cycling ? target < plan.target : target > plan.target)
      .sort((a, b) => Math.abs(a - plan.target) - Math.abs(b - plan.target));
    for (const target of candidates) {
      const estimate = workoutForecast(comparable, { ...plan, target });
      if (!estimate || estimate.high > plan.ceiling) continue;
      if (estimate.measuredPeakDays >= 2 && estimate.daysOverCeiling === 0) return target;
    }
    return null;
  }

  function weeklyEffort(rows, date, sport, environment) {
    const daysBefore = days => new Date(Date.parse(date) - days * 86400000).toISOString().slice(0, 10);
    const currentStart = daysBefore(6), previousStart = daysBefore(13);
    const recorded = matchingEfforts(rows, sport, environment).filter(row => row.date >= previousStart && row.date <= date);
    const comparable = useIdentifiedSessions(recorded);
    const current = comparable.filter(row => row.date >= currentStart);
    const previous = comparable.filter(row => row.date < currentStart);
    if (!current.length || !previous.length) return null;
    const midpoint = median(current.map(row => row.bpm));
    const centers = [...new Set(current.map(row => Math.round(row.bpm)))].sort((a, b) => Math.abs(a - midpoint) - Math.abs(b - midpoint));
    for (const center of centers) {
      const dailyEfforts = group => {
        const byDay = new Map();
        for (const row of group.filter(row => Math.abs(row.bpm - center) <= 3)) {
          byDay.set(row.date, [...(byDay.get(row.date) ?? []), row.effort]);
        }
        return [...byDay.values()].map(median);
      };
      const recent = dailyEfforts(current), prior = dailyEfforts(previous);
      if (recent.length >= 2 && prior.length >= 2) {
        return { low: center - 3, high: center + 3, current: median(recent), previous: median(prior),
          currentDays: recent.length, previousDays: prior.length };
      }
    }
    return null;
  }

  function workoutActual(rows, plan) {
    const eligible = matchingEfforts(rows, plan.sport, plan.environment).filter(row =>
      row.date === plan.date && row.sessionStart != null && row.sessionStart >= plan.savedAt && row.activityId);
    const sessions = new Map();
    for (const row of eligible) {
      const key = row.sessionKey ?? row.source + "|" + row.activityId;
      const blocks = sessions.get(key) ?? [];
      blocks.push(row);
      sessions.set(key, blocks);
    }
    const matching = [...sessions.values()].flatMap(blocks => {
      const sorted = blocks.filter(row => Math.abs(row.effort - plan.target) <= effortTolerance(plan.target, plan.sport))
        .sort((a, b) => Math.abs(a.effort - plan.target) - Math.abs(b.effort - plan.target) || a.offsetSeconds - b.offsetSeconds);
      return sorted.length ? [sorted[0]] : [];
    });
    if (matching.length !== 1) return { state: matching.length > 1 ? "multiple" : eligible.length ? "off-target" : "waiting" };
    const row = matching[0];
    const seconds = row.hrSeconds?.reduce((sum, [, value]) => sum + value, 0) ?? null;
    const over = row.hrSeconds?.reduce((sum, [bpm, value]) => bpm > plan.ceiling ? sum + value : sum, 0) ?? null;
    return { state: "matched", bpm: row.bpm, peakHR: row.peakHR, effort: row.effort, source: row.source,
      minutes: row.minutes, offsetSeconds: row.offsetSeconds, measuredSeconds: seconds, secondsOver: over };
  }

  function recoveryAssessment(data, date) {
    const garmin = data.wellness.filter(row => row.source === providers[0]);
    const reading = garmin.findLast(row => row.date === date);
    if (!reading) return { level: "partial", reasons: [] };
    const { readiness, recoveryHours, restingHR, sleepMinutes } = reading;
    const baseline = garmin.filter(row => row.date < date && row.restingHR != null).slice(-21);
    const restingDelta = baseline.length >= 7 && restingHR != null ? restingHR - median(baseline.map(row => row.restingHR)) : null;
    const sleepGap = sleepMinutes != null && reading.sleepDetails?.need != null ? reading.sleepDetails.need - sleepMinutes : null;
    const factors = [
      ["readiness", readiness == null || readiness >= 50 ? null : readiness < 25 ? "rest" : "easy"],
      ["timer", recoveryHours >= 24 ? "rest" : recoveryHours > 12 ? "easy" : null],
      ["restingHR", restingDelta >= 5 ? "easy" : null],
      ["sleep", sleepGap >= 60 ? "easy" : null],
    ];
    const level = factors.some(([, flag]) => flag === "rest") ? "rest" : factors.some(([, flag]) => flag === "easy") ? "easy"
      : (readiness == null || recoveryHours == null) && (sleepMinutes == null || restingDelta == null) ? "partial" : "start";
    return { reading, restingDelta, sleepGap, level, reasons: factors.filter(([, flag]) => flag === level).map(([factor]) => factor) };
  }

  function trainingAssessment(data, date) {
    const recovery = recoveryAssessment(data, date);
    const fitness = data.wellness.findLast(row => row.date === date && row.source === providers[1]);
    const { acuteLoad, optimalLow, optimalHigh, loadRatio, loadStatus, hrvStatus } = recovery.reading ?? {};
    const personalRange = optimalLow != null && optimalHigh != null && optimalLow <= optimalHigh ? [optimalLow, optimalHigh] : null;
    const withinAcute = personalRange && acuteLoad != null && acuteLoad >= personalRange[0] && acuteLoad <= personalRange[1];
    const withinRatio = loadRatio != null && loadRatio >= optimalLoadRatio.low && loadRatio <= optimalLoadRatio.high;
    const highLoad = personalRange && acuteLoad != null && acuteLoad > personalRange[1] ? "Acute Load was above your personal range."
      : loadRatio > optimalLoadRatio.high ? "Load ratio was above its target range."
        : /high|above/i.test(loadStatus ?? "") ? "Recent load was rated high." : null;
    const cautions = [highLoad,
      fitness?.form < highRiskFormBelow ? "Form was " + fitness.form.toFixed(1) + ", below the usual training range." : null,
      /^(?:low|poor|unbalanced)$/i.test(hrvStatus?.trim() ?? "") ? "Your HRV status was " + hrvStatus.trim().toLowerCase() + "." : null,
    ].filter(Boolean);
    const level = recovery.level === "start" && cautions.length ? "easy" : recovery.level;
    const loadContext = withinAcute ? "Acute Load was within your personal range."
      : withinRatio ? "Load ratio was within its target range." : /^optimal$/i.test(loadStatus?.trim() ?? "") ? "Recent load was rated optimal." : null;
    return { ...recovery, fitness, personalRange, level, cautions, loadContext };
  }

  function workoutAdjustment(data, today, minutes) {
    if (data.date !== today) return { title: "Check recovery first", note: "Sync today’s recovery readings before choosing your effort.", minutes: null };
    const { reading, restingDelta, level, cautions } = trainingAssessment(data, today);
    if (!reading) return { title: "Check recovery first", note: "Sync today’s recovery readings before choosing your effort.", minutes: null };
    const { readiness, recoveryHours, sleepMinutes } = reading;
    const captured = recoveryReadingTime(data, today);
    const notes = [
      readiness != null ? "readiness of " + readiness + "/100" : null,
      recoveryHours != null ? Math.round(recoveryHours * 10) / 10 + " h remaining on your recovery timer"
        + (captured ? " at " + captured : " at the last recorded check") : null,
      sleepMinutes != null ? Math.round(sleepMinutes / 6) / 10 + " h of sleep" : null,
      restingDelta != null ? "resting HR " + (restingDelta === 0 ? "at your recent median"
        : Math.round(Math.abs(restingDelta) * 10) / 10 + " bpm " + (restingDelta > 0 ? "above" : "below") + " your recent median") : null,
    ].filter(Boolean);
    const note = [notes.length ? "Today’s readings show " + new Intl.ListFormat("en", { type: "conjunction" }).format(notes) + "." : null,
      ...cautions].filter(Boolean).join(" ");
    if (level === "rest") return { title: "Give yourself more time to recover", note, minutes: null };
    if (level === "easy") {
      return { title: "Keep it short and easy", note, minutes: Math.min(minutes, 25) };
    }
    if (level === "partial") {
      return { title: "Check recovery first", note: "There’s only a partial view of your recovery today. Sync any newer readings before you set a target.", minutes: null };
    }
    return { title: "Start easy", note, minutes };
  }

  function currentDate(timezone) {
    const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return [values.year, values.month, values.day].join("-");
  }

  globalThis.PerformanceData = { providers, sports, normalize, number, currentDate, matchingEfforts, hasComparableEfforts, hrEstimate,
    ceilingReference, strengthRecords, workoutForecast, workoutDefaults, recoveryReadingTime,
    gentlerWorkoutTarget, workoutActual, workoutAdjustment, recoveryAssessment, trainingAssessment, optimalLoadRatio, highRiskFormBelow, weeklyEffort };
})();
