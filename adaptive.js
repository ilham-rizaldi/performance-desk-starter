(() => {
  "use strict";

  const storageKey = "performance-desk.workouts.v1";
  const model = globalThis.PerformanceData;
  const sports = ["Cycling", "Running"];
  const environments = ["Outdoor", "Indoor"];
  const byDate = (a, b) => a.date.localeCompare(b.date);
  const fieldNumber = (value, min, max) => value.trim() ? model.number(Number(value), min, max) : null;

  function pace(seconds) {
    const total = Math.round(seconds);
    return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
  }

  function parseTarget(value, sport) {
    if (sport === "Cycling") return fieldNumber(value, 1, 1000);
    const match = /^([0-9]{1,2}):([0-5][0-9])$/.exec(value.trim());
    return match ? model.number(Number(match[1]) * 60 + Number(match[2]), 120, 1800) : null;
  }

  globalThis.PerformanceAdaptive = function ({ node, card, fmt, graphic, detailsButton, getReport, canSave }) {
    function readPlans() {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      return Array.isArray(stored) ? stored.filter(plan => plan && sports.includes(plan.sport)
        && environments.includes(plan.environment) && typeof plan.date === "string" && Number.isFinite(plan.savedAt)) : [];
    }
    let plans = [];
    try { plans = readPlans(); }
    catch { /* Local storage may be unavailable. */ }

    function save(next) {
      localStorage.setItem(storageKey, JSON.stringify(next.sort(byDate).slice(-180)));
      plans = next.slice(-180);
    }

    const effortText = (value, sport) => sport === "Cycling" ? fmt(value) + " W" : pace(value) + " /km";
    const bpm = value => fmt(value) + " bpm";
    const time = seconds => Math.floor(seconds / 60) + "m " + String(seconds % 60).padStart(2, "0") + "s";
    const range = estimate => estimate.low === estimate.high ? bpm(estimate.low) : fmt(estimate.low) + "–" + bpm(estimate.high);
    const metric = (label, value) => {
      const item = node("div", null, "adaptive-value");
      item.append(node("span", label), node("strong", value));
      return item;
    };

    function field(label, control) {
      const item = node("label", null, "adaptive-field");
      item.append(node("span", label), control);
      return item;
    }

    function select(values) {
      const item = node("select");
      for (const value of values) item.append(node("option", value));
      return item;
    }

    function review(plan, data, refresh, canCancel = false) {
      const section = node("section", null, "workout-review");
      const header = node("div", null, "workout-review-header");
      const date = canCancel && plan.date === data.date ? "" : plan.date + " · ";
      header.append(node("h3", date + plan.sport + " · " + plan.environment));
      section.append(header);
      if (canCancel && !plan.actual) {
        const cancel = node("button", "Cancel target", "adaptive-cancel");
        cancel.type = "button";
        const feedback = node("p", null, "muted");
        feedback.setAttribute("role", "status");
        cancel.addEventListener("click", () => {
          try {
            save(readPlans().filter(item => item.actual || item.date !== plan.date
              || item.sport !== plan.sport || item.savedAt !== plan.savedAt));
            refresh(true);
          } catch { feedback.textContent = "This browser could not cancel your target."; }
        });
        header.append(cancel);
        section.append(feedback);
      }
      const actual = plan.actual ?? model.workoutActual(data.efforts, plan);
      const values = node("div", null, "adaptive-values");
      values.append(metric("Saved target", effortText(plan.target, plan.sport)), metric("HR ceiling", bpm(plan.ceiling)));
      if (plan.forecast) values.append(metric("Expected HR", bpm(plan.forecast.bpm)), metric("Recorded range", range(plan.forecast)));
      if (actual.state === "matched") values.append(metric("Observed HR", bpm(actual.bpm)));
      section.append(values);
      if (actual.state !== "matched") {
        const messages = {
          waiting: "Once you sync a session that matches your saved target, you’ll see your actual HR here.",
          "off-target": "Your session is in. Its steady efforts were outside your saved target range.",
          multiple: "Several sessions matched this target. A single match is needed to score the forecast.",
        };
        section.append(node("p", messages[actual.state], "muted"));
        return section;
      }
      const evidence = [
        "You averaged " + bpm(actual.bpm) + " toward the end of a steady " + actual.minutes + " min block at " + effortText(actual.effort, plan.sport) + ".",
        actual.measuredSeconds > 0 ? (actual.secondsOver === 0 ? "You stayed at or below your ceiling for all " + time(actual.measuredSeconds)
          + " of recorded time." : "You spent " + time(actual.secondsOver) + " above your ceiling out of " + time(actual.measuredSeconds) + " recorded.") : null,
        plan.forecast ? "Your HR was " + fmt(Math.abs(actual.bpm - plan.forecast.bpm)) + " bpm from the estimate." : "You can use this block as a reference for a future session.",
      ].filter(Boolean);
      section.append(node("p", evidence.join(" "), "muted"));
      if (plan.actual) {
        if (plan.rpe != null) section.append(node("p", "RPE " + plan.rpe + "/10", "muted"));
        return section;
      }
      const form = node("form", null, "adaptive-review-form");
      const input = node("input");
      Object.assign(input, { type: "number", min: 1, max: 10, step: 1, placeholder: "1–10" });
      const button = node("button", "Save result");
      button.type = "submit";
      const feedback = node("p", null, "muted");
      feedback.setAttribute("role", "status");
      form.append(field("Session RPE (optional)", input), button, feedback);
      form.addEventListener("submit", event => {
        event.preventDefault();
        try {
          save(plans.map(item => item === plan ? { ...item, actual, rpe: input.value ? Number(input.value) : null } : item));
          refresh();
        } catch { feedback.textContent = "This browser could not save your result."; }
      });
      section.append(form);
      return section;
    }

    function daily(selectedSport) {
      const data = getReport();
      if (!data || !canSave()) return null;
      const today = model.currentDate(data.timezone);
      const panel = card("Adaptive Workout", "adaptive-panel");
      const sport = select(sports), environment = select(environments), target = node("input");
      const minutes = node("input"), ceiling = node("input");
      const form = node("form", null, "adaptive-form");
      const targetField = field("", target);
      const decision = node("div", null, "adaptive-decision");
      const summary = node("p", null, "muted");
      const saveButton = node("button", "Save pre-workout target", "adaptive-primary");
      const feedback = node("p", null, "muted");
      const content = node("div", null, "adaptive-content");
      const refresh = (focusTarget = false) => {
        const updated = daily(sport.value);
        panel.replaceWith(updated);
        if (focusTarget) (updated.querySelector('.adaptive-form input[type="text"]') ?? updated.querySelector("select")).focus();
      };
      saveButton.type = "submit";
      feedback.setAttribute("role", "status");
      Object.assign(minutes, { type: "number", min: 13, max: 90, step: 1, required: true });
      Object.assign(ceiling, { type: "number", min: 40, max: 230, step: 1, required: true });
      Object.assign(target, { type: "text", required: true });
      sport.value = selectedSport ?? data.plannedWorkouts.find(row => row.date === today)?.sport ?? sports[0];

      const currentPlan = () => plans.find(plan => plan.date === today && plan.sport === sport.value);
      const calendar = () => data.plannedWorkouts.filter(row => row.sport === sport.value && row.date >= today);
      const preview = () => {
        const plan = {
          date: today, sport: sport.value, environment: environment.value,
          target: parseTarget(target.value, sport.value),
          ceiling: fieldNumber(ceiling.value, 40, 230),
        };
        const duration = fieldNumber(minutes.value, 13, 90);
        const adjustment = model.workoutAdjustment(data, today, duration ?? 0);
        const estimate = plan.target == null ? null : model.workoutForecast(data.efforts, plan);
        const values = node("div", null, "adaptive-values");
        const nearCeiling = (estimate?.daysOverCeiling ?? 0) > 0 || (plan.ceiling != null && estimate?.high >= plan.ceiling);
        if (duration && adjustment.minutes) values.append(metric("Easy session", adjustment.minutes + " min"));
        if (estimate) {
          values.append(metric("Estimated HR", bpm(estimate.bpm)), metric("Range across those days", range(estimate)));
          decision.replaceChildren(node("h3", adjustment.title), node("p", adjustment.note, "muted"), values,
            node("p", "Based on " + estimate.days + " days when you held a similar " + (plan.sport === "Cycling" ? "power" : "pace") + ".", "muted"),
            node("p", nearCeiling
              ? (estimate.daysOverCeiling ? "Your HR went over this ceiling on " + estimate.daysOverCeiling + " of "
                + estimate.measuredPeakDays + " comparable days with peak readings. Start at an easier effort."
                : "Your settled HR reached this ceiling at a similar effort. Give yourself room by starting easier.")
              : "Back off if HR stays above your ceiling or the warm-up feels harder than usual.", "muted"));
        } else {
          decision.replaceChildren(node("h3", adjustment.title), node("p", adjustment.note, "muted"), values,
            node("p", "You’ll get an HR estimate once you have steady efforts near this target on at least two days.", "muted"));
        }
        const gentler = adjustment.minutes && (!estimate || nearCeiling) ? model.gentlerWorkoutTarget(data.efforts, plan) : null;
        if (gentler) {
          const use = node("button", "Use " + effortText(gentler, plan.sport), "adaptive-alternative");
          use.type = "button";
          use.addEventListener("click", () => {
            target.value = plan.sport === "Cycling" ? String(gentler) : pace(gentler);
            preview();
            target.focus();
          });
          decision.append(node("p", "On at least two days, similar efforts stayed within your HR ceiling.", "muted"), use);
        }
        saveButton.disabled = !adjustment.minutes || plan.target == null || plan.ceiling == null;
        if (saveButton.disabled) return null;
        return { ...plan, minutes: adjustment.minutes, forecast: estimate, savedAt: Date.now() };
      };
      const renderSport = () => {
        const saved = currentPlan();
        const scheduled = calendar()[0];
        const cycling = sport.value === "Cycling";
        const defaults = model.workoutDefaults(data.context, sport.value, today);
        summary.textContent = scheduled ? (scheduled.date === data.date ? "On today’s calendar" : "On your calendar for " + scheduled.date) + " · " + scheduled.name
          + (scheduled.minutes ? " · " + fmt(scheduled.minutes) + " min planned" : "") : "Pick an easy target and save it before you start so you can see how the session went.";
        targetField.firstElementChild.textContent = cycling ? "Steady target (W)" : "Steady pace (min/km)";
        target.inputMode = cycling ? "decimal" : "text";
        target.placeholder = cycling ? "Watts" : "mm:ss";
        target.value = defaults.target > 0 ? cycling ? String(defaults.target) : pace(defaults.target) : "";
        minutes.value = Math.min(90, Math.max(13, Math.round((scheduled?.date === today && scheduled.minutes) || defaults.minutes || 30)));
        ceiling.value = Number.isFinite(defaults.ceiling) ? defaults.ceiling : "";
        environment.value = data.efforts.findLast(row => row.sport === sport.value)?.environment ?? "Outdoor";
        feedback.textContent = "";
        content.replaceChildren(saved ? review(saved, data, refresh, true) : form);
        if (!saved) preview();
      };
      form.append(field("Environment", environment), targetField, field("Duration (min)", minutes), field("HR ceiling (bpm)", ceiling),
        decision, saveButton, feedback);
      form.addEventListener("input", preview);
      form.addEventListener("submit", event => {
        event.preventDefault();
        const plan = preview();
        if (!plan || currentPlan()) return;
        try { save([...plans, plan]); refresh(); }
        catch { feedback.textContent = "This browser could not save your target."; }
      });
      sport.addEventListener("change", renderSport);
      panel.append(field("Sport", sport), summary, content);
      renderSport();
      return panel;
    }

    function trends() {
      const data = getReport();
      if (!data || !canSave()) return null;
      const panel = card("Workout review", "adaptive-panel");
      const weekly = node("div", null, "adaptive-weekly");
      for (const sport of sports) {
        for (const environment of environments) {
          const comparison = model.weeklyEffort(data.efforts, data.date, sport, environment);
          if (!comparison) continue;
          const item = node("section", null, "workout-review");
          const values = node("div", null, "adaptive-values");
          values.append(metric("Last 7 days", effortText(comparison.current, sport)),
            metric("Prior 7 days", effortText(comparison.previous, sport)));
          item.append(node("h3", sport + " · " + environment), values,
            node("p", "Here’s how your steady efforts compare at " + comparison.low + "–" + comparison.high + " bpm, using "
              + comparison.currentDays + " days this week and " + comparison.previousDays + " in the prior week.", "muted"));
          weekly.append(item);
        }
      }
      if (weekly.childElementCount) panel.append(node("h3", "Weekly progress at similar HR"), weekly);
      const groups = new Map();
      for (const plan of plans.filter(row => row.date <= data.date && row.actual?.state === "matched")) {
        const label = plan.sport + " · " + plan.environment;
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(plan);
      }
      for (const [label, rows] of groups) {
        const section = node("section", null, "workout-review");
        const scored = rows.filter(row => row.forecast);
        const expected = scored.map(row => ({ date: row.date, value: row.forecast.bpm }));
        const actual = rows.map(row => ({ date: row.date, value: row.actual.bpm }));
        const band = scored.map(row => ({ date: row.date, low: row.forecast.low, high: row.forecast.high }));
        const options = { axes: true, size: "history", label: "Expected and observed HR for " + label, seriesName: "Observed HR",
          overlay: expected, overlayName: "Expected HR", overlayColor: "pink", color: "cyan", band, bandName: "Recorded range", format: bpm };
        section.append(node("h3", label));
        if (scored.length) {
          const error = scored.reduce((sum, row) => sum + Math.abs(row.forecast.bpm - row.actual.bpm), 0) / scored.length;
          const covered = scored.filter(row => row.actual.bpm >= row.forecast.low && row.actual.bpm <= row.forecast.high).length;
          section.append(node("p", "Your HR was within the forecast range on " + covered + " of " + scored.length
            + " blocks. On average, the estimate was " + fmt(error) + " bpm from your actual HR.", "muted"));
        }
        section.append(graphic(actual, options));
        detailsButton(section, label, actual, { ...options, tableRows: rows,
          columns: ["Date", "Target", "Expected HR", "Observed HR", "Time over ceiling", "RPE"],
          row: row => [row.date, effortText(row.target, row.sport), row.forecast ? bpm(row.forecast.bpm) : "—", bpm(row.actual.bpm),
            row.actual.measuredSeconds > 0 ? time(row.actual.secondsOver) + " / " + time(row.actual.measuredSeconds) : "—", row.rpe ?? "—"],
        });
        panel.append(section);
      }
      const refresh = () => panel.replaceWith(trends());
      for (const plan of plans.filter(row => row.date <= data.date && !row.actual).slice(-6).reverse()) panel.append(review(plan, data, refresh));
      if (!panel.querySelector("section")) return null;
      return panel;
    }

    return { daily, trends };
  };
})();
