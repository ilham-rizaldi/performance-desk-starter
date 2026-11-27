(() => {
  "use strict";
  const local = location.protocol === "http:" && location.hostname === "127.0.0.1";
  const dialog = document.getElementById("connections");
  const cards = document.getElementById("connection-cards");
  const note = document.getElementById("connection-status");
  const keyForm = document.getElementById("key-form");
  const keyInput = document.getElementById("source-key");
  const syncButton = document.getElementById("sync-now");
  const keyPages = { garmin: "https://connect.garmin.com/app/settings/personalApiToken",
    intervals: "https://intervals.icu/settings" };
  const keyLabels = { garmin: "Garmin Personal API key", intervals: "Intervals.icu API key" };
  let current, provider, updating = false, signature;

  function node(tag, content) {
    const item = document.createElement(tag);
    item.textContent = content;
    return item;
  }

  function button(label, click) {
    const item = node("button", label);
    item.type = "button";
    item.addEventListener("click", click);
    return item;
  }

  function link(title, target) {
    const item = node("a", title);
    item.href = target;
    item.target = "_blank";
    item.rel = "noreferrer";
    return item;
  }

  async function api(path, data) {
    const options = { cache: "no-store", headers: { "X-Performance-Desk": "1" } };
    if (data !== undefined) {
      options.method = "POST";
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(data);
    }
    const response = await fetch(path, options);
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "Could not reach the local connection.");
    return result;
  }

  function showKey(source) {
    provider = source.id;
    document.getElementById("key-label").textContent = keyLabels[provider];
    keyForm.querySelector("a").href = keyPages[provider];
    keyInput.value = "";
    keyForm.hidden = false;
    keyInput.focus();
  }

  async function act(task) {
    if (updating) return;
    updating = true;
    note.textContent = "Working…";
    try { await task(); note.textContent = ""; }
    catch (error) { note.textContent = error.message; }
    finally { updating = false; }
  }

  function show(state) {
    current = state;
    const serialized = JSON.stringify(state.report);
    if (signature !== serialized) {
      signature = serialized;
      window.dispatchEvent(new CustomEvent("performance-desk-live", { detail: state.report }));
    }
    const saveFocus = document.activeElement?.dataset?.connection;
    const elements = [];
    for (const source of state.connections) {
      const card = node("article", "");
      card.className = "card";
      card.append(node("h3", source.name), node("p", source.syncing ? "Sync in progress" : source.connected
        ? source.lastSync ? "Last synced " + new Date(source.lastSync).toLocaleString() : "Waiting for first sync" : "Ready to connect"));
      if (source.error) card.append(node("p", source.error));
      for (const detail of source.notices) card.append(node("p", detail));
      const connect = button(source.connected ? "Reconnect" : "Connect", () => {
        if (source.oauth) void act(async () => { location.assign((await api("/api/intervals/authorize", {})).url); });
        else showKey(source);
      });
      connect.dataset.connection = source.id;
      connect.setAttribute("aria-label", connect.textContent + " " + source.name);
      card.append(connect);
      if (source.oauth) card.append(button("Use personal key", () => showKey(source)));
      if (source.connected) card.append(button("Disconnect", () => act(async () => show(await api("/api/" + source.id + "/disconnect", {})))));
      elements.push(card);
    }
    const strava = node("article", "");
    strava.className = "card";
    strava.append(node("h3", "Strava"), node("p", "For personal AI use, check availability of the official Strava MCP. This dashboard syncs Garmin and Intervals.icu."),
      link("Strava’s integration policy", "https://www.strava.com/legal/api_policy"));
    cards.replaceChildren(...elements, strava);
    if (saveFocus) cards.querySelector('[data-connection="' + saveFocus + '"]')?.focus();
    syncButton.hidden = !state.connections.some(source => source.connected);
  }

  async function check() {
    if (updating) return;
    try {
      const state = await api("/api/state");
      if (JSON.stringify(state) !== JSON.stringify(current)) show(state);
    } catch { if (dialog.open) note.textContent = "The local app is unavailable. Start it again and reopen this page."; }
  }

  document.getElementById("show-connections").addEventListener("click", () => {
    dialog.showModal();
    if (local) void check();
    else {
      const status = node("p", "Automatic sync runs in your private app.");
      cards.replaceChildren(status, link("Open private app", "http://127.0.0.1:4176/"), link("Set up automatic sync", "https://github.com/ilham-rizaldi/performance-desk-starter/blob/main/SYNC.md"));
    }
  });
  keyForm.addEventListener("submit", event => {
    event.preventDefault();
    if (!provider || !local) return;
    const key = keyInput.value;
    keyInput.value = "";
    void act(async () => {
      show(await api("/api/" + provider + "/connect", { key }));
      keyForm.hidden = true;
    });
  });
  dialog.addEventListener("close", () => { keyForm.hidden = true; keyInput.value = ""; });
  syncButton.addEventListener("click", () => act(async () => show(await api("/api/sync", {}))));
  if (local) {
    void check();
    setInterval(check, 30000);
  }
})();
