(() => {
  "use strict";
  const model = globalThis.PerformanceData;
  const element = id => document.getElementById(id);
  const metricColors = { cyan: "#56e8f4", pink: "#ff77a8", green: "#7aefa8", violet: "#be9cff", amber: "#ffc572" };
  let report = null;

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
  const dayMs = 86400000;
  const axisDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const reportDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const chartRedraw = new WeakMap();
  const chartSize = new ResizeObserver(entries => {
    for (const entry of entries) chartRedraw.get(entry.target)?.();
  });
  const chartCleanup = new MutationObserver(records => {
    for (const record of records) for (const item of record.removedNodes) {
      if (item.nodeType !== Node.ELEMENT_NODE || item.isConnected) continue;
      if (chartRedraw.has(item)) chartSize.unobserve(item);
      for (const canvas of item.querySelectorAll("canvas.chart")) chartSize.unobserve(canvas);
    }
  });
  chartCleanup.observe(document.body, { childList: true, subtree: true });

  function chartScale(values, zeroFloor) {
    const low = Math.min(...values), high = Math.max(...values);
    const padding = low === high ? Math.max(.1, Math.abs(low) * .1) : 0;
    const bottom = zeroFloor ? 0 : low - padding;
    const top = high + padding;
    const rawStep = (top - bottom) / 4;
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const step = [1, 2, 2.5, 5, 10].find(value => value * magnitude >= rawStep) * magnitude;
    const min = Math.floor(bottom / step) * step, max = Math.ceil(top / step) * step;
    const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step);
    return { min, max, ticks };
  }

  function chartRuns(rows, gapDays) {
    const runs = [];
    for (const row of rows) {
      const run = runs.at(-1), previous = run?.at(-1);
      if (!previous || row.time - previous.time > gapDays * dayMs) runs.push([row]);
      else run.push(row);
    }
    return runs;
  }

  function graphic(rows, {
    color = "cyan", format = fmt, label = "History", seriesName, overlay = [], overlayColor = "amber", overlayName,
    overlayFormat = format, overlayAxis,
    band = [], bandName, axes = false, size = "standard", zeroFloor = false, gapDays = 7, dateDomain = [],
    plotBackground, area = false, zones = [], axisTicks, tooltipRows, tooltipReadings, markReadings = axes, linkedDate,
  } = {}) {
    const timed = list => list.map(row => ({ ...row, time: Date.parse(row.date) })).sort((a, b) => a.time - b.time);
    const series = [
      { items: timed(rows), name: seriesName ?? (overlay.length ? label : ""), color, format },
      { items: timed(overlay), name: overlayName ?? "Comparison", color: overlayColor, format: overlayFormat, dashed: true, secondary: !!overlayAxis },
    ].filter(entry => entry.items.length);
    if (!series.length) return node("p", "No recorded values for this chart.", "muted");

    const ranges = timed(band);
    const data = new Map();
    for (const line of series) {
      line.byTime = new Map(line.items.map(row => [row.time, row]));
      line.runs = chartRuns(line.items, gapDays);
      for (const row of line.items) if (!data.has(row.time)) data.set(row.time, row);
    }
    const rangeByTime = new Map(ranges.map(row => [row.time, row]));
    const timestamps = linkedDate?.dates ?? [...data.keys()].sort((a, b) => a - b);
    const xMin = Math.min(timestamps[0], ranges[0]?.time ?? Infinity, ...dateDomain);
    const xMax = Math.max(timestamps.at(-1), ranges.at(-1)?.time ?? -Infinity, ...dateDomain);
    const bounds = zones.flatMap(zone => [zone.low, zone.high]).filter(Number.isFinite);
    const secondary = series.find(line => line.secondary);
    const secondaryScale = secondary ? chartScale(secondary.items.map(row => row.value), false) : null;
    const values = [...series.filter(line => !line.secondary).flatMap(line => line.items.map(row => row.value)), ...ranges.flatMap(row => [row.low, row.high]), ...bounds];
    if (!values.length && secondary) values.push(...secondary.items.map(row => row.value));
    const scale = chartScale(values, zeroFloor);
    const min = axisTicks && Math.min(...values) >= axisTicks[0] ? axisTicks[0] : scale.min;
    const max = axisTicks && Math.max(...values) <= axisTicks.at(-1) ? axisTicks.at(-1) : scale.max;
    const ticks = axisTicks ? [min, ...axisTicks.filter(value => value > min && value < max), max] : scale.ticks;
    const bandRuns = chartRuns(ranges, gapDays);
    const output = node("div", null, "chart-frame chart-frame--" + size);
    const canvas = node("canvas", null, "chart");
    const tooltip = node("div", null, "chart-tooltip");
    tooltip.setAttribute("role", "status");
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", label + ". Use left and right arrows to read values.");
    const context = canvas.getContext("2d");
    let selected = timestamps.length - 1, active = false, geometry;
    if (linkedDate) {
      selected = Math.max(0, timestamps.indexOf(linkedDate.current));
      linkedDate.bind((time, showTooltip = true) => {
        if (time == null) { clearHover(); return; }
        const index = timestamps.indexOf(time);
        if (index < 0) return;
        if (linkedDate.mirrorHover && (showTooltip || !linkedDate.retainCursor)) {
          reveal(index, { announce: false, showTooltip });
          return;
        }
        if (index === selected && !active) return;
        selected = index;
        clearHover();
      });
    }

    function draw() {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.round(bounds.width), height = Math.round(bounds.height);
      if (!width || !height || !context) return;
      const scale = window.devicePixelRatio || 1;
      const pixelWidth = Math.round(width * scale), pixelHeight = Math.round(height * scale);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
      context.clearRect(0, 0, width, height);
      context.font = "11px DM Sans, Arial, sans-serif";
      const axisValue = value => fmt(value, 2);
      const tickWidth = labels => Math.ceil(Math.max(...labels.map(value => context.measureText(axisValue(value)).width)));
      const left = linkedDate ? 46 : axes ? Math.max(37, tickWidth(ticks) + 12) : 5;
      const right = width - (linkedDate ? 43 : axes ? (secondaryScale ? Math.max(30, tickWidth(secondaryScale.ticks) + 12) : 14) : 5);
      const top = axes ? (secondaryScale ? 24 : 12) : 4, bottom = height - (axes ? 27 : 4);
      const x = time => xMin === xMax ? (left + right) / 2 : left + (right - left) * (time - xMin) / (xMax - xMin);
      const y = value => bottom - (bottom - top) * (value - min) / (max - min);
      const ySecondary = value => bottom - (bottom - top) * (value - secondaryScale.min) / (secondaryScale.max - secondaryScale.min);
      geometry = { x, width };

      if (plotBackground) {
        context.fillStyle = plotBackground;
        context.fillRect(left, top, right - left, bottom - top);
      }
      for (const zone of zones) {
        const low = Math.max(min, zone.low ?? min), high = Math.min(max, zone.high ?? max);
        if (high <= low) continue;
        const xSize = right - left, yStart = y(high), ySize = y(low) - yStart;
        context.fillStyle = zone.color;
        context.fillRect(left, yStart, xSize, ySize);
        if (zone.edgeColor) {
          context.strokeStyle = zone.edgeColor;
          context.lineWidth = 1;
          context.setLineDash([]);
          context.strokeRect(left, yStart, xSize, ySize);
        }
      }
      if (axes) {
        context.fillStyle = secondaryScale ? metricColors[color] : "#a6afbc";
        context.lineWidth = 1;
        context.textAlign = "right";
        context.textBaseline = "middle";
        for (const value of ticks) {
          const coordinate = y(value);
          context.strokeStyle = zones.length ? "#e6dfff24" : "#2a3440";
          context.setLineDash(value === min || zones.length ? [] : [2, 4]);
          context.beginPath();
          context.moveTo(left, coordinate);
          context.lineTo(right, coordinate);
          context.stroke();
          context.fillText(axisValue(value), left - 7, coordinate);
        }
        context.setLineDash([]);
        if (secondaryScale) {
          context.fillText(overlayAxis.leftUnit, left - 7, 10);
          context.textAlign = "left";
          context.fillStyle = metricColors[secondary.color];
          context.fillText(overlayAxis.rightUnit, right + 7, 10);
          for (const value of secondaryScale.ticks) context.fillText(axisValue(value), right + 7, ySecondary(value));
        }
        context.textBaseline = "top";
        context.fillStyle = "#a6afbc";
        const steps = Math.max(1, Math.min(5, Math.floor((right - left) / 92)));
        const dates = xMin === xMax ? [xMin] : [...new Set(Array.from({ length: steps + 1 }, (_, i) =>
          xMin + Math.round((xMax - xMin) / dayMs * i / steps) * dayMs))];
        dates.forEach((time, i) => {
          context.textAlign = dates.length === 1 ? "center" : i === 0 ? "left" : i === dates.length - 1 ? "right" : "center";
          context.fillText(axisDate.format(time), x(time), bottom + 8);
        });
      }

      for (const run of bandRuns) {
        if (run.length < 2) continue;
        context.fillStyle = "#7aefa824";
        context.beginPath();
        for (const row of run) context.lineTo(x(row.time), y(row.high));
        for (const row of [...run].reverse()) context.lineTo(x(row.time), y(row.low));
        context.closePath();
        context.fill();
      }

      function traceLine(run, project) {
        context.beginPath();
        context.moveTo(x(run[0].time), project(run[0].value));
        for (let i = 1; i < run.length; i++) {
          const start = run[i - 1], end = run[i], mid = (x(start.time) + x(end.time)) / 2;
          context.bezierCurveTo(mid, project(start.value), mid, project(end.value), x(end.time), project(end.value));
        }
      }
      for (const line of series) {
        const project = line.secondary ? ySecondary : y;
        context.strokeStyle = context.fillStyle = metricColors[line.color];
        context.lineWidth = axes ? (line.dashed ? 1.6 : 2.35) : 1.4;
        context.lineCap = "round";
        context.setLineDash(line.dashed ? [4, 3] : []);
        for (const run of line.runs) {
          if (area && !line.dashed && run.length > 1) {
            const shade = context.createLinearGradient(0, top, 0, bottom);
            shade.addColorStop(0, metricColors[line.color] + "35");
            shade.addColorStop(1, metricColors[line.color] + "04");
            traceLine(run, project);
            context.lineTo(x(run.at(-1).time), bottom);
            context.lineTo(x(run[0].time), bottom);
            context.closePath();
            context.fillStyle = shade;
            context.fill();
            context.fillStyle = metricColors[line.color];
          }
          traceLine(run, project);
          context.stroke();
        }
        context.setLineDash([]);
        const points = markReadings ? line.items : line.runs.filter(run => run.length === 1).flat();
        for (const row of points) {
          context.beginPath();
          context.arc(x(row.time), project(row.value), axes ? (row === line.items.at(-1) ? 3.5 : 1.6) : 1.5, 0, Math.PI * 2);
          context.fill();
        }
      }

      if (!active && (!linkedDate || (linkedDate.mirrorHover && !linkedDate.retainCursor))) return;
      const time = timestamps[selected], cursor = x(time);
      context.strokeStyle = "#a7b4c278";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(cursor, top);
      context.lineTo(cursor, bottom);
      context.stroke();
      for (const line of series) {
        const row = line.byTime.get(time);
        if (!row) continue;
        context.beginPath();
        context.arc(cursor, (line.secondary ? ySecondary : y)(row.value), axes ? 4.6 : 3.2, 0, Math.PI * 2);
        context.fillStyle = metricColors[line.color];
        context.fill();
        context.strokeStyle = "#e8f0f7";
        context.stroke();
      }
    }

    function reveal(index, { announce = true, showTooltip = true } = {}) {
      const changed = selected !== index || !active || showTooltip !== tooltip.classList.contains("is-visible");
      selected = index;
      active = true;
      if (changed && announce) linkedDate?.onChange(timestamps[index]);
      if (!showTooltip) {
        hideTooltip();
        if (changed) draw();
        return;
      }
      if (changed) {
        const time = timestamps[selected];
        const items = tooltipReadings?.(time) ?? series.flatMap(line => {
          const row = line.byTime.get(time);
          return row ? [[line.name, line.format(row.value), line.color]] : [];
        });
        if (tooltipRows) items.push(...tooltipRows(time));
        const range = rangeByTime.get(time);
        if (range && bandName) items.push([bandName, format(range.low) + "–" + format(range.high), "green"]);
        if (!items.length && linkedDate) items.push(["Reading", "—", "#b0b5c0"]);
        tooltip.replaceChildren(...items.map(([name, value, key]) => {
          const line = node("div", null, "chart-tooltip-row");
          if (name) line.append(node("span", name));
          const number = node("strong", value);
          number.style.color = metricColors[key] ?? key;
          line.append(number);
          return line;
        }));
        tooltip.classList.add("is-visible");
        draw();
      }
      positionTooltip();
    }

    function positionTooltip() {
      if (!geometry) return;
      const { x, width } = geometry, tooltipWidth = tooltip.offsetWidth, cursor = x(timestamps[selected]);
      const next = cursor > width / 2 ? cursor - tooltipWidth - 10 : cursor + 10;
      tooltip.style.left = Math.max(0, Math.min(width - tooltipWidth, next)) + "px";
    }

    function chooseByPointer(event) {
      if (!geometry) return;
      const cursor = event.clientX - canvas.getBoundingClientRect().left;
      const nearest = timestamps.reduce((best, time, i) =>
        Math.abs(geometry.x(time) - cursor) < Math.abs(geometry.x(timestamps[best]) - cursor) ? i : best, 0);
      reveal(nearest);
    }
    function hideTooltip() {
      tooltip.classList.remove("is-visible");
      tooltip.style.removeProperty("left");
    }
    function clearHover() {
      active = false;
      hideTooltip();
      draw();
    }
    function hide() {
      if (!active) return;
      clearHover();
      linkedDate?.onLeave?.();
    }
    canvas.addEventListener("pointermove", chooseByPointer);
    canvas.addEventListener("pointerdown", chooseByPointer);
    canvas.addEventListener("pointerleave", event => {
      if (!linkedDate?.mirrorHover || event.pointerType !== "touch") hide();
    });
    canvas.addEventListener("blur", hide);
    canvas.addEventListener("keydown", event => {
      if (event.key === "Escape" && active) { event.stopPropagation(); hide(); return; }
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const index = active || linkedDate ? selected + (event.key === "ArrowLeft" ? -1 : 1) : timestamps.length - 1;
      reveal(Math.max(0, Math.min(timestamps.length - 1, index)));
    });
    chartRedraw.set(canvas, () => {
      draw();
      if (tooltip.classList.contains("is-visible")) positionTooltip();
    });
    output.append(canvas, tooltip);
    chartSize.observe(canvas);
    return output;
  }

  function historyTable(tableRows, options) {
    const wrapper = node("div", null, "table-wrap");
    const table = node("table");
    const columns = options.columns || ["Date", options.unit || "Value"];
    const head = node("thead"), headings = node("tr");
    for (const title of columns) headings.append(node("th", title));
    head.append(headings);
    const body = node("tbody");
    for (const row of [...tableRows].reverse()) {
      const tr = node("tr");
      const values = options.row ? options.row(row) : [row.date, (options.format || fmt)(row.value)];
      for (const value of values) tr.append(node("td", value));
      body.append(tr);
    }
    table.append(head, body);
    wrapper.append(table);
    return wrapper;
  }

  function showHistory(title, rows, options = {}) {
    const container = element("detail-content");
    const tableRows = options.tableRows ?? rows;
    container.replaceChildren();
    if (options.renderCharts) {
      container.append(options.renderCharts());
    } else if (rows.length || options.overlay?.length || !tableRows.length) {
      container.append(graphic(rows, { label: title, axes: true, size: "history", ...options }));
    }
    if (tableRows.length && options.collapseHistory !== false) {
      const section = node("details", null, "history-disclosure");
      const summary = node("summary");
      summary.append(node("span", "Historical data"), node("small", tableRows.length + (tableRows.length === 1 ? " record" : " records")));
      section.append(summary);
      section.addEventListener("toggle", () => {
        if (!section.open || section.lastElementChild !== summary) return;
        if (options.renderHistoricalChart) section.append(options.renderHistoricalChart());
        section.append(historyTable(tableRows, options));
      });
      container.append(section);
    } else if (tableRows.length) {
      container.append(historyTable(tableRows, options));
    }
    element("detail-title").textContent = title;
    const dialog = element("details");
    dialog.showModal();
    dialog.scrollTop = 0;
  }

  function detailsButton(panel, title, rows, options) {
    const actions = node("div", null, "card-details");
    const details = node("button", "+ Details", "history-button");
    details.type = "button";
    details.setAttribute("aria-label", "Details for " + title);
    details.addEventListener("click", () => showHistory(title, rows, options));
    actions.append(details);
    panel.append(actions);
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
    const sleepTime = field === "sleepMinutes" && latest;
    const readout = node("p", sleepTime ? Math.floor(latest.value / 60) + "h " + Math.round(latest.value % 60) + "m" : fmt(latest?.value), "metric");
    readout.style.setProperty("--accent", metricColors[color]);
    if (latest && unit && !sleepTime) readout.append(node("small", unit));
    panel.append(readout);
    if (!latest || latest.date !== report?.date) {
      panel.append(node("small", latest ? latest.date : "No recorded reading"));
    }
    const options = { color, label, format: value => fmt(value) + (unit && unit !== "/100" ? " " + unit : unit), unit: label + (unit ? " (" + unit + ")" : "") };
    if (field === "restingHR") Object.assign(options, { axes: true, size: "rhr", area: true, plotBackground: "#0e131a" });
    if (field === "vo2") Object.assign(options, { gapDays: Infinity, markReadings: true });
    if (field === "readiness" && latest) {
      const track = node("div", null, "readiness-bar"), fill = node("span");
      fill.style.width = latest.value + "%";
      if (latest.value > 0) fill.style.setProperty("--scale", (10000 / latest.value) + "%");
      track.append(fill);
      panel.append(track);
    }
    if (chart && rows.length) {
      const preview = typeof chart === "object" ? chart : {};
      panel.append(graphic(preview.limit ? rows.slice(-preview.limit) : rows, { ...options, ...preview }));
    }
    const detail = chart?.size === "status" ? { ...options, ...chart, size: "history" } : options;
    detailsButton(panel, label, rows, detail);
    return panel;
  }

  function showDaily() {
    const content = element("daily-content");
    content.replaceChildren();
    const date = element("report-date");
    date.textContent = report ? reportDate.format(Date.parse(report.date)) : "";
    if (report) date.dateTime = report.date;
    else date.removeAttribute("datetime");
    content.append(...panels.daily());
    const workout = adaptive?.daily();
    if (workout) content.append(workout);
  }

  function showTrends() {
    const list = element("trends-content");
    list.replaceChildren(...panels.trends());
    const review = adaptive?.trends();
    if (review) list.append(review);
    const sessions = (report?.activities ?? []).filter(row => row.sport === "Strength");
    const recorded = sessions.filter(row => row.liftedKg != null);
    const records = model.strengthRecords(sessions);
    if (!recorded.length && !records.length) return;

    const strength = card("Strength progression", "strength-panel");
    if (recorded.length) {
      const total = node("p", fmt(recorded.reduce((sum, row) => sum + row.liftedKg, 0), 2), "metric strength-total");
      total.append(node("small", "kg"));
      strength.append(node("span", "Total lifted", "strength-caption"), total,
        node("p", "From " + recorded.length + (recorded.length === 1 ? " session where you recorded weight." : " sessions where you recorded weight."), "muted"));
      const unnamed = recorded.reduce((count, session) =>
        count + (session.exerciseSets ?? []).filter(set => !set.exercise && set.weightKg != null && set.reps != null).length, 0);
      if (unnamed) strength.append(node("p", "Your total includes " + unnamed + " weighted sets without an exercise name. The exercise records below use named sets.", "muted"));
      const byDate = new Map();
      for (const session of recorded) byDate.set(session.date, (byDate.get(session.date) ?? 0) + session.liftedKg);
      const volume = [...byDate].map(([date, value]) => ({ date, value }));
      const kg = value => fmt(value, 2) + " kg";
      const options = { color: "violet", label: "Daily lifting volume", format: kg, seriesName: "Volume",
        axes: true, zeroFloor: true, size: "strength", area: true, plotBackground: "#14121c" };
      strength.append(node("h3", "Daily lifting volume", "strength-chart-heading"), graphic(volume, options));
      detailsButton(strength, "Strength sessions", volume, {
        ...options, tableRows: sessions, columns: ["Date", "Session", "Recorded volume"],
        row: row => [row.date, row.name || "Strength", row.liftedKg == null ? "—" : kg(row.liftedKg)],
      });
    }

    if (records.length) {
      const section = node("section", null, "exercise-records");
      const title = node("h3", "Exercise records");
      title.id = "exercise-records-title";
      const table = node("table"), head = node("thead"), heading = node("tr");
      for (const label of ["Exercise", "Heaviest recorded set", "Date"]) heading.append(node("th", label));
      head.append(heading);
      const body = node("tbody");
      for (const record of records) {
        const row = node("tr");
        const name = node("th", record.exercise);
        name.scope = "row";
        const load = record.weightKg == null ? "Load unrecorded" : fmt(record.weightKg, 2) + " kg";
        const reps = record.reps == null ? "" : " × " + fmt(record.reps, 0) + (record.reps === 1 ? " rep" : " reps");
        row.append(name, node("td", load + reps), node("td", record.date));
        body.append(row);
      }
      table.append(head, body);
      const wrapper = node("div", null, "table-wrap exercise-record-list");
      wrapper.tabIndex = 0;
      wrapper.setAttribute("role", "region");
      wrapper.setAttribute("aria-labelledby", title.id);
      wrapper.append(table);
      section.append(title, wrapper);
      strength.append(section);
    }
    list.append(strength);
  }

  const panels = globalThis.PerformancePanels({ node, card, fmt, graphic, metric, valuesFor, showHistory, detailsButton,
    getReport: () => report, currentDate: model.currentDate, colors: metricColors });
  const adaptive = location.protocol === "http:" && location.hostname === "127.0.0.1"
    ? globalThis.PerformanceAdaptive({ node, card, fmt, graphic, detailsButton, getReport: () => report, canSave: () => Boolean(report) })
    : null;

  const viewButtons = [...document.querySelectorAll("[data-view]")];
  const referenceButton = viewButtons.find(button => button.dataset.view === "reference");

  function selectView(button, focus = false) {
    for (const current of viewButtons) {
      element(current.dataset.view).hidden = current !== button;
      if (current === button) current.setAttribute("aria-current", "page");
      else current.removeAttribute("aria-current");
    }
    if (focus) {
      if (button.dataset.view === "daily") showDaily();
      if (button.dataset.view === "trends") showTrends();
      element(button.dataset.view + "-title").focus();
    }
  }

  function render() {
    showDaily();
    showTrends();
    element("archive-content").replaceChildren(...panels.archive());
    const references = panels.reference();
    element("reference-content").replaceChildren(...references);
    referenceButton.hidden = !references.length;
    if (referenceButton.hidden && referenceButton.hasAttribute("aria-current")) selectView(viewButtons[0], true);
  }
  for (const button of viewButtons) {
    button.addEventListener("click", () => { if (!button.hidden) selectView(button, true); });
    element(button.dataset.view + "-title").tabIndex = -1;
  }

  window.addEventListener("performance-desk-live", event => {
    report = event.detail ? model.normalize(event.detail) : null;
    render();
  });
  render();
})();
