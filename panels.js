(() => {
  "use strict";
  const garmin = "Garmin Connect", intervals = "Intervals.icu";
  const list = value => Array.isArray(value) ? value : [];

  globalThis.PerformancePanels = function ({ node, card, fmt, pace, graphic, metric, valuesFor, showHistory, detailsButton, getReport, currentDate, colors }) {
    const newest = (field, source = garmin) => valuesFor(field, source).at(-1);
    const datedRows = () => list(getReport()?.wellness).filter(row => row.source === garmin);
    const range = (target, format = fmt) => Array.isArray(target) && target.length === 2 && target.every(Number.isFinite)
      ? target.map(format).join("–") : null;
    const hasFitness = () => ["fitness", "fatigue", "form"].some(field => newest(field, intervals));

    function header(panel, source, date) {
      const meta = node("div", null, "panel-meta");
      if (source) meta.append(node("span", source, "source-tag"));
      if (date) meta.append(node("small", date));
      panel.append(meta);
    }

    function readout(label, value, color = "cyan", unit = "") {
      const item = node("div", null, "load-metric");
      const number = node("p", typeof value === "string" ? value : fmt(value), "metric");
      number.style.setProperty("--accent", colors[color]);
      if (unit && value != null) number.append(node("small", unit));
      item.append(node("span", label), number);
      return item;
    }

    function trainingLoad() {
      const panel = card("Training Load", "load-panel");
      const acute = valuesFor("acuteLoad", garmin).slice(-42);
      const chronic = valuesFor("chronicLoad", garmin).slice(-42);
      const ratio = valuesFor("loadRatio", garmin).slice(-42);
      const band = datedRows().filter(row => row.date >= (acute.at(0)?.date ?? "") && row.optimalLow != null && row.optimalHigh != null)
        .map(row => ({ date: row.date, low: row.optimalLow, high: row.optimalHigh }));
      const latest = datedRows().filter(row => row.acuteLoad != null).at(-1);
      const counters = node("div", null, "load-readouts");
      counters.append(readout("Acute", acute.at(-1)?.value), readout("Chronic", chronic.at(-1)?.value, "amber"),
        readout("Ratio", ratio.at(-1)?.value, "violet"));
      header(panel, garmin, latest?.date);
      panel.append(counters);
      if (latest?.optimalLow != null && latest?.optimalHigh != null) panel.append(node("small", "Acute optimal range ≈" + fmt(latest.optimalLow) + "–" + fmt(latest.optimalHigh)));
      panel.append(graphic(acute, { overlay: chronic, band, label: "Garmin acute and chronic load" }));
      if (ratio.length) panel.append(node("small", "Load ratio"), graphic(ratio, { color: "violet", label: "Garmin load ratio" }));
      if (latest?.loadStatus) panel.append(node("p", latest.loadStatus, "metric-status"));
      detailsButton(panel, "Training Load", acute, {
        overlay: chronic, band, columns: ["Date", "Acute", "Chronic", "Ratio"],
        row: item => {
          const row = datedRows().find(date => date.date === item.date);
          return [item.date, fmt(item.value), fmt(row?.chronicLoad), fmt(row?.loadRatio)];
        },
      });
      return panel;
    }

    function recovery() {
      const panel = card("Workout suggestion", "workout-panel");
      const data = getReport(), snapshot = data?.context?.plan;
      const ready = newest("readiness"), recoveryTime = newest("recoveryHours");
      const live = data && data.date === currentDate(data.timezone) && ready?.date === data.date && recoveryTime?.date === data.date;
      if (snapshot?.date === data?.date && live) {
        panel.append(node("h3", snapshot.name), node("p", snapshot.condition || "Review how you feel during the warm-up.", "muted"));
      } else if (live) {
        const ease = ready.value < 50 || recoveryTime.value > 12;
        panel.append(node("h3", ease ? "Rest or keep it easy" : "Start with an easy warm-up"),
          node("p", "Use the recorded recovery readings and adjust to how you feel.", "muted"));
      } else {
        panel.append(node("h3", "Check recovery first"),
          node("p", "A workout suggestion needs current readiness and recovery time.", "muted"));
      }
      const signals = node("div", null, "workout-signals");
      for (const [title, field, unit, color] of [["Readiness", "readiness", "/100", "pink"], ["Recovery time", "recoveryHours", "h", "cyan"],
        ["HRV · 7-day", "hrv7d", "ms", "green"], ["Sleep score", "sleepScore", "/100", "pink"]]) {
        signals.append(metric(title, field, unit, color, garmin, field !== "readiness"));
      }
      panel.append(signals);
      return panel;
    }

    function trainingStatus() {
      const panel = card("Training Status");
      const row = datedRows().filter(item => item.trainingStatus).at(-1);
      header(panel, garmin, row?.date);
      if (row) {
        const line = node("div", null, "training-status-line");
        line.append(node("strong", row.trainingStatus, "metric-status"), node("small", row.trainingStatusSince ? "Since " + row.trainingStatusSince : ""));
        panel.append(line);
        if (row.loadFocusStatus) panel.append(node("p", "Load Focus · " + row.loadFocusStatus, "muted"));
      }
      const grid = node("div", null, "metric-grid status-grid");
      for (const [label, field, unit, color] of [["VO₂ max", "vo2", "", "cyan"], ["HRV · 7-day", "hrv7d", "ms", "green"],
        ["Acute load", "acuteLoad", "", "cyan"], ["Heat acclimation", "heat", "%", "amber"]]) {
        grid.append(metric(label, field, unit, color, garmin));
      }
      panel.append(grid);
      return panel;
    }

    function battery() {
      const panel = metric("Body Battery", "bodyBattery", "/100", "cyan", garmin, false);
      const values = datedRows().filter(row => row.bodyBatteryLow != null && row.bodyBatteryHigh != null && row.bodyBatteryLow <= row.bodyBatteryHigh).slice(-28);
      if (values.length) {
        const figure = node("figure", null, "battery-figure");
        const ranges = node("div", null, "battery-ranges");
        for (const row of values) {
          const stem = node("span");
          stem.style.setProperty("--low", row.bodyBatteryLow + "%");
          stem.style.setProperty("--high", row.bodyBatteryHigh + "%");
          stem.title = row.date + " · " + row.bodyBatteryLow + "–" + row.bodyBatteryHigh;
          ranges.append(stem);
        }
        figure.append(ranges, node("figcaption", values[0].date + " – " + values.at(-1).date));
        panel.insertBefore(figure, panel.querySelector("button"));
      }
      return panel;
    }

    function sleep() {
      const panel = metric("Sleep", "sleepMinutes", "min", "cyan", garmin, false);
      const reading = getReport()?.context?.sleep;
      if (!reading || reading.date !== newest("sleepMinutes")?.date) return panel;
      const strip = node("div", null, "sleep-strip");
      const stageData = [["Deep", reading.deep, "#738dff"], ["Light", reading.light, "#53cde9"], ["REM", reading.rem, "#c294ff"], ["Awake", reading.awake, "#a7acb8"]];
      const stages = stageData.filter(([, value]) => Number.isFinite(value) && value > 0);
      const legend = node("small", stages.map(([stage, value]) => stage + " " + fmt(value) + "m").join(" · "), "stage-caption");
      for (const [name, value, color] of stages) {
        const item = node("span");
        item.style.flexGrow = String(value);
        item.style.background = color;
        item.title = name + " " + fmt(value) + " min";
        strip.append(item);
      }
      const score = node("div", null, "sleep-score-row");
      if (Number.isFinite(reading.score)) {
        const ring = node("span", fmt(reading.score), "sleep-ring");
        ring.style.setProperty("--score", Math.max(0, Math.min(100, reading.score)) + "%");
        score.append(ring, node("small", "Sleep score"));
      }
      panel.insertBefore(score, panel.querySelector("button"));
      if (stages.length) panel.insertBefore(strip, panel.querySelector("button"));
      if (stages.length) panel.insertBefore(legend, panel.querySelector("button"));
      if (reading.bed && reading.wake) panel.insertBefore(node("small", reading.bed + "–" + reading.wake, "stage-caption"), panel.querySelector("button"));
      return panel;
    }

    function fitness() {
      const panel = card("Fitness", "fitness-panel");
      const fc = valuesFor("fitness", intervals).slice(-42), at = valuesFor("fatigue", intervals).slice(-42), form = valuesFor("form", intervals).slice(-42);
      const history = new Map();
      for (const [field, series] of [["fitness", fc], ["fatigue", at], ["form", form]]) {
        for (const row of series) history.set(row.date, { ...history.get(row.date), date: row.date, [field]: row.value });
      }
      const days = [...history.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-42);
      header(panel, intervals, days.at(-1)?.date);
      const stats = node("div", null, "load-readouts");
      if (fc.length) stats.append(readout("Fitness", fc.at(-1).value));
      if (at.length) stats.append(readout("Fatigue", at.at(-1).value, "violet"));
      if (form.length) stats.append(readout("Form", form.at(-1).value, "green"));
      panel.append(stats);
      if (fc.length || at.length) panel.append(graphic(fc, { overlay: at, overlayColor: "violet", label: "Intervals.icu fitness and fatigue" }));
      if (form.length) panel.append(node("small", "Form"), graphic(form, { color: "green", label: "Intervals.icu form" }));
      detailsButton(panel, "Fitness", fc.length || at.length ? fc : form, {
        overlay: at, overlayColor: "violet", color: fc.length ? "cyan" : "green", tableRows: days, columns: ["Date", "Fitness", "Fatigue", "Form"],
        row: item => [item.date, fmt(item.fitness), fmt(item.fatigue), fmt(item.form)],
      });
      return panel;
    }

    function body() {
      const panel = card("Body metrics");
      header(panel, garmin);
      const grid = node("div", null, "metric-grid body-grid");
      if (newest("readiness")) grid.append(metric("Readiness", "readiness", "/100", "pink", garmin, false));
      if (newest("bodyBattery")) grid.append(battery());
      if (newest("hrv")) grid.append(metric("HRV · overnight", "hrv", "ms", "green", garmin));
      if (newest("restingHR")) grid.append(metric("Resting heart rate", "restingHR", "bpm", "pink", garmin));
      if (newest("sleepMinutes")) grid.append(sleep());
      if (newest("recoveryHours")) grid.append(metric("Recovery", "recoveryHours", "h", "cyan", garmin));
      const bottom = node("div", null, "load-and-fitness");
      bottom.append(trainingLoad());
      if (hasFitness()) bottom.append(fitness());
      if (grid.childElementCount) panel.append(grid);
      panel.append(bottom);
      return panel;
    }

    function pacing() {
      const panel = card("Pacing cards");
      const context = getReport()?.context;
      const grid = node("div", null, "pace-grid");
      for (const [title, type, color] of [["Cycling", "cycling", "cyan"], ["Running", "running", "green"]]) {
        const plan = context?.pacing?.[type];
        if (!plan) continue;
        const metrics = [
          ["Power", range(plan.power), "W", "cyan", "powerWatts"],
          ["Heart rate", range(plan.hr), "bpm", "pink", "hrBpm"],
          ["Pace", range(plan.pace, pace), "min/km", "green", "paceSecondsPerKm"],
        ].filter(([, target]) => target != null);
        if (!metrics.length && !Number.isFinite(plan.ceiling)) continue;
        const item = card(title, "pacing-card");
        item.style.setProperty("--accent", colors[color]);
        header(item, "Recorded plan", context.date);
        if (Number.isFinite(plan.minutes)) item.querySelector("h2").append(node("span", fmt(plan.minutes) + " min", "pacing-length"));
        const stages = node("div", null, "pacing-timeline");
        list(plan.steps).forEach((duration, index) => {
          if (Number.isFinite(duration)) stages.append(node("span", fmt(duration) + " min · " + (["Warm-up", "Steady work", "Cool-down"][index] ?? "Work")));
        });
        if (stages.childElementCount) item.append(stages);
        const targets = node("div", null, "pacing-metrics");
        for (const [label, target, unit, tone, field] of metrics) {
          const targetBlock = readout(label, target, tone, unit);
          if (plan.evidenceDates?.[field]) targetBlock.append(node("small", "Recorded " + plan.evidenceDates[field]));
          targets.append(targetBlock);
        }
        if (targets.childElementCount) item.append(targets);
        if (Number.isFinite(plan.ceiling)) item.append(node("p", "HR ceiling " + fmt(plan.ceiling) + " bpm", "pacing-ceiling"));
        if (plan.adjustment) item.append(node("p", plan.adjustment, "muted"));
        grid.append(item);
      }
      if (!grid.childElementCount) return null;
      panel.append(grid);
      return panel;
    }

    function daily() {
      const lead = node("div", null, "daily-lead");
      lead.append(trainingLoad(), recovery());
      if (!getReport()) {
        const empty = card("No report open", "empty");
        empty.append(node("p", "Connect Garmin and Intervals.icu in the private app or open a report file.", "muted"));
        return [empty, lead, trainingStatus(), body()];
      }
      return [lead, trainingStatus(), body()];
    }

    function trends() {
      const pair = node("div", null, "load-and-fitness");
      pair.append(trainingLoad());
      if (hasFitness()) pair.append(fitness());
      const row = node("div", null, "load-and-fitness");
      const focusData = getReport()?.context?.loadFocus;
      const buckets = list(focusData?.buckets).filter(bucket => Number.isFinite(bucket?.points));
      if (buckets.length) {
        const focus = card("Load Focus");
        header(focus, garmin, focusData.end);
        const scale = Math.max(1, ...buckets.flatMap(row => [row.points, Number.isFinite(row.targetHigh) ? row.targetHigh : 0]));
        for (const bucket of buckets) {
          const [label, color] = { lowAerobic: ["Low aerobic", "green"], highAerobic: ["High aerobic", "amber"], anaerobic: ["Anaerobic", "violet"] }[bucket.key] ?? [bucket.key, "cyan"];
          const row = readout(label, bucket.points, color, "pts");
          const bar = node("div", null, "focus-bar"), fill = node("span");
          fill.style.setProperty("--fill", (100 * (bucket.points ?? 0) / scale) + "%");
          fill.style.setProperty("--accent", colors[color]);
          bar.append(fill);
          if (Number.isFinite(bucket.targetLow) && Number.isFinite(bucket.targetHigh)) {
            const target = node("i");
            target.style.left = (100 * bucket.targetLow / scale) + "%";
            target.style.width = (100 * (bucket.targetHigh - bucket.targetLow) / scale) + "%";
            bar.append(target);
            row.append(bar, node("small", "Target " + fmt(bucket.targetLow) + "–" + fmt(bucket.targetHigh) + " pts"));
          } else row.append(bar);
          focus.append(row);
        }
        row.append(focus);
      }
      if (newest("restingHR")) row.append(metric("Resting heart rate", "restingHR", "bpm", "pink", garmin));
      return row.childElementCount ? [pair, row] : [pair];
    }

    function benchmarks() {
      const data = getReport();
      const grid = node("div", null, "load-and-fitness");
      for (const [label, sports] of [["Cycling", /cycl|ride/i], ["Running", /run/i]]) {
        const records = list(data?.context?.records).filter(row => row?.label && row.value != null && sports.test(row.sport ?? ""));
        if (!records.length) continue;
        const panel = card(label + " benchmarks");
        header(panel, garmin);
        for (const row of records) {
          const entry = node("div", null, "benchmark-entry");
          entry.append(node("span", row.label), node("strong", [row.value, row.unit].filter(value => value != null).join(" ")),
            node("small", row.date));
          panel.append(entry);
        }
        grid.append(panel);
      }
      return grid.childElementCount ? [grid, trainingStatus()] : [];
    }

    function plan() {
      const workout = getReport()?.context?.plan;
      const content = [];
      if (workout?.name) {
        const panel = card("Next session");
        header(panel, "Saved plan", workout.date);
        panel.append(node("h3", workout.name));
        if (workout.target) panel.append(node("p", workout.target, "muted"));
        const timeline = node("div", null, "pace-grid");
        for (const step of list(workout.steps)) {
          const detail = card(step.name);
          detail.append(node("strong", fmt(step.minutes) + " min"), node("p", step.detail, "muted"));
          timeline.append(detail);
        }
        if (timeline.childElementCount) panel.append(timeline);
        if (workout.alternative) panel.append(node("p", workout.alternative, "muted"));
        content.push(panel);
      }
      const targets = pacing();
      if (targets) content.push(targets);
      return content;
    }

    function archive() {
      const panel = card("Report archive");
      const data = getReport();
      const saved = new Map(list(data?.context?.archive).map(row => [row.date, row.title]));
      const history = new Map();
      function entryFor(date) {
        if (!history.has(date)) history.set(date, { sessions: [], readings: [] });
        return history.get(date);
      }
      for (const session of list(data?.activities)) entryFor(session.date).sessions.push(session);
      const fields = [
        ["restingHR", "Resting heart rate", " bpm"], ["bodyBattery", "Body Battery", "/100"],
        ["sleepMinutes", "Sleep", " min"], ["sleepScore", "Sleep score", "/100"], ["hrv", "HRV · overnight", " ms"],
        ["readiness", "Readiness", "/100"], ["recoveryHours", "Recovery time", " h"],
        ["acuteLoad", "Acute load", ""], ["chronicLoad", "Chronic load", ""], ["loadRatio", "Load ratio", ""],
        ["fitness", "Fitness", ""], ["fatigue", "Fatigue", ""], ["form", "Form", ""],
      ];
      for (const reading of list(data?.wellness)) {
        for (const [field, name, unit] of fields) {
          if (reading[field] != null) entryFor(reading.date).readings.push([reading.date, name, fmt(reading[field]) + unit, reading.source]);
        }
      }
      const days = [...new Set([...saved.keys(), ...history.keys()])].sort().reverse();
      if (!days.length) panel.append(node("p", "Activities and wellness history will appear after the first sync.", "muted"));
      for (const date of days) {
        const { sessions, readings } = entryFor(date);
        const counts = [
          sessions.length && sessions.length + (sessions.length === 1 ? " activity" : " activities"),
          readings.length && readings.length + (readings.length === 1 ? " reading" : " readings"),
        ].filter(Boolean).join(" · ");
        const row = node("button", null, "archive-entry");
        row.type = "button";
        row.append(node("time", date), node("strong", saved.get(date) || (sessions.length ? "Recorded activities" : "Wellness readings")), node("small", counts));
        row.addEventListener("click", () => {
          const durations = sessions.filter(item => item.minutes != null).map(item => ({ ...item, value: item.minutes }));
          const activities = sessions.map(item => [date, item.name || item.sport, item.minutes == null ? "—" : fmt(item.minutes) + " min", item.sources.join(", ")]);
          showHistory(date, durations, {
            label: "Session duration", format: value => fmt(value) + " min",
            tableRows: [...readings, ...activities], columns: ["Date", "Activity or reading", "Value", "Source"], row: item => item,
          });
        });
        panel.append(row);
      }
      return [panel];
    }

    function reference() {
      const data = getReport(), origins = card("Data sources"), thresholds = card("Threshold review");
      for (const name of [garmin, intervals]) {
        const wellness = list(data?.wellness).filter(row => row.source === name).length;
        const activities = list(data?.activities).filter(row => row.sources.includes(name)).length;
        const efforts = list(data?.efforts).filter(row => row.source === name).length;
        if (!wellness && !activities && !efforts) continue;
        const entry = node("div", null, "benchmark-entry");
        entry.append(node("strong", name));
        if (wellness) entry.append(node("small", wellness + " wellness dates"));
        if (activities) entry.append(node("small", activities + " activities"));
        if (efforts) entry.append(node("small", efforts + " paired efforts"));
        origins.append(entry);
      }
      if (data?.context?.date) origins.append(node("p", "Performance Desk archive imported through " + data.context.date + ".", "muted"));
      const items = list(data?.context?.thresholds).filter(row => row?.title && row.value != null);
      for (const row of items) {
        const entry = node("div", null, "benchmark-entry");
        entry.append(node("span", row.title), node("strong", [row.value, row.unit].filter(value => value != null).join(" ")),
          node("small", [row.status, row.date].filter(Boolean).join(" · ")));
        thresholds.append(entry);
      }
      const content = origins.childElementCount > 1 ? [origins] : [];
      if (items.length) content.push(thresholds);
      return content;
    }

    return { daily, trends, benchmarks, plan, archive, reference };
  };
})();
