/* Experiment Studio · Compare results workspace */
"use strict";

function cmpUi() {
  STORE.ui.cmp = STORE.ui.cmp || { study: "study_C1_sub_fine_full", crit: "persona", q: null, lane: "human", obs: "all", drawer: null, tab: "persona", shelf: "subscription-management" };
  const u = STORE.ui.cmp;
  if (!studyById(u.study)) u.study = studyById("study_C1_sub_fine_full") ? "study_C1_sub_fine_full" : Object.keys(allStudies())[0];
  if (u.q != null && !(Number.isInteger(u.q) && u.q >= 0 && u.q <= 6)) u.q = null;
  if (!COMMON.some((c) => c.id === u.crit)) u.crit = "persona";
  if (![...EVALUATORS.map((e) => e.id), "all"].includes(u.lane)) u.lane = "human";
  if (!PRODUCTS.some((p) => p.id === u.shelf && !p.missing)) u.shelf = studyById(u.study).product;
  return u;
}
function armRuns(study, arm) { return (arm === "b" ? study.baselineRuns : study.groundedRuns).map(runById).filter(Boolean); }
function armScore(study, arm, i, cid, lane) {
  const vals = armRuns(study, arm).map((r) => (r.turns[i] && r.turns[i].status === "done" ? laneScore(itemId(r.id, i), lane, cid) : null)).filter((v) => typeof v === "number");
  return vals.length ? median(vals) : null;
}
function critSummary(study, cid, lane) {
  let hi = 0, same = 0, lo = 0, scored = 0;
  for (let i = 0; i < 7; i++) {
    const b = armScore(study, "b", i, cid, lane), g = armScore(study, "g", i, cid, lane);
    if (b == null || g == null) continue;
    scored++; if (g > b) hi++; else if (g < b) lo++; else same++;
  }
  return { hi, same, lo, scored };
}
function cycleLabel(cyc) { return `Emotional cycle ${String(cyc.id).replace(/\D/g, "")}`; }
function cycleFeeling(cyc) { return cyc.short_title.replace(/^Cycle \d+: /, ""); }
/* One shelf block per journey + persona + memory policy; its cue-detail variants become a switch inside the block. */
function shelfGroupKey(study) {
  const c = armRuns(study, "g")[0].cfg;
  return [c.journey, c.persona, c.profileHash || "seed", c.keep, c.profileFreq, study.origin].join("|");
}
function shelfGroups(studies) {
  const groups = {};
  studies.forEach((st) => {
    const gr = armRuns(st, "g")[0]; if (!gr) return;
    const key = shelfGroupKey(st);
    (groups[key] = groups[key] || { key, cfg: gr.cfg, origin: st.origin, options: [] }).options.push({ st, gr });
  });
  const detailOrder = Object.keys(DETAIL);
  const personaOrder = PERSONAS.map((p) => p.id);
  const list = Object.values(groups);
  list.forEach((g) => {
    g.options.sort((a, b) => detailOrder.indexOf(a.gr.cfg.detail) - detailOrder.indexOf(b.gr.cfg.detail));
    g.options.forEach((o) => {
      const same = g.options.filter((x) => x.gr.cfg.detail === o.gr.cfg.detail);
      o.label = DETAIL[o.gr.cfg.detail].name + (same.length > 1 ? ` · ${TIMING[o.gr.cfg.timing].name.toLowerCase()}` : "");
    });
  });
  return list.sort((a, b) => (a.origin === b.origin ? 0 : a.origin === "saved" ? -1 : 1)
    || a.cfg.journey.localeCompare(b.cfg.journey) || personaOrder.indexOf(a.cfg.persona) - personaOrder.indexOf(b.cfg.persona));
}
function coverage(study, lane) {
  const items = studyItems(study);
  const done = items.filter((id) => reviewsFor(id).some((x) => (lane === "all" || x.lane === lane) && x.r.commonSubmittedAt)).length;
  return { done, total: items.length };
}

