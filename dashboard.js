(() => {
  "use strict";
  const model = globalThis.PerformanceData;
  const element = id => document.getElementById(id);
  const metricColors = { cyan: "#55e3f0", pink: "#ff7bad", green: "#79eeae", violet: "#bb9cff", amber: "#ffca7d" };
  let report = null;
  let mode = null;

  function node(tag, text, className) {
    const item = document.createElement(tag);
    if (text != null) item.textContent = text;
    if (className) item.className = className;
    return item;
  }

  function card(title, variant = "") {
    const panel = node("article", null, ("card " + variant).trim());
    panel.append(node("h2", title));
    return panel;
  }

  function fmt(value, digits = 1) {
    return value == null || !Number.isFinite(value) ? "—" : new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(value);
  }
  function pace(seconds) {
    if (!Number.isFinite(seconds)) return "—";
    const whole = Math.round(seconds);
    return Math.floor(whole / 60) + ":" + String(whole % 60).padStart(2, "0");
  }

  function parsePace(value) {
    const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim());
    return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
  }

  function graphic(rows, { color = "cyan", format = fmt, label } = {}) {
    if (!rows.length) return node("p", "No recorded values for this chart.", "muted");
    const output = node("div");
    const canvas = node("canvas", null, "chart");
    const readout = node("small", "");
    canvas.width = 660;
    canvas.height = 170;
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", (label || "History") + ". Use arrow keys for recorded values.");
    const context = canvas.getContext("2d");
    const timestamps = rows.map(row => Date.parse(row.date));
    const values = rows.map(row => row.value);
    const xMin = timestamps[0], xMax = timestamps.at(-1);
    const yMin = Math.min(...values), yMax = Math.max(...values);
    const points = rows.map((row, index) => [
      xMin === xMax ? 330 : 20 + 620 * (timestamps[index] - xMin) / (xMax - xMin),
      yMin === yMax ? 85 : 145 - 120 * (row.value - yMin) / (yMax - yMin),
    ]);
    let selected = points.length - 1;
    function draw() {
      context.clearRect(0, 0, 660, 170);
      context.setLineDash([4, 7]);
      context.strokeStyle = "#32414e";
      for (const y of [25, 85, 145]) {
        context.beginPath();
        context.moveTo(18, y);
        context.lineTo(642, y);
        context.stroke();
      }
      context.setLineDash([]);
      context.strokeStyle = metricColors[color];
      context.lineWidth = 2.5;
      context.beginPath();
      points.forEach(([x, y], i) => {
        const previous = points[i - 1];
        if (!previous || timestamps[i] - timestamps[i - 1] > 7 * 86400000) context.moveTo(x, y);
        else {
          const midpoint = (previous[0] + x) / 2;
          context.bezierCurveTo(midpoint, previous[1], midpoint, y, x, y);
        }
      });
      context.stroke();
      points.forEach(([x, y], i) => {
        context.fillStyle = i === selected ? "#f5faff" : metricColors[color];
        context.beginPath();
        context.arc(x, y, i === selected ? 5 : 3, 0, Math.PI * 2);
        context.fill();
      });
      readout.textContent = rows[selected].date + " · " + format(rows[selected].value);
    }
    canvas.addEventListener("pointermove", event => {
      const bounds = canvas.getBoundingClientRect();
      const cursor = (event.clientX - bounds.left) * 660 / bounds.width;
      selected = points.reduce((nearest, point, i) => Math.abs(point[0] - cursor) < Math.abs(points[nearest][0] - cursor) ? i : nearest, 0);
      draw();
    });
    canvas.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      selected = Math.max(0, Math.min(points.length - 1, selected + (event.key === "ArrowLeft" ? -1 : 1)));
      draw();
    });
    draw();
    output.append(canvas, readout);
    return output;
  }

  function showHistory(title, rows, options = {}) {
    const container = element("detail-content");
    container.replaceChildren(graphic(rows, { ...options, label: title }));
    const wrapper = node("div", null, "table-wrap");
    const table = node("table");
    const columns = options.columns || ["Date", options.unit || "Value", "Source"];
    const head = node("thead"), headings = node("tr");
    for (const title of columns) headings.append(node("th", title));
    head.append(headings);
    const body = node("tbody");
    for (const row of [...rows].reverse()) {
      const tr = node("tr");
      const values = options.row ? options.row(row) : [row.date, (options.format || fmt)(row.value), row.source];
      for (const value of values) tr.append(node("td", value));
      body.append(tr);
    }
    table.append(head, body);
    wrapper.append(table);
    if (rows.length) container.append(wrapper);
    element("detail-title").textContent = title;
    element("details").showModal();
  }

  function detailsButton(panel, title, rows, options) {
    const details = node("button", "Details", "history-button");
    details.type = "button";
    details.setAttribute("aria-label", "Details for " + title);
    details.addEventListener("click", () => showHistory(title, rows, options));
    panel.append(details);
  }

  function valuesFor(field, source) {
    const byDate = new Map();
    for (const row of report?.wellness || []) {
      if (row.source === source && row[field] != null) byDate.set(row.date, { date: row.date, value: row[field], source });
    }
    return [...byDate.values()];
  }

  function metric(label, field, unit, color, source, chart = true) {
    const panel = card(label);
    const rows = valuesFor(field, source);
    const latest = rows.at(-1);
    const readout = node("p", fmt(latest?.value), "metric");
    readout.style.setProperty("--accent", metricColors[color]);
    if (latest && unit) readout.append(node("small", unit));
    panel.append(readout, node("small", latest ? source + " · " + latest.date : "Waiting for " + source + " data"));
    const options = { color, unit: label + (unit ? " (" + unit + ")" : "") };
    if (chart && rows.length) panel.append(graphic(rows, options));
    if (field === "readiness" && latest) {
      const track = node("div", null, "readiness-bar"), fill = node("span");
      fill.style.width = latest.value + "%";
      if (latest.value > 0) fill.style.setProperty("--scale", (10000 / latest.value) + "%");
      track.append(fill);
      panel.append(track);
    }
    detailsButton(panel, label, rows, options);
    return panel;
  }

  function showDaily() {
    const content = element("daily-content");
    content.replaceChildren();
    element("report-date").textContent = report ? ("Report · " + report.date) : "";
    if (!report) {
      const blank = card("No report open", "empty");
      blank.append(node("p", "Open a private report file to see recovery, training load and recent workouts.", "muted"));
      const links = node("div", null, "source-links");
      for (const [title, url] of [["Garmin Connect", "https://connect.garmin.com/"], ["Intervals.icu", "https://intervals.icu/"], ["Strava", "https://www.strava.com/"]]) {
        const link = node("a", title);
        link.href = url;
        link.target = "_blank";
        link.rel = "noreferrer";
        links.append(link);
      }
      blank.append(links, node("small", "The report file stays in this browser session."));
      content.append(blank);
    } else {
      const summary = card("Workout suggestion", "empty");
      const readiness = valuesFor("readiness", "Garmin Connect").at(-1);
      const recovery = valuesFor("recoveryHours", "Garmin Connect").at(-1);
      if (report.date !== model.currentDate(report.timezone) || readiness?.date !== report.date || recovery?.date !== report.date) {
        summary.append(node("p", "Use this as training history. A session suggestion needs current readiness and recovery readings.", "muted"));
      } else {
        const caution = readiness.value < 50 || recovery.value > 12;
        summary.append(node("h3", caution ? "Rest or keep it easy" : "Start with an easy warm-up"),
          node("p", "Readiness " + fmt(readiness.value) + "/100 · Recovery time " + fmt(recovery.value) + " h. Adjust to how you feel during the warm-up.", "muted"));
      }
      content.append(summary);
    }
    const grid = node("div", null, "grid");
    const g = "Garmin Connect", i = "Intervals.icu";
    for (const config of [
      ["Readiness","readiness","/100","pink",g,false], ["Body Battery","bodyBattery","/100","cyan",g],
      ["Resting HR","restingHR","bpm","pink",g], ["HRV","hrv","ms","green",g],
      ["Sleep","sleepMinutes","min","cyan",g], ["Sleep score","sleepScore","/100","violet",g], ["Recovery time","recoveryHours","h","green",g],
      ["Acute load","acuteLoad","","cyan",g], ["Chronic load","chronicLoad","","amber",g],
      ["Load ratio","loadRatio","","violet",g], ["Fitness","fitness","","cyan",i],
      ["Fatigue","fatigue","","violet",i], ["Form","form","","green",i],
    ]) grid.append(metric(...config));
    content.append(grid);
  }

  function showTrends() {
    const list = element("trends-content");
    list.replaceChildren();
    const grid = node("div", null, "grid");
    for (const sport of model.sports) {
      const panel = card(sport);
      const sessions = (report?.activities || []).filter(row => row.sport === sport);
      const label = node("label", "Environment ", "muted");
      const select = node("select");
      for (const text of ["All","Indoor","Outdoor"]) {
        const option = node("option", text);
        option.value = text;
        select.append(option);
      }
      label.append(select);
      if (sport !== "Strength") panel.append(label);
      const view = node("div");
      const strength = sport === "Strength";
      const run = sport === "Running";
      const title = strength ? "Strength volume" : run ? "Run pace" : "Ride speed";
      const format = strength ? value => fmt(value) + " kg" : run ? value => pace(value) + "/km" : value => fmt(value) + " km/h";
      function update() {
        view.replaceChildren();
        const filtered = sessions.filter(row => select.value === "All" || row.environment === select.value);
        const rows = filtered.map(row => ({ ...row, value: strength ? row.liftedKg : row.km && row.minutes
          ? (run ? 60 * row.minutes / row.km : 60 * row.km / row.minutes) : null })).filter(row => row.value != null);
        const readout = strength && rows.length ? rows.reduce((sum, row) => sum + row.value, 0) : rows.at(-1)?.value;
        view.append(node("p", readout == null ? "—" : format(readout), "metric"),
          node("small", filtered.length + " sessions · " + rows.length + " with " + title.toLowerCase()),
          graphic(rows, { color: strength ? "violet" : run ? "green" : "cyan", format, label: title }));
        detailsButton(view, title, rows, { format, columns: ["Date", "Environment", "Time", title, "Sources"],
          row: row => [row.date, row.environment || "—", row.minutes == null ? "—" : fmt(row.minutes) + " min", format(row.value), row.sources.join(", ")] });
      }
      select.addEventListener("change", update);
      update();
      panel.append(view);
      grid.append(panel);
    }
    list.append(grid);
  }

  function showPredictions() {
    const root = element("predictions-content");
    root.replaceChildren();
    const grid = node("div", null, "grid");
    for (const sport of ["Cycling", "Running"]) {
      const ride = sport === "Cycling";
      const panel = card(sport);
      const controls = node("div", null, "controls");
      const environmentLabel = node("label", "Environment");
      const environment = node("select");
      for (const value of ["Outdoor", "Indoor"]) environment.append(node("option", value));
      environmentLabel.append(environment);
      const targetLabel = node("label", ride ? "Target watts" : "Target pace (min/km)");
      const target = node("input");
      target.type = ride ? "number" : "text";
      if (ride) { target.min = "1"; target.max = "1000"; }
      target.placeholder = ride ? "Watts" : "min:sec";
      targetLabel.append(target);
      const ceilingLabel = node("label", "HR ceiling (bpm)");
      const ceiling = node("input");
      ceiling.type = "number";
      ceiling.min = "30";
      ceiling.max = "260";
      ceilingLabel.append(ceiling);
      controls.append(environmentLabel, targetLabel, ceilingLabel);
      const outcome = node("div", null, "stack");
      function update() {
        const rows = model.matchingEfforts(report?.efforts || [], sport, environment.value);
        const predicted = model.hrEstimate(rows, ride ? target.valueAsNumber : parsePace(target.value), sport);
        const atCeiling = model.ceilingReference(rows, ceiling.valueAsNumber, sport);
        const output = predicted ? predicted.bpm + " bpm" : "—";
        const boundary = atCeiling?.reference;
        const formatEffort = value => ride ? fmt(value) + " W" : pace(value) + "/km";
        outcome.replaceChildren(
          node("h3", "HR at target " + (ride ? "power" : "pace")), node("p", output, "metric"),
          node("small", predicted ? predicted.low + "–" + predicted.high + " bpm across " + predicted.days + " comparable days"
            : "Needs paired efforts on two comparable days within the recorded range."),
          node("h3", (ride ? "Power" : "Pace") + " at HR ceiling"), node("p", boundary == null ? "—" : formatEffort(boundary), "metric"),
          node("small", atCeiling ? atCeiling.over + " of " + atCeiling.days + " measured days exceeded the ceiling. The reference needs two days within the ceiling."
            : "Enter a ceiling to check measured peaks." ));
        const history = rows.map(row => ({ ...row, value: row.bpm }));
        detailsButton(outcome, sport + " paired efforts", history, {
          color: "pink", format: value => fmt(value) + " bpm", columns: ["Date", "Effort", "Time", "HR", "Peak HR", "Source"],
          row: row => [row.date, formatEffort(row.effort), fmt(row.minutes) + " min", fmt(row.bpm) + " bpm", fmt(row.peakHR), row.source],
        });
      }
      for (const control of [environment, target, ceiling]) control.addEventListener("input", update);
      update();
      panel.append(controls, outcome);
      grid.append(panel);
    }
    root.append(grid);
  }

  function render() { showDaily(); showTrends(); showPredictions(); }
  for (const button of document.querySelectorAll("[data-view]")) {
    button.addEventListener("click", () => {
      const selected = button.dataset.view;
      for (const current of document.querySelectorAll("[data-view]")) {
        element(current.dataset.view).hidden = current !== button;
        if (current === button) current.setAttribute("aria-current", "page");
        else current.removeAttribute("aria-current");
      }
      element(selected + "-title").focus();
    });
    element(button.dataset.view + "-title").tabIndex = -1;
  }

  window.addEventListener("performance-desk-live", event => {
    if (event.detail) {
      report = model.normalize(event.detail);
      mode = "live";
      element("feedback").textContent = "Connected report · " + report.date;
    } else if (mode === "live") {
      report = null;
      mode = null;
      element("feedback").textContent = "";
    }
    render();
  });
  element("report-input").addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 10_000_000) throw Error("The report file is too large. Ask GPT for a smaller report.");
      report = model.normalize(JSON.parse(await file.text()));
      mode = "file";
      render();
      element("feedback").textContent = "Report loaded · " + report.date;
    } catch (error) {
      element("feedback").textContent = error instanceof SyntaxError ? "This file is not valid JSON." : error.message;
    } finally {
      event.target.value = "";
    }
  });
  render();
})();
