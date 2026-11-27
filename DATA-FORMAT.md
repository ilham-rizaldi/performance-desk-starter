# Report file format

Use [report.blank.json](report.blank.json) as a starting point. Open a report with **Open report file**. Use numeric values without unit strings. Leave unknown fields out or set them to `null`.

| Field | Value |
|---|---|
| `version` | `1` |
| `reportDate` | The report day in `YYYY-MM-DD` |
| `timezone` | An IANA time zone such as `Asia/Jakarta` |
| `wellness`, `activities`, `efforts` | Lists. Use `[]` when a list has no data. |

Use `Garmin Connect` or `Intervals.icu` for `source`. For activities, use `Cycling`, `Running`, or `Strength` for `sport`. Use `Indoor` or `Outdoor` when the environment is known.

## Wellness

Enter one reading per date and source. Garmin fields include `restingHR` (bpm), `hrv` and `hrv7d` (ms), `sleepMinutes`, `sleepScore`, `readiness`, `bodyBattery`, `recoveryHours`, `acuteLoad`, `chronicLoad`, and the recorded `loadRatio`. Intervals.icu uses `fitness`, `fatigue`, and `form`.

For `sleepDetails`, use local `HH:mm` for `bed` and `wake`, Unix milliseconds for `start` and `end`, and minutes for `deep`, `light`, `rem`, `awake`, and `need`. A recorded stage segment contains `stage`, `startAt`, and `endAt`, with an explicit time zone for each timestamp.

## Activities

Each activity requires `id` as text, `date`, `source`, and `sport`. Use `sessionKey` when two records have been verified as copies of the same session. Optional fields include `environment`, `minutes`, `km`, `avgWatts`, `avgHR` (bpm), and `liftedKg` (recorded total set volume).

A strength `exerciseSets` item can contain `exercise`, `weightKg`, and `reps`. Keep an unnamed weighted set if the weight and reps are known. The volume total can include that set, and per-exercise records use named sets only.

## Steady efforts

Each effort requires `date`, `source`, `sport`, `environment`, `minutes`, and `bpm` from the same steady block. Add `watts` for cycling or `paceSeconds` (seconds per km) for running. Add `peakHR` only for a measured peak in the block.

The estimate uses comparable 8–15 minute efforts. At least two earlier days must support the target. The range is based on recorded heart rates from those days. A gentler target based on a ceiling uses measured peaks.

Automatically extracted blocks can also include `activityId`, `sessionStart` (Unix milliseconds), `offsetSeconds`, and `hrSeconds` as pairs of `[bpm, seconds]`. The start time is used to match an effort to a target saved before the session. Time above the ceiling covers the part of the matched block with paired heart rate and effort measurements.
