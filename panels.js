(() => {
  "use strict";
  const garmin = "Garmin Connect", intervals = "Intervals.icu";
  const model = globalThis.PerformanceData;
  const list = value => Array.isArray(value) ? value : [];
  const formZones = [
    { label: "Transition", low: 20, color: "#54432e", swatch: "#ffc572" },
    { label: "Fresh", low: 5, high: 20, color: "#293c51", swatch: "#56d5f4" },
    { label: "Grey zone", low: -10, high: 5, color: "#3d3a47", swatch: "#b1aabb" },
    { label: "Optimal", low: model.highRiskFormBelow, high: -10, color: "#2c4038", swatch: "#7aefa8" },
    { label: "High risk", high: model.highRiskFormBelow, color: "#4b303a", swatch: "#fa819e" },
  ];
  const sleepStages = [
    ["awake", "Awake", "#7aefa8"], ["rem", "REM", "#be9cff"], ["light", "Light", "#56d5f4"], ["deep", "Deep", "#7892ff"],
  ];
  const ratioOptimal = { ...model.optimalLoadRatio, color: "#7aefa824", edgeColor: "#7aefa856" };
  const ratioOptimalRange = ratioOptimal.low + "–" + ratioOptimal.high;
  const coachActions = { follow: "Follow the plan", easy: "Keep it easy", rest: "Rest" };
  const coachDates = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const coachDate = date => coachDates.format(Date.parse(date));
  const focusWorkouts = {
    lowAerobic: [
      ["Cycling", "Power Z2", "Spin for 25–45 min at a pace you can talk through. Drop to Z1 if recovery is the goal."],
      ["Running", "HR Z1–Z2", "Jog or run–walk for 20–35 min. On hills, back off as needed to keep the conversation going."],
    ],
    highAerobic: [
      ["Cycling", "Power Z3–Z4", "Try two 10 min tempo blocks in Z3 with 5 min easy between them. Save Z4 for a planned threshold session."],
      ["Running", "HR Z3–Z4", "Try two 8 min tempo blocks with a 3 min easy jog in between. Keep the second block as controlled as the first."],
    ],
    anaerobic: [
      ["Cycling", "Power Z6", "Try four 30 sec efforts with 3 min of easy spinning between them. Give yourself enough recovery to keep each rep sharp."],
      ["Running", "Fast pace · hard effort", "Run four 20 sec uphill reps and walk back down between efforts. Go by pace and feel. HR takes time to catch up on short reps."],
    ],
  };

  globalThis.PerformancePanels = function ({ node, card, fmt, graphic, metric, valuesFor, showHistory, detailsButton, getReport, currentDate, colors }) {
    const newest = (field, source = garmin) => valuesFor(field, source).at(-1);
    const datedRows = () => list(getReport()?.wellness).filter(row => row.source === garmin);
    const hasFitness = () => ["fitness", "fatigue", "form"].some(field => newest(field, intervals));
    const statusChart = { axes: true, area: true, size: "status", plotBackground: "#0e151e" };
    let heartView = "both";

    function olderReading(panel, date) {
      if (date && date !== getReport()?.date) panel.append(node("p", "Latest reading · " + date, "muted reading-date"));
    }

    function readout(label, value, color = "cyan", unit = "") {
      const item = node("div", null, "load-metric");
      const number = node("p", typeof value === "string" ? value : fmt(value), "metric");
      number.style.setProperty("--accent", colors[color]);
      if (unit && value != null) number.append(node("small", unit));
      item.append(node("span", label), number);
      return item;
    }

    function coachNote({ date, accent, headline, explanation }) {
      const section = node("section", null, "coach-note");
      section.style.setProperty("--coach-accent", accent);
      const header = node("div", null, "coach-note-head");
      header.append(node("h3", headline));
      if (date !== getReport()?.date) header.append(node("small", coachDate(date)));
      section.append(header, node("p", explanation));
      return section;
    }

    function trainingLoadCoach(latest, previous) {
      if (!latest) return null;
      const range = row => row?.optimalLow != null && row?.optimalHigh != null && row.optimalHigh >= row.optimalLow;
      const relativeTo = (value, low, high) => value < low ? "below" : value > high ? "above" : "within";
      const target = range(latest) ? relativeTo(latest.acuteLoad, latest.optimalLow, latest.optimalHigh) : null;
      const ratio = latest.loadRatio != null ? relativeTo(latest.loadRatio, ratioOptimal.low, ratioOptimal.high) : null;
      const status = latest.loadStatus?.trim() ?? "";
      const above = target === "above" || ratio === "above" || /high|above/i.test(status);
      const below = target === "below" || ratio === "below" || /low|below/i.test(status);
      const returned = !above && !below && target === "within" && range(previous) && previous.acuteLoad > previous.optimalHigh;
      const comparison = previous ? latest.acuteLoad - previous.acuteLoad : 0;
      const changed = Math.abs(comparison) >= 1;
      if (!target && !ratio && !changed && !above && !below) return null;
      const headline = above && below ? "Your load signals point in different directions" : above ? "Your training load is running high"
        : below ? "Your training load is running lighter" : returned ? "You’re back in your personal load range"
          : target ? "You’re training within your load range" : ratio ? "Your load ratio is within range" : "Your acute load has changed";
      const evidence = [
        changed ? "Acute load " + (comparison < 0 ? "fell " : "rose ") + fmt(Math.abs(comparison))
          + " points since " + coachDate(previous.date) + "." : null,
        target ? "Acute load is " + target + " your personal range." : null,
        ratio ? "Load ratio is " + ratio + " its optimal range." : null,
      ].filter(Boolean);
      if (!evidence.length) return null;
      return coachNote({ date: latest.date, accent: above || below ? "#ffc572" : colors.green,
        headline, explanation: evidence.join(" ") });
    }

    function loadRangeKey(label, value) {
      const key = node("p", null, "load-range-key");
      key.append(node("span"), node("small", label));
      if (value) key.append(node("small", value));
      return key;
    }

    function sharedHover(dates, enabled, { showBothTooltips = true } = {}) {
      const subscribers = new Map();
      return key => {
        if (!enabled) return undefined;
        function updateOthers(time) {
          for (const [name, update] of subscribers) if (name !== key) update(time, showBothTooltips);
        }
        return { dates, current: dates.at(-1), mirrorHover: true,
          onChange: updateOthers, onLeave: () => updateOthers(null), bind: update => subscribers.set(key, update) };
      };
    }

    function trainingLoad({ compact = false } = {}) {
      const panel = card("Training Load", "load-panel");
      const acute = valuesFor("acuteLoad", garmin).slice(-42);
      const chronic = valuesFor("chronicLoad", garmin).slice(-42);
      const ratio = valuesFor("loadRatio", garmin).slice(-42);
      const band = datedRows().filter(row => row.date >= (acute.at(0)?.date ?? "") && row.optimalLow != null && row.optimalHigh != null
        && row.optimalLow <= row.optimalHigh)
        .map(row => ({ date: row.date, low: row.optimalLow, high: row.optimalHigh }));
      const history = new Map();
      for (const [field, series] of [["acute", acute], ["chronic", chronic], ["ratio", ratio], ["range", band]]) {
        for (const row of series) {
          const time = Date.parse(row.date);
          history.set(time, { ...history.get(time), date: row.date, [field]: field === "range" ? fmt(row.low) + "–" + fmt(row.high) : row.value });
        }
      }
      const dateDomain = [...history.keys()].sort((a, b) => a - b);
      function tooltipReadings(time) {
        const row = history.get(time) ?? {};
        return [["Acute", fmt(row.acute, 2), "cyan"], ["Chronic", fmt(row.chronic, 2), "amber"],
          ["Ratio", fmt(row.ratio, 2), "violet"], ["Acute optimal range", row.range ?? "—", "green"],
          ["Ratio optimal range", ratioOptimalRange, "green"]];
      }
      const loadChart = { overlay: chronic, seriesName: "Acute", overlayName: "Chronic", band,
        axes: true, size: "load", zeroFloor: true, gapDays: 1, dateDomain, label: "Acute and chronic load", tooltipReadings };
      const readings = datedRows().filter(row => row.acuteLoad != null);
      const latest = readings.at(-1);
      const status = latest?.loadStatus?.trim();
      if (status) {
        const title = panel.firstElementChild;
        const heading = node("div", null, "load-heading");
        const tone = /^optimal$/i.test(status) ? "optimal" : /high|above|low|below/i.test(status) ? "out-of-range" : "neutral";
        heading.append(title, node("strong", status, "load-status load-status--" + tone));
        panel.prepend(heading);
      }
      const counters = node("div", null, "load-readouts");
      counters.append(readout("Acute", acute.at(-1)?.value), readout("Chronic", chronic.at(-1)?.value, "amber"),
        readout("Ratio", ratio.at(-1)?.value, "violet"));
      olderReading(panel, latest?.date ?? chronic.at(-1)?.date ?? ratio.at(-1)?.date);
      panel.append(counters);
      const comment = trainingLoadCoach(latest, readings.at(-2));
      const acuteRange = latest?.optimalLow != null && latest?.optimalHigh != null && latest.optimalHigh >= latest.optimalLow
        ? "≈" + fmt(latest.optimalLow) + "–" + fmt(latest.optimalHigh) : null;
      function renderCharts() {
        const charts = node("div", null, "load-charts");
        const link = sharedHover(dateDomain, ratio.length && (acute.length || chronic.length), { showBothTooltips: false });
        if (acute.length || chronic.length || !ratio.length) {
          if (band.length) charts.append(loadRangeKey("Acute optimal range", acuteRange));
          charts.append(graphic(acute, { ...loadChart, linkedDate: link("load") }));
        }
        if (ratio.length) {
          const subsection = node("div", null, "load-ratio");
          const heading = node("div", null, "load-ratio-header");
          heading.append(node("h3", "Load ratio"), loadRangeKey("Optimal range", ratioOptimalRange));
          subsection.append(heading, graphic(ratio, { color: "violet", label: "Load ratio, optimal range " + ratioOptimalRange, seriesName: "Ratio",
            axes: true, size: "ratio", gapDays: 1, dateDomain, zones: [ratioOptimal], linkedDate: link("ratio"), tooltipReadings }));
          charts.append(subsection);
        }
        return charts;
      }
      if (compact && (acuteRange || ratio.length)) {
        const ranges = node("div", null, "load-summary-ranges");
        if (acuteRange) ranges.append(loadRangeKey("Acute optimal range", acuteRange));
        if (ratio.length) ranges.append(loadRangeKey("Ratio optimal range", ratioOptimalRange));
        panel.append(ranges);
      }
      if (comment) panel.append(comment);
      if (!compact) panel.append(renderCharts());
      const tableRows = dateDomain.map(time => history.get(time));
      if (tableRows.length) detailsButton(panel, "Training Load", [], {
        renderCharts, tableRows, columns: ["Date", "Acute", "Chronic", "Ratio", "Acute optimal range", "Ratio optimal range"],
        row: item => [item.date, fmt(item.acute), fmt(item.chronic), fmt(item.ratio, 2), item.range ?? "—", ratioOptimalRange],
      });
      return panel;
    }

    function workoutAdvice() {
      const data = getReport(), snapshot = data?.context?.plan;
      const day = data?.date;
      if (!data || day !== currentDate(data.timezone)) {
        return { title: "Check recovery first", detail: "Sync today’s readings so you can choose a session that fits." };
      }
      const assessment = model.trainingAssessment(data, day);
      const [action, reason] = coachRecommendation(assessment);
      const plan = action === "follow" && snapshot?.date === day && snapshot.name ? snapshot : null;
      return { title: plan?.name ?? coachActions[action], action, reason, assessment, plan, detail: plan?.condition };
    }

    function coachSummary() {
      const data = getReport();
      if (!data) return null;
      const day = data.date;
      const garminHistory = datedRows();
      const today = garminHistory.findLast(row => row.date === day) ?? {};
      const priorLoad = garminHistory.findLast(row => row.date < day && row.acuteLoad != null);
      const { acuteLoad, optimalLow, optimalHigh, sleepMinutes, readiness, recoveryHours } = today;
      const within = acuteLoad != null && optimalLow != null && optimalHigh != null && acuteLoad >= optimalLow && acuteLoad <= optimalHigh;
      const falling = acuteLoad != null && priorLoad && acuteLoad < priorLoad.acuteLoad;
      const advice = workoutAdvice();
      const shouldEase = advice.action === "rest" || advice.action === "easy";
      const findings = [];
      if (acuteLoad != null) {
        const delta = priorLoad ? acuteLoad - priorLoad.acuteLoad : 0;
        const change = delta ? " It " + (delta < 0 ? "fell " : "rose ") + fmt(Math.abs(delta))
          + " points from " + fmt(priorLoad.acuteLoad) + " on " + coachDate(priorLoad.date) + "." : "";
        const band = within ? ", within your personal range of about " + fmt(optimalLow) + "–" + fmt(optimalHigh) : "";
        findings.push(["Training load", "Your acute load is " + fmt(acuteLoad) + band + "." + change]);
      }
      const sleep = sleepMinutes == null ? null : Math.round(sleepMinutes);
      const captured = globalThis.PerformanceData.recoveryReadingTime(data, day);
      const recoveryFacts = [
        sleep != null ? Math.floor(sleep / 60) + " h " + sleep % 60 + " min of sleep" : null,
        readiness != null ? "readiness " + fmt(readiness) + "/100" : null,
        recoveryHours != null ? fmt(recoveryHours) + " h remaining on the recovery timer"
          + (captured ? " at " + captured : " at the last recorded check") : null,
      ].filter(Boolean);
      if (recoveryFacts.length) {
        findings.push(["Recovery", "You logged " + new Intl.ListFormat("en", { type: "conjunction" }).format(recoveryFacts) + "."]);
      }
      const intervalsHistory = data.wellness.filter(row => row.source === intervals && row.form != null);
      const currentForm = intervalsHistory.findLast(row => row.date === day);
      const priorForm = intervalsHistory.findLast(row => row.date < day);
      if (currentForm) {
        const signed = value => fmt(value).replace(/^-/, "−");
        const form = currentForm.form;
        const change = priorForm && signed(priorForm.form) !== signed(form)
          ? "Your Form moved from " + signed(priorForm.form) + " on " + coachDate(priorForm.date) + " to " + signed(form) + "."
          : "Your Form is " + signed(form) + ".";
        const balance = form < -.5 ? " You’re still carrying more recent load than you typically do over the longer term."
          : form > .5 ? " Short-term load is lighter than your longer-term baseline." : " Short- and long-term loads are close.";
        findings.push(["Form", change + balance]);
      }
      if (!findings.length) {
        const count = data.activities.filter(row => row.date === day).length;
        if (count) findings.push(["Activity", fmt(count) + (count === 1 ? " session recorded." : " sessions recorded.")]);
        else return null;
      }

      const panel = card("Coach’s summary", "coach-summary");
      const headline = shouldEase ? "Make room for recovery"
        : within && falling ? "Your load has eased"
        : within ? "You’re within your personal load range"
        : "Let recovery shape your next session";
      panel.append(node("h3", headline, "coach-summary-headline"));
      const evidence = node("div", null, "coach-summary-data");
      for (const [label, copy] of findings) {
        const line = node("p");
        line.append(node("strong", label), " ", copy);
        evidence.append(line);
      }
      const recommendation = node("div", null, "coach-recommendation");
      recommendation.append(node("h3", "Next session"), node("strong", advice.title));
      if (advice.action && advice.title !== coachActions[advice.action]) recommendation.append(node("p", coachActions[advice.action]));
      if (advice.reason) recommendation.append(node("p", advice.reason));
      if (advice.action) recommendation.dataset.action = advice.action;
      const affirmation = shouldEase ? "Taking an easy day when you need it is part of training well. Give yourself credit for making that call."
        : within && falling ? "If you finish with something left, you paced it well. That’s the kind of session you can build on."
          : "Give yourself credit for matching the effort to the goal. It’s a skill you can carry into your next session.";
      const closing = node("p", null, "coach-summary-affirmation");
      closing.append(node("strong", "Coach’s reminder"), " ", affirmation);
      panel.append(evidence, recommendation, closing);
      return panel;
    }

    function workoutTarget(text, metric) {
      if (typeof text !== "string") return null;
      if (metric === "power") {
        const matches = [...text.matchAll(/(?:(below|under|less than|up to|no more than|[<≤])\s*)?\b(\d{1,4})(?:\s*[–-]\s*(\d{1,4}))?\s*(?:W|watts?)\b/gi)];
        if (matches.length !== 1) return null;
        const [value, limit, low, high = low] = matches[0];
        const qualifier = text.slice(0, matches[0].index);
        if (+low <= 0 || +high < +low || +high > 1500 || (limit && low !== high)
          || /(?:above|over|more than|at least|[>≥-]|\d[.,])\s*$/i.test(qualifier)) return null;
        return { value, index: matches[0].index, low: +low, high: +high, limit: Boolean(limit) };
      }
      if (metric === "pace") {
        const matches = [...text.matchAll(/\b(\d{1,2}):([0-5]\d)(?:\s*[–-]\s*(\d{1,2}):([0-5]\d))?\s*(?:min\s*)?\/\s*km\b/gi)];
        if (matches.length !== 1) return null;
        const [value, minutes, seconds, endMinutes = minutes, endSeconds = seconds] = matches[0];
        const first = 60 * +minutes + +seconds, last = 60 * +endMinutes + +endSeconds;
        const qualifier = text.slice(0, matches[0].index);
        if (Math.min(first, last) < 120 || Math.max(first, last) > 1800
          || /(?:below|above|under|over|faster than|slower than|[<>≤≥])\s*$/i.test(qualifier)) return null;
        return { value, index: matches[0].index, low: 3600 / Math.max(first, last), high: 3600 / Math.min(first, last) };
      }
      return null;
    }

    function workoutStats(plan, metric) {
      const stats = node("dl", null, "workout-stats");
      function add(label, value) {
        const entry = node("div");
        entry.append(node("dt", label), node("dd", value));
        stats.append(entry);
      }
      if (Number.isFinite(plan?.minutes) && plan.minutes > 0) add("Duration", fmt(plan.minutes) + " min");
      const target = typeof plan?.target === "string" ? plan.target.trim() : "";
      const notes = [];
      for (const sentence of target.split(/(?<=\.)\s+/).filter(Boolean)) {
        const clause = sentence.replace(/\.$/, "");
        const heartRate = /^HR ceiling\s+(\d{2,3})\s*bpm$/i.exec(clause);
        if (heartRate && +heartRate[1] >= 40 && +heartRate[1] <= 230) {
          add("HR ceiling", heartRate[1] + " bpm");
          continue;
        }
        const effort = workoutTarget(clause, metric);
        const suffix = effort ? clause.slice(effort.value.length) : "";
        if (effort?.index === 0 && /^(?: in the easy block)?$/i.test(suffix)) {
          const label = metric === "power" ? "Power" : "Pace";
          add(suffix ? "Easy block " + label.toLowerCase() : label + " target", effort.value);
        } else notes.push(sentence);
      }
      return { stats, note: notes.join(" ") };
    }

    function workoutProfile(steps, metric) {
      const targets = steps.map(step => workoutTarget(step.detail, metric));
      const highest = Math.max(0, ...targets.map(target => target?.high ?? 0));
      const maximum = metric === "power" ? Math.ceil(highest / 50) * 50 : highest;
      const figure = node("figure", null, "workout-profile");
      const caption = node("figcaption", highest ? metric === "power" ? "Planned power (W)" : "Planned pace (min/km)" : "Session timeline");
      figure.append(caption);
      const chart = node("div", null, "workout-profile-chart" + (highest ? "" : " is-timeline"));
      if (highest) {
        const axis = node("div", null, "workout-profile-axis");
        const marks = metric === "power" ? [maximum, maximum / 2, 0].map(value => fmt(value)) : ["Faster", "Slower"];
        axis.append(...marks.map(mark => node("span", mark)));
        chart.append(axis);
      }
      const plot = node("div", null, "workout-profile-plot");
      plot.style.gridTemplateColumns = steps.map(step => `minmax(0, ${step.minutes}fr)`).join(" ");
      for (const [index, step] of steps.entries()) {
        const target = targets[index];
        const block = node("div", null, "workout-profile-block");
        block.title = [step.name, fmt(step.minutes) + " min", step.detail].filter(Boolean).join(" · ");
        if (target) {
          block.style.setProperty("--low", 100 * target.low / maximum + "%");
          block.style.setProperty("--high", 100 * target.high / maximum + "%");
          block.append(node("span", null, "workout-profile-fill"), node("span", null, target.limit ? "workout-profile-limit" : "workout-profile-target"));
        } else block.append(node("span", null, "workout-profile-time-only"));
        plot.append(block);
      }
      chart.append(plot);
      const time = node("div", null, "workout-profile-time");
      time.append(node("span", "0"), node("span", fmt(steps.reduce((sum, step) => sum + step.minutes, 0)) + " min"));
      chart.append(time);
      // The ordered step list provides the same targets and durations as text.
      chart.setAttribute("aria-hidden", "true");
      figure.append(chart);
      return figure;
    }

    function workoutSuggestion() {
      const panel = card("Workout suggestion", "workout-panel");
      const data = getReport();
      const { title, plan, detail, action, reason, assessment } = workoutAdvice();
      const sport = plan?.sport ?? title;
      const metric = /ride|cycl|bike|spin/i.test(sport) ? "power" : /run/i.test(sport) ? "pace" : null;
      const { stats, note } = workoutStats(plan, metric);
      panel.append(node("h3", title, "workout-heading"));
      if (action) {
        panel.dataset.action = action;
        if (plan) panel.append(node("strong", coachActions[action], "workout-action"));
        panel.append(node("p", reason, "workout-reason"));
      }
      if (stats.childElementCount) panel.append(stats);
      if (note) panel.append(node("p", note, "workout-target"));
      if (detail) panel.append(node("p", detail, "muted"));
      const steps = list(plan?.steps).filter(step => typeof step?.name === "string" && step.name.trim()
        && Number.isFinite(step.minutes) && step.minutes > 0);
      if (steps.length) {
        const instructions = node("details", null, "workout-steps");
        instructions.open = true;
        const sequence = node("ol");
        for (const step of steps) {
          const item = node("li");
          item.append(node("strong", step.name + " · " + fmt(step.minutes) + " min"));
          if (typeof step.detail === "string" && step.detail.trim()) item.append(node("p", step.detail));
          sequence.append(item);
        }
        instructions.append(node("summary", "Session steps"), workoutProfile(steps, metric), sequence);
        panel.append(instructions);
      }
      if (assessment) panel.append(coachEvidence(data, data.date, assessment));
      return panel;
    }

    function trainingStatus() {
      const panel = card("Training Status");
      const row = datedRows().filter(item => item.trainingStatus).at(-1);
      olderReading(panel, row?.date);
      if (row) {
        const line = node("div", null, "training-status-line");
        line.append(node("strong", row.trainingStatus, "metric-status"), node("small", row.trainingStatusSince ? "Since " + row.trainingStatusSince : ""));
        panel.append(line);
        if (row.loadFocusStatus) panel.append(node("p", "Load Focus · " + row.loadFocusStatus, "muted"));
      }
      const grid = node("div", null, "metric-grid status-grid");
      grid.append(metric("VO₂ max", "vo2", "", "cyan", garmin, statusChart), heartMetrics(),
        metric("Acute load", "acuteLoad", "", "cyan", garmin, statusChart),
        metric("Heat acclimation", "heat", "%", "amber", garmin, { ...statusChart, axisTicks: [0, 25, 50, 75, 100] }));
      panel.append(grid);
      return panel;
    }

    function heartMetrics({ days = 28, explain = false } = {}) {
      const panel = card("Heart metrics", "heart-metrics-card");
      const metrics = [
        { key: "rhr", short: "RHR", label: "Resting heart rate", unit: "bpm", color: "pink", rows: valuesFor("restingHR", garmin) },
        { key: "hrv", short: "HRV", label: "HRV · 7-day", unit: "ms", color: "green", rows: valuesFor("hrv7d", garmin) },
      ];
      const byDate = new Map();
      for (const { key, rows } of metrics) {
        for (const row of rows) byDate.set(row.date, { ...byDate.get(row.date), date: row.date, [key]: row.value });
      }
      const history = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
      if (!history.length) {
        panel.append(node("p", "No recorded readings", "muted"));
        return panel;
      }
      const end = Date.parse(history.at(-1).date);
      let cardView = heartView;

      function explorer(days, initial, onSelect) {
        const start = end - (days - 1) * 86400000;
        const series = metrics.map(metric => ({ ...metric, rows: metric.rows.filter(row => Date.parse(row.date) >= start) }));
        const options = [
          { key: "rhr", label: "RHR", available: series[0].rows.length > 0 },
          { key: "hrv", label: "HRV", available: series[1].rows.length > 0 },
          { key: "both", label: "RHR + HRV", available: series.every(metric => metric.rows.length) },
        ];
        const container = node("div", null, "heart-metrics-explorer");
        const chooser = node("div", null, "heart-metrics-options");
        chooser.setAttribute("role", "group");
        chooser.setAttribute("aria-label", "Heart metric view");
        const plot = node("div", null, "heart-metrics-plot");
        const buttons = new Map();
        function select(view) {
          for (const [key, button] of buttons) button.setAttribute("aria-pressed", String(key === view));
          const visible = series.filter(metric => view === "both" || metric.key === view);
          const readings = node("div", null, "heart-metrics-readings" + (view === "both" ? " is-combined" : ""));
          for (const item of visible) {
            const current = item.rows.at(-1);
            const heading = node("div", null, "heart-metrics-reading");
            heading.style.setProperty("--heart-metric", colors[item.color]);
            const text = node("div");
            text.append(node("h3", view === "both" && item.key === "rhr" ? item.short : item.label));
            if (current.date !== getReport()?.date) text.append(node("small", current.date));
            const value = node("strong", fmt(current.value));
            value.append(node("small", item.unit));
            heading.append(text, value);
            readings.append(heading);
          }
          const [primary, comparison] = visible;
          const chart = graphic(primary.rows, {
            ...statusChart, color: primary.color, size: "heart", seriesName: primary.short,
            format: value => fmt(value, 2) + " " + primary.unit,
            label: visible.map(item => item.label + " in " + item.unit).join(" and "),
            dateDomain: [start, end],
            ...(comparison && {
              overlay: comparison.rows, overlayName: comparison.short, overlayColor: comparison.color,
              overlayFormat: value => fmt(value, 2) + " " + comparison.unit,
              overlayAxis: { leftUnit: primary.unit, rightUnit: comparison.unit },
            }),
          });
          plot.replaceChildren(readings, chart);
          onSelect?.(view);
        }
        for (const option of options) {
          const button = node("button", option.label);
          button.type = "button";
          button.disabled = !option.available;
          button.addEventListener("click", () => select(option.key));
          buttons.set(option.key, button);
          chooser.append(button);
        }
        container.append(chooser, plot);
        select((options.find(option => option.available && option.key === initial) ?? options.find(option => option.available)).key);
        return container;
      }

      panel.append(explorer(days, cardView, view => { cardView = view; heartView = view; }));
      if (explain) {
        const note = node("p", null, "heart-metrics-explanation");
        note.append(
          node("strong", "Resting heart rate (RHR) and heart rate variability (HRV) often move in opposite directions because they reflect two aspects of the same heartbeat pattern."),
          " RHR measures how fast your heart beats at rest, in ",
          node("strong", "bpm"),
          ". HRV measures how much the time between beats varies, in ",
          node("strong", "milliseconds"),
          ".",
        );
        panel.append(note);
      }
      detailsButton(panel, "Heart metrics", [], {
        renderCharts: () => explorer(90, cardView), tableRows: history, columns: ["Date", "RHR (bpm)", "HRV · 7-day (ms)"],
        row: row => [row.date, fmt(row.rhr), fmt(row.hrv)],
      });
      return panel;
    }

    const hasBatteryRange = row => row.bodyBatteryLow != null && row.bodyBatteryHigh != null && row.bodyBatteryLow <= row.bodyBatteryHigh;

    function batteryRangeChart(values) {
      const figure = node("figure", null, "battery-figure");
      const plot = node("div", null, "battery-plot");
      const axis = node("div", null, "battery-axis");
      for (const value of ["100", "50", "0"]) axis.append(node("span", value));
      const ranges = node("div", null, "battery-ranges");
      ranges.tabIndex = 0;
      ranges.setAttribute("role", "img");
      ranges.setAttribute("aria-label", "Body Battery daily low and high. Use the left and right arrow keys to inspect each recorded day.");

      const caption = node("figcaption");
      const selectedDate = node("time");
      const readings = node("span", null, "battery-range-readings");
      caption.setAttribute("role", "status");
      const low = node("strong"), high = node("strong");
      const lowLabel = node("span", "Low", "battery-low");
      const highLabel = node("span", "High", "battery-high");
      lowLabel.append(low);
      highLabel.append(high);
      readings.append(lowLabel, highLabel);
      caption.append(readings, selectedDate);
      const reportDate = getReport()?.date;
      let selected = -1;
      function select(index) {
        if (index === selected) return;
        ranges.children[selected]?.classList.remove("is-selected");
        ranges.children[index].classList.add("is-selected");
        selected = index;
        const reading = values[index];
        selectedDate.dateTime = reading.date;
        selectedDate.textContent = coachDate(reading.date);
        selectedDate.hidden = reading.date === reportDate;
        low.textContent = fmt(reading.bodyBatteryLow);
        high.textContent = fmt(reading.bodyBatteryHigh);
      }
      for (const [index, row] of values.entries()) {
        const stem = node("span");
        stem.style.setProperty("--low", row.bodyBatteryLow + "%");
        stem.style.setProperty("--high", row.bodyBatteryHigh + "%");
        stem.title = row.date + " · Low " + row.bodyBatteryLow + " · High " + row.bodyBatteryHigh;
        stem.addEventListener("pointerenter", () => select(index));
        stem.addEventListener("pointerdown", () => select(index));
        ranges.append(stem);
      }
      ranges.addEventListener("pointerleave", event => {
        if (event.pointerType !== "touch") select(values.length - 1);
      });
      ranges.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        if (event.key === "Home") select(0);
        else if (event.key === "End") select(values.length - 1);
        else select(Math.max(0, Math.min(values.length - 1, selected + (event.key === "ArrowLeft" ? -1 : 1))));
      });
      select(values.length - 1);
      plot.append(axis, ranges);
      figure.append(plot, caption);
      return figure;
    }

    function battery() {
      const history = datedRows().filter(row => row.bodyBattery != null || hasBatteryRange(row));
      const values = history.filter(hasBatteryRange).slice(-28);
      const panel = metric("Body Battery", "bodyBattery", "/100", "cyan", garmin,
        values.length ? false : { axes: true, size: "body", area: true, limit: 28 });
      if (values.length) {
        panel.querySelector(".card-details").remove();
        panel.append(batteryRangeChart(values));
        detailsButton(panel, "Body Battery", [], {
          renderCharts: () => batteryRangeChart(values), tableRows: history, columns: ["Date", "Low", "High", "Reading"],
          row: item => [item.date, fmt(item.bodyBatteryLow), fmt(item.bodyBatteryHigh), fmt(item.bodyBattery)],
        });
      }
      return panel;
    }

    function sleepDuration(value) {
      if (!Number.isFinite(value)) return "—";
      const minutes = Math.round(value);
      return minutes < 60 ? minutes + " min" : Math.floor(minutes / 60) + " h " + (minutes % 60) + " min";
    }

    function sleepGauge(night) {
      const score = night.sleepScore;
      const ratings = { poor: "Poor", fair: "Fair", good: "Good", excellent: "Excellent" };
      const rating = ratings[night.sleepStatus?.toLowerCase()]
        ?? (score >= 90 ? "Excellent" : score >= 80 ? "Good" : score >= 60 ? "Fair" : "Poor");
      const gauge = node("div", null, "sleep-gauge");
      gauge.style.setProperty("--sleep-fill", score + "%");
      gauge.setAttribute("role", "img");
      gauge.setAttribute("aria-label", "Sleep score " + score + " out of 100, " + rating);
      const center = node("div", null, "sleep-gauge-center");
      center.append(node("strong", fmt(score)), node("span", rating));
      gauge.append(center);
      return gauge;
    }

    function sleepStageTimeline(segments, detail, includeTable = true) {
      const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23",
        timeZone: detail.offset == null ? getReport().timezone : "UTC" });
      const time = stamp => clock.format(stamp + (detail.offset ?? 0) * 60000);
      const first = segments[0].start, last = segments.at(-1).end;
      const position = stamp => (stamp - first) * 100 / (last - first);
      const map = new Map(sleepStages.map(([key, name, color], index) => [key, { name, color, top: 12.5 + index * 25 }]));
      const chart = node("div", null, "sleep-timeline");
      const lanes = node("div", null, "sleep-lanes");
      const plot = node("div", null, "sleep-plot");
      plot.setAttribute("role", "img");
      plot.setAttribute("aria-label", "Sleep stages from " + time(first) + " to " + time(last));
      for (const { name, color } of map.values()) {
        const lane = node("span", name);
        lane.style.setProperty("--stage-color", color);
        lanes.append(lane);
        const track = node("div", null, "sleep-track");
        track.style.setProperty("--stage-color", color);
        plot.append(track);
      }
      const axis = node("div", null, "sleep-time-axis");
      for (const [index, part] of [0, .25, .5, .75, 1].entries()) {
        const tick = node("i", null, "sleep-time-tick");
        tick.style.left = (part * 100) + "%";
        plot.append(tick);
        const label = node("span", time(first + part * (last - first)));
        label.style.left = tick.style.left;
        if (index === 0 || index === 4) label.classList.add(index === 0 ? "first" : "last");
        axis.append(label);
      }
      const timed = node("details", null, "sleep-timed-details");
      const table = node("table"), tableHead = node("thead"), heading = node("tr"), body = node("tbody");
      for (const text of ["Stage", "From", "To", "Duration"]) heading.append(node("th", text));
      tableHead.append(heading);
      let prior;
      for (const segment of segments) {
        const { name, color, top } = map.get(segment.stage);
        const part = node("span", null, "sleep-segment");
        part.style.left = position(segment.start) + "%";
        part.style.width = (position(segment.end) - position(segment.start)) + "%";
        part.style.top = top + "%";
        part.style.setProperty("--stage-color", color);
        const length = sleepDuration((segment.end - segment.start) / 60000);
        part.title = name + " · " + time(segment.start) + "–" + time(segment.end) + " · " + length;
        if (prior?.end === segment.start && prior.stage !== segment.stage) {
          const connector = node("i", null, "sleep-stage-connector");
          const priorTop = map.get(prior.stage).top;
          connector.style.left = part.style.left;
          connector.style.top = Math.min(top, priorTop) + "%";
          connector.style.height = Math.abs(top - priorTop) + "%";
          plot.append(connector);
        }
        plot.append(part);
        prior = segment;
        if (includeTable) {
          const row = node("tr");
          for (const value of [name, time(segment.start), time(segment.end), length]) row.append(node("td", value));
          body.append(row);
        }
      }
      chart.append(lanes, plot, axis);
      if (includeTable) {
        table.append(tableHead, body);
        const wrapper = node("div", null, "table-wrap");
        wrapper.append(table);
        timed.append(node("summary", "Timed stages"), wrapper);
        chart.append(timed);
      }
      return chart;
    }

    function sleepDetail(night) {
      const content = node("div", null, "sleep-detail");
      const detail = night.sleepDetails ?? {};
      const hero = node("div", null, "sleep-detail-hero");
      if (night.sleepScore != null) hero.append(sleepGauge(night));
      const timings = node("dl", null, "sleep-timings");
      const windowMinutes = (detail.end - detail.start) / 60000;
      const clockRange = detail.bed && detail.wake ? detail.bed + "–" + detail.wake : null;
      for (const [label, value] of [
        ["Bedtime – wake time", clockRange], ["Time asleep", night.sleepMinutes != null ? sleepDuration(night.sleepMinutes) : null],
        ["Time in bed", detail.start != null && detail.end != null && windowMinutes > 0 && windowMinutes <= 1440 ? sleepDuration(windowMinutes) : null],
      ]) {
        if (value == null) continue;
        const entry = node("div");
        entry.append(node("dt", label), node("dd", value));
        timings.append(entry);
      }
      if (timings.childElementCount) hero.append(timings);
      content.append(hero);
      const stages = sleepStages.filter(([key]) => Number.isFinite(detail[key]));
      if (detail.segments?.length || stages.length) {
        const section = node("section", null, "sleep-detail-stages");
        section.append(node("h3", "Sleep stages"));
        if (detail.segments?.length) section.append(sleepStageTimeline(detail.segments, detail));
        if (stages.length) {
          const tiles = node("dl", null, "sleep-stage-tiles");
          for (const [key, label, color] of stages) {
            const tile = node("div");
            tile.style.setProperty("--stage-color", color);
            tile.append(node("dt", label), node("dd", sleepDuration(detail[key])));
            tiles.append(tile);
          }
          section.append(tiles);
        }
        content.append(section);
      }
      const facts = node("dl", null, "sleep-detail-facts");
      for (const [label, value, format] of [
        ["Sleep need", detail.need, sleepDuration], ["Awakenings", detail.awakenings, fmt], ["Restless moments", detail.restless, fmt],
        ["Overnight HR", detail.overnightHR, value => fmt(value) + " bpm"], ["Overnight HRV", night.hrv, value => fmt(value) + " ms"],
        ["Average SpO₂", detail.spo2, value => fmt(value) + "%"], ["Average respiration", detail.respiration, value => fmt(value) + " br/min"],
      ]) {
        if (value == null) continue;
        const fact = node("div");
        fact.append(node("dt", label), node("dd", format(value)));
        facts.append(fact);
      }
      if (facts.childElementCount) content.append(facts);
      return content;
    }

    function sleepHistoryChart(history) {
      const hasScore = history.some(row => row.sleepScore != null);
      const points = history.flatMap(row => {
        const value = hasScore ? row.sleepScore : row.sleepMinutes;
        return value != null ? [{ date: row.date, value }] : [];
      });
      const heading = hasScore ? "Sleep score history" : "Sleep duration history";
      const content = node("div", null, "sleep-history-chart");
      content.append(node("h3", heading, "sleep-history-heading"), graphic(points, {
        label: heading, color: "cyan", axes: true, size: "history", format: hasScore ? value => fmt(value) + "/100" : sleepDuration,
      }));
      return content;
    }

    function sleep() {
      const title = "Sleep";
      const panel = card(title, "sleep-card");
      const nights = new Map(datedRows().filter(row => row.sleepMinutes != null || row.sleepScore != null).map(row => [row.date, row]));
      const history = [...nights.values()];
      const night = history.at(-1);
      if (!night) {
        panel.append(node("p", "No recorded reading", "muted"));
        return panel;
      }
      const overview = node("div", null, "sleep-card-overview");
      if (night.sleepScore != null) overview.append(sleepGauge(night));
      if (night.sleepMinutes != null) {
        const time = node("div", null, "sleep-card-time");
        time.append(node("small", "Time asleep"), node("strong", sleepDuration(night.sleepMinutes)));
        overview.append(time);
      }
      panel.append(overview);
      if (night.date !== getReport()?.date) panel.append(node("small", night.date));
      if (night.sleepDetails) {
        const detail = night.sleepDetails;
        if (detail.bed && detail.wake) panel.append(node("p", detail.bed + "–" + detail.wake, "sleep-card-window"));
        if (detail.segments.length) panel.append(sleepStageTimeline(detail.segments, detail, false));
        const stageTotals = sleepStages.filter(([key]) => detail[key] != null);
        if (stageTotals.length) {
          const stages = node("div", null, "sleep-compact-stages");
          for (const [key, label, color] of stageTotals) {
            const stage = node("div");
            stage.style.setProperty("--stage-color", color);
            stage.append(node("small", label), node("strong", sleepDuration(detail[key])));
            stages.append(stage);
          }
          panel.append(stages);
        }
      }
      detailsButton(panel, title, [], {
        renderCharts: () => sleepDetail(night), renderHistoricalChart: () => sleepHistoryChart(history),
        tableRows: history, columns: ["Date", "Sleep score", "Time asleep"],
        row: item => [item.date, item.sleepScore == null ? "—" : fmt(item.sleepScore) + "/100", sleepDuration(item.sleepMinutes)],
      });
      return panel;
    }

    function recoveryAmount(value) {
      return value > 0 && value < .01 ? "<0.01" : fmt(value, 2);
    }

    function recoveryTime() {
      const title = "Recovery";
      const panel = card(title, "recovery-timer-card");
      const rows = valuesFor("recoveryHours", garmin);
      const latest = rows.at(-1);
      if (!latest) {
        panel.append(node("p", "No recorded reading", "muted"));
        return panel;
      }
      // Garmin reports a countdown of up to four days. Zero is the finished timer.
      const hours = latest.value, recovered = hours === 0;
      const overview = node("div", null, "recovery-timer");
      const track = node("div", null, "recovery-timer-track" + (recovered ? " is-complete" : ""));
      track.setAttribute("aria-hidden", "true");
      track.style.setProperty("--recovery-fill", 100 * (1 - Math.min(hours, 96) / 96) + "%");
      track.append(node("span"));
      const time = node("div", null, "recovery-timer-time");
      const remaining = node("strong", recoveryAmount(hours));
      remaining.append(node("span", " h", "recovery-timer-unit"));
      time.append(remaining, node("small", recovered ? "Complete at check" : "Remaining at check"));
      overview.append(track, time);
      panel.append(overview);
      if (latest.date !== getReport()?.date) panel.append(node("small", latest.date));
      else {
        const captured = globalThis.PerformanceData.recoveryReadingTime(getReport(), latest.date);
        if (captured) panel.append(node("small", "Recorded at " + captured));
      }
      const options = { color: "cyan", format: value => recoveryAmount(value) + " h", unit: "Time remaining", label: "Recovery time" };
      panel.append(graphic(rows.slice(-28), { ...options, axes: true, size: "body", area: true, zeroFloor: true }));
      detailsButton(panel, title, rows, options);
      return panel;
    }

    function fitnessCoach(days) {
      const latest = days.at(-1);
      if (!latest || ![latest.fitness, latest.fatigue, latest.form].every(Number.isFinite)) return null;
      const gap = latest.fatigue - latest.fitness;
      if (Math.abs(latest.form + gap) > .2) return null;
      const end = Date.parse(latest.date);
      const weekStart = end - 6 * 86400000;
      const peak = days.reduce((highest, row) => {
        if (Date.parse(row.date) < weekStart || !Number.isFinite(row.fatigue)) return highest;
        return row.fatigue > highest.fatigue ? row : highest;
      }, latest);
      const fall = peak.fatigue - latest.fatigue;
      const easing = fall >= 1;
      const zone = formZones.find(item => latest.form >= (item.low ?? -Infinity) && latest.form < (item.high ?? Infinity));
      const headline = zone.label === "High risk" ? "Form is in the high-risk zone" : easing ? "Your Fatigue is easing"
        : gap >= .5 ? "You’re carrying more recent load" : gap <= -.5 ? "Your recent load is lighter" : "Your recent and long-term loads are close";
      const explanation = Math.abs(gap) < .5 ? "Your Fatigue and Fitness are close, so Form is near zero."
        : "Your Form is " + fmt(latest.form).replace(/^-/, "−") + " because Fatigue (short-term load) is "
          + fmt(Math.abs(gap)) + " points " + (gap > 0 ? "above" : "below") + " Fitness (long-term load).";
      const trend = easing
        ? "You’re " + fmt(fall) + " points below your seven-day Fatigue peak of " + fmt(peak.fatigue) + " on " + coachDate(peak.date) + "."
        : "";
      return coachNote({ date: latest.date, accent: zone.swatch, headline,
        explanation: explanation + (trend ? " " + trend : "") });
    }

    function fitness() {
      const panel = card("Fitness", "fitness-panel");
      const fc = valuesFor("fitness", intervals).slice(-42), at = valuesFor("fatigue", intervals).slice(-42), form = valuesFor("form", intervals).slice(-42);
      const history = new Map();
      for (const [field, series] of [["fitness", fc], ["fatigue", at], ["form", form]]) {
        for (const row of series) history.set(row.date, { ...history.get(row.date), date: row.date, [field]: row.value });
      }
      const days = [...history.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-42);
      olderReading(panel, days.at(-1)?.date);
      const stats = node("div", null, "load-readouts");
      if (fc.length) stats.append(readout("Fitness", fc.at(-1).value));
      if (at.length) stats.append(readout("Fatigue", at.at(-1).value, "violet"));
      if (form.length) stats.append(readout("Form", form.at(-1).value, "green"));
      panel.append(stats);
      const comment = fitnessCoach(days);
      if (comment) panel.append(comment);
      const dateDomain = [...history.keys()].sort().map(date => Date.parse(date));
      const formByDate = new Map(form.map(row => [Date.parse(row.date), row.value]));
      function renderCharts() {
        const charts = node("div", null, "intervals-charts");
        const link = sharedHover(dateDomain, form.length && (fc.length || at.length));
        if (fc.length || at.length) {
          charts.append(graphic(fc, { overlay: at, overlayColor: "violet", seriesName: "Fitness", overlayName: "Fatigue",
            label: "Fitness and fatigue", axes: true, size: "fitness", dateDomain, plotBackground: "#1b1a1f", area: true, linkedDate: link("fitness"),
            tooltipRows: time => formByDate.has(time) ? [["Form", fmt(formByDate.get(time), 2), "green"]] : [] }));
        }
        if (form.length) {
          charts.append(node("h3", "Form", "form-heading"), graphic(form, { color: "green", label: "Absolute form", seriesName: "Form",
            axes: true, size: "form", dateDomain, zones: formZones, axisTicks: [-40, -30, -10, 5, 20, 30], linkedDate: link("form"),
            format: value => fmt(value, 2), tooltipRows: time => {
              const value = formByDate.get(time);
              const zone = formZones.find(item => value >= (item.low ?? -Infinity) && value < (item.high ?? Infinity));
              return zone ? [["Zone", zone.label, zone.swatch]] : [];
            } }));
          const legend = node("ul", null, "form-zone-legend");
          legend.setAttribute("aria-label", "Absolute Form zones");
          for (const zone of formZones) {
            const key = node("li", zone.label);
            key.style.setProperty("--swatch", zone.swatch);
            legend.append(key);
          }
          charts.append(legend);
        }
        return charts;
      }
      panel.append(renderCharts());
      detailsButton(panel, "Fitness", [], {
        renderCharts, tableRows: days, columns: ["Date", "Fitness", "Fatigue", "Form"],
        row: item => [item.date, fmt(item.fitness), fmt(item.fatigue), fmt(item.form)],
      });
      return panel;
    }

    function body() {
      const panel = card("Body metrics");
      const grid = node("div", null, "metric-grid body-grid");
      const preview = { axes: true, size: "body", area: true, limit: 28 };
      if (newest("readiness")) grid.append(metric("Readiness", "readiness", "/100", "pink", garmin, { ...preview, axisTicks: [0, 25, 50, 75, 100] }));
      if (newest("bodyBattery")) grid.append(battery());
      if (newest("hrv")) grid.append(metric("HRV · overnight", "hrv", "ms", "green", garmin, preview));
      if (newest("restingHR")) grid.append(metric("Resting heart rate", "restingHR", "bpm", "pink", garmin, { limit: 28 }));
      if (newest("sleepMinutes") || newest("sleepScore")) grid.append(sleep());
      if (newest("recoveryHours")) grid.append(recoveryTime());
      if (grid.childElementCount) panel.append(grid);
      if (hasFitness()) panel.append(fitness());
      return panel.childElementCount > 1 ? panel : null;
    }

    function daily() {
      const lead = node("div", null, "daily-lead");
      lead.append(workoutSuggestion(), trainingLoad({ compact: true }));
      if (!getReport()) {
        const empty = card("No report open", "empty");
        empty.append(node("p", "Connect your training accounts in the local app to see your first report.", "muted"));
        return [empty, lead, trainingStatus()];
      }
      return [lead, coachSummary(), trainingStatus(), body()].filter(Boolean);
    }

    function focusWorkoutGuide(workouts) {
      const guide = node("div", null, "focus-workout-guide");
      const zones = node("div", null, "focus-workout-grid");
      const examples = node("details", null, "focus-workout-examples");
      examples.append(node("summary", "Workout examples"));
      const sessions = node("div", null, "focus-workout-grid");
      for (const [sport, zone, session] of workouts) {
        const item = node("div", null, "focus-workout-zone");
        item.append(node("span", sport), node("strong", zone));
        zones.append(item);
        const example = node("div");
        example.append(node("strong", sport), node("p", session));
        sessions.append(example);
      }
      examples.append(sessions);
      guide.append(zones, examples);
      return guide;
    }

    function difference(value) {
      return (value > 0 ? "+" : "") + fmt(value, 2).replace(/^-/, "−");
    }

    function loadDirectionNote(change, paired) {
      if (!change) return paired
        ? "This is the first date in view with both readings. Select a later paired date to see how recent load changed."
        : "Use a date with both readings to compare the two load trends.";
      const [acute, fatigue] = change;
      if (acute < 0 && fatigue < 0) return "Your recent training load eased. Earlier sessions carry less weight over time, so the load can fall as those sessions fade from the calculation.";
      if (acute > 0 && fatigue > 0) return "Your recent training load rose. New training can add more load than fades from earlier sessions.";
      if (acute === 0 && fatigue === 0) return "Your recent training load held steady across these two dates.";
      return "Acute Load and Fatigue moved differently. Look at the surrounding days to see which direction holds.";
    }

    function comparisonRecoveryNote(recovery, day, baseline) {
      const sentences = [];
      const changes = new Map();
      for (const field of ["Resting HR", "HRV · 7-day", "Time asleep"]) {
        const metric = recovery.find(item => item.name === field);
        const current = metric?.byDate.get(day), previous = metric?.byDate.get(baseline);
        if (current == null) continue;
        const label = field === "HRV · 7-day" ? "7-day HRV" : field;
        const format = metric.format ?? (value => fmt(value, 2) + " " + metric.unit);
        if (previous != null) changes.set(field, current - previous);
        sentences.push(previous == null ? label + " was " + format(current) + "."
          : current === previous ? label + " held at " + format(current) + "."
          : label + (current > previous ? " rose from " : " fell from ") + format(previous) + " to " + format(current) + ".");
      }
      if (!sentences.length) return "Recovery comparison needs a recorded resting HR, HRV, or sleep reading for this date.";
      const rhr = changes.get("Resting HR"), hrv = changes.get("HRV · 7-day");
      if (rhr != null && hrv != null) {
        if (rhr < 0 && hrv > 0) sentences.push("Both heart readings moved in a direction consistent with recovery.");
        else if (rhr === 0 && hrv === 0) sentences.push("The heart readings were steady across these two dates.");
        else sentences.push("The heart readings show little sign of improved recovery across these two dates.");
      }
      return sentences.join(" ");
    }

    function coachRecommendation({ reading, restingDelta, sleepGap, level, reasons, cautions, loadContext }) {
      const { readiness, recoveryHours } = reading ?? {};
      const readinessFact = "readiness was " + fmt(readiness) + "/100";
      const timerFact = recoveryHours === 0 ? "the recovery timer was complete" : "the recovery timer showed " + recoveryAmount(recoveryHours) + " h remaining";
      const describe = {
        readiness: readinessFact, timer: timerFact,
        restingHR: "resting HR was " + fmt(restingDelta) + " bpm above your recent median",
        sleep: "sleep was " + sleepDuration(sleepGap) + " short of your recorded need",
      };
      const evidence = new Intl.ListFormat("en", { type: "conjunction" }).format(reasons.map(reason => describe[reason]));
      if (level === "rest") return ["rest", "Give yourself time to recover because " + evidence + "."];
      if (level === "easy" || cautions.length) {
        const reason = evidence ? "Keep the effort conversational because " + evidence + "." : "Keep the effort conversational.";
        return ["easy", [reason, ...cautions].join(" ")];
      }
      if (level === "partial" || readiness == null || recoveryHours == null) {
        return ["easy", "Recovery readings for this date were incomplete. If you train, keep it conversational and check how you feel."];
      }
      if (!loadContext) {
        return ["easy", "Recent load had limited context for this date. Use a conversational effort until you can check the trend."];
      }
      return ["follow", "Your " + readinessFact + " and " + timerFact + " at the last check. " + loadContext
        + " If you still have a session planned, start easy and continue if the warm-up feels right."];
    }

    function coachEvidence(data, date, assessment, disclosure = node("details", null, "coach-evidence")) {
      const { reading = {}, fitness = {}, personalRange, restingDelta } = assessment;
      const sleep = reading.sleepDetails ?? {};
      const duration = value => value == null ? null : sleepDuration(value);
      if (!disclosure.childElementCount) disclosure.append(node("summary", "Data behind this recommendation"), node("div", null, "coach-evidence-groups"));
      const groups = disclosure.lastElementChild;
      groups.replaceChildren();
      function group(title, fields) {
        const readings = fields.filter(([, value]) => value != null && value !== "");
        if (!readings.length) return;
        const values = node("dl");
        for (const [label, value, unit = ""] of readings) {
          const item = node("div");
          item.append(node("dt", label), node("dd", (typeof value === "number" ? fmt(value, 2) : value) + unit));
          values.append(item);
        }
        const section = node("section");
        section.append(node("h4", title), values);
        groups.append(section);
      }
      group("Training load and fitness", [
        ["Acute", reading.acuteLoad], ["Chronic", reading.chronicLoad], ["Load ratio", reading.loadRatio],
        ["Acute optimal range", personalRange?.map(value => fmt(value)).join("–")], ["Load status", reading.loadStatus],
        ["Fitness", fitness.fitness], ["Fatigue", fitness.fatigue], ["Form", fitness.form],
      ]);
      group("Recovery and heart metrics", [
        ["Readiness", reading.readiness, "/100"], ["Recovery time at check", reading.recoveryHours, " h"],
        ["Body Battery", reading.bodyBattery, "/100"], ["Body Battery low", reading.bodyBatteryLow], ["Body Battery high", reading.bodyBatteryHigh],
        ["Resting HR", reading.restingHR, " bpm"], ["Resting HR vs recent median", restingDelta == null ? null : difference(restingDelta), " bpm"],
        ["Overnight HRV", reading.hrv, " ms"], ["7-day HRV", reading.hrv7d, " ms"], ["HRV status", reading.hrvStatus],
      ]);
      group("Sleep and overnight readings", [
        ["Time asleep", duration(reading.sleepMinutes)], ["Sleep need", duration(sleep.need)], ["Sleep score", reading.sleepScore, "/100"],
        ["Deep", duration(sleep.deep)], ["Light", duration(sleep.light)], ["REM", duration(sleep.rem)], ["Awake", duration(sleep.awake)],
        ["Overnight HR", sleep.overnightHR, " bpm"], ["Overnight SpO₂", sleep.spo2, "%"], ["Respiration", sleep.respiration, " br/min"],
        ["Restless moments", sleep.restless], ["Awakenings", sleep.awakenings],
      ]);
      const focus = data.context?.loadFocus;
      const withinFocusWindow = Date.parse(date) - Date.parse(focus?.end);
      const focusLabels = { lowAerobic: "Low aerobic", highAerobic: "High aerobic", anaerobic: "Anaerobic" };
      const focusFields = withinFocusWindow >= 0 && withinFocusWindow < 7 * 86400000
        ? list(focus.buckets).filter(bucket => focusLabels[bucket?.key] && Number.isFinite(bucket.points))
          .map(bucket => [focusLabels[bucket.key] + " through " + coachDate(focus.end), bucket.points, " pts"]) : [];
      group("Training status and adaptation", [
        ["Training status", reading.trainingStatus], ["Load focus", reading.loadFocusStatus], ["VO₂ max", reading.vo2],
        ["Heat acclimation", reading.heat, "%"], ...focusFields,
      ]);
      const sessions = list(data.activities).filter(row => row.date === date);
      group("Workouts recorded on this date", sessions.map(row => [row.name || row.sport,
        [row.environment, duration(row.minutes), row.km == null ? null : fmt(row.km, 2) + " km",
          row.avgHR == null ? null : fmt(row.avgHR) + " bpm avg", row.avgWatts == null ? null : fmt(row.avgWatts) + " W avg",
          row.liftedKg == null ? null : fmt(row.liftedKg, 2) + " kg lifted"].filter(Boolean).join(" · ")]));
      const end = Date.parse(date);
      const recent = list(data.activities).filter(row => row.date <= date && end - Date.parse(row.date) < 7 * 86400000);
      group("Workouts over the past seven days", model.sports.map(sport => {
        const workouts = recent.filter(row => row.sport === sport);
        if (!workouts.length) return [sport, null];
        const fields = [["minutes", duration], ["km", value => fmt(value, 2) + " km"], ["liftedKg", value => fmt(value, 2) + " kg lifted"]];
        const totals = fields.flatMap(([field, format]) => {
          const recorded = workouts.map(row => row[field]).filter(Number.isFinite);
          return recorded.length ? [format(recorded.reduce((sum, value) => sum + value, 0))] : [];
        });
        return [sport, [workouts.length + (workouts.length === 1 ? " session" : " sessions"), ...totals].join(" · ")];
      }));
      const efforts = list(data.efforts).filter(row => row.date === date);
      function pace(seconds) {
        const total = Math.round(seconds);
        return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0") + "/km";
      }
      group("Measured steady efforts", ["Cycling", "Running"].flatMap(sport => ["Indoor", "Outdoor"].map(environment => {
        const blocks = efforts.filter(row => row.sport === sport && row.environment === environment);
        if (!blocks.length) return [sport, null];
        const totals = blocks.map(row => row.effort), heart = blocks.map(row => row.bpm);
        const format = sport === "Cycling" ? value => fmt(value) + " W" : pace;
        const range = (values, render) => {
          const min = Math.min(...values), max = Math.max(...values);
          return min === max ? render(min) : render(min) + "–" + render(max);
        };
        return [sport + " · " + environment, blocks.length + (blocks.length === 1 ? " block" : " blocks")
          + " · " + range(totals, format) + " · " + range(heart, value => fmt(value) + " bpm")];
      })));
      if (!groups.childElementCount) groups.append(node("p", "Readings and workouts will appear here when available.", "muted"));
      return disclosure;
    }

    function sessionCheck(data, since, onSelect) {
      const sessions = list(data.activities).filter(row => row.date >= since && ["Cycling", "Running"].includes(row.sport));
      const paired = sessions.filter(row => row.sourceReadings?.length === 2).reverse();
      if (!onSelect && !paired.length) return null;
      const section = onSelect ? node("section", null, "comparison-sessions") : card("Session cross-check", "comparison-sessions");
      if (onSelect) section.append(node("h3", "Session cross-check"));
      section.append(node("p", fmt(paired.length, 0) + " paired · " + fmt(sessions.length - paired.length, 0) + " single-source sessions", "muted comparison-meta"));
      if (!paired.length) {
        section.append(node("p", "Session comparisons appear when the same workout can be matched across both sources.", "muted"));
        return section;
      }
      const chooser = node("select");
      chooser.setAttribute("aria-label", "Paired session");
      for (const [index, row] of paired.entries()) {
        const option = node("option", coachDate(row.date) + " · " + (row.name || row.sport));
        option.value = index;
        chooser.append(option);
      }
      const wrapper = node("div", null, "table-wrap");
      wrapper.tabIndex = 0;
      wrapper.setAttribute("role", "region");
      wrapper.setAttribute("aria-label", "Paired session readings");
      section.append(chooser, wrapper);
      function showSession(moveTimeline = false) {
        const session = paired[Number(chooser.value)];
        const original = session.sourceReadings.find(reading => reading.source === garmin);
        const comparison = session.sourceReadings.find(reading => reading.source === intervals);
        const table = node("table"), head = node("thead"), headings = node("tr"), body = node("tbody");
        for (const title of ["Metric", "Garmin", "Intervals.icu", "Intervals.icu − Garmin"]) headings.append(node("th", title));
        head.append(headings);
        const metrics = [["Distance", "km", " km"], ["Time", "minutes", " min"], ["Average HR", "avgHR", " bpm"]];
        if (session.sport === "Cycling") metrics.push(["Measured average power", "avgWatts", " W"]);
        for (const [label, field, unit] of metrics) {
          const left = original[field], right = comparison[field];
          const time = field === "minutes";
          const both = left != null && right != null;
          const comparable = !time || (original.timeBasis && original.timeBasis === comparison.timeBasis);
          const timeDifference = original.timeBasis && comparison.timeBasis ? "Different time basis" : "Time basis unclear";
          const format = (value, reading) => value == null ? "—" : fmt(value, 2) + unit
            + (time && reading.timeBasis ? (reading.timeBasis === "moving" ? " moving" : " duration") : "");
          const tr = node("tr");
          const name = node("th", label);
          name.scope = "row";
          tr.append(name, node("td", format(left, original)), node("td", format(right, comparison)),
            node("td", both ? comparable ? difference(right - left) + unit : timeDifference : "—"));
          body.append(tr);
        }
        table.append(head, body);
        wrapper.replaceChildren(table);
        if (moveTimeline) onSelect?.(Date.parse(session.date));
      }
      chooser.addEventListener("change", () => showSession(true));
      showSession();
      section.append(node("p", "When both apps use the same recording, this checks how each app imported and processed it.", "muted comparison-meta"));
      return section;
    }

    function loadRecoveryComparison() {
      const data = getReport();
      if (!data) return null;
      const since = new Date(Date.parse(data.date) - 41 * 86400000).toISOString().slice(0, 10);
      const series = (field, source = garmin) => valuesFor(field, source).filter(row => row.date >= since);
      const acute = series("acuteLoad"), fatigue = series("fatigue", intervals);
      if (!acute.length || !fatigue.length) return sessionCheck(data, since);
      const byTime = rows => new Map(rows.map(row => [Date.parse(row.date), row.value]));
      const recovery = [
        { name: "Resting HR", unit: "bpm", color: "pink", rows: series("restingHR") },
        { name: "HRV · 7-day", unit: "ms", color: "green", rows: series("hrv7d") },
        { name: "Readiness", unit: "/100", color: "cyan", rows: series("readiness") },
        { name: "Time asleep", unit: "min", color: "amber", rows: series("sleepMinutes"), format: sleepDuration },
      ].filter(item => item.rows.length).map(item => ({ ...item, byDate: byTime(item.rows) }));
      const allDates = [...new Set([acute, fatigue, ...recovery.map(item => item.rows)].flat().map(row => Date.parse(row.date)))].sort((a, b) => a - b);
      const acuteByDate = byTime(acute), fatigueByDate = byTime(fatigue);
      const paired = allDates.filter(day => acuteByDate.has(day) && fatigueByDate.has(day));
      const prior = new Map(paired.slice(1).map((day, index) => [day, paired[index]]));
      let selected = paired.at(-1) ?? allDates.at(-1);
      const listeners = new Map();
      let updateRecoveryValues;
      const panel = card("Load & Recovery", "load-recovery-panel");
      panel.append(node("p", paired.length + " of 42 days with both load readings", "muted comparison-meta"));
      const summary = node("div", null, "comparison-day");
      const selectedDate = node("time");
      const finding = node("span", null, "comparison-direction");
      const changes = node("div", null, "comparison-changes");
      const acuteChange = node("span", null, "comparison-acute"), fatigueChange = node("span", null, "comparison-fatigue");
      changes.append(acuteChange, fatigueChange);
      const acuteValue = node("strong"), fatigueValue = node("strong");
      summary.append(selectedDate, finding, changes);
      const explanation = node("section", null, "comparison-explanation");
      const loadNote = node("p"), recoveryNote = node("p");
      explanation.append(node("h3", "What this means"), loadNote, recoveryNote);
      const coach = node("section", null, "comparison-coach");
      const coachTitle = node("strong"), coachReason = node("p");
      const performanceEvidence = node("details", null, "coach-evidence");
      coach.append(node("h3", "Coach recommends"), coachTitle, coachReason, performanceEvidence);
      const guide = node("details", null, "comparison-guide");
      guide.append(node("summary", "How to read these charts"),
        node("p", "Acute Load and Fatigue track recent training strain on separate scales. Read the blue line against the left scale and the purple line against the right scale. Look for whether each line rises or falls."),
        node("p", "The lower chart shows recovery readings for the same date. Seven-day HRV averages recent nights, so it changes as nights enter and leave the window. Use your usual range and a pattern across several days to put a single reading in context."));
      panel.append(summary, explanation, coach, guide);
      function changeAt(day) {
        if (!prior.has(day)) return null;
        const baseline = prior.get(day);
        return [acuteByDate.get(day) - acuteByDate.get(baseline), fatigueByDate.get(day) - fatigueByDate.get(baseline)];
      }
      function selectDay(day, origin) {
        if (!allDates.includes(day)) return;
        selected = day;
        selectedDate.dateTime = new Date(day).toISOString().slice(0, 10);
        selectedDate.textContent = coachDate(selectedDate.dateTime);
        acuteValue.textContent = fmt(acuteByDate.get(day), 2);
        fatigueValue.textContent = fmt(fatigueByDate.get(day), 2);
        const change = changeAt(day);
        const isPaired = acuteByDate.has(day) && fatigueByDate.has(day);
        changes.hidden = !change;
        finding.dataset.tone = isPaired ? "steady" : "incomplete";
        if (change) {
          const [a, f] = change;
          const rising = a > 0 && f > 0, easing = a < 0 && f < 0;
          const direction = rising ? "Both rose" : easing ? "Both fell"
            : a === 0 && f === 0 ? "Both steady" : a === 0 || f === 0 ? "One changed" : "Moved in opposite directions";
          finding.dataset.tone = rising ? "rising" : easing ? "easing" : a === 0 && f === 0 ? "steady" : "mixed";
          finding.textContent = direction + " since " + coachDates.format(prior.get(day));
          acuteChange.textContent = "Acute " + difference(a);
          fatigueChange.textContent = "Fatigue " + difference(f);
        } else finding.textContent = isPaired ? "Both load readings available" : "Pair incomplete on this date";
        loadNote.textContent = loadDirectionNote(change, isPaired);
        recoveryNote.textContent = comparisonRecoveryNote(recovery, day, prior.get(day));
        const assessment = model.trainingAssessment(data, selectedDate.dateTime);
        const [action, reason] = coachRecommendation(assessment);
        coach.dataset.action = action;
        coachTitle.textContent = coachActions[action];
        coachReason.textContent = reason;
        coachEvidence(data, selectedDate.dateTime, assessment, performanceEvidence);
        updateRecoveryValues?.(day);
        for (const [name, update] of listeners) if (name !== origin) update(day, Boolean(origin));
      }
      function linkedDate(key) {
        return { dates: allDates, current: selected, mirrorHover: true, retainCursor: true,
          onChange: day => selectDay(day, key),
          onLeave: () => listeners.get(key === "load" ? "recovery" : "load")?.(null),
          bind: update => listeners.set(key, update) };
      }
      const axes = { axes: true, gapDays: 1, size: "comparison", dateDomain: allDates, plotBackground: "#0d151f" };
      const loadOptions = { ...axes, label: "Acute load and Fatigue", seriesName: "Acute load", overlay: fatigue,
        overlayName: "Fatigue", overlayColor: "violet", overlayAxis: { leftUnit: "pts", rightUnit: "pts" }, format: value => fmt(value, 2),
        tooltipRows: day => {
          const change = changeAt(day);
          return change ? [["Acute change", difference(change[0]), "cyan"], ["Fatigue change", difference(change[1]), "violet"]] : [];
        } };
      const load = node("div", null, "comparison-plot");
      const labels = node("p", null, "comparison-legend");
      const acuteLabel = node("span", "Acute Load", "comparison-acute");
      const fatigueLabel = node("span", "Fatigue", "comparison-fatigue");
      acuteLabel.append(acuteValue);
      fatigueLabel.append(fatigueValue);
      labels.append(acuteLabel, fatigueLabel);
      load.append(labels, graphic(acute, { ...loadOptions, linkedDate: linkedDate("load") }));
      panel.append(load);
      if (recovery.length) {
        const section = node("div", null, "comparison-plot");
        const heading = node("div", null, "comparison-recovery-heading");
        const chooser = node("select");
        chooser.setAttribute("aria-label", "Recovery chart metric");
        const views = recovery.map(metric => ({ title: metric.name, metrics: [metric] }));
        if (recovery[0]?.unit === "bpm" && recovery[1]?.unit === "ms") views.unshift({ title: "Resting HR + HRV", metrics: recovery.slice(0, 2) });
        for (const [index, view] of views.entries()) {
          const option = node("option", view.title);
          option.value = index;
          chooser.append(option);
        }
        const plot = node("div");
        const values = node("p", null, "comparison-legend");
        function showMetric() {
          const { title, metrics } = views[Number(chooser.value)];
          const [first, second] = metrics;
          const format = (metric, value) => value == null ? "—" : metric.format ? metric.format(value)
            : fmt(value, 2) + (metric.unit === "/100" ? "" : " ") + metric.unit;
          function showValues(day) {
            values.replaceChildren(...metrics.map(metric => {
              const reading = node("span", metric.name);
              reading.style.setProperty("--series-color", colors[metric.color]);
              reading.append(node("strong", format(metric, metric.byDate.get(day))));
              return reading;
            }));
          }
          plot.replaceChildren(graphic(first.rows, { ...axes, label: title, seriesName: first.name, color: first.color, size: "comparison-recovery",
            format: value => format(first, value), linkedDate: linkedDate("recovery"),
            ...(second && { overlay: second.rows, overlayName: second.name, overlayColor: second.color,
              overlayFormat: value => format(second, value), overlayAxis: { leftUnit: first.unit, rightUnit: second.unit } }) }));
          updateRecoveryValues = showValues;
          showValues(selected);
        }
        chooser.addEventListener("change", showMetric);
        heading.append(node("h3", "Recovery"), chooser);
        section.append(heading, values, plot);
        panel.append(section);
        showMetric();
      }
      selectDay(selected);
      panel.append(sessionCheck(data, since, selectDay));
      detailsButton(panel, "Load & Recovery", [], {
        renderCharts: () => graphic(acute, loadOptions),
        tableRows: allDates.map(time => ({ time, date: new Date(time).toISOString().slice(0, 10) })),
        columns: ["Date", "Acute load", "Fatigue", ...recovery.map(item => item.name)],
        row: item => [item.date, fmt(acuteByDate.get(item.time), 2), fmt(fatigueByDate.get(item.time), 2),
          ...recovery.map(metric => metric.byDate.has(item.time) ? (metric.format ?? fmt)(metric.byDate.get(item.time)) : "—")],
      });
      return panel;
    }

    function trends() {
      const pair = node("div", null, "load-and-fitness");
      pair.append(trainingLoad());
      if (hasFitness()) pair.append(fitness());
      const metrics = node("div", null, "stack trends-metrics");
      const focusData = getReport()?.context?.loadFocus;
      const buckets = list(focusData?.buckets).filter(bucket => Number.isFinite(bucket?.points) && bucket.points >= 0);
      if (buckets.length) {
        const focus = card("Load Focus", "load-focus");
        olderReading(focus, focusData.end);
        const withinOrAbove = Object.keys(focusWorkouts).every(key => buckets.some(bucket =>
          bucket.key === key && Number.isFinite(bucket.targetLow) && Number.isFinite(bucket.targetHigh)
          && bucket.targetLow >= 0 && bucket.targetHigh >= bucket.targetLow && bucket.points >= bucket.targetLow));
        if (withinOrAbove) {
          focus.append(node("p", "You’ve met the minimum in all three categories. Let recovery guide what you do next.", "focus-advice"));
        }
        const scale = Math.max(1, ...buckets.flatMap(row => [row.points, Number.isFinite(row.targetHigh) ? row.targetHigh : 0])) * 1.08;
        for (const bucket of buckets) {
          const [label, color] = { lowAerobic: ["Low aerobic", "green"], highAerobic: ["High aerobic", "amber"], anaerobic: ["Anaerobic", "violet"] }[bucket.key] ?? [bucket.key, "cyan"];
          const category = node("div", null, "focus-category");
          const heading = node("div", null, "focus-category-head");
          heading.append(node("h3", label));
          const values = node("div", null, "focus-values");
          values.append(readout("Actual", bucket.points, color, "pts"));
          const bar = node("div", null, "focus-bar"), fill = node("span");
          bar.setAttribute("aria-hidden", "true");
          fill.style.setProperty("--fill", (100 * bucket.points / scale) + "%");
          fill.style.setProperty("--accent", colors[color]);
          bar.append(fill);
          const { targetLow, targetHigh, points } = bucket;
          if (Number.isFinite(targetLow) && Number.isFinite(targetHigh) && targetLow >= 0 && targetLow <= targetHigh) {
            let status = "On target", tone = "on";
            if (points < targetLow) {
              status = "Below target · " + fmt(targetLow - points, 2) + " pts short";
              tone = "below";
            } else if (points > targetHigh) {
              status = "Above target · " + fmt(points - targetHigh, 2) + " pts over";
              tone = "above";
            }
            heading.append(node("span", status, "focus-status focus-status--" + tone));
            const targetValue = node("div", null, "focus-target");
            const range = node("strong", fmt(targetLow) + "–" + fmt(targetHigh));
            range.append(node("small", "pts"));
            targetValue.append(node("span", "Target"), range);
            values.append(targetValue);
            const target = node("i");
            target.style.left = (100 * targetLow / scale) + "%";
            target.style.width = (100 * (targetHigh - targetLow) / scale) + "%";
            bar.append(target);
          }
          category.append(heading, values, bar);
          if (Object.hasOwn(focusWorkouts, bucket.key)) category.append(focusWorkoutGuide(focusWorkouts[bucket.key]));
          focus.append(category);
        }
        if (buckets.some(bucket => Object.hasOwn(focusWorkouts, bucket.key))) {
          if (focusData.estimated) focus.append(node("p", "Points and target ranges are approximate readings from the source chart.", "focus-guide-note"));
          focus.append(node("p", "Use the zones to pace your effort. Your session’s Training Effect determines how its load is counted. Save hard efforts for days when you feel recovered.", "focus-guide-note"));
        }
        metrics.append(focus);
      }
      if (newest("restingHR") || newest("hrv7d")) metrics.append(heartMetrics({ days: 90, explain: true }));
      return [pair, loadRecoveryComparison(), metrics.childElementCount ? metrics : null].filter(Boolean);
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
          if (reading[field] != null) entryFor(reading.date).readings.push([reading.date, name, fmt(reading[field]) + unit]);
        }
      }
      const days = [...new Set([...saved.keys(), ...history.keys()])].sort().reverse();
      if (!days.length) panel.append(node("p", "Once you sync, you’ll see your activities and recovery history here.", "muted"));
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
          const durations = sessions.filter(item => item.minutes != null);
          const time = durations.reduce((sum, item) => sum + item.minutes, 0);
          const activities = sessions.map(item => [date, item.name || item.sport, item.minutes == null ? "—" : fmt(item.minutes) + " min"]);
          showHistory(date, [], {
            renderCharts: () => node("p", durations.length ? fmt(time) + " min of recorded session time" : "Readings for " + date, "muted"),
            collapseHistory: false,
            tableRows: [...readings, ...activities], columns: ["Date", "Activity or reading", "Value"], row: item => item,
          });
        });
        panel.append(row);
      }
      return [panel];
    }

    function reference() {
      const data = getReport(), coverage = card("Data coverage"), thresholds = card("Threshold review");
      const totals = [
        ["Wellness dates", new Set(list(data?.wellness).map(row => row.date)).size],
        ["Activities", list(data?.activities).length],
        ["Paired efforts", list(data?.efforts).length],
      ];
      for (const [label, count] of totals) {
        if (!count) continue;
        const entry = node("div", null, "benchmark-entry");
        entry.append(node("strong", label), node("span", fmt(count)));
        coverage.append(entry);
      }
      const items = list(data?.context?.thresholds).filter(row => row?.title && row.value != null);
      for (const row of items) {
        const entry = node("div", null, "benchmark-entry");
        const status = row.status?.replace(/\b(?:Garmin(?: Connect)?|Intervals(?:\.icu)?)\b/gi, "").trim();
        entry.append(node("span", row.title), node("strong", [row.value, row.unit].filter(value => value != null).join(" ")),
          node("small", [status, row.date].filter(Boolean).join(" · ")));
        thresholds.append(entry);
      }
      const content = coverage.childElementCount > 1 ? [coverage] : [];
      if (items.length) content.push(thresholds);
      return content;
    }

    return { daily, trends, archive, reference };
  };
})();
