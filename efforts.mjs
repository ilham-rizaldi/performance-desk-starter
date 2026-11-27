import { Decoder, Stream } from "@garmin/fitsdk";
import { unzipSync } from "fflate";

const warmupSeconds = 300;
const blockSeconds = 480;
const hrWindowSeconds = 300;
const sampleWindow = 30;
const minCoverage = .90;
const round = value => Math.round(value * 10) / 10;

export function fitEfforts(activity, buffer) {
  const maxSize = 20 * 1024 * 1024;
  if (buffer.byteLength > maxSize) return [];
  let bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const files = unzipSync(bytes, { filter: entry => /[.]fit$/i.test(entry.name) && entry.originalSize <= maxSize });
    const filesFound = Object.values(files);
    if (filesFound.length !== 1) return [];
    [bytes] = filesFound;
  }
  const decoder = new Decoder(Stream.fromByteArray(bytes));
  if (!decoder.isFIT() || !decoder.checkIntegrity()) return [];
  const { messages, errors } = decoder.read();
  if (errors.length || !messages.recordMesgs?.length || messages.sessionMesgs?.length !== 1) return [];
  const session = messages.sessionMesgs[0];
  const records = new Map();
  for (const row of messages.recordMesgs) {
    const elapsed = (row.timestamp - activity.start) / 1000;
    if (Number.isInteger(elapsed) && elapsed >= 0) records.set(elapsed, row);
  }
  const entries = [...records].sort(([a], [b]) => a - b);
  const environment = activity.environment ?? (/indoor|treadmill|spin/i.test(session.subSport) ? "Indoor"
    : entries.some(([, row]) => Number.isFinite(row.positionLat) && Number.isFinite(row.positionLong)) ? "Outdoor" : null);
  return steadyEfforts({ ...activity, environment }, [
    { type: "time", data: entries.map(([seconds]) => seconds) },
    { type: "heartrate", data: entries.map(([, row]) => row.heartRate) },
    { type: "watts", data: entries.map(([, row]) => row.power) },
    { type: "velocity_smooth", data: entries.map(([, row]) => row.enhancedSpeed ?? row.speed) },
  ]);
}

export function steadyEfforts(activity, streams) {
  if (!Array.isArray(streams) || !activity.environment || !Number.isFinite(activity.start)) return [];
  const byType = new Map(streams.map(stream => [stream.type, stream.data]));
  const time = byType.get("time"), hr = byType.get("heartrate");
  const cycling = activity.sport === "Cycling";
  const effort = byType.get(cycling ? "watts" : "velocity_smooth");
  if (![time, hr, effort].every(Array.isArray) || hr.length !== time.length || effort.length !== time.length
    || time.length < 2 || time.some((t, i) => !Number.isInteger(t) || t < 0 || (i && t <= time[i - 1]))) return [];
  const result = [];
  let samples = [];

  function assess(start) {
    const counts = new Map();
    const windows = [];
    let paired = 0, tailSeconds = 0, sum = 0, hrSum = 0, stationary = 0, peak = 0;
    const first = start - samples[0].time;
    for (let chunk = 0; chunk < blockSeconds; chunk += sampleWindow) {
      let chunkCount = 0, chunkSum = 0;
      for (let index = chunk; index < chunk + sampleWindow; index++) {
        const sample = samples[first + index];
        if (sample.hr < 35 || sample.hr > 235 || !Number.isFinite(sample.hr)
          || sample.effort < 0 || sample.effort > (cycling ? 2000 : 60) || !Number.isFinite(sample.effort)) continue;
        chunkCount++;
        chunkSum += sample.effort;
        if (sample.effort < 1) stationary++;
        if (index >= blockSeconds - hrWindowSeconds) {
          tailSeconds++;
          hrSum += sample.hr;
        }
        peak = Math.max(peak, sample.hr);
        const bpm = Math.round(sample.hr);
        counts.set(bpm, (counts.get(bpm) ?? 0) + 1);
      }
      paired += chunkCount;
      sum += chunkSum;
      if (chunkCount >= 24) windows.push(chunkSum / chunkCount);
    }
    const mean = sum / paired;
    const windowMean = windows.reduce((sum, value) => sum + value, 0) / windows.length;
    const variation = Math.sqrt(windows.reduce((sum, value) => sum + (value - windowMean) ** 2, 0) / windows.length) / mean;
    if (paired < blockSeconds * minCoverage || tailSeconds < hrWindowSeconds * minCoverage
      || windows.length < 14 || stationary > blockSeconds * .10 || mean <= 0 || variation > (cycling ? .24 : .16)) return false;
    const target = cycling ? mean : 1000 / mean;
    if (target < (cycling ? 1 : 120) || target > (cycling ? 1000 : 1800)) return false;
    result.push({
      date: activity.date, sport: activity.sport, environment: activity.environment, source: activity.source,
      activityId: activity.id, sessionStart: activity.start, offsetSeconds: start, minutes: blockSeconds / 60,
      bpm: round(hrSum / tailSeconds), peakHR: round(peak), hrSeconds: [...counts].sort(([a], [b]) => a - b),
      ...(cycling ? { watts: round(target) } : { paceSeconds: round(target) }),
    });
    return true;
  }

  function finishRun() {
    if (!samples.length) return;
    const end = samples.at(-1).time + 1;
    for (let start = samples[0].time; start + blockSeconds <= end;) {
      start += assess(start) ? blockSeconds : sampleWindow;
    }
    samples = [];
  }

  for (let i = 0; i < time.length - 1; i++) {
    const width = time[i + 1] - time[i];
    if (time[i] < warmupSeconds) continue;
    if (width > 4) { finishRun(); continue; }
    for (let offset = 0; offset < width; offset++) {
      samples.push({ time: time[i] + offset, hr: hr[i], effort: effort[i] });
    }
  }
  finishRun();
  return result;
}
