(() => {
  "use strict";
  const garmin = "Garmin Connect", intervals = "Intervals.icu";
  const list = value => Array.isArray(value) ? value : [];
  const formZones = [
    { label: "Transition", low: 20, color: "#54432e", swatch: "#ffc572" },
    { label: "Fresh", low: 5, high: 20, color: "#293c51", swatch: "#56d5f4" },
    { label: "Grey zone", low: -10, high: 5, color: "#3d3a47", swatch: "#b1aabb" },
    { label: "Optimal", low: -30, high: -10, color: "#2c4038", swatch: "#7aefa8" },
    { label: "High risk", high: -30, color: "#4b303a", swatch: "#fa819e" },
  ];
  const sleepStages = [
    ["awake", "Awake", "#7aefa8"], ["rem", "REM", "#be9cff"], ["light", "Light", "#56d5f4"], ["deep", "Deep", "#7892ff"],
  ];
  const ratioOptimal = { low: 0.8, high: 1.5, color: "#7aefa824", edgeColor: "#7aefa856" };
  const ratioOptimalRange = ratioOptimal.low + "–" + ratioOptimal.high;
  const coachDates = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const coachDate = date => coachDates.format(Date.parse(date));
  const needsRecovery = row => (row?.readiness != null && row.readiness < 25) || row?.recoveryHours >= 24;
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

    function header(panel, source, date) {
      const meta = node("div", null, "panel-meta");
      if (source) meta.append(node("span", source, "source-tag"));
      if (date) meta.append(node("small", date));
      panel.append(meta);
    }

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

    function coachNote({ date, accent, headline, explanation, advice, affirmation }) {
      const section = node("section", null, "coach-note");
      section.style.setProperty("--coach-accent", accent);
      const header = node("div", null, "coach-note-head");
      header.append(node("span", "Coach’s note"), node("h3", headline));
      if (date !== getReport()?.date) header.append(node("small", coachDate(date)));
      const next = node("p"), anchor = node("p");
      next.append(node("strong", "Recommendation"), " ", advice);
      anchor.append(node("strong", "Coach’s reminder"), " ", affirmation);
      section.append(header, node("p", explanation), next, anchor);
      return section;
    }

    function trainingLoadCoach(latest, previous) {
      if (!latest) return null;
      const range = row => row?.optimalLow != null && row?.optimalHigh != null && row.optimalHigh >= row.optimalLow;
      const relativeTo = (value, low, high) => value < low ? "below" : value > high ? "above" : "within";
      const target = range(latest) ? relativeTo(latest.acuteLoad, latest.optimalLow, latest.optimalHigh) : null;
      const ratio = latest.loadRatio != null ? relativeTo(latest.loadRatio, ratioOptimal.low, ratioOptimal.high) : null;
      if (!target && !ratio) return null;

      const status = latest.loadStatus?.trim() ?? "";
      const above = target === "above" || ratio === "above" || /high|above/i.test(status);
      const below = target === "below" || ratio === "below" || /low|below/i.test(status);
      const returned = !above && !below && target === "within" && range(previous) && previous.acuteLoad > previous.optimalHigh;
      const headline = above && below ? "Your load signals point in different directions" : above ? "Your training load is running high"
        : below ? "Your training load is running lighter" : returned ? "You’re back in your personal load range"
          : target ? "You’re training within your load range" : "Your load ratio is within range";
      const comparison = previous ? latest.acuteLoad - previous.acuteLoad : 0;
      const evidence = [
        "Your acute load is " + fmt(latest.acuteLoad) + (target ? ", " + target + " your personal range of about "
          + fmt(latest.optimalLow) + "–" + fmt(latest.optimalHigh) : "") + ".",
        Math.abs(comparison) >= 1 ? "It " + (comparison < 0 ? "fell " : "rose ") + fmt(Math.abs(comparison))
          + " points since " + coachDate(previous.date) + "." : null,
        ratio ? "Your load ratio is " + fmt(latest.loadRatio) + ", " + ratio + " the " + ratioOptimalRange + " range." : null,
      ].filter(Boolean);
      const advice = above || needsRecovery(latest) ? "Save the hard session for another day. Take a rest day or choose light movement if it feels right."
        : returned ? "Keep your next session easy. Check how you’re recovering before you add intensity."
        : below ? "If you feel recovered, build back with a little more time at an easy effort."
        : "Start with your usual warm-up. If it feels as expected and recovery looks good, stick to the plan.";
      const affirmation = above ? "An easier day can help you come back ready for the next hard session."
        : below ? "Coming back from a lighter week takes time. A session you can repeat is a good place to start."
        : returned ? "Keeping an easy session easy is good pacing, especially after a high-load day."
        : "Staying in range gives you a steady base for the work you’ve planned.";
      return coachNote({ date: latest.date, accent: above || below ? "#ffc572" : colors.green,
        headline, explanation: evidence.join(" "), advice, affirmation });
    }

    function trainingLoad() {
      const panel = card("Training Load", "load-panel");
      const acute = valuesFor("acuteLoad", garmin).slice(-42);
      const chronic = valuesFor("chronicLoad", garmin).slice(-42);
      const ratio = valuesFor("loadRatio", garmin).slice(-42);
      const band = datedRows().filter(row => row.date >= (acute.at(0)?.date ?? "") && row.optimalLow != null && row.optimalHigh != null)
        .map(row => ({ date: row.date, low: row.optimalLow, high: row.optimalHigh }));
      const dateDomain = [...acute, ...chronic, ...ratio, ...band].map(row => Date.parse(row.date));
      const ratioByDate = new Map(ratio.map(row => [Date.parse(row.date), row.value]));
      const loadChart = { overlay: chronic, seriesName: "Acute", overlayName: "Chronic", band, bandName: "Acute optimal range",
        axes: true, size: "load", zeroFloor: true, gapDays: 1, dateDomain, label: "Garmin acute and chronic load",
        tooltipRows: time => ratioByDate.has(time) ? [["Ratio", fmt(ratioByDate.get(time), 2), "violet"]] : [] };
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
      if (comment) panel.append(comment);
      if (band.length) {
        const legend = node("p", null, "load-range-key");
        legend.append(node("span"), node("small", "Acute optimal range"));
        if (latest?.optimalLow != null && latest?.optimalHigh != null) legend.append(node("small", "≈" + fmt(latest.optimalLow) + "–" + fmt(latest.optimalHigh)));
        panel.append(legend);
      }
      panel.append(graphic(acute, loadChart));
      if (ratio.length) {
        const subsection = node("div", null, "load-ratio");
        const heading = node("div", null, "load-ratio-header");
        heading.append(node("h3", "Load ratio"));
        const legend = node("p", null, "load-range-key");
        legend.append(node("span"), node("small", "Optimal range"), node("small", ratioOptimalRange));
        heading.append(legend);
        subsection.append(heading, graphic(ratio, { color: "violet", label: "Garmin load ratio, optimal range " + ratioOptimalRange, seriesName: "Ratio",
          axes: true, size: "ratio", gapDays: 1, dateDomain, zones: [ratioOptimal],
          tooltipRows: () => [["Optimal range", ratioOptimalRange, "green"]] }));
        panel.append(subsection);
      }
      detailsButton(panel, "Training Load", acute, {
        ...loadChart, columns: ["Date", "Acute", "Chronic", "Ratio"],
        row: item => {
          const row = datedRows().find(date => date.date === item.date);
          return [item.date, fmt(item.value), fmt(row?.chronicLoad), fmt(row?.loadRatio)];
        },
      });
      return panel;
    }

    function workoutAdvice() {
      const data = getReport(), snapshot = data?.context?.plan;
      const ready = newest("readiness"), recoveryTime = newest("recoveryHours");
      const current = data && data.date === currentDate(data.timezone) && ready?.date === data.date && recoveryTime?.date === data.date;
      if (!current) return { title: "Check recovery first", detail: "Sync today’s readiness and recovery time so you can choose a session that fits." };
      if (snapshot?.date === data.date && snapshot.name) {
        return { title: snapshot.name, detail: snapshot.condition || "Start gently and see how the warm-up feels before you settle into the target.", target: snapshot.target };
      }
      const ease = ready.value < 50 || recoveryTime.value > 12;
      return { title: ease ? "Rest or keep it easy" : "Start with an easy warm-up",
        detail: ease ? "Give yourself room to recover. If you choose to train, keep the effort conversational."
          : "Start conversational. If the effort feels right, settle into the planned easy pace or power." };
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
      const fresh = day === currentDate(data.timezone);
      const shouldEase = needsRecovery(today) || (readiness != null && readiness < 50) || recoveryHours > 12;
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
        findings.push(["Recovery", "You logged " + new Intl.ListFormat("en", { type: "conjunction" }).format(recoveryFacts) + "."
          + (fresh && !shouldEase && readiness != null && recoveryHours != null ? " See how the effort feels in your warm-up before settling into the session." : "")]);
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
      const title = panel.firstElementChild;
      const header = node("div", null, "coach-summary-header");
      const date = node("time", coachDate(day) + " " + day.slice(0, 4));
      date.dateTime = day;
      header.append(title, date);
      panel.prepend(header);
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
      const advice = workoutAdvice();
      const recommendation = node("div", null, "coach-recommendation");
      recommendation.append(node("h3", "Next session"), node("strong", advice.title));
      if (advice.target) recommendation.append(node("p", advice.target, "coach-session-target"));
      recommendation.append(node("p", advice.detail));
      const affirmation = shouldEase ? "Taking an easy day when you need it is part of training well. Give yourself credit for making that call."
        : within && falling ? "If you finish with something left, you paced it well. That’s the kind of session you can build on."
          : "Give yourself credit for matching the effort to the goal. It’s a skill you can carry into your next session.";
      const closing = node("p", null, "coach-summary-affirmation");
      closing.append(node("strong", "Coach’s reminder"), " ", affirmation);
      panel.append(evidence, recommendation, closing);
      return panel;
    }

    function recovery() {
      const panel = card("Workout suggestion", "workout-panel");
      const advice = workoutAdvice();
      panel.append(node("h3", advice.title), node("p", advice.detail, "muted"));
      const signals = node("div", null, "workout-signals");
      const readiness = metric("Readiness", "readiness", "/100", "pink", garmin, false);
      const timer = recoveryTime("Recovery time");
      readiness.classList.add("workout-signal--compact");
      timer.classList.add("workout-signal--compact");
      signals.append(readiness, timer, heartMetrics({ compact: true }), sleep(true));
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
      grid.append(metric("VO₂ max", "vo2", "", "cyan", garmin, statusChart), heartMetrics(),
        metric("Acute load", "acuteLoad", "", "cyan", garmin, statusChart),
        metric("Heat acclimation", "heat", "%", "amber", garmin, { ...statusChart, axisTicks: [0, 25, 50, 75, 100] }));
      panel.append(grid);
      return panel;
    }

    function heartMetrics({ compact = false, days = 28 } = {}) {
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
      let cardView = compact ? "both" : heartView;

      function explorer(days, initial, onSelect, preview = false) {
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
            ...statusChart, axes: !preview, color: primary.color, size: "heart", seriesName: primary.short,
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
        if (!preview) {
          for (const option of options) {
            const button = node("button", option.label);
            button.type = "button";
            button.disabled = !option.available;
            button.addEventListener("click", () => select(option.key));
            buttons.set(option.key, button);
            chooser.append(button);
          }
          container.append(chooser);
        }
        container.append(plot);
        select((options.find(option => option.available && option.key === initial) ?? options.find(option => option.available)).key);
        return container;
      }

      panel.append(explorer(days, cardView, view => { cardView = view; if (!compact) heartView = view; }, compact));
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
      ranges.setAttribute("aria-label", "Garmin Body Battery daily low and high. Use left and right arrows to read each day.");

      const caption = node("figcaption");
      const selectedDate = node("time");
      const readings = node("div", null, "battery-range-readings");
      readings.setAttribute("role", "status");
      const low = node("strong"), high = node("strong");
      const lowLabel = node("span", "Low", "battery-low");
      const highLabel = node("span", "High", "battery-high");
      lowLabel.append(low);
      highLabel.append(high);
      readings.append(selectedDate, lowLabel, highLabel);
      caption.append(node("span", values[0].date + " – " + values.at(-1).date), readings);
      let selected = -1;
      function select(index) {
        if (index === selected) return;
        ranges.children[selected]?.classList.remove("is-selected");
        ranges.children[index].classList.add("is-selected");
        selected = index;
        const reading = values[index];
        selectedDate.dateTime = reading.date;
        selectedDate.textContent = reading.date;
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
        const button = panel.querySelector(".history-button");
        panel.insertBefore(batteryRangeChart(values), button);
        button.remove();
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
      gauge.setAttribute("aria-label", "Garmin sleep score " + score + " out of 100, " + rating);
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
      plot.setAttribute("aria-label", "Garmin sleep stages from " + time(first) + " to " + time(last));
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

    function sleep(compact = false) {
      const title = compact ? "Sleep score" : "Sleep";
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
      panel.append(overview, node("small", night.date));
      if (!compact && night.sleepDetails) {
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

    function recoveryTime(title, expanded = false) {
      const panel = card(title, "recovery-timer-card");
      const rows = valuesFor("recoveryHours", garmin);
      const latest = rows.at(-1);
      if (!latest) {
        panel.append(node("p", "No recorded reading", "muted"));
        return panel;
      }
      // Garmin reports a countdown of up to four days. Zero is the finished timer.
      const hours = latest.value, recovered = hours === 0;
      const amount = value => value > 0 && value < .01 ? "<0.01" : fmt(value, 2);
      const format = value => amount(value) + " h";
      const overview = node("div", null, "recovery-timer");
      const track = node("div", null, "recovery-timer-track" + (recovered ? " is-complete" : ""));
      track.setAttribute("aria-hidden", "true");
      track.style.setProperty("--recovery-fill", 100 * (1 - Math.min(hours, 96) / 96) + "%");
      track.append(node("span"));
      const time = node("div", null, "recovery-timer-time");
      const remaining = node("strong", amount(hours));
      remaining.append(node("span", " h", "recovery-timer-unit"));
      time.append(remaining, node("small", recovered ? "Complete at check" : "Remaining at check"));
      overview.append(track, time);
      panel.append(overview);
      if (latest.date !== getReport()?.date) panel.append(node("small", latest.date));
      else {
        const captured = globalThis.PerformanceData.recoveryReadingTime(getReport(), latest.date);
        if (captured) panel.append(node("small", "Recorded at " + captured));
      }
      const options = { color: "cyan", format, unit: "Time remaining", label: "Garmin recovery time" };
      if (expanded) panel.append(graphic(rows.slice(-28), { ...options, axes: true, size: "body", area: true, zeroFloor: true }));
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
      const recovery = datedRows().findLast(row => row.date === latest.date);
      const headline = zone.label === "High risk" ? "Your recent load calls for an easier day" : easing ? "Your Fatigue is easing"
        : gap >= .5 ? "You’re carrying more recent load" : gap <= -.5 ? "Your recent load is lighter" : "Your recent and long-term loads are close";
      const explanation = Math.abs(gap) < .5 ? "Your Fatigue and Fitness are close, so Form is near zero."
        : "Your Form is " + fmt(latest.form).replace(/^-/, "−") + " because Fatigue (short-term load) is "
          + fmt(Math.abs(gap)) + " points " + (gap > 0 ? "above" : "below") + " Fitness (long-term load).";
      const trend = easing
        ? "You’re " + fmt(fall) + " points below your seven-day Fatigue peak of " + fmt(peak.fatigue) + " on " + coachDate(peak.date) + "."
        : "";
      const advice = needsRecovery(recovery) || zone.label === "High risk" ? "Save the hard session. Take a rest day or move lightly, then check how you feel before the next session."
        : zone.label === "Optimal" ? "Keep your next session easy. See whether your usual pace or power feels comfortable in the warm-up."
        : zone.label === "Fresh" || zone.label === "Transition" ? "Follow your plan if you feel recovered. If you’re coming back from time off, build gradually."
        : "Start with your normal warm-up. Add load when you feel ready and the session calls for it.";
      const affirmation = easing ? "If recovery was the goal, that drop is worth noticing. Keep the next effort manageable."
        : gap >= .5 ? "An easy day helps you keep showing up for the work you’ve planned."
        : "Use the lighter stretch to make room for your next key session.";

      return coachNote({ date: latest.date, accent: zone.swatch, headline,
        explanation: explanation + (trend ? " " + trend : ""), advice, affirmation });
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
      const dateDomain = days.map(row => Date.parse(row.date));
      const formByDate = new Map(form.map(row => [Date.parse(row.date), row.value]));
      function renderCharts() {
        const charts = node("div", null, "intervals-charts");
        if (fc.length || at.length) {
          charts.append(graphic(fc, { overlay: at, overlayColor: "violet", seriesName: "Fitness", overlayName: "Fatigue",
            label: "Intervals.icu fitness and fatigue", axes: true, size: "fitness", dateDomain, plotBackground: "#1b1a1f", area: true,
            tooltipRows: time => formByDate.has(time) ? [["Form", fmt(formByDate.get(time), 2), "green"]] : [] }));
        }
        if (form.length) {
          charts.append(node("h3", "Form", "form-heading"), graphic(form, { color: "green", label: "Intervals.icu absolute form", seriesName: "Form",
            axes: true, size: "form", dateDomain, zones: formZones, axisTicks: [-40, -30, -10, 5, 20, 30],
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
      header(panel, garmin);
      const grid = node("div", null, "metric-grid body-grid");
      const preview = { axes: true, size: "body", area: true, limit: 28 };
      if (newest("readiness")) grid.append(metric("Readiness", "readiness", "/100", "pink", garmin, { ...preview, axisTicks: [0, 25, 50, 75, 100] }));
      if (newest("bodyBattery")) grid.append(battery());
      if (newest("hrv")) grid.append(metric("HRV · overnight", "hrv", "ms", "green", garmin, preview));
      if (newest("restingHR")) grid.append(metric("Resting heart rate", "restingHR", "bpm", "pink", garmin, { limit: 28 }));
      if (newest("sleepMinutes") || newest("sleepScore")) grid.append(sleep());
      if (newest("recoveryHours")) grid.append(recoveryTime("Recovery", true));
      const bottom = node("div", null, "load-and-fitness");
      bottom.append(trainingLoad());
      if (hasFitness()) bottom.append(fitness());
      if (grid.childElementCount) panel.append(grid);
      panel.append(bottom);
      return panel;
    }

    function daily() {
      const lead = node("div", null, "daily-lead");
      lead.append(trainingLoad(), recovery());
      if (!getReport()) {
        const empty = card("No report open", "empty");
        empty.append(node("p", "Connect your training accounts to see your first report, or open a report you’ve saved.", "muted"));
        return [empty, lead, trainingStatus(), body()];
      }
      const summary = coachSummary();
      return summary ? [lead, summary, trainingStatus(), body()] : [lead, trainingStatus(), body()];
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
      if (newest("restingHR") || newest("hrv7d")) metrics.append(heartMetrics({ days: 90 }));
      return metrics.childElementCount ? [pair, metrics] : [pair];
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
          const activities = sessions.map(item => [date, item.name || item.sport, item.minutes == null ? "—" : fmt(item.minutes) + " min", item.sources.join(", ")]);
          showHistory(date, [], {
            renderCharts: () => node("p", durations.length ? fmt(time) + " min of recorded session time" : "Readings for " + date, "muted"),
            collapseHistory: false,
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

    return { daily, trends, archive, reference };
  };
})();
