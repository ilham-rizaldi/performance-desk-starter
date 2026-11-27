const garmin = "Garmin Connect";
const wellnessKey = row => [row.source, row.date].join("|");
const activityKey = row => [row.source, row.id].join("|");
const pairs = fields => Object.entries(fields).filter(([, value]) => value != null);

export function mergeRows(older, newer, key) {
  const rows = new Map(older.map(row => [key(row), row]));
  for (const row of newer) {
    const id = key(row);
    rows.set(id, { ...rows.get(id), ...Object.fromEntries(pairs(row)) });
  }
  return [...rows.values()];
}

export function combineReference(live, reference, activeSources) {
  if (!reference || reference.version !== 1) return live;
  const available = row => activeSources.includes(row.source) && row.date <= live.reportDate;
  const garminAvailable = activeSources.includes(garmin) && reference.reportDate <= live.reportDate;
  const effortKey = row => [row.source, row.activityId].join("|");
  const liveActivityEfforts = new Set(live.efforts.filter(row => row.activityId).map(effortKey));
  return {
    ...live,
    wellness: mergeRows((reference.wellness ?? []).filter(available), live.wellness, wellnessKey),
    activities: mergeRows((reference.activities ?? []).filter(available), live.activities, activityKey),
    efforts: [...(reference.efforts ?? []).filter(row => available(row) && !liveActivityEfforts.has(effortKey(row))), ...live.efforts],
    context: garminAvailable ? reference.context : undefined,
  };
}

