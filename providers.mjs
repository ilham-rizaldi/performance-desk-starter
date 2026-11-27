const garmin = "https://personal.connectapi.garmin.com";
const intervals = "https://intervals.icu";

export const sources = { garmin: "Garmin Connect", intervals: "Intervals.icu" };
const number = value => Number.isFinite(value) ? value : null;
const scale = (value, factor) => Number.isFinite(value) ? value * factor : null;
const day = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
const dateString = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
export const timezone = dateString.resolvedOptions().timeZone;

export function dateRange(now = new Date()) {
  const parts = Object.fromEntries(dateString.formatToParts(now).map(p => [p.type, p.value]));
  const reportDate = [parts.year, parts.month, parts.day].join("-");
  const oldest = new Date(Date.parse(reportDate) - 41 * 86400000).toISOString().slice(0, 10);
  return { oldest, reportDate };
}

export class SourceError extends Error {
  constructor(status, message, retryAt) {
    super(message);
    this.status = status;
    this.retryAt = retryAt;
  }
}

async function read(url, options, request) {
  const response = await request(url, { ...options, redirect: "error", signal: AbortSignal.timeout(12000) });
  if (!response.ok) {
    const retry = response.headers.get("Retry-After");
    const retryAt = retry == null ? null : /^\d+$/.test(retry) ? Date.now() + Number(retry) * 1000 : Date.parse(retry);
    const message = response.status === 401 || response.status === 403 ? "Access expired or was denied. Reconnect this source."
      : response.status === 429 ? "The provider requested a pause. Sync will retry later."
      : "The provider could not complete this sync.";
    throw new SourceError(response.status, message, retryAt);
  }
  return response.status === 204 ? null : response.json();
}

function rows(value, key) {
  const list = Array.isArray(value) ? value : value?.[key];
  if (Array.isArray(list)) return list;
  throw new SourceError(502, "The provider returned an unexpected data format.");
}

function sportType(value) {
  const type = String(value ?? "").toLowerCase();
  if (/cycl|rid(e|ing)|bik(e|ing)/.test(type)) return "Cycling";
  if (/run|treadmill/.test(type)) return "Running";
  return /strength|weight.?train/.test(type) ? "Strength" : null;
}

function environmentType(value) {
  const type = String(value ?? "").toLowerCase();
  if (/indoor|virtual|treadmill|track.?cycling/.test(type)) return "Indoor";
  return /outdoor|road|trail|gravel|mountain/.test(type) ? "Outdoor" : null;
}

function timestamp(value) {
  if (typeof value !== "string" || !/([zZ]|[+-]\d\d:?\d\d)$/.test(value)) return null;
  const parsed = Date.parse(value.replace(" ", "T"));
  return Number.isFinite(parsed) ? parsed : null;
}

function activity(row, source) {
  const isGarmin = source === sources.garmin;
  const type = isGarmin ? row.activityType?.typeKey : row.type;
  const sport = sportType(type);
  const id = isGarmin ? row.activityId : row.id;
  const localDate = day(isGarmin ? row.startTimeLocal : row.start_date_local);
  if (!sport || !localDate || id == null) return null;
  if (!isGarmin && (/strava/i.test(row.source ?? "") || String(row._note ?? "").includes("STRAVA activities are not available"))) return null;
  const start = isGarmin && typeof row.startTimeGMT === "string" && !/([zZ]|[+-]\d\d:?\d\d)$/.test(row.startTimeGMT)
    ? row.startTimeGMT + "Z" : isGarmin ? row.startTimeGMT : row.start_date;
  return {
    id: String(id), date: localDate, sport, source, start: timestamp(start),
    environment: environmentType(type),
    minutes: scale(isGarmin ? row.duration : row.moving_time, 1 / 60),
    km: scale(row.distance, 1 / 1000),
    avgHR: number(isGarmin ? row.averageHR : row.average_heartrate),
    avgWatts: isGarmin ? number(row.avgPower) : row.device_watts === true ? number(row.average_watts) : null,
  };
}

function matchActivities(garminRows, intervalsRows) {
  const close = (a, b) => a.sport === b.sport && a.date === b.date && a.start != null && b.start != null
    && (!a.environment || !b.environment || a.environment === b.environment)
    && Math.abs(a.start - b.start) <= 60000
    && a.minutes > 0 && b.minutes > 0 && Math.abs(a.minutes - b.minutes) <= Math.max(0.75, a.minutes * .03)
    && a.km > 0 && b.km > 0 && Math.abs(a.km - b.km) <= Math.max(.1, a.km * .03);
  const sessionKeys = new Map();
  for (const a of garminRows) {
    const hits = intervalsRows.filter(b => close(a, b));
    if (hits.length === 1 && garminRows.filter(other => close(other, hits[0])).length === 1) {
      sessionKeys.set(a, "garmin-" + a.id);
      sessionKeys.set(hits[0], "garmin-" + a.id);
    }
  }
  return [...garminRows, ...intervalsRows].map(record => {
    const { start, ...row } = record;
    return sessionKeys.has(record) ? { ...row, sessionKey: sessionKeys.get(record) } : row;
  });
}