const Compare = {
  render() {
    const u = cmpUi(); const s = studyById(u.study);
    const demo = hasDemo();
    return `${demo ? `<div class="banner-demo" style="margin-bottom:14px"><span><b>Illustrative scores are loaded.</b> They are placeholders for exploring this view, not real reviews.</span><button class="btn sm" data-action="clear-demo">Remove illustrative scores</button></div>` : ""}
      ${this.picker(u, s)}
      ${s ? this.body(u, s) : ""}`;
  },

  picker(u, s) {
    const studies = Object.values(allStudies()).filter((x) => x.product === u.shelf);
    const b = s ? armRuns(s, "b")[0] : null, g = s ? armRuns(s, "g")[0] : null;
    return `<section class="panel panel-pad" style="margin-bottom:16px">
      <div class="spread" style="margin-bottom:10px"><h2>Choose the comparison</h2>
        <div class="seg" role="group" aria-label="Product">${PRODUCTS.filter((p) => !p.missing).map((p) => `<button data-action="shelf" data-p="${p.id}" aria-pressed="${u.shelf === p.id}">${p.short}</button>`).join("")}</div></div>
      <p class="tray-hint">Drag a grounded configuration onto the right slot. Its matched baseline fills the left slot, and your selected question stays put.</p>
      <div class="shelf">${shelfGroups(studies).map((grp) => {
        u.pick = u.pick || {};
        const sel = grp.options.find((o) => o.st.id === u.study) || grp.options.find((o) => o.st.id === u.pick[grp.key]) || grp.options[0];
        const st = sel.st, gr = sel.gr;
        const cyc = DATA.cycles[gr.cfg.journey]; const cov = coverage(st, "all");
        return `<div class="block${st.id === u.study ? " placed" : ""}" data-drag="study" data-value="${st.id}" data-default-drop="grounded-slot" tabindex="0">
          <div class="b-title">${cycleLabel(cyc)}</div>
          <div class="b-sub">${esc(cycleFeeling(cyc))}</div>
          ${sparkline(cyc, { key: "sh" + st.id, h: 30 })}
          <div class="seg" role="group" aria-label="Cue detail for ${cycleLabel(cyc)}">${grp.options.map((o) => `<button data-action="cmp-pick" data-g="${esc(grp.key)}" data-s="${o.st.id}" aria-pressed="${o === sel}" title="${esc(DETAIL[o.gr.cfg.detail].sub)}">${esc(o.label)}</button>`).join("")}</div>
          <div class="b-meta">${st.baselineRuns.length ? "" : '<span class="chip warn">No matched baseline</span>'}${st.origin === "live" ? '<span class="chip focus">Launched here</span>' : ""}</div>
          <div class="tiny faint">${PERSONAS.find((p) => p.id === gr.cfg.persona).variant} · reviewed ${cov.done}/${cov.total}</div>
        </div>`;
      }).join("")}</div>
      <div class="pair-slots" style="margin-top:6px">
        <div class="pair-slot base"><div class="row"><span class="dot base"></span><b>Baseline</b><span class="faint small">matched automatically</span></div>
          ${b ? `<div class="small muted">${esc(runConfigLine(b))}</div><div class="tiny faint">${PERSONAS.find((p) => p.id === b.cfg.persona).variant} · ${s.baselineRuns.length} interview${s.baselineRuns.length > 1 ? "s" : ""}</div>`
            : `<div class="note warn small">No baseline shares this persona and memory policy. Launch one from Design study to complete the pair.</div>`}</div>
        <div class="pair-slot grnd" data-drop="study" data-drop-id="grounded-slot"><div class="row"><span class="dot grnd"></span><b>Grounded</b><span class="faint small">${g ? `${cycleLabel(DATA.cycles[g.cfg.journey])} · ${esc(cycleFeeling(DATA.cycles[g.cfg.journey]))}` : "drop a configuration"}</span><span class="grow"></span>${s ? `<button class="btn sm" data-action="inspect">Inspect the run</button>` : ""}</div>
          ${g ? `<div class="small muted">${esc(runConfigLine(g))}</div><div class="tiny faint">${s.groundedRuns.length} interview${s.groundedRuns.length > 1 ? "s" : ""}${g.origin === "saved" ? " · saved v3 run" : " · " + fmtTime(g.createdAt)}</div>` : ""}</div>
      </div>
    </section>`;
  },

  body(u, s) {
    const cov = coverage(s, u.lane); const covAll = EVALUATORS.map((e) => ({ e, c: coverage(s, e.id) }));
    const partial = cov.done < cov.total;
    const anyScores = studyItems(s).some((id) => reviewsFor(id).length);
    return `
      <section class="summary-strip" style="margin-bottom:16px">
        <div class="count"><span>Status</span><b style="font-size:16px;margin-top:4px">${!anyScores ? "Not reviewed yet" : partial ? "In progress" : "Complete"}</b></div>
        <div class="count"><span>Matched questions</span><b>${s.baselineRuns.length ? 7 : 0}</b></div>
        <div class="count"><span>Review coverage, ${EVALUATORS.find((e) => e.id === u.lane)?.name || "all evaluators"}</span><b>${cov.done}<span style="font-size:13px;color:var(--ink-3)"> / ${cov.total}</span></b></div>
        <div class="count"><span>Coverage by evaluator</span><div class="small" style="margin-top:6px">${covAll.map((x) => `${x.e.name} ${x.c.done}/${x.c.total}`).join("<br/>")}</div></div>
      </section>
      ${!anyScores ? `<section class="panel panel-pad" style="margin-bottom:16px"><div class="spread"><div><h3>No reviews for this pair yet</h3><p class="small muted">Score responses in Evaluate, or run the LLM judge there. To explore this view first, load illustrative scores.</p></div>
        <div class="row"><button class="btn" data-action="go-eval">Open Evaluate</button><button class="btn ghost" data-action="seed-demo">Load illustrative scores</button></div></div></section>` : ""}
      <section class="panel panel-pad" style="margin-bottom:16px">
        <div class="spread" style="margin-bottom:12px"><div><h2>Common criteria</h2><p class="tiny faint">Each question's score is the median across that evaluator's reviewers and replicates. Criteria stay separate so gains and losses both show.</p></div>
          <div class="row"><span class="small faint">Evaluator</span><div class="seg" role="group" aria-label="Evaluator">${[...EVALUATORS, { id: "all", name: "All" }].map((e) => `<button data-action="lane-cmp" data-lane="${e.id}" aria-pressed="${u.lane === e.id}">${e.name}</button>`).join("")}</div></div></div>
        <div class="crit-board">
          <div class="grp">Behavioral consistency</div><div class="grp g3">Product feedback</div>
          ${COMMON.map((c) => this.tile(s, c, u)).join("")}
        </div>
      </section>
      ${this.critDetail(u, s)}
      ${u.q != null ? this.questionPanel(u, s) : ""}
      ${this.implSection(u, s)}`;
  },
  tile(s, c, u) {
    const m = critSummary(s, c.id, u.lane);
    const tot = Math.max(1, m.scored);
    return `<button class="ctile" data-action="crit" data-c="${c.id}" aria-pressed="${u.crit === c.id}">
      <b class="small">${c.name}</b>
      <div class="ministack" aria-hidden="true">${m.scored ? `<i style="width:${(100 * m.hi) / tot}%;background:var(--pos)"></i><i style="width:${(100 * m.same) / tot}%;background:var(--line-2)"></i><i style="width:${(100 * m.lo) / tot}%;background:var(--neg)"></i>` : ""}</div>
      <div class="hsl"><span style="color:#1d7f62">${ICON.up}${m.hi} higher</span><span class="faint">${ICON.eq}${m.same}</span><span style="color:#b8364a">${ICON.down}${m.lo} lower</span></div>
      <span class="tiny faint">${m.scored} of 7 questions scored on both sides</span>
    </button>`;
  },
  critDetail(u, s) {
    const c = COMMON.find((x) => x.id === u.crit) || COMMON[0];
    const dist = (arm) => { const d = [0, 0, 0, 0]; for (let i = 0; i < 7; i++) { const v = armScore(s, arm, i, c.id, u.lane); if (v != null) d[Math.round(v)]++; } return d; };
    const db = dist("b"), dg = dist("g"); const mx = Math.max(1, ...db, ...dg);
    return `<section class="panel panel-pad" style="margin-bottom:16px">
      <div class="spread" style="margin-bottom:4px"><div><h2>${c.name}</h2><p class="small muted">${c.ask} Select a question to read both answers.</p></div></div>
      ${twinRail({ mode: "scores", selected: u.q, action: "cmp-q", scoreAt: (i, arm) => armScore(s, arm, i, c.id, u.lane), aria: `${c.name} scores by question` })}
      <div class="slot-pair" style="margin-top:8px">
        ${[["b", "Baseline", db, "var(--base)"], ["g", "Grounded", dg, "var(--grnd)"]].map(([k, l, d, col]) => `<div>
          <div class="slot-label">${l}: score distribution across questions</div>
          <div class="dist">${[0, 1, 2, 3].map((v) => `<div class="col" style="grid-column:${v + 2}"><span class="tiny">${d[v]}</span><div class="bar" style="height:${(52 * d[v]) / mx}px;background:${col}" title="${d[v]} question${d[v] === 1 ? "" : "s"} scored ${v}"></div></div>`).join("")}
            <span class="tiny faint" style="grid-row:2">Score</span>${[0, 1, 2, 3].map((v) => `<span class="tiny" style="grid-row:2;text-align:center">${v}</span>`).join("")}</div></div>`).join("")}
      </div>
    </section>`;
  },
  questionPanel(u, s) {
    const i = u.q; const b = armRuns(s, "b")[0], g = armRuns(s, "g")[0];
    const q = questionsOf(s.product)[i];
    const obs = STORE.observations.filter((o) => o.study === s.id && o.q === i);
    const filters = [["all", "All"], ["both", "Appears in both"], ["baseline", "Baseline only"], ["config", "Selected configuration only"], ["none", "No material difference"]];
    const shown = obs.filter((o) => u.obs === "all" || o.kind === u.obs);
    const auto = g && g.origin === "saved" && DATA.insights[g.cfg.journey] && DATA.insights[g.cfg.journey][s.product] ? DATA.insights[g.cfg.journey][s.product][i] : null;
    return `<section class="panel panel-pad" style="margin-bottom:16px" id="qpanel">
      <div class="spread" style="margin-bottom:10px"><div class="row"><h2>Question ${i + 1}</h2><span class="chip">${isScreen(q) ? "With screen" : "Topic-only"}</span></div>
        <div class="row"><button class="btn sm" data-action="cmp-q" data-i="${Math.max(0, i - 1)}" ${i === 0 ? "disabled" : ""}>Previous</button><button class="btn sm" data-action="cmp-q" data-i="${Math.min(6, i + 1)}" ${i === 6 ? "disabled" : ""}>Next</button><button class="btn ghost sm" data-action="cmp-q-close">Close</button></div></div>
      <div class="row" style="align-items:flex-start;gap:16px;margin-bottom:16px"><p class="grow" style="font-size:15px">${esc(q.question)}</p>
        ${isScreen(q) ? `<img class="thumb" style="width:120px;height:80px" src="${q.screenshot_data_uri}" alt="Screen" data-action="zoom" data-pid="${s.product}" data-i="${i}"/>` : ""}</div>
      <div class="qcompare">${this.replyCard(s, b, i, "b", u, obs)}${this.replyCard(s, g, i, "g", u, obs)}</div>
      <div style="margin-top:20px" data-drop="quote" data-drop-id="new" class="dropzone">
        <div class="spread" style="margin-bottom:10px"><h3>Observations</h3>
          <div class="row wrap">${filters.map(([k, l]) => `<button class="chip" data-action="obs-filter" data-k="${k}" aria-pressed="${u.obs === k}">${l} · ${k === "all" ? obs.length : obs.filter((o) => o.kind === k).length}</button>`).join("")}</div></div>
        <p class="tiny faint" style="margin-bottom:10px">Select words in either answer and drag them here to start an observation, or onto an existing one to link the other side. A point found in both answers can still gain useful detail on one side.</p>
        <div class="stack">${shown.map((o) => this.obsCard(o)).join("") || `<p class="faint small">No observations match this filter.</p>`}</div>
        <div class="row" style="margin-top:12px"><button class="btn sm" data-action="obs-none">Record no material difference</button></div>
        ${auto ? `<div class="obs auto" style="margin-top:12px"><div class="tiny faint">Automated note from the v3 dashboard, comparing all three prompt levels</div><div class="small">${esc(auto)}</div></div>` : ""}
      </div>
      ${this.evalCompare(s, i)}
    </section>`;
  },
  replyCard(s, run, i, arm, u, obs) {
    const isB = arm === "b";
    if (!run) return `<div class="reply-card ${isB ? "base" : "grnd"}"><div class="rc-head"><b>${isB ? "Baseline" : "Grounded"}</b></div><div class="rc-body"><p class="faint">No run available.</p></div></div>`;
    const t = run.turns[i];
    const id = itemId(run.id, i);
    const revs = reviewsFor(id).filter((x) => u.lane === "all" || x.lane === u.lane);
    const quotes = []; revs.forEach((x) => Object.values(x.r.scores || {}).forEach((sc) => (sc.evidence || []).forEach((e) => quotes.push(e.text))));
    obs.forEach((o) => (isB ? o.base : o.grnd).forEach((q) => quotes.push(q)));
    const notes = []; revs.forEach((x) => Object.entries(x.r.scores || {}).forEach(([cid, sc]) => sc.note && COMMON_IDX[cid] && notes.push({ who: x.ek.replace(/^human:/, ""), c: cid, n: sc.note })));
    return `<div class="reply-card ${isB ? "base" : "grnd"}">
      <div class="rc-head"><div class="row"><span class="dot ${isB ? "base" : "grnd"}"></span><b>${isB ? "Baseline" : "Grounded"}</b>${run.cfg.arm === "grounded" ? `<span class="small faint">${esc(moodOf(t.state_before))} cue</span>` : ""}</div><span class="row"><span class="tiny faint">${anonCode(id)} · ${t.words || wordsOf(t.reply)} words</span><button class="btn ghost sm" data-action="open-interview" data-run="${run.id}" data-i="${i}">Prompt blocks</button></span></div>
      <div class="rc-body"><div class="read reply-text" data-side="${isB ? "base" : "grnd"}">${t.status === "done" ? highlightText(t.reply, quotes) : `<span class="faint">Not generated yet (${t.status}).</span>`}</div></div>
      <div class="rc-scores">
        ${COMMON.map((c) => { const v = laneScore(id, u.lane, c.id); return `<div class="score-line"><span>${c.name}</span><span class="row"><span class="pips ${isB ? "base" : "grnd"}">${[1, 2, 3].map((k) => `<i class="${v != null && v >= k ? "on" : ""}"></i>`).join("")}</span><b style="width:22px;text-align:right">${v == null ? (revs.some((x) => scoreVal(x.r, c.id) === "na") ? "N/A" : "–") : fmtNum(v)}</b></span></div>`; }).join("")}
        ${notes.length ? `<details><summary class="tiny" style="cursor:pointer">${notes.length} reviewer note${notes.length > 1 ? "s" : ""}</summary>${notes.map((n) => `<div class="tiny" style="margin-top:4px"><b>${esc(n.who)}</b> on ${COMMON.find((c) => c.id === n.c).name}: ${esc(n.n)}</div>`).join("")}</details>` : ""}
      </div>
    </div>`;
  },
  obsCard(o) {
    const label = { both: "Appears in both", baseline: "Baseline only", config: "Selected configuration only", none: "No material difference" }[o.kind];
    return `<div class="obs" data-drop="quote" data-drop-id="${o.id}">
      <div class="spread"><span class="chip ${o.kind === "config" ? "grnd" : o.kind === "baseline" ? "base" : o.kind === "both" ? "focus" : ""}">${label}</span>
        <div class="row"><span class="tiny faint">${esc(o.author || "")}</span><button class="btn ghost sm" data-action="obs-del" data-id="${o.id}" aria-label="Delete observation">${ICON.x}</button></div></div>
      <textarea class="note-in" rows="1" data-bind="obs-title" data-id="${o.id}" placeholder="${o.kind === "none" ? "Why there is no meaningful difference" : "What the team learns from this"}">${esc(o.title || "")}</textarea>
      ${o.base.map((q) => `<div class="q base">“${esc(q)}”</div>`).join("")}${o.grnd.map((q) => `<div class="q grnd">“${esc(q)}”</div>`).join("")}
    </div>`;
  },
  evalCompare(s, i) {
    const rows = [];
    ["b", "g"].forEach((arm) => armRuns(s, arm).forEach((run) => {
      const id = itemId(run.id, i);
      reviewsFor(id).forEach((x) => rows.push({ arm, ek: x.ek, lane: x.lane, r: x.r }));
    }));
    if (!rows.length) return `<div style="margin-top:20px"><h3>Evaluator comparison</h3><p class="small faint" style="margin-top:6px">No judgments recorded for this question yet.</p></div>`;
    const lanesPresent = new Set(rows.map((r) => r.lane));
    const missing = EVALUATORS.filter((e) => !lanesPresent.has(e.id)).map((e) => e.name);
    // scale difference across the whole study: LLM and Jev mean minus human mean
    const laneMean = (lane) => mean(studyItems(s).flatMap((id) => reviewsFor(id).filter((x) => x.lane === lane).flatMap((x) => COMMON.map((c) => (x.r.commonAudit ? x.r.commonAudit[c.id] : scoreVal(x.r, c.id))))));
    const hm = laneMean("human");
    const scale = ["llm", "jev"].map((l) => { const m = laneMean(l); return m != null && hm != null ? `${EVALUATORS.find((e) => e.id === l).name} averages ${m - hm >= 0 ? "+" : ""}${(m - hm).toFixed(2)} against humans` : null; }).filter(Boolean);
    const table = (arm) => {
      const rs = rows.filter((r) => r.arm === arm);
      const spread = Object.fromEntries(COMMON.map((c) => { const v = rs.map((r) => scoreVal(r.r, c.id)).filter((x) => typeof x === "number"); return [c.id, v.length > 1 ? Math.max(...v) - Math.min(...v) : 0]; }));
      return `<table class="ev-table"><thead><tr><th>${arm === "b" ? '<span class="dot base"></span> Baseline' : '<span class="dot grnd"></span> Grounded'}</th>${COMMON.map((c) => `<th>${c.name}</th>`).join("")}</tr></thead>
        <tbody>${rs.map((r) => `<tr><td>${esc(r.ek.replace(/^human:/, "").replace(/^llm:/, "LLM · "))}${r.r.demo ? ' <span class="tiny faint">(illustrative)</span>' : ""}</td>${COMMON.map((c) => { const v = scoreVal(r.r, c.id); return `<td class="${spread[c.id] >= 2 ? "flag" : ""}" title="${esc(((r.r.scores[c.id] || {}).note) || "")}">${v === undefined ? "–" : v === "na" ? "N/A" : v}</td>`; }).join("")}</tr>`).join("") || `<tr><td colspan="6" class="faint">No judgments</td></tr>`}
        <tr><td class="tiny faint">Disagreement</td>${COMMON.map((c) => `<td class="tiny ${spread[c.id] >= 2 ? "flag" : "faint"}">${spread[c.id] >= 2 ? `${spread[c.id]}-point spread` : spread[c.id] ? "1 point" : "none"}</td>`).join("")}</tr></tbody></table>`;
    };
    return `<div style="margin-top:22px"><div class="spread"><h3>Evaluator comparison</h3><span class="small faint">${[missing.length ? `Missing: ${missing.join(", ")}` : "All three evaluators present", ...scale].join(" · ")}</span></div>
      <div class="slot-pair" style="margin-top:8px">${table("b")}${table("g")}</div></div>`;
  },
  implSection(u, s) {
    const g = armRuns(s, "g")[0]; if (!g) return "";
    return `<section class="panel panel-pad">
      <div class="spread" style="margin-bottom:8px"><div><h2>Journey implementation</h2><p class="small muted">Grounded interview only. Scored after the common pass, with the cue revealed.</p></div></div>
      <table class="ev-table"><thead><tr><th>Check</th>${[1, 2, 3, 4, 5, 6, 7].map((i) => `<th>Q${i}</th>`).join("")}</tr></thead><tbody>
        <tr><td class="small faint">Cue supplied</td>${g.turns.map((t) => `<td class="tiny"><span class="chip focus">${esc(moodOf(t.state_before || ""))}</span></td>`).join("")}</tr>
        ${IMPL.map((c) => `<tr><td>${c.name}</td>${[0, 1, 2, 3, 4, 5, 6].map((i) => { const v = armScore(s, "g", i, c.id, u.lane); const na = v == null && armRuns(s, "g").some((r) => reviewsFor(itemId(r.id, i)).some((x) => scoreVal(x.r, c.id) === "na")); return `<td><b>${v == null ? (na ? "N/A" : "–") : fmtNum(v)}</b></td>`; }).join("")}</tr>`).join("")}
      </tbody></table>
    </section>`;
  },

  drawer(u, s) {
    const g = armRuns(s, "g")[0], b = armRuns(s, "b")[0];
    const i = u.q == null ? 0 : u.q;
    const tabs = [["persona", "Persona"], ["pack", "Product pack"], ["journey", "Source journey"], ["inputs", `Turn inputs · Q${i + 1}`], ["config", "Configuration"]];
    let body = "";
    if (u.tab === "persona") body = `<p class="read" style="font-size:15.5px">${esc(runPersonaText(g))}</p>${g.approvedProfile ? `<div class="stack">${g.approvedProfile.lines.map((l) => `<div class="row small"><span class="prov ${l.prov}">${provName(l.prov)}</span><span>${esc(l.text)}</span></div>`).join("")}</div>` : `<p class="tiny faint">Seed profile from the team's persona dataset (${esc(PERSONAS.find((p) => p.id === g.cfg.persona).variant)}).</p>`}`;
    if (u.tab === "pack") body = `<div class="qseq">${questionsOf(s.product).map((q, k) => `<div class="qitem"><div class="qnum">Q${k + 1}</div><div class="small">${esc(q.question)}</div><div>${isScreen(q) ? `<img class="thumb" src="${q.screenshot_data_uri}" alt="" data-action="zoom" data-pid="${s.product}" data-i="${k}"/>` : ""}</div></div>`).join("")}</div>`;
    if (u.tab === "journey") { const c = DATA.cycles[g.cfg.journey]; body = Design.journeyDetail(c); }
    if (u.tab === "inputs") body = [b, g].filter(Boolean).map((r) => `<div class="pv"><div class="pv-head ${r.cfg.arm === "baseline" ? "base" : "grnd"}">${r.cfg.arm === "baseline" ? "Baseline" : "Grounded"} · Q${i + 1}</div>
        <details class="pv-block"><summary class="pv-lab" style="cursor:pointer">System card</summary><pre>${esc(r.system === "(cached Block A)" ? "" : r.system)}</pre></details>
        ${(r.turns[i].recent || []).length ? `<div class="pv-block"><div class="pv-lab">Verbatim history sent</div>${r.turns[i].recent.map((t) => `<div class="small"><b>Q.</b> ${esc(t.q)}<br/><b>A.</b> <span class="muted">${esc(t.r)}</span></div>`).join("<br/>")}</div>` : ""}
        <div class="pv-block"><div class="pv-lab">Assembled user message</div><pre>${esc(r.turns[i].user || "")}</pre></div>
        ${r.turns[i].think ? `<div class="pv-block"><div class="pv-lab">Private &lt;think&gt; (not shown to reviewers)</div><div class="small muted">${esc(r.turns[i].think)}</div></div>` : ""}</div>`).join("");
    if (u.tab === "config") body = [b, g].filter(Boolean).map((r) => `<div><h3 style="margin-bottom:8px">${r.cfg.arm === "baseline" ? "Baseline" : "Grounded"}</h3><dl class="kv-grid">
        <dt>Run</dt><dd>${esc(r.id)}</dd><dt>Source</dt><dd>${r.origin === "saved" ? "Saved v3 notebook run" : "Launched in Experiment Studio, " + fmtTime(r.createdAt)}</dd>
        <dt>Persona</dt><dd>${esc(PERSONAS.find((p) => p.id === r.cfg.persona).variant)}${r.cfg.profileHash !== "seed" ? " (edited)" : ""}</dd>
        <dt>Journey</dt><dd>${r.cfg.journey ? esc(DATA.cycles[r.cfg.journey].short_title) : "None"}</dd>
        <dt>Cue</dt><dd>${r.cfg.arm === "grounded" ? `${DETAIL[r.cfg.detail].name}, ${TIMING[r.cfg.timing].name.toLowerCase()}${r.legacyArm ? ` (v3 “${r.legacyArm}” arm)` : ""}` : "None"}</dd>
        <dt>Memory</dt><dd>${HISTORY[r.cfg.keep].name}; ${PROFILE_FREQ[r.cfg.profileFreq].name.toLowerCase()}</dd>
        <dt>Model</dt><dd>${r.model ? `${esc(r.model.deployment)}, temperature ${r.model.temperature}, max ${r.model.maxTokens} tokens` : "Not recorded with the saved runs"}</dd>
        <dt>Versions</dt><dd class="small">persona ${r.versions.persona} · pack ${r.versions.pack} · journey ${esc(r.versions.journey)} · ${esc(r.versions.loop)}</dd>
      </dl></div>`).join("");
    return `<div class="drawer-head"><h2>Inspect the run</h2><button class="btn ghost sm" data-action="close-drawer">Close</button></div>
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${u.tab === k}" data-action="drawer-tab" data-k="${k}">${l}</button>`).join("")}</div>
      <div class="drawer-body">${body}</div>`;
  },

  bind() {
    const save = () => { persist(); App.render(); };
    onDrop("study", (v) => {
      const u = cmpUi(); u.pick = u.pick || {};
      [studyById(u.study), studyById(v)].forEach((st) => { if (st && armRuns(st, "g")[0]) u.pick[shelfGroupKey(st)] = st.id; });
      u.study = v; save();
    });
    onDrop("quote", (raw, target) => {
      const u = cmpUi(); const q = safeJson(raw, null); if (!q || u.q == null) return;
      const author = STORE.reviewer.lane === "jev" ? "Jev" : STORE.reviewer.name || "Reviewer";
      let o;
      if (target === "new" || !target) {
        o = { id: "obs_" + hash(raw + Date.now()), study: u.study, q: u.q, title: "", base: [], grnd: [], author, at: new Date().toISOString() };
        STORE.observations.push(o);
      } else o = STORE.observations.find((x) => x.id === target);
      if (!o) return;
      (q.side === "base" ? o.base : o.grnd).push(q.text);
      o.kind = o.base.length && o.grnd.length ? "both" : o.base.length ? "baseline" : "config";
      hideSelChip(); window.getSelection().removeAllRanges(); save();
      setTimeout(() => { const t = $(`[data-bind="obs-title"][data-id="${o.id}"]`); if (t && !o.title) t.focus(); }, 0);
    });
    App.on("shelf", (el) => { cmpUi().shelf = el.dataset.p; save(); });
    App.on("cmp-pick", (el) => {
      const u = cmpUi(); u.pick = u.pick || {};
      u.pick[el.dataset.g] = el.dataset.s;
      const cur = studyById(u.study);
      if (cur && armRuns(cur, "g")[0] && shelfGroupKey(cur) === el.dataset.g) u.study = el.dataset.s;
      save();
    });
    App.on("crit", (el) => { cmpUi().crit = el.dataset.c; save(); });
    App.on("lane-cmp", (el) => { cmpUi().lane = el.dataset.lane; save(); });
    App.on("cmp-q", (el) => { cmpUi().q = Number(el.dataset.i); save(); setTimeout(() => { const p = $("#qpanel"); if (p) p.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); }, 0); });
    App.on("cmp-q-close", () => { cmpUi().q = null; save(); });
    App.on("obs-filter", (el) => { cmpUi().obs = el.dataset.k; save(); });
    App.on("obs-none", () => { const u = cmpUi(); STORE.observations.push({ id: "obs_" + hash(String(Date.now())), study: u.study, q: u.q, title: "", base: [], grnd: [], kind: "none", author: STORE.reviewer.name || "Reviewer", at: new Date().toISOString() }); save(); });
    App.on("obs-del", (el) => { STORE.observations = STORE.observations.filter((o) => o.id !== el.dataset.id); save(); });
    App.onInput("obs-title", (el) => { const o = STORE.observations.find((x) => x.id === el.dataset.id); if (o) { o.title = el.value; persist(); } });
    App.on("inspect", () => { const u = cmpUi(); u.drawer = true; u.tab = u.tab || "persona"; persist(); App.renderDrawer(); });
    App.on("drawer-tab", (el) => { cmpUi().tab = el.dataset.k; persist(); App.renderDrawer(); });
    App.on("close-drawer", () => { cmpUi().drawer = false; persist(); closeLayer(); });
    App.on("seed-demo", () => { seedIllustrative(studyById(cmpUi().study)); toast("Illustrative scores loaded for this pair"); save(); });
    App.on("clear-demo", () => { clearIllustrative(); toast("Illustrative scores removed"); save(); });
    App.on("go-eval", () => { const u = evalUi(); if (!u.scope.includes(cmpUi().study)) u.scope.push(cmpUi().study); App.go("evaluate"); });
    document.addEventListener("keydown", (e) => {
      if (App.ws !== "compare") return;
      const st = e.target.closest && e.target.closest(".station");
      if (st && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); App.dispatch("cmp-q", st); }
    });
  },
};
