(() => {
  "use strict";
  const local = location.protocol === "http:" && location.hostname === "127.0.0.1";
  const hosted = location.origin === "https://ilham-rizaldi.github.io"
    && location.pathname.startsWith("/performance-desk-starter/");
  const hostedEndpoint = "https://performance-desk-report.ilhamngeprint.chatgpt.site/api/starter";
  const fragmentToken = hosted ? new URLSearchParams(location.hash.slice(1)).get("live") : null;
  let hostedToken = /^[A-Za-z0-9_-]{43}$/.test(fragmentToken ?? "") ? fragmentToken : null;
  const dialog = document.getElementById("connections");
  const cards = document.getElementById("connection-cards");
  const note = document.getElementById("connection-status");
  const keyForm = document.getElementById("key-form");
  const keyInput = document.getElementById("source-key");
  const syncButton = document.getElementById("sync-now");
  const headerSync = document.getElementById("header-sync");
  const headerStatus = document.getElementById("header-sync-status");
  const lock = document.getElementById("lock-live");
  lock.hidden = !hostedToken;
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
    const response = hosted
      ? await fetch(hostedEndpoint, { method: data === undefined ? "GET" : "POST", cache: "no-store",
        credentials: "omit", redirect: "error", headers: { Authorization: "Bearer " + hostedToken }, signal: AbortSignal.timeout(45000) })
      : await fetch(path, options);
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
    finally { updating = false; syncControls(); }
  }

  function syncControls() {
    const connected = current?.connections?.filter(source => source.connected) ?? [];
    for (const button of [headerSync, syncButton]) {
      button.hidden = !connected.length;
      button.disabled = updating || connected.some(source => source.syncing);
      button.textContent = button.disabled ? "Syncing…" : "Sync now";
    }
    if (!connected.length) headerStatus.textContent = "";
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
      if (local) {
        const connect = button(source.connected ? "Reconnect" : "Connect", () => {
          if (source.oauth) void act(async () => { location.assign((await api("/api/intervals/authorize", {})).url); });
          else showKey(source);
        });
        connect.dataset.connection = source.id;
        connect.setAttribute("aria-label", connect.textContent + " " + source.name);
        card.append(connect);
        if (source.oauth) card.append(button("Use personal key", () => showKey(source)));
        if (source.connected) card.append(button("Disconnect", () => act(async () => show(await api("/api/" + source.id + "/disconnect", {})))));
      }
      elements.push(card);
    }
    cards.replaceChildren(...elements);
    if (saveFocus) cards.querySelector('[data-connection="' + saveFocus + '"]')?.focus();
    syncControls();
  }

  async function check() {
    if (updating || (!local && !hostedToken)) return;
    try {
      const state = await api("/api/state");
      if (hosted && !hostedToken) return;
      if (hosted && !current?.report) headerStatus.textContent = state.report ? "" : "Waiting for the first private sync.";
      if (JSON.stringify(state) !== JSON.stringify(current)) show(state);
    } catch {
      if (hosted && hostedToken) headerStatus.textContent = "Could not open the private dashboard. Check your bookmark and try again.";
      if (dialog.open) note.textContent = local ? "The local app is unavailable. Start it again and reopen this page." : headerStatus.textContent;
    }
  }

  document.getElementById("show-connections").addEventListener("click", () => {
    dialog.showModal();
    if (local || hostedToken) void check();
    else {
      const status = node("p", "Open your private bookmark to view live data, or connect your own accounts in the local app.");
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
  async function syncNow(feedback) {
    if (updating) return;
    updating = true;
    syncControls();
    feedback.textContent = "Syncing your training data…";
    const before = new Map(current.connections.map(source => [source.id, source.lastSync]));
    try {
      const state = await api("/api/sync", {});
      if (hosted && !hostedToken) return;
      show(state);
      const connected = state.connections.filter(source => source.connected);
      feedback.textContent = state.refreshMode === "mac" ? "Refresh requested. The syncing Mac checks for requests every minute."
        : connected.some(source => source.error) ? "Some data could not sync. Check Connect accounts for details."
        : connected.some(source => source.lastSync && source.lastSync !== before.get(source.id)) ? "Sync complete."
        : "A refresh is not available yet. Check your last sync time in Connect accounts.";
    } catch (error) { feedback.textContent = error.message; }
    finally { updating = false; syncControls(); }
  }
  syncButton.addEventListener("click", () => syncNow(note));
  headerSync.addEventListener("click", () => syncNow(headerStatus));
  lock.addEventListener("click", () => {
    hostedToken = null;
    history.replaceState(null, "", location.pathname + location.search);
    lock.hidden = true;
    show({ report: null, connections: [] });
    headerStatus.textContent = "Desk locked. Reopen your private bookmark for live data.";
    if (dialog.open) dialog.close();
  });
  if (local || hostedToken) {
    if (hostedToken) {
      headerStatus.textContent = "Opening your private Performance Desk…";
      document.querySelector(".brand").addEventListener("click", event => {
        if (!hostedToken) return;
        event.preventDefault();
        document.querySelector('[data-view="daily"]').click();
      });
    }
    void check();
    setInterval(check, 30000);
  }
})();
