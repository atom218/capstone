/* Experiment Studio · shell, routing and event delegation */
"use strict";

const WORKSPACES = [
  { id: "design", name: "Design", title: "Design study",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="7" height="7" rx="2"/><rect x="14" y="4" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="6" rx="2"/><path d="M17.5 14v6M14.5 17h6"/></svg>' },
  { id: "interviews", name: "Interviews", title: "Interviews",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="4" rx="1.5"/><rect x="3" y="10" width="13" height="4" rx="1.5"/><rect x="3" y="16" width="16" height="4" rx="1.5"/></svg>' },
  { id: "evaluate", name: "Evaluate", title: "Evaluate",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h8M8 12h5M8 16h3"/><path d="M14.5 15.5l1.6 1.6 3-3.2"/></svg>' },
  { id: "compare", name: "Compare", title: "Compare results",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 8h18M3 16h18"/><circle cx="7" cy="8" r="2" fill="currentColor"/><circle cx="12" cy="16" r="2" fill="currentColor"/><circle cx="17" cy="8" r="2" fill="currentColor"/><path d="M12 10v4"/></svg>' },
];

const App = {
  ws: "design",
  actions: {},
  inputs: {},
  on(name, fn) { this.actions[name] = fn; },
  onInput(name, fn, mode) { this.inputs[name] = { fn, mode }; },
  dispatch(name, el) { const fn = this.actions[name]; if (fn) fn(el); },
  go(ws, opts = {}) {
    this.ws = ws; STORE.ui.ws = ws;
    if (ws === "compare" && opts.study) { cmpUi().study = opts.study; const st = studyById(opts.study); if (st) cmpUi().shelf = st.product; }
    closeLayer(); hideSelChip(); persist();
    // Sandboxed previews (origin "null") refuse history updates; the workspace still switches.
    try { if (location.hash !== "#" + ws) history.replaceState(null, "", "#" + ws); } catch (e) { /* no addressable URL here */ }
    this.render(); window.scrollTo(0, 0);
  },
  renderSoon() { clearTimeout(this._t); this._t = setTimeout(() => this.render(), 120); },
  render() {
    const focus = document.activeElement;
    const fkey = focus && focus.dataset && focus.dataset.bind ? { bind: focus.dataset.bind, i: focus.dataset.i, c: focus.dataset.c, id: focus.dataset.id, s: focus.selectionStart, e: focus.selectionEnd } : null;
    const actionFocus = this.lastKeyboard && focus && focus.dataset && focus.dataset.action ? { action: focus.dataset.action, key: focus.dataset.i || focus.dataset.c || focus.dataset.step || focus.dataset.v || focus.dataset.k || "" } : null;
    const scroller = document.scrollingElement; const y = scroller.scrollTop;
    const shelfSig = (n) => `${n.childElementCount}:${n.firstElementChild ? n.firstElementChild.dataset.value : ""}`;
    const shelves = $$("#page .shelf").map((n) => ({ sig: shelfSig(n), left: n.scrollLeft }));
    $("#rail").innerHTML = this.rail();
    $("#topbar").innerHTML = this.topbar();
    const mod = { design: Design, interviews: Interviews, evaluate: Evaluate, compare: Compare }[this.ws];
    try {
      $("#page").innerHTML = mod.render();
    } catch (err) {
      // Never leave a workspace unusable: show what failed and offer a reset of this view's saved state.
      console.error(err);
      $("#page").innerHTML = `<section class="panel panel-pad" role="alert"><h2>This view hit an error</h2>
        <p class="muted" style="margin:6px 0 12px">${esc(err.message || String(err))}</p>
        <p class="small muted" style="margin-bottom:12px">Your reviews, observations and launched runs are not affected. Resetting clears only this workspace's selections.</p>
        <button class="btn primary" data-action="reset-view">Reset this view</button></section>`;
    }
    document.title = `${WORKSPACES.find((w) => w.id === this.ws).title} · Experiment Studio`;
    scroller.scrollTop = y;
    $$("#page .shelf").forEach((n, k) => { if (shelves[k] && shelves[k].sig === shelfSig(n)) n.scrollLeft = shelves[k].left; });
    if (fkey) {
      const sel = `[data-bind="${fkey.bind}"]` + (fkey.i != null ? `[data-i="${fkey.i}"]` : "") + (fkey.c ? `[data-c="${fkey.c}"]` : "") + (fkey.id ? `[data-id="${fkey.id}"]` : "");
      const n = $(sel); if (n) { n.focus(); if (n.setSelectionRange && fkey.s != null) try { n.setSelectionRange(fkey.s, fkey.e); } catch (e) {} }
    } else if (actionFocus) {
      const n = $$(`[data-action="${actionFocus.action}"]`).find((x) => (x.dataset.i || x.dataset.c || x.dataset.step || x.dataset.v || x.dataset.k || "") === actionFocus.key);
      if (n) n.focus({ preventScroll: true });
    }
    if (this.ws === "compare" && cmpUi().drawer && !$(".drawer")) this.renderDrawer();
  },
  renderDrawer() {
    const u = cmpUi(); const s = studyById(u.study); if (!s || !armRuns(s, "g")[0]) return;
    let html;
    try { html = Compare.drawer(u, s); } catch (err) { console.error(err); u.drawer = false; persist(); return; }
    const existing = $(".drawer");
    if (existing) { existing.innerHTML = html; return; }
    const box = openLayer(html, "drawer");
    box.setAttribute("aria-label", "Run inspector");
  },
  refreshSockets() {
    if (this.ws !== "design") return;
    const d = draft(); const el = $(".sockets");
    if (el) el.innerHTML = STEPS.map((s, i) => Design.socket(d, s, i)).join("");
  },
  rail() {
    return `<svg class="mark" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="11" fill="#2e2b55"/><line x1="9" x2="31" y1="15" y2="15" stroke="#e8885a" stroke-width="2.4" stroke-linecap="round"/><line x1="9" x2="31" y1="25" y2="25" stroke="#5b5bd6" stroke-width="2.4" stroke-linecap="round"/><circle cx="14" cy="15" r="2.6" fill="#fff"/><circle cx="26" cy="15" r="2.6" fill="#fff"/><circle cx="14" cy="25" r="2.6" fill="#fff"/><circle cx="26" cy="25" r="2.6" fill="#fff"/></svg>
      ${WORKSPACES.map((w) => `<button data-action="ws" data-ws="${w.id}" ${this.ws === w.id ? 'aria-current="page"' : ""}>${w.icon}<span>${w.name}</span></button>`).join("")}
      <span class="spacer"></span><span class="rail-foot">Northwestern × Accenture</span>`;
  },
  topbar() {
    const helper = CONN.helper ? "Local helper" : connReady() ? "Direct" : "Not connected";
    const sync = cloudStateLabel();
    const left = this.ws === "design"
      ? `<div class="title"><span class="tiny faint">Design study</span><input data-bind="study-name" value="${esc(draft().name)}" aria-label="Study name"/></div>`
      : this.ws === "interviews"
      ? `<div class="title"><span class="tiny faint">Interviews</span><h1>Generated answers and the exact prompt behind each one</h1></div>`
      : this.ws === "evaluate"
      ? `<div class="title"><span class="tiny faint">Evaluate</span><h1>Score responses against the shared rubric</h1></div>`
      : `<div class="title"><span class="tiny faint">Compare results</span><h1>${esc((studyById(cmpUi().study) || {}).name || "Choose a study")}</h1></div>`;
    return `${left}<span class="grow"></span>
      ${this.ws === "design" ? `<button class="btn ghost sm" data-action="new-study">New study</button>` : ""}
      <button class="btn sm" data-action="conn"><span class="dot" style="background:${connReady() ? "var(--pos)" : "var(--line-2)"}"></span>${helper}</button>
      <button class="btn sm" data-action="cloud"><span class="dot" style="background:${cloudStatusDot()}"></span>${sync}</button>
      <button class="btn sm" data-action="menu" aria-haspopup="dialog">Data</button>`;
  },
  menu() {
    const nRev = Object.values(STORE.reviews).reduce((a, x) => a + Object.keys(x).length, 0);
    const box = openLayer(`<div class="spread"><h2>Your data</h2><button class="btn ghost sm" data-action="close-layer">Close</button></div>
      <p class="muted small">Reviews, observations and launched runs are saved in this browser as you work. Export them to share with the team or keep a copy in the repo's <code>results/</code> folder.</p>
      <div class="count-row"><div class="count"><b>${nRev}</b><span>reviews</span></div><div class="count"><b>${STORE.observations.length}</b><span>observations</span></div><div class="count"><b>${Object.keys(STORE.liveRuns).length}</b><span>launched runs</span></div></div>
      <div class="row wrap"><button class="btn" data-action="export-json">Export everything (JSON)</button><button class="btn" data-action="export-csv">Export scores (CSV)</button>
        <label class="btn" style="cursor:pointer">Import a JSON export<input type="file" accept="application/json" id="importFile" class="sr"/></label>
        <button class="btn" data-action="cloud">Team sync settings</button>
        <button class="btn" data-action="cloud-migrate">Upload local data to team workspace</button></div>`);
    box.querySelector("#importFile").onchange = (e) => { if (e.target.files[0]) { importAll(e.target.files[0]); closeLayer(); } };
  },
  init() {
    initDnD();
    Design.bind(); Interviews.bind(); Evaluate.bind(); Compare.bind();
    this.on("ws", (el) => this.go(el.dataset.ws));
    this.on("close-layer", () => { closeLayer(); if (STORE.ui.cmp) STORE.ui.cmp.drawer = false; persist(); });
    this.on("conn", () => connModal());
    this.on("cloud", () => cloudModal());
    this.on("cloud-migrate", async () => {
      try {
        const id = await CloudSync.migrateNow();
        toast("Uploaded local data (" + id + ")");
      } catch (err) {
        toast("Sync upload failed: " + (err.message || err));
      }
      this.render();
    });
    this.on("reset-view", () => {
      if (this.ws === "design") STORE.draft = null;
      else if (this.ws === "interviews") delete STORE.ui.iv;
      else if (this.ws === "evaluate") delete STORE.ui.eval;
      else if (this.ws === "compare") delete STORE.ui.cmp;
      persist(true); this.render(); toast("View reset");
    });
    this.on("menu", () => this.menu());
    this.on("export-json", () => exportAll());
    this.on("export-csv", () => exportScoresCsv());
    this.on("new-study", () => { STORE.draft = null; draft(); persist(); this.render(); toast("Started a new study"); });
    this.onInput("study-name", (el) => { draft().name = el.value; persist(); }, "blur-render");

    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-action]");
      if (!el || el.disabled) return;
      if (el.closest("[data-drag]") && el.dataset.drag && el.dataset.defaultDrop) return; // handled by DnD tap
      this.dispatch(el.dataset.action, el);
    });
    document.addEventListener("input", (e) => {
      const el = e.target.closest("[data-bind]"); if (!el) return;
      const h = this.inputs[el.dataset.bind]; if (h) h.fn(el);
    });
    document.addEventListener("focusout", (e) => {
      const el = e.target.closest && e.target.closest("[data-bind]"); if (!el) return;
      const h = this.inputs[el.dataset.bind]; if (h && h.mode === "blur-render") setTimeout(() => this.render(), 0);
    });
    document.addEventListener("pointerdown", () => { this.lastKeyboard = false; }, true);
    document.addEventListener("keydown", () => { this.lastKeyboard = true; }, true);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && ($(".modal") || $(".drawer"))) { closeLayer(); if (STORE.ui.cmp) STORE.ui.cmp.drawer = false; persist(); }
      if (e.key === "Enter" && e.target.matches('[data-bind="profile-line"]')) { e.preventDefault(); e.target.blur(); }
    });
    window.addEventListener("hashchange", () => { const w = location.hash.slice(1); if (WORKSPACES.some((x) => x.id === w) && w !== this.ws) this.go(w); });
    const fromHash = location.hash.slice(1);
    this.ws = WORKSPACES.some((x) => x.id === fromHash) ? fromHash : STORE.ui.ws || "design";
    this.render();
    detectHelper().then(() => { CloudSync.init(); this.render(); });
    CloudSync.init();
  },
};

document.addEventListener("DOMContentLoaded", () => App.init());