export function buildReport(cache, now = new Date()) {
  const { oldest, reportDate } = dateRange(now);
  const included = row => row.date >= oldest && row.date <= reportDate;
  const getActivities = name => (cache.get(name)?.activities ?? []).filter(included);
  return {
    version: 1, reportDate, timezone,
    wellness: [...cache.values()].flatMap(item => item.wellness).filter(included),
    activities: matchActivities(getActivities("garmin"), getActivities("intervals")),
    efforts: [],
  };
}

export async function syncGarmin(auth, now, request = fetch) {
  const { oldest, reportDate } = dateRange(now);
  const issued = await read(garmin + "/personalapitoken-service/personal-api/personal-api-key/token",
    { method: "POST", headers: { Authorization: "ApiKey " + auth.value } }, request);
  if (!issued?.access_token) throw new SourceError(502, "Garmin did not return an access token.");
  const get = (path, params = {}) => read(garmin + path + "?" + new URLSearchParams(params),
    { headers: { Authorization: "Bearer " + issued.access_token } }, request);

  const byDate = new Map();
  function add(date, fields) {
    if (date) byDate.set(date, { ...byDate.get(date), date, source: sources.garmin, ...fields });
  }
  const firstMonth = new Date(Date.parse(reportDate) - 29 * 86400000).toISOString().slice(0, 10);
  const split = new Date(Date.parse(firstMonth) - 86400000).toISOString().slice(0, 10);
  const dailyRanges = [[oldest, split], [firstMonth, reportDate]];
  const notices = [];
  async function loadWellness(label, load) {
    try { await load(); }
    catch (error) {
      if (error.status === 401 || error.status === 429) throw error;
      notices.push(label + " unavailable on this sync.");
    }
  }
  for (const [startDate, endDate] of dailyRanges) {
    await loadWellness("Resting HR", async () => {
      for (const row of rows(await get("/usersummary-service/v2/dailysummaries", { startDate, endDate }), "dailySummaries")) {
        add(day(row.calendarDate), { restingHR: number(row.restingHeartRate) });
      }
    });
    await loadWellness("Sleep", async () => {
      const values = await get("/sleep-service/sleep/dailySleepSummariesByDate", { startDate, endDate });
      for (const item of rows(values, "dailySleepSummaries")) {
        const row = item.dailySleepDTO ?? item;
        add(day(row.calendarDate), { sleepMinutes: scale(row.sleepTimeSeconds, 1 / 60), sleepScore: number(row.sleepScores?.overall?.value) });
      }
    });
    await loadWellness("HRV", async () => {
      const data = await get("/hrv-service/hrv/daily/" + startDate + "/" + endDate);
      for (const row of rows(data, "hrvSummaries")) add(day(row.calendarDate), { hrv: number(row.lastNightAvg) });
    });
  }
  const activities = [];
  for (let start = 0; start < 500; start += 100) {
    const list = rows(await get("/activitylist-service/activities/search/activities", { start, limit: 100, startDate: oldest, endDate: reportDate }), "activities");
    activities.push(...list.map(row => activity(row, sources.garmin)).filter(Boolean));
    if (list.length < 100) break;
    if (start === 400) notices.push("Garmin activity limit reached. The range is partial.");
  }
  return { wellness: [...byDate.values()], activities, notices: [...new Set(notices)] };
}

export async function syncIntervals(auth, now, request = fetch) {
  const { oldest, reportDate } = dateRange(now);
  const Authorization = auth.kind === "oauth" ? "Bearer " + auth.value : "Basic " + Buffer.from("API_KEY:" + auth.value).toString("base64");
  const get = category => read(intervals + "/api/v1/athlete/0/" + category + "?" + new URLSearchParams({ oldest, newest: reportDate }),
    { headers: { Authorization } }, request);
  const [wellness, workouts] = await Promise.all([get("wellness"), get("activities")]);
  return {
    wellness: rows(wellness).flatMap(row => {
      const date = day(row.id);
      const fitness = number(row.ctl), fatigue = number(row.atl);
      return date ? [{ date, source: sources.intervals, fitness, fatigue,
        form: fitness != null && fatigue != null ? fitness - fatigue : null }] : [];
    }),
    activities: rows(workouts).map(row => activity(row, sources.intervals)).filter(Boolean),
    notices: [],
  };
}

export async function exchangeIntervals(code, verifier, client, request = fetch) {
  const body = new URLSearchParams({ client_id: client.id, code, code_verifier: verifier });
  if (client.secret) body.set("client_secret", client.secret);
  const token = await read(intervals + "/api/oauth/token", { method: "POST", body }, request);
  const scopes = new Set(String(token?.scope ?? "").split(","));
  if (!token?.access_token || !["ACTIVITY:READ", "WELLNESS:READ"].every(scope => scopes.has(scope))) {
    if (token?.access_token) await revokeIntervals(token.access_token, request).catch(() => {});
    throw new SourceError(403, "Both read permissions are needed. Reconnect Intervals.icu.");
  }
  return { kind: "oauth", value: token.access_token };
}

export async function revokeIntervals(token, request = fetch) {
  await read(intervals + "/api/v1/disconnect-app", { method: "DELETE", headers: { Authorization: "Bearer " + token } }, request);
}
