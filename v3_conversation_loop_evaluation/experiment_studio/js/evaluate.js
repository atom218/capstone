/* Experiment Studio · Evaluate workspace */
"use strict";

function evalUi() {
  STORE.ui.eval = STORE.ui.eval || { view: "home", item: null, open: "persona", scope: null, support: null, filter: "todo", progress: "mine" };
  const u = STORE.ui.eval;
  if (u.scope) u.scope = u.scope.filter((id) => studyById(id));
  if (u.item && !itemContext(u.item)) { u.item = null; u.view = "home"; }
  if (!Array.isArray(u.scope)) u.scope = Object.values(allStudies()).filter((s) => s.product === "subscription-management" && s.baselineRuns.length && (runById(s.groundedRuns[0]) || {}).cfg?.persona === "full_description").map((s) => s.id);
  return u;
}
function queueSet() {
  const u = evalUi(); const set = new Set();
  u.scope.forEach((sid) => { const s = studyById(sid); if (s) studyItems(s).forEach((id) => set.add(id)); });
  return Array.from(set).sort();
}
/* Interviews get neutral numbers, shuffled per reviewer, so position never reveals which one is the baseline. */
function blindInterviews(items) {
  const seed = "iv:" + evalKey(STORE.reviewer.lane, STORE.reviewer.name);
  const byProduct = {};
  items.forEach((id) => {
    const { runId } = parseItem(id); const run = runById(runId); if (!run) return;
    (byProduct[run.cfg.product] = byProduct[run.cfg.product] || new Set()).add(runId);
  });
  const out = {};
  Object.entries(byProduct).forEach(([pid, set]) => {
    out[pid] = shuffle(Array.from(set).sort(), seed + pid).map((runId, k) => ({ runId, n: k + 1 }));
  });
  return out;
}
function interviewNumber(id, blind) {
  const { runId } = parseItem(id); const run = runById(runId);
  const hit = run && (blind[run.cfg.product] || []).find((x) => x.runId === runId);
  return hit ? hit.n : 0;
}
function queueItems() {
  const u = evalUi(); const items = queueSet();
  const order = u.order || "random";
  if (order === "random") return shuffle(items, "queue:" + evalKey(STORE.reviewer.lane, STORE.reviewer.name));
  const blind = blindInterviews(items);
  const pOrder = (id) => PRODUCTS.findIndex((p) => p.id === runById(parseItem(id).runId).cfg.product);
  return items.slice().sort((a, b) => {
    const pa = pOrder(a) - pOrder(b); if (pa) return pa;
    const qa = parseItem(a).i - parseItem(b).i, na = interviewNumber(a, blind) - interviewNumber(b, blind);
    return order === "question" ? qa || na : na || qa;
  });
}
function stageIcon(stage) {
  const c = stage === "complete" ? "#1f1d3d" : stage === "common" || stage === "started" ? "#1f1d3d" : "#d3d0e2";
  const frac = { none: 0, started: 0.33, common: 0.66, complete: 1 }[stage];
  const r = 6, C = 2 * Math.PI * r;
  return `<svg class="stat-ring" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="${r}" fill="none" stroke="#e6e4f0" stroke-width="2.4"/>
    <circle cx="8" cy="8" r="${r}" fill="none" stroke="${c}" stroke-width="2.4" stroke-dasharray="${C * frac} ${C}" transform="rotate(-90 8 8)" stroke-linecap="round"/></svg>`;
}
function cellGlyph(st) { return `<span class="cell-glyph ${st}" aria-hidden="true"></span>`; }
function stageLabel(st) { return { none: "Not started", started: "In progress", common: "Common scores in, checks left", complete: "Complete" }[st]; }
function addedMeasuresLocked(rev) {
  return !!(rev.additionalSubmittedAt || (rev.commonSubmittedAt && ADDED_MEASURES.every((c) => rev.commonAudit && Object.prototype.hasOwnProperty.call(rev.commonAudit, c.id))));
}
function firstReviewCriterion(rev, item) {
  if (!rev || !rev.commonSubmittedAt) return COMMON[0].id;
  if (!addedMeasuresLocked(rev)) return ADDED_MEASURES.find((c) => scoreVal(rev, c.id) === undefined)?.id || ADDED_MEASURES[0].id;
  return !rev.implSubmittedAt && item.run.cfg.arm === "grounded" ? IMPL[0].id : COMMON[0].id;
}
function criterionLocked(rev, id) {
  return ADDED_MEASURE_IDS.has(id) ? addedMeasuresLocked(rev) : COMMON_IDX[id] ? !!rev.commonSubmittedAt : !!rev.implSubmittedAt;
}
function reviewerNameFromKey(ek) { return ek && ek.startsWith("human:") ? (ek.slice(6).trim() || "Reviewer") : ek || "Reviewer"; }
function fmtScore(v) { return v === undefined || v === null ? "–" : v === "na" ? "N/A" : String(v); }
function humanReviewsForItem(itemIdStr) {
  return reviewsFor(itemIdStr)
    .filter((x) => x.lane === "human")
    .map((x) => ({ ...x, name: reviewerNameFromKey(x.ek), st: reviewStage(x.r) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
function llmReviewForItem(itemIdStr, cfg = getConn()) {
  const ek = judgeLaneKey(cfg);
  return { ek, review: (STORE.reviews[ek] && STORE.reviews[ek][itemIdStr]) || null };
}
function scoreText(v) {
  if (v == null) return "—";
  if (v === "na" || v === "n/a") return "N/A";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
function humanMeanScore(rows, cid) {
  const vals = rows.map((x) => scoreVal(x.r, cid)).filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!vals.length) {
    return rows.some((x) => scoreVal(x.r, cid) === "na") ? "na" : undefined;
  }
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Number.isInteger(mean) ? mean : Number(mean.toFixed(1));
}
function teammateHover(itemIdStr) {
  const hs = humanReviewsForItem(itemIdStr);
  if (!hs.length) return "No teammate reviews yet";
  return "Team: " + hs.map((x) => `${x.name} (${stageLabel(x.st).toLowerCase()})`).join(", ");
}
const STAGE_RANK = { none: 0, started: 1, common: 2, complete: 3 };
function strongerStage(a, b) { return (STAGE_RANK[b] || 0) > (STAGE_RANK[a] || 0) ? b : a; }
/* Team mode: one cell reflects the furthest progress reached by any reviewer in this lane. */
function laneStage(itemIdStr, lane) {
  const revs = reviewsFor(itemIdStr).filter((x) => lane === "all" || x.lane === lane);
  return revs.reduce((best, x) => strongerStage(best, reviewStage(x.r)), "none");
}
function llmReviewComplete(itemIdStr, ek) {
  const rev = STORE.reviews[ek] && STORE.reviews[ek][itemIdStr];
  if (!rev || !rev.implSubmittedAt) return false;
  const it = itemContext(itemIdStr);
  if (!it) return false;
  const needed = [...JUDGE_COMMON, ...(it.run.cfg.arm === "grounded" ? JUDGE_IMPL : [])];
  return needed.every((c) => {
    const s = rev.scores && rev.scores[c.id];
    if (!s) return false;
    if (typeof s.note === "string" && s.note.includes("Fallback: model did not return this score.")) return false;
    return scoreVal(rev, c.id) !== undefined;
  });
}
function judgeQueueStats(items, cfg = getConn()) {
  const ek = judgeLaneKey(cfg);
  const doneSet = new Set(items.filter((id) => llmReviewComplete(id, ek)));
  const pending = items.filter((id) => !doneSet.has(id));
  return { ek, total: items.length, done: doneSet.size, pending: pending.length, next: pending[0] || null };
}

const Evaluate = {
  render() {
    const u = evalUi();
    if (u.view === "item" && u.item && itemContext(u.item)) return this.itemView(u);
    return this.home(u);
  },

  home(u) {
    const items = queueItems();
    const judge = judgeQueueStats(items);
    const mine = items.map((id) => ({ id, st: reviewStage(myReview(id)) }));
    const mineOf = Object.fromEntries(mine.map((x) => [x.id, x.st]));
    const mode = u.progress || "mine";
    const lane = STORE.reviewer.lane === "human" ? "human" : STORE.reviewer.lane;
    const stOf = mode === "team" ? Object.fromEntries(items.map((id) => [id, laneStage(id, lane)])) : mineOf;
    const next = mine.find((x) => x.st === "started" || x.st === "common") || mine.find((x) => x.st === "none");
    const count = (st) => items.filter((id) => stOf[id] === st).length;
    const done = count("complete"), half = count("common") + count("started"), todo = count("none");
    const nameMissing = STORE.reviewer.lane === "human" && !STORE.reviewer.name.trim();
    const blind = blindInterviews(items);
    const orderLabel = { random: "random order", question: "question by question", interview: "interview by interview" }[u.order || "random"];
    return `<div class="eval-home">
      <div class="stack">
        <section class="resume">
          <div class="spread"><h2>Continue my reviews</h2><span class="small" style="color:#b7b4d0">${items.length} responses in your queue</span></div>
          <div class="prog-big" aria-hidden="true"><i style="width:${(100 * done) / Math.max(1, items.length)}%"></i><i class="half" style="width:${(100 * half) / Math.max(1, items.length)}%"></i></div>
          ${nameMissing ? `<p style="color:#cfcce3">Add your name on the right so your scores are kept apart from other reviewers'.</p>` : next
            ? `<div class="row"><button class="btn primary" data-action="open-item" data-id="${esc(next.id)}">${next.st === "none" ? "Start" : "Resume"} ${anonCode(next.id)}</button>
               <span class="small" style="color:#b7b4d0">${next.st === "none" ? `Next in ${orderLabel}` : stageLabel(next.st)} · Interview ${interviewNumber(next.id, blind)}, Q${parseItem(next.id).i + 1}</span></div>`
            : `<p>Every response in your queue is complete. Open Compare results to see how the arms differ.</p>`}
          ${mode === "team" ? `<p class="tiny" style="color:#8f8cae">Markers in the matrix below now show team-wide progress across all human reviewers. The Continue button still follows your own queue.</p>` : ""}
          <p class="tiny" style="color:#8f8cae">Interviews are numbered at random for you, and condition labels, the journey, other reviewers' scores and automated notes stay hidden until the final implementation pass.</p>
        </section>

        <section class="summary-strip">
          ${[["Complete", done, "complete"], ["In progress", half, "common"], ["Not started", todo, "none"], ["Total", items.length, null]].map(([l, n, st]) => `<div class="count"><span class="row">${st ? stageIcon(st) : ""}${l}</span><b>${n}</b></div>`).join("")}
        </section>

        <section class="panel panel-pad">
          <div class="spread" style="margin-bottom:14px">
            <div><h3>Your assignments</h3><p class="tray-hint" style="margin:2px 0 0">${(u.qview || "grid") === "grid" ? "Each cell is one response. Select a cell to score it." : "Grouped by question. Select a response to score it."}</p></div>
            <div class="row">
              <span class="small faint">Cell status</span>
              <div class="seg" role="group" aria-label="Cell status source">${[["mine", "My marks"], ["team", "Team marks"]].map(([k, l]) => `<button data-action="qprogress" data-k="${k}" aria-pressed="${(u.progress || "mine") === k}">${l}</button>`).join("")}</div>
              <span class="small faint">Work</span>
              <div class="seg" role="group" aria-label="Review order">${[["random", "Random"], ["question", "By question"], ["interview", "By interview"]].map(([k, l]) => `<button data-action="qorder" data-k="${k}" aria-pressed="${(u.order || "random") === k}">${l}</button>`).join("")}</div>
              <div class="seg" role="group" aria-label="View">${[["grid", "Grid"], ["list", "List"]].map(([k, l]) => `<button data-action="qview" data-k="${k}" aria-pressed="${(u.qview || "grid") === k}">${l}</button>`).join("")}</div>
            </div>
          </div>
          ${items.length ? ((u.qview || "grid") === "grid" ? this.grid(items, stOf, blind, next) : this.list(items, stOf, blind, u)) : `<div class="empty"><h3>No responses in your queue</h3><p class="muted">Turn on at least one study on the right.</p></div>`}
          <div class="row wrap qlegend">${["none", "started", "common", "complete"].map((st) => `<span class="row tiny">${cellGlyph(st)}${stageLabel(st)}</span>`).join("")}<span class="row tiny"><span class="cell-glyph next" aria-hidden="true"></span>Up next</span></div>
        </section>
      </div>
      <aside class="stack">
        <section class="panel panel-pad stack">
          <h3>Reviewing as</h3>
          <div class="seg" role="group" aria-label="Reviewer lane">${[["human", "Human reviewer"], ["jev", "Jev"], ["llm", "LLM judge"]].map(([k, l]) => `<button data-action="lane" data-lane="${k}" aria-pressed="${STORE.reviewer.lane === k}">${l}</button>`).join("")}</div>
          ${STORE.reviewer.lane === "human"
            ? `<div class="field"><label for="revName">Your name</label><input id="revName" data-bind="reviewer-name" value="${esc(STORE.reviewer.name)}" placeholder="First name"/></div>`
            : STORE.reviewer.lane === "jev"
              ? `<p class="small muted">Scores entered here are filed under Jev.</p>`
              : `<div class="stack">
                  <p class="small muted">Use this lane to run automated scoring. API key and endpoint are set in Model connection.</p>
                  <p class="tiny faint">Queue: ${judge.total} items · Pending for this model: ${judge.pending}${judge.next ? ` · Next: ${esc(anonCode(judge.next))}` : ""}</p>
                  <div class="row"><button class="btn sm" data-action="conn">Model connection / API key</button>${connReady() ? `<button class="btn sm primary" data-action="judge-run">Run now</button><button class="btn sm ghost" data-action="judge-run-force">Re-run all</button>` : ""}</div>
                </div>`}
        </section>
        <section class="panel panel-pad">
          <h3 style="margin-bottom:10px">Queue coverage by evaluator</h3>
          <div class="lanes">${EVALUATORS.map((ev) => {
            const full = items.filter((id) => reviewsFor(id).some((x) => x.lane === ev.id && x.r.implSubmittedAt)).length;
            const part = items.filter((id) => reviewsFor(id).some((x) => x.lane === ev.id && !x.r.implSubmittedAt && x.r.commonSubmittedAt)).length;
            return `<div class="lane"><span>${ev.name}</span><div class="bar" title="${full} complete, ${part} with common scores only"><i style="width:${(100 * full) / Math.max(1, items.length)}%"></i><i class="part" style="width:${(100 * part) / Math.max(1, items.length)}%"></i></div><span class="small faint">${full}/${items.length}</span></div>`;
          }).join("")}</div>
          <p class="tiny faint" style="margin-top:10px">This shows completion only. Completed reviews can still disagree, and Compare results shows where they do.</p>
        </section>
        ${this.scopePanel(u)}
        <section class="panel panel-pad stack">
          <h3>LLM judge</h3>
          <p class="small muted">Scores every response in this queue with the same 0-3 rubric and then writes a short overall summary per interview.</p>
          <p class="tiny faint">Model lane: ${esc(judge.ek.replace(/^llm:/, ""))} · Queue ${judge.total} · Pending ${judge.pending}</p>
          <div class="row"><button class="btn ghost sm" data-action="conn">Model connection / API key</button></div>
          ${JUDGE.running ? `<div class="row"><div class="grow"><div class="lane"><span class="small">Scoring</span><div class="bar"><i style="width:${(100 * JUDGE.done) / Math.max(1, JUDGE.total)}%"></i></div><span class="small">${JUDGE.done}/${JUDGE.total}</span></div></div><button class="btn sm" data-action="judge-stop">Stop</button></div>`
            : `<div class="row wrap"><button class="btn" data-action="judge-run">${connReady() ? "Run judge on pending queue items" : "Connect a model to run the judge"}</button>${connReady() ? `<button class="btn ghost" data-action="judge-run-force">Run again on all items</button><button class="btn ghost" data-action="judge-summaries">Generate interview summaries</button>` : ""}</div>`}
          ${JUDGE.error ? `<div class="note warn small">${esc(JUDGE.error)}</div>` : ""}
          ${JUDGE.last ? `<div class="note small">${esc(JUDGE.last)}</div>` : ""}
          ${this.judgeSummaryPanel(items)}
        </section>
      </aside>
    </div>`;
  },
  judgeSummaryPanel(items) {
    const c = getConn();
    const ek = judgeLaneKey(c);
    const rows = [];
    const seen = new Set();
    items.forEach((id) => {
      const { runId } = parseItem(id);
      if (seen.has(runId)) return;
      seen.add(runId);
      const row = STORE.judgeSummaries[ek] && STORE.judgeSummaries[ek][runId];
      if (!row || !row.text) return;
      rows.push({ runId, row });
    });
    if (!rows.length) return `<p class="tiny faint">Interview-level summaries appear here after the batch judge run finishes.</p>`;
    return `<div class="stack">${rows.map(({ runId, row }) => `<div class="note"><div class="small"><b>${esc(anonCode(runId + "#0").replace("Q1", "Interview"))}</b> · ${esc(fmtTime(row.at || ""))}</div><div class="small" style="white-space:pre-wrap;margin-top:4px">${esc(row.text)}</div></div>`).join("")}</div>`;
  },

  /* Questions down, blinded interviews across: the whole queue at a glance. */
  grid(items, stOf, blind, next) {
    const set = new Set(items);
    return Object.entries(blind).map(([pid, ivs]) => {
      const qs = questionsOf(pid);
      const colDone = (runId) => qs.filter((_, i) => stOf[itemId(runId, i)] === "complete").length;
      return `<div class="matrix-wrap">
        ${Object.keys(blind).length > 1 ? `<div class="slot-label">${esc(productOf(pid).name)}</div>` : ""}
        <table class="matrix">
          <thead>
            <tr class="cap"><th class="qh"></th><th colspan="${ivs.length}" class="ivcap">Interview</th><th class="tot"></th></tr>
            <tr><th class="qh">Question</th>${ivs.map((iv) => `<th><span class="ivn">${iv.n}</span><span class="tiny faint">${colDone(iv.runId)}/${qs.length}</span></th>`).join("")}<th class="tot">Done</th></tr>
          </thead>
          <tbody>${qs.map((q, i) => {
            const ids = ivs.map((iv) => itemId(iv.runId, i)).filter((id) => set.has(id));
            const rowDone = ids.filter((id) => stOf[id] === "complete").length;
            return `<tr><th class="qh" scope="row"><div class="qcell"><span class="qn">Q${i + 1}</span><span class="qt" title="${esc(q.question)}">${esc(q.question)}</span>${isScreen(q) ? '<span class="chip focus tiny-chip">screen</span>' : ""}</div></th>
              ${ivs.map((iv) => {
                const id = itemId(iv.runId, i);
                if (!set.has(id)) return `<td><span class="cell-glyph absent" aria-hidden="true"></span></td>`;
                const st = stOf[id];
                return `<td><button class="cell${next && next.id === id ? " is-next" : ""}" data-action="open-item" data-id="${esc(id)}" title="${anonCode(id)} · Interview ${iv.n}, Q${i + 1} · ${stageLabel(st)} · ${esc(teammateHover(id))}" aria-label="${anonCode(id)}, interview ${iv.n}, question ${i + 1}, ${stageLabel(st)}">${cellGlyph(st)}</button></td>`;
              }).join("")}
              <td class="tot"><div class="rowbar"><i style="width:${(100 * rowDone) / Math.max(1, ids.length)}%"></i></div><span class="tiny faint">${rowDone}/${ids.length}</span></td></tr>`;
          }).join("")}</tbody>
        </table></div>`;
    }).join("");
  },

  /* Grouped by question, with status filters. */
  list(items, stOf, blind, u) {
    const filt = u.filter || "todo";
    const keep = (id) => (filt === "todo" ? stOf[id] !== "complete" : filt === "done" ? stOf[id] === "complete" : true);
    const groups = {};
    items.forEach((id) => { const it = itemContext(id); const key = it.run.cfg.product + "#" + it.i; (groups[key] = groups[key] || { pid: it.run.cfg.product, i: it.i, ids: [] }).ids.push(id); });
    const ordered = Object.values(groups).sort((a, b) => (a.pid === b.pid ? a.i - b.i : PRODUCTS.findIndex((p) => p.id === a.pid) - PRODUCTS.findIndex((p) => p.id === b.pid)));
    u.open_groups = u.open_groups || {};
    return `<div class="row" style="margin-bottom:10px"><div class="seg" role="group" aria-label="Filter">${[["todo", "Remaining"], ["done", "Completed"], ["all", "All"]].map(([k, l]) => `<button data-action="qfilter" data-f="${k}" aria-pressed="${filt === k}">${l}</button>`).join("")}</div></div>
      <div class="qgroups">${ordered.map((g) => {
        const q = questionsOf(g.pid)[g.i]; const shown = g.ids.filter(keep);
        const done = g.ids.filter((id) => stOf[id] === "complete").length;
        const key = g.pid + "#" + g.i; const open = u.open_groups[key] !== false && shown.length > 0;
        return `<div class="qgroup${open ? " open" : ""}">
          <button class="qg-head" data-action="qgroup" data-k="${key}" aria-expanded="${open}">
            <span class="qn">Q${g.i + 1}</span><span class="qt">${esc(q.question)}</span>
            ${isScreen(q) ? '<span class="chip focus tiny-chip">screen</span>' : ""}
            <span class="rowbar"><i style="width:${(100 * done) / Math.max(1, g.ids.length)}%"></i></span><span class="tiny faint">${done}/${g.ids.length}</span>
          </button>
          ${open ? `<div class="qg-body">${shown.sort((a, b) => interviewNumber(a, blind) - interviewNumber(b, blind)).map((id) => `
            <button class="qg-item" data-action="open-item" data-id="${esc(id)}">${cellGlyph(stOf[id])}<b>${anonCode(id)}</b><span class="faint">Interview ${interviewNumber(id, blind)}</span><span class="grow"></span><span class="tiny faint">${stageLabel(stOf[id])}</span></button>`).join("") || `<p class="tiny faint" style="padding:6px 10px">Nothing matches this filter.</p>`}</div>` : ""}
        </div>`;
      }).join("")}</div>`;
  },

  /* Which studies feed the queue: journeys by cue detail, per product. */
  scopePanel(u) {
    const studies = Object.values(allStudies()).filter((s) => s.baselineRuns.length);
    const byProduct = {};
    studies.forEach((s) => (byProduct[s.product] = byProduct[s.product] || []).push(s));
    const on = (id) => u.scope.includes(id);
    return `<section class="panel panel-pad">
      <h3>Studies in this queue</h3><p class="tray-hint">Choose which journey and cue combinations feed your assignments.</p>
      ${Object.entries(byProduct).map(([pid, list]) => {
        const g = (s) => runById(s.groundedRuns[0]);
        const saved = list.filter((s) => s.origin === "saved" && g(s).cfg.persona === "full_description");
        const other = list.filter((s) => !saved.includes(s));
        const journeys = Object.values(DATA.cycles).filter((c) => saved.some((s) => g(s).cfg.journey === c.id));
        const cell = (c, detail) => { const s = saved.find((x) => g(x).cfg.journey === c.id && g(x).cfg.detail === detail); return s ? `<button class="scope-cell" data-action="scope" data-study="${esc(s.id)}" aria-pressed="${on(s.id)}" aria-label="${esc(c.short_title)}, ${detail} cue">${on(s.id) ? ICON.check : ""}</button>` : `<span class="faint">–</span>`; };
        const nOn = list.filter((s) => on(s.id)).length;
        return `<div class="scope-block">
          <div class="spread"><b class="small">${esc(productOf(pid).short)}</b><span class="row"><span class="tiny faint">${nOn}/${list.length} on</span><button class="btn ghost sm" data-action="scope-all" data-p="${pid}" data-v="1">All</button><button class="btn ghost sm" data-action="scope-all" data-p="${pid}" data-v="0">None</button></span></div>
          <table class="scope-table"><thead><tr><th>Journey</th><th>Brief</th><th>Detailed</th></tr></thead>
            <tbody>${journeys.map((c) => `<tr><td>${esc(c.short_title.replace(/^Cycle \d: /, ""))}</td><td>${cell(c, "brief")}</td><td>${cell(c, "detailed")}</td></tr>`).join("")}</tbody></table>
          ${other.length ? `<div class="row wrap" style="margin-top:8px">${other.map((s) => `<button class="chip wrapchip" data-action="scope" data-study="${esc(s.id)}" aria-pressed="${on(s.id)}">${esc(s.name)}</button>`).join("")}</div>` : ""}
        </div>`;
      }).join("")}
    </section>`;
  },

  itemView(u) {
    const it = itemContext(u.item);
    const rev = myReview(u.item) || { scores: {}, flags: {} };
    const stage = reviewStage(rev);
    const items = queueItems(); const pos = items.indexOf(u.item);
    const locked = !!rev.commonSubmittedAt;
    const run = it.run;
    const persona = PERSONAS.find((p) => p.id === run.cfg.persona);
    const cyc = run.cfg.arm === "grounded" ? DATA.cycles[run.cfg.journey] : null;
    const cycleName = cyc ? cyc.short_title.replace(/^Cycle \d: /, "") : "";
    const teamRows = humanReviewsForItem(u.item);
    const llmNow = llmReviewForItem(u.item);
    const compareCrit = [...JUDGE_COMMON, ...(run.cfg.arm === "grounded" ? JUDGE_IMPL : [])];
    const me = (STORE.reviewer.name || "").trim();
    return `<div class="spread" style="margin-bottom:16px">
        <div class="row"><button class="btn ghost" data-action="eval-home">← Queue</button><h2>${anonCode(u.item)}</h2><span class="chip">Interview ${interviewNumber(u.item, blindInterviews(queueSet()))}, Q${it.i + 1}</span><span class="chip">${stageLabel(stage)}</span></div>
        <div class="row"><span class="small faint">${pos >= 0 ? `${pos + 1} of ${items.length}` : "Outside your current queue"}</span>
          <button class="btn sm" data-action="item-step" data-d="-1" ${pos <= 0 ? "disabled" : ""}>Previous</button>
          <button class="btn sm" data-action="item-step" data-d="1" ${pos < 0 || pos >= items.length - 1 ? "disabled" : ""}>Next</button></div>
      </div>
      <div class="scoring">
        <div class="answer-col">
          <section class="panel panel-pad">
            <div class="spread"><h3>This interview setup</h3><span class="small faint">Fixed across Q1-Q7</span></div>
            <div class="row wrap" style="margin-top:8px">
              <span class="chip focus">${esc(productOf(run.cfg.product).short)}</span>
              <span class="chip line">${esc(persona ? persona.variant : run.cfg.persona)}</span>
              <span class="chip ${run.cfg.arm === "grounded" ? "grnd" : "base"}">${run.cfg.arm === "grounded" ? "Grounded" : "Baseline"}</span>
              ${cyc ? `<span class="chip line">${esc(cycleName)}</span>` : ""}
              ${cyc ? `<span class="chip line">${esc(DETAIL[run.cfg.detail].name)} · ${esc(TIMING[run.cfg.timing].name.toLowerCase())}</span>` : ""}
            </div>
            <p class="tiny faint" style="margin-top:8px">What changes each question: the question text (and screen when present) plus the live state cue. The approved profile and product pack stay the same for this interview.</p>
          </section>
          <section class="panel panel-pad">
            <div class="spread"><h3>Human vs LLM on this response</h3><span class="small faint">${compareCrit.length} criteria</span></div>
            <div class="row wrap" style="margin-top:8px;align-items:stretch">
              <div class="note focus small grow" style="min-width:280px">
                <div class="spread"><b>Human (team average)</b><span class="faint">${teamRows.length} reviewer${teamRows.length === 1 ? "" : "s"}</span></div>
                <div class="stack" style="margin-top:6px">${compareCrit.map((c) => `<div class="spread"><span class="tiny">${esc(c.name)}</span><b>${esc(scoreText(humanMeanScore(teamRows, c.id)))}</b></div>`).join("")}</div>
              </div>
              <div class="note small grow" style="min-width:280px">
                <div class="spread"><b>LLM (${esc(llmNow.ek.replace(/^llm:/, ""))})</b><span class="faint">${llmNow.review && llmNow.review.implSubmittedAt ? fmtTime(llmNow.review.implSubmittedAt) : "not scored yet"}</span></div>
                ${llmNow.review ? `<div class="stack" style="margin-top:6px">${compareCrit.map((c) => `<div class="spread"><span class="tiny">${esc(c.name)}</span><b>${esc(scoreText(scoreVal(llmNow.review, c.id)))}</b></div>`).join("")}</div>` : `<p class="tiny faint" style="margin-top:6px">Run the LLM judge to populate this side.</p>`}
              </div>
            </div>
          </section>
          <section class="panel panel-pad">
            <div class="spread"><h3>Team evaluations on this response</h3><span class="small faint">${teamRows.length} reviewer${teamRows.length === 1 ? "" : "s"}</span></div>
            ${teamRows.length ? `<div class="stack" style="margin-top:8px">${teamRows.map((x) => {
              const mineTag = me && x.name === me ? " · you" : "";
              const common = COMMON.map((c) => `${c.id}:${fmtScore(scoreVal(x.r, c.id))}`).join(" ");
              const impl = IMPL.map((c) => `${c.id}:${fmtScore(scoreVal(x.r, c.id))}`).join(" ");
              return `<div class="note focus small">
                <div class="spread"><b>${esc(x.name)}${mineTag}</b><span class="faint">${stageLabel(x.st)}</span></div>
                <div class="tiny" style="margin-top:4px"><b>Common:</b> ${esc(common)}</div>
                <div class="tiny" style="margin-top:2px"><b>Implementation:</b> ${esc(impl)}</div>
              </div>`;
            }).join("")}</div>` : `<p class="tiny faint" style="margin-top:8px">No human reviewer has scored this response yet.</p>`}
          </section>
          <section class="panel qbox">
            <div class="qlabel">Question ${it.i + 1} of 7 · ${isScreen(it.q) ? "shown with a product screen" : "topic-only, no screen"}</div>
            <div class="tiny faint" style="margin:4px 0 10px">${run.cfg.arm === "grounded" ? `Current cue: <code>${esc(it.turn.state_before)}</code>` : "Baseline interview: no journey cue applied."}</div>
            <div class="row" style="align-items:flex-start;gap:14px"><p class="grow">${esc(it.q.question)}</p>
              ${isScreen(it.q) ? `<img class="thumb" src="${it.q.screenshot_data_uri}" alt="Product screen" data-action="zoom" data-pid="${it.run.cfg.product}" data-i="${it.i}"/>` : ""}</div>
          </section>
          <section class="panel answer-card">
            <div class="spread" style="margin-bottom:8px"><span class="small faint">The persona's reply, verbatim</span><span class="small faint">${wordsOf(it.turn.reply)} words</span></div>
            <div class="answer-text read" id="answerText">${highlightText(it.turn.reply, evidenceTexts(rev))}</div>
            <p class="tiny faint" style="margin-top:12px">Select words, then drag the chip onto a criterion to attach them as evidence.</p>
          </section>
          <section class="panel panel-pad">
            <div class="support" role="group" aria-label="Supporting material">
              ${[["profile", "Approved profile"], ["history", `Earlier replies (${it.i})`], ["product", "Product facts"]].map(([k, l]) => `<button class="chip line" data-action="support" data-k="${k}" aria-pressed="${u.support === k}">${l}</button>`).join("")}
            </div>
            ${u.support ? `<div class="support-body">${this.support(it, u.support)}</div>` : `<p class="tiny faint" style="margin-top:8px">Open supporting material only when a criterion needs it.</p>`}
          </section>
        </div>
        <section class="panel scorecard" aria-label="Scorecard">
          <div class="rubric-intro small muted">Rate each criterion separately. The examples are illustrations, not evidence about this answer. Human likeness and contextual responsiveness apply to both conditions and are reported separately from the five core criteria.</div>
          ${locked && !rev.rubricVersion ? `<div class="rubric-intro note small">These ratings were recorded with earlier guidance and remain unchanged. Human likeness and contextual responsiveness are unscored unless a reviewer explicitly adds ratings.</div>` : ""}
          ${["Behavioral consistency", "Product feedback", "Additional measures"].map((g) => `<div class="sc-group">${g}</div>${COMMON.filter((c) => c.group === g).map((c) => this.critRow(c, rev, it, u, criterionLocked(rev, c.id))).join("")}${g === "Product feedback" ? this.factualRow(rev, locked) : ""}`).join("")}
          ${locked && !addedMeasuresLocked(rev) ? `<div class="footer-bar"><span class="small muted">Add these two ratings without reopening the original scores.</span><button class="btn primary" data-action="submit-additional" ${ADDED_MEASURES.every((c) => scoreVal(rev, c.id) !== undefined) ? "" : "disabled"}>Submit additional measures</button></div>` : ""}
          ${locked ? `<div class="footer-bar"><span class="small muted">${ICON.lock} Common scores submitted ${fmtTime(rev.commonSubmittedAt)}. The original scores are kept for audit.</span><button class="btn ghost sm" data-action="unlock-common">Revise</button></div>`
            : `<div class="footer-bar"><span class="saved-tick" id="savedTick">${rev.updatedAt ? "Autosaved " + fmtTime(rev.updatedAt) : ""}</span>
               <button class="btn primary" data-action="submit-common" ${COMMON.every((c) => scoreVal(rev, c.id) !== undefined) ? "" : "disabled"}>Submit common scores</button></div>`}
          ${locked ? this.implSection(it, rev, u) : `<div class="impl-reveal"><div class="sc-group" style="padding:0 0 4px">Context and journey implementation</div><p class="small muted">Unlocks after you submit the common scores. The cue supplied at this turn is revealed then.</p></div>`}
          <div class="footer-bar"><span class="tiny faint"><span class="kbd">0</span>–<span class="kbd">3</span> score · <span class="kbd">N</span> not applicable · <span class="kbd">J</span>/<span class="kbd">K</span> next or previous criterion</span></div>
        </section>
      </div>`;
  },
  critRow(c, rev, it, u, locked) {
    const v = scoreVal(rev, c.id); const open = u.open === c.id;
    const s = (rev.scores && rev.scores[c.id]) || {};
    const autoNa = c.naFirst && it.i === 0;
    return `<div class="crit${open ? " open" : ""}" data-drop="evidence" data-drop-id="${esc(c.id)}">
      <button class="crit-row" data-action="open-crit" data-c="${c.id}" aria-expanded="${open}">
        <div><div class="c-name">${c.name}</div><div class="c-ask">${c.ask}</div></div>
        ${badge(v)}
      </button>
      ${open ? `<div class="crit-body">
        ${c.guidance ? `<div class="reminder">${esc(c.guidance)}</div>` : ""}
        ${c.exampleContext ? `<p class="tiny faint">${esc(c.exampleContext)}</p>` : ""}
        ${autoNa && v === undefined ? `<div class="note small">This is the first question, so there is nothing earlier to be consistent with. Mark it not applicable unless you disagree.</div>` : ""}
        <div class="anchors" role="radiogroup" aria-label="${c.name} score">${c.anchors.map((a, k) => `<button class="anchor" role="radio" aria-checked="${v === k}" aria-pressed="${v === k}" data-action="score" data-c="${c.id}" data-v="${k}" ${locked ? "disabled" : ""}><b>${k}</b><span class="anchor-copy">${esc(a)}${c.examples && c.examples[k] ? `<small class="anchor-example">Example: ${esc(c.examples[k])}</small>` : ""}</span></button>`).join("")}</div>
        <div class="crit-tools">
          <button class="btn sm" data-action="score" data-c="${c.id}" data-v="na" aria-pressed="${v === "na"}" ${locked ? "disabled" : ""}>Not applicable</button>
          ${v !== undefined && !locked ? `<button class="btn ghost sm" data-action="score" data-c="${c.id}" data-v="clear">Clear score</button>` : ""}
          ${c.support ? `<button class="btn ghost sm" data-action="support" data-k="${c.support}">Show ${c.support === "profile" ? "the profile" : c.support === "history" ? "earlier replies" : "product facts"}</button>` : ""}
        </div>
        ${(s.evidence || []).length ? `<div class="evidence">${s.evidence.map((e, k) => `<span class="evi">“${esc(e.text)}”${locked ? "" : `<button data-action="rm-evi" data-c="${c.id}" data-k="${k}" aria-label="Remove evidence">${ICON.x}</button>`}</span>`).join("")}</div>` : `<p class="tiny faint">No evidence attached yet.</p>`}
        <textarea class="note-in" rows="1" data-bind="crit-note" data-c="${c.id}" placeholder="Note (optional)" ${locked ? "disabled" : ""}>${esc(s.note || "")}</textarea>
      </div>` : ""}
    </div>`;
  },
  factualRow(rev, locked) {
    const f = (rev.flags && rev.flags.factual) || {};
    return `<div class="crit"><div class="crit-row" style="cursor:default">
      <div><div class="c-name">Factual concern</div><div class="c-ask">Flag claims about the product that the question or screen does not support. This is separate from the scores.</div></div>
      <button class="chip${f.on ? " warn" : " line"}" data-action="flag-factual" aria-pressed="${!!f.on}" ${locked ? "disabled" : ""}>${f.on ? "Flagged" : "Flag"}</button></div>
      ${f.on ? `<div class="crit-body"><textarea class="note-in" rows="1" data-bind="factual-note" placeholder="What is unsupported?" ${locked ? "disabled" : ""}>${esc(f.note || "")}</textarea></div>` : ""}
    </div>`;
  },
  implSection(it, rev, u) {
    const g = it.run.cfg.arm === "grounded";
    const cyc = g ? DATA.cycles[it.run.cfg.journey] : null;
    const done = !!rev.implSubmittedAt;
    return `<div class="impl-reveal">
      <div class="sc-group" style="padding:0 0 6px">Context and journey implementation</div>
      ${g ? `<div class="stack small">
          <div class="row"><span class="chip grnd">Grounded interview</span><span class="muted">${esc(cyc.short_title.replace(/^Cycle \d: /, ""))}</span></div>
          ${sparkline(cyc, { key: "rv", h: 36 })}
          <div><b>Cue supplied at Q${it.i + 1}:</b> <code>${esc(it.turn.state_before)}</code></div>
          ${it.i ? `<div class="muted">Previous turn's cue: <code>${esc(it.run.turns[it.i - 1].state_before)}</code></div>` : ""}
          <details><summary style="cursor:pointer">Behavior rules in the card</summary><ul style="margin:6px 0 0;padding-left:18px">${rulesFor(it.run.cfg).map((r) => `<li>${esc(r)}</li>`).join("")}</ul></details>
        </div>` : `<div class="row small"><span class="chip base">Baseline interview</span><span class="muted">No journey was supplied, so these checks do not apply.</span></div>`}
    </div>
    ${g ? IMPL.map((c) => this.critRow(c, rev, it, u, done)).join("") : ""}
    <div class="footer-bar"><span class="small muted">${done ? `${ICON.check} Review complete` : ""}</span>
      ${done ? `<button class="btn primary" data-action="item-step" data-d="1">Next response</button>`
        : `<button class="btn primary" data-action="submit-impl" ${!g || IMPL.every((c) => scoreVal(rev, c.id) !== undefined) ? "" : "disabled"}>${g ? "Submit checks" : "Mark complete"}</button>`}</div>`;
  },
  support(it, k) {
    if (k === "profile") return `<p class="read" style="font-size:15px">${esc(runPersonaText(it.run))}</p>`;
    if (k === "history") {
      if (!it.i) return `<p class="faint">This is the first question, so there are no earlier replies.</p>`;
      const qs = questionsOf(it.run.cfg.product);
      return it.run.turns.slice(0, it.i).map((t, k2) => `<div class="history-item"><div class="tiny faint">Q${k2 + 1}. ${esc(qs[k2].question)}</div><div class="read" style="font-size:14.5px">${esc(t.reply)}</div></div>`).join("");
    }
    return isScreen(it.q)
      ? `<img class="thumb lg" src="${it.q.screenshot_data_uri}" alt="Product screen"/><p class="tiny faint" style="margin-top:6px">This screen was attached to the question.</p>`
      : `<p class="muted">This is a topic-only question. No screen or product facts were supplied, so judge specificity by what the persona says she would need.</p><p class="tiny faint" style="margin-top:6px">${esc(it.q.participant_instruction || "")}</p>`;
  },

  bind() {
    const save = () => { persist(); App.render(); };
    const touch = (rev) => { rev.updatedAt = new Date().toISOString(); };
    App.on("open-item", (el) => { const u = evalUi(); u.view = "item"; u.item = el.dataset.id; u.support = null;
      u.open = firstReviewCriterion(myReview(u.item), itemContext(u.item)); save(); window.scrollTo(0, 0); });
    App.on("eval-home", () => { evalUi().view = "home"; save(); });
    App.on("qorder", (el) => { evalUi().order = el.dataset.k; save(); });
    App.on("qview", (el) => { evalUi().qview = el.dataset.k; save(); });
    App.on("qprogress", (el) => { evalUi().progress = el.dataset.k; save(); });
    App.on("qgroup", (el) => { const u = evalUi(); u.open_groups = u.open_groups || {}; const k = el.dataset.k; u.open_groups[k] = u.open_groups[k] === false; save(); });
    App.on("scope-all", (el) => {
      const u = evalUi(); const ids = Object.values(allStudies()).filter((s) => s.product === el.dataset.p && s.baselineRuns.length).map((s) => s.id);
      u.scope = el.dataset.v === "1" ? Array.from(new Set([...u.scope, ...ids])) : u.scope.filter((x) => !ids.includes(x));
      save();
    });
    App.on("qfilter", (el) => { evalUi().filter = el.dataset.f; save(); });
    App.on("lane", (el) => { STORE.reviewer.lane = el.dataset.lane; save(); });
    App.on("scope", (el) => { const u = evalUi(); const id = el.dataset.study; u.scope = u.scope.includes(id) ? u.scope.filter((x) => x !== id) : [...u.scope, id]; save(); });
    App.on("refresh-team", () => { App.render(); });
    App.on("item-step", (el) => {
      const u = evalUi(); const items = queueItems(); const pos = items.indexOf(u.item);
      const n = items[pos + Number(el.dataset.d)]; if (n) { u.item = n; u.support = null; u.open = firstReviewCriterion(myReview(n), itemContext(n)); save(); window.scrollTo(0, 0); }
    });
    App.on("open-crit", (el) => { const u = evalUi(); u.open = u.open === el.dataset.c ? null : el.dataset.c; save(); });
    App.on("support", (el) => { const u = evalUi(); u.support = u.support === el.dataset.k ? null : el.dataset.k; save(); });
    App.on("score", (el) => {
      if (STORE.reviewer.lane === "llm") { toast("Switch to Human or Jev to score manually. Use LLM judge controls in the queue view."); return; }
      if (STORE.reviewer.lane === "human" && !STORE.reviewer.name.trim()) { toast("Add your name in the queue view first"); return; }
      const u = evalUi(); const rev = myReview(u.item, true); const c = el.dataset.c;
      if (!ALL_CRIT.some((criterion) => criterion.id === c) || criterionLocked(rev, c)) return;
      rev.scores[c] = rev.scores[c] || { evidence: [], note: "" };
      const raw = el.dataset.v;
      if (raw === "clear") delete rev.scores[c].v; else rev.scores[c].v = raw === "na" ? "na" : Number(raw);
      touch(rev);
      // move to the next unscored criterion in the same pass
      const pass = ADDED_MEASURE_IDS.has(c) && rev.commonSubmittedAt ? ADDED_MEASURES : COMMON.some((x) => x.id === c) ? COMMON : IMPL;
      const nxt = pass.find((x) => scoreVal(rev, x.id) === undefined);
      if (raw !== "clear" && nxt) u.open = nxt.id;
      save();
    });
    App.on("rm-evi", (el) => { const rev = myReview(evalUi().item, true); rev.scores[el.dataset.c].evidence.splice(Number(el.dataset.k), 1); touch(rev); save(); });
    App.on("flag-factual", () => { const rev = myReview(evalUi().item, true); const f = rev.flags.factual || {}; f.on = !f.on; rev.flags.factual = f; touch(rev); save(); });
    App.on("submit-common", () => {
      const u = evalUi(); const rev = myReview(u.item, true);
      if (rev.commonSubmittedAt) return;
      if (!COMMON.every((c) => scoreVal(rev, c.id) !== undefined)) { toast("Rate all seven criteria, or mark a criterion not applicable, before submitting."); return; }
      rev.commonSubmittedAt = new Date().toISOString();
      rev.commonAudit = rev.commonAudit || Object.fromEntries(COMMON.map((c) => [c.id, scoreVal(rev, c.id)]));
      rev.additionalAudit = rev.additionalAudit || Object.fromEntries(ADDED_MEASURES.map((c) => [c.id, scoreVal(rev, c.id)]));
      rev.additionalSubmittedAt = rev.additionalSubmittedAt || rev.commonSubmittedAt;
      rev.additionalRubricVersion = rev.additionalRubricVersion || HUMAN_RUBRIC_VERSION;
      const it = itemContext(u.item);
      if (it.i === 0) { rev.scores.trajectory = rev.scores.trajectory || { v: "na", evidence: [], note: "" }; }
      u.open = it.run.cfg.arm === "grounded" ? IMPL.find((c) => scoreVal(rev, c.id) === undefined)?.id || null : null;
      save(); toast("Common scores submitted. The cue is now revealed.");
    });
    App.on("submit-additional", () => {
      const rev = myReview(evalUi().item, true);
      if (!rev.commonSubmittedAt || addedMeasuresLocked(rev) || !ADDED_MEASURES.every((c) => scoreVal(rev, c.id) !== undefined)) return;
      rev.additionalAudit = Object.fromEntries(ADDED_MEASURES.map((c) => [c.id, scoreVal(rev, c.id)]));
      rev.additionalSubmittedAt = new Date().toISOString();
      rev.additionalRubricVersion = HUMAN_RUBRIC_VERSION;
      touch(rev); save(); toast("Additional measures saved. Original scores are unchanged.");
    });
    App.on("unlock-common", () => {
      const rev = myReview(evalUi().item, true);
      rev.auditTrail = rev.auditTrail || []; rev.auditTrail.push({ at: new Date().toISOString(), scores: rev.commonAudit });
      delete rev.commonSubmittedAt; delete rev.implSubmittedAt; save();
      toast("Unlocked. Your original common scores stay on record.");
    });
    App.on("submit-impl", () => {
      const u = evalUi(); const rev = myReview(u.item, true); const it = itemContext(u.item);
      if (it.run.cfg.arm !== "grounded") IMPL.forEach((c) => (rev.scores[c.id] = { v: "na", evidence: [], note: "Baseline" }));
      rev.implSubmittedAt = new Date().toISOString(); touch(rev); save();
    });
    App.on("judge-run", () => { if (!connReady()) return connModal(() => runJudge()); runJudge(); });
    App.on("judge-run-force", () => { if (!connReady()) return connModal(() => runJudge(true)); runJudge(true); });
    App.on("judge-summaries", () => { if (!connReady()) return connModal(() => runJudge(false, true)); runJudge(false, true); });
    App.on("judge-stop", () => { JUDGE.stop = true; });
    onDrop("evidence", (text, target) => {
      const u = evalUi(); if (!target || !ALL_CRIT.find((c) => c.id === target)) return;
      const rev = myReview(u.item, true);
      if (criterionLocked(rev, target)) { toast("That pass is submitted. Revise it to add evidence."); return; }
      rev.scores[target] = rev.scores[target] || { evidence: [], note: "" };
      rev.scores[target].evidence = rev.scores[target].evidence || [];
      if (!rev.scores[target].evidence.some((e) => e.text === text)) rev.scores[target].evidence.push({ text });
      u.open = target; touch(rev); hideSelChip(); window.getSelection().removeAllRanges(); save();
      toast(`Evidence attached to ${ALL_CRIT.find((c) => c.id === target).name}`);
    });
    App.onInput("reviewer-name", (el) => { STORE.reviewer.name = el.value; persist(); }, "blur-render");
    App.onInput("crit-note", (el) => { const rev = myReview(evalUi().item, true); rev.scores[el.dataset.c] = rev.scores[el.dataset.c] || { evidence: [] }; rev.scores[el.dataset.c].note = el.value; touch(rev); persist(); flashSaved(); });
    App.onInput("factual-note", (el) => { const rev = myReview(evalUi().item, true); rev.flags.factual.note = el.value; touch(rev); persist(); flashSaved(); });

    document.addEventListener("mouseup", (e) => setTimeout(() => maybeSelChip(e), 0));
    document.addEventListener("keyup", (e) => { if (e.shiftKey) maybeSelChip(e); });
    document.addEventListener("pointerdown", (e) => { if (!e.target.closest(".sel-chip")) hideSelChip(); });
    document.addEventListener("keydown", (e) => {
      if (App.ws !== "evaluate" || evalUi().view !== "item") return;
      if (e.target.closest("input, textarea, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const u = evalUi(); const rev = myReview(u.item) || {};
      const pass = !rev.commonSubmittedAt ? COMMON : !addedMeasuresLocked(rev) ? ADDED_MEASURES : itemContext(u.item).run.cfg.arm === "grounded" ? IMPL : [];
      if (!pass.length) return;
      const idx = Math.max(0, pass.findIndex((c) => c.id === u.open));
      if (/^[0-3]$/.test(e.key) || e.key.toLowerCase() === "n") {
        if (!u.open || !pass.find((c) => c.id === u.open)) return;
        const btn = document.createElement("button"); btn.dataset.c = u.open; btn.dataset.v = e.key.toLowerCase() === "n" ? "na" : e.key;
        App.dispatch("score", btn); e.preventDefault();
      } else if (e.key.toLowerCase() === "j" || e.key.toLowerCase() === "k") {
        u.open = pass[Math.max(0, Math.min(pass.length - 1, idx + (e.key.toLowerCase() === "j" ? 1 : -1)))].id; save(); e.preventDefault();
      }
    });
  },
};
function badge(v) {
  if (v === undefined || v === null) return `<span class="score-badge unscored" aria-label="Unscored">Unscored</span>`;
  if (v === "na") return `<span class="score-badge na" aria-label="Not applicable">N/A</span>`;
  return `<span class="score-badge v${v === 0 ? " v0" : ""}" aria-label="Score ${v}">${v}</span>`;
}
function evidenceTexts(rev) { const out = []; Object.values((rev && rev.scores) || {}).forEach((s) => (s.evidence || []).forEach((e) => out.push(e.text))); return out; }
function highlightText(text, quotes) {
  let html = esc(text);
  Array.from(new Set(quotes)).filter((q) => q && q.length > 2).sort((a, b) => b.length - a.length).forEach((q) => {
    const eq = esc(q);
    const i = html.indexOf(eq);
    if (i >= 0 && !/<mark[^>]*>[^<]*$/.test(html.slice(0, i))) html = html.slice(0, i) + `<mark>${eq}</mark>` + html.slice(i + eq.length);
  });
  return html;
}
function flashSaved() { const t = $("#savedTick"); if (t) t.textContent = "Autosaved just now"; }
function maybeSelChip(e) {
  if (App.ws !== "evaluate" && App.ws !== "compare") return;
  const sel = window.getSelection(); const txt = sel ? sel.toString().trim().replace(/\s+/g, " ") : "";
  const host = sel && sel.rangeCount ? sel.getRangeAt(0).commonAncestorContainer : null;
  const zone = host && (host.nodeType === 1 ? host : host.parentElement).closest(".answer-text, .reply-text");
  if (!txt || !zone || txt.length < 3) return;
  hideSelChip();
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  const chip = document.createElement("div");
  chip.className = "sel-chip";
  if (App.ws === "evaluate") {
    chip.dataset.drag = "evidence"; chip.dataset.value = txt;
    const open = evalUi().open; if (open) chip.dataset.defaultDrop = open;
    chip.textContent = open ? `Drag to a criterion, or click to add to ${ALL_CRIT.find((c) => c.id === open).name}` : "Drag to a criterion";
  } else {
    chip.dataset.drag = "quote"; chip.dataset.value = JSON.stringify({ text: txt, side: zone.dataset.side });
    chip.dataset.defaultDrop = "new";
    chip.textContent = "Drag to observations, or click to start one";
  }
  chip.tabIndex = 0;
  chip.style.left = Math.max(8, rect.left + window.scrollX) + "px";
  chip.style.top = rect.bottom + window.scrollY + 8 + "px";
  document.body.appendChild(chip);
}
function hideSelChip() { $$(".sel-chip").forEach((c) => c.remove()); }

const JUDGE = { running: false, done: 0, total: 0, stop: false, error: null, last: "" };
async function runJudge(forceAll = false, summariesOnly = false) {
  if (JUDGE.running) return;
  const c = getConn(); const items = queueItems();
  const ek = judgeLaneKey(c);
  const pending = items.filter((id) => !llmReviewComplete(id, ek));
  const runIds = Array.from(new Set(items.map((id) => parseItem(id).runId)));
  const missingSummaries = runIds.filter((runId) => !((STORE.judgeSummaries[ek] || {})[runId] || {}).text);
  const todo = summariesOnly ? [] : (forceAll ? items.slice() : pending);
  if (!items.length) {
    JUDGE.last = "No queue items are selected. Turn on at least one study in the scope panel.";
    App.render(); toast("No queue items to score");
    return;
  }
  if (!todo.length && !missingSummaries.length) {
    JUDGE.last = `Nothing to run. All ${items.length} queue items already have LLM scores in lane "${ek.replace(/^llm:/, "")}", and interview summaries already exist.`;
    App.render(); toast("No pending items for this model lane");
    return;
  }
  Object.assign(JUDGE, {
    running: true,
    done: forceAll || summariesOnly ? 0 : items.length - todo.length,
    total: summariesOnly ? Math.max(1, missingSummaries.length) : items.length,
    stop: false,
    error: null,
    last: summariesOnly
      ? `Generating ${missingSummaries.length} missing interview summaries on lane "${ek.replace(/^llm:/, "")}"...`
      : `Running ${todo.length} ${forceAll ? "(forced)" : "pending"} items on lane "${ek.replace(/^llm:/, "")}"...`,
  });
  App.render();
  for (const id of todo) {
    if (JUDGE.stop) break;
    try { await judgeItem(id, c); JUDGE.done++; }
    catch (err) { JUDGE.error = `Stopped at ${anonCode(id)}: ${err.message || err}`; break; }
    App.renderSoon();
  }
  if (!JUDGE.stop && !JUDGE.error) {
    const summaryOnlyMode = summariesOnly || (!todo.length && missingSummaries.length);
    const summaryTargets = summaryOnlyMode ? missingSummaries : runIds;
    for (const runId of summaryTargets) {
      if (JUDGE.stop) break;
      try { await judgeInterviewSummary(runId, c); }
      catch (err) { JUDGE.error = `Summary failed at ${anonCode(runId + "#0").replace("Q1", "Interview")}: ${err.message || err}`; break; }
      if (summaryOnlyMode) JUDGE.done++;
      App.renderSoon();
    }
  }
  JUDGE.running = false; App.render();
  if (!JUDGE.error) {
    JUDGE.last = JUDGE.stop
      ? `Stopped manually. Completed ${JUDGE.done}/${JUDGE.total}.`
      : `Finished. Completed ${JUDGE.done}/${JUDGE.total} on lane "${ek.replace(/^llm:/, "")}".`;
    App.render();
    toast(JUDGE.stop ? "LLM judge stopped" : "LLM judge finished (scores + interview summaries)");
  } else { JUDGE.last = JUDGE.error; App.render(); }
}
