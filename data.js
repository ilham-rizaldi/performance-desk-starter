(() => {
  "use strict";

  const providers = ["Garmin Connect", "Intervals.icu"];
  const sports = ["Cycling", "Running", "Strength"];
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

  function normalize(raw) {
    if (!raw || raw.version !== 1 || !validDate(raw.reportDate)) throw Error("Choose a Performance Desk JSON report with a valid report date.");
    if (!["wellness", "activities", "efforts"].every(key => Array.isArray(raw[key]))) throw Error("The report needs wellness, activities and efforts lists. A list may be empty.");
    if (typeof raw.timezone !== "string") throw Error("The report is missing its time zone.");
    try { new Intl.DateTimeFormat("en", { timeZone: raw.timezone }); }
    catch { throw Error("The report time zone is invalid."); }

    const observed = row => row && validDate(row.date) && row.date <= raw.reportDate && providers.includes(row.source);
    const byDate = (left, right) => left.date.localeCompare(right.date);
    const labels = ["trainingStatus", "loadFocusStatus", "trainingStatusSince", "hrvStatus", "readinessStatus", "sleepStatus", "loadStatus"];
    const wellness = raw.wellness.filter(observed).map(row => ({
      date: row.date,
      source: row.source,
      ...Object.fromEntries(labels.map(key => [key, typeof row[key] === "string" ? row[key] : null])),
      ...Object.fromEntries(Object.entries(metricRanges).map(([key, [low, high]]) => [key, number(row[key], low, high)])),
    })).sort(byDate);

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
      };
      if (!previous) {
        sessions.set(key, { ...session, sources: [row.source] });
        continue;
      }
      if (!previous.sources.includes(row.source)) previous.sources.push(row.source);
      for (const name of ["name", "environment", "minutes", "km", "avgWatts", "avgHR", "liftedKg"]) previous[name] ??= session[name];
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
      const key = JSON.stringify([row.date, row.sport, row.environment, bpm, peakHR, minutes, effort]);
      if (bpm == null || minutes == null || effort == null || effortKeys.has(key)) continue;
      effortKeys.add(key);
      efforts.push({ date: row.date, sport: row.sport, source: row.source, environment: row.environment, bpm, peakHR, minutes, effort });
    }
    return { date: raw.reportDate, timezone: raw.timezone, wellness, activities: [...sessions.values()].sort(byDate), efforts: efforts.sort(byDate), context: raw.context && typeof raw.context === "object" ? raw.context : null };
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

  function currentDate(timezone) {
    const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return [values.year, values.month, values.day].join("-");
  }

  globalThis.PerformanceData = { providers, sports, normalize, number, currentDate, matchingEfforts, hasComparableEfforts, hrEstimate, ceilingReference };
})();
