/* Experiment Studio · Interviews workspace
   Replicates tab 4 of the v3 dashboard ("Exact Prompt Sent for Each Question"):
   for any run and question, the five prompt blocks (A–E), what changed since the
   previous question, the exact message sent and the answer the model gave. */
"use strict";

const BLOCKS = [
  { k: "A", name: "Persona and rules card", inside: "Who the persona is, the journey's behavior rules, and the <think> / <reply> / <state> format.", change: "Fixed for the whole interview." },
  { k: "B", name: "Live mood state", inside: "One short line, such as patience: low; trust: low; mood: frustrated.", change: "Rewritten before every question." },
  { k: "C", name: "Bounded memory", inside: "Recent questions and spoken replies word for word, older ones as one-line summaries. Private <think> notes never carry forward.", change: "Shifts by one question each time, so length stays flat." },
  { k: "D", name: "Current question and screen", inside: "The interview context, the question, and its product screen when there is one.", change: "Swapped each question." },
  { k: "E", name: "Final reminder", inside: "Restates the persona's current state right before it answers.", change: "Always last." },
];

function ivUi() {
  STORE.ui.iv = STORE.ui.iv || { run: "C1_sub_fine_full", q: 3, think: true, product: "subscription-management", raw: false, card: false };
  const u = STORE.ui.iv;
  if (!runById(u.run)) u.run = "C1_sub_fine_full";
  if (!(Number.isInteger(u.q) && u.q >= 0 && u.q <= 6)) u.q = 0;
  u.product = runById(u.run).cfg.product;
  return u;
}
function runsForProduct(pid) {
  const order = (r) => (r.cfg.arm === "baseline" ? "0" : "1" + (r.cfg.journey || "") + (r.cfg.detail === "brief" ? "a" : "b") + r.cfg.persona);
  return Object.values(allRuns()).filter((r) => r.cfg.product === pid).sort((a, b) => (a.origin === b.origin ? order(a).localeCompare(order(b)) : a.origin === "saved" ? -1 : 1));
}
function runShortTitle(r) {
  if (r.cfg.arm === "baseline") return "Baseline, no journey";
  return runLabel(r);
}
function runTag(r) {
  const parts = [];
  if (r.cfg.arm === "grounded") parts.push(DETAIL[r.cfg.detail].name);
  if (r.cfg.persona !== "full_description") parts.push(PERSONAS.find((p) => p.id === r.cfg.persona).variant);
  if (r.cfg.profileHash !== "seed") parts.push("Edited profile");
  if (String(r.cfg.keep) !== "2" || r.cfg.profileFreq !== "once") parts.push(HISTORY[r.cfg.keep].name);
  return parts;
}

/* Rebuild the turn exactly as the loop assembled it, and check it against the recorded message. */
function rebuildTurn(run, i) {
  const qs = questionsOf(run.cfg.product);
  const prior = run.turns.slice(0, i).map((t, k) => ({ q: qs[k].question, r: t.reply }));
  const t = run.turns[i];
  const built = buildTurn(run.cfg, runPersonaText(run), qs[i], prior, t.state_before || openingState(run.cfg));
  const recorded = (t.user || "").trim();
  return { built, matches: recorded ? recorded === built.userText.trim() : null };
}

const Interviews = {
  render() {
    const u = ivUi(); const run = runById(u.run);
    return `${this.picker(u, run)}${run ? this.body(u, run) : ""}`;
  },

  picker(u, run) {
    const runs = runsForProduct(u.product);
    return `<section class="panel panel-pad" style="margin-bottom:16px">
      <div class="spread" style="margin-bottom:10px"><div><h2>Choose an interview</h2><p class="tray-hint" style="margin:2px 0 0">Drag an interview into the viewer, or press Enter on it. Conditions are visible here, so reviewers should finish blinded scoring first.</p></div>
        <div class="seg" role="group" aria-label="Product">${PRODUCTS.filter((p) => !p.missing).map((p) => `<button data-action="iv-product" data-p="${p.id}" aria-pressed="${u.product === p.id}">${p.short}</button>`).join("")}</div></div>
      <div class="shelf">${runs.map((r) => {
        const cyc = r.cfg.journey ? DATA.cycles[r.cfg.journey] : null;
        const prog = runProgress(r);
        return `<div class="block run-card ${r.cfg.arm === "baseline" ? "is-base" : "is-grnd"}${r.id === u.run ? " placed" : ""}" data-drag="ivrun" data-value="${r.id}" data-default-drop="viewer" tabindex="0">
          <div class="row"><span class="dot ${r.cfg.arm === "baseline" ? "base" : "grnd"}"></span><div class="b-title">${esc(runShortTitle(r))}</div></div>
          ${cyc ? sparkline(cyc, { key: "iv" + r.id, h: 28 }) : `<div class="flatline" aria-hidden="true"></div>`}
          <div class="b-meta">${runTag(r).map((t) => `<span class="chip">${esc(t)}</span>`).join("")}${r.origin === "live" ? '<span class="chip focus">Launched here</span>' : ""}</div>
          <div class="tiny faint">${prog.done}/7 answers${r.origin === "saved" ? " · saved v3 run" : " · " + fmtTime(r.createdAt)}</div>
        </div>`;
      }).join("")}</div>
      <div class="viewer-slot" data-drop="ivrun" data-drop-id="viewer">
        ${run ? `<div class="row"><span class="dot ${run.cfg.arm === "baseline" ? "base" : "grnd"}"></span><b>${esc(productOf(run.cfg.product).name)}</b><span class="muted">· ${esc(runShortTitle(run))}</span><span class="grow"></span><span class="small faint">${esc(runConfigLine(run))}</span></div>` : `<span class="faint">Drop an interview here</span>`}
      </div>
    </section>`;
  },

  body(u, run) {
    const qs = questionsOf(run.cfg.product);
    const i = Math.min(u.q, qs.length - 1);
    const t = run.turns[i];
    const q = qs[i];
    const { built, matches } = rebuildTurn(run, i);
    return `<div class="iv-grid">
      <div class="stack" style="--gap:16px">
        <section class="panel panel-pad">
          <div class="spread" style="margin-bottom:6px"><h2>Question ${i + 1} of 7</h2>
            <div class="row"><button class="btn sm" data-action="iv-q" data-i="${Math.max(0, i - 1)}" ${i === 0 ? "disabled" : ""}>Previous</button><button class="btn sm" data-action="iv-q" data-i="${Math.min(6, i + 1)}" ${i === 6 ? "disabled" : ""}>Next</button></div></div>
          ${this.qRail(run, i)}
          <div class="changes-card">
            <div class="slot-label">What changed since the previous question</div>
            <ul class="change-list">${this.changes(run, i, built).map((c) => `<li><span class="blk-dot blk-${c.k}">${c.k}</span><span>${c.text}</span></li>`).join("")}</ul>
          </div>
        </section>
        <section class="panel panel-pad">
          <div class="spread" style="margin-bottom:12px"><h2>Exact prompt sent</h2>
            <div class="row">${t.tokens ? `<span class="chip">~${t.tokens} prompt tokens</span>` : ""}${matches === true ? `<span class="chip ok" title="The blocks below, joined in order, equal the message recorded with this run.">${ICON.check} Matches the recorded message</span>` : matches === false ? `<span class="chip warn" title="Showing the recorded message below; the block view is a reconstruction.">Rebuilt blocks differ from the record</span>` : ""}</div></div>
          ${this.promptView(run, i, built, q)}
          <div class="row" style="margin-top:12px"><button class="btn ghost sm" data-action="iv-raw" aria-expanded="${u.raw}">${u.raw ? "Hide" : "Show"} the new message as one raw block</button></div>
          ${u.raw ? `<pre class="code raw-block">${esc(t.user || built.userText)}</pre>` : ""}
        </section>
        <section class="panel panel-pad">
          <div class="spread" style="margin-bottom:12px"><h2>What the persona answered</h2>
            <button class="btn sm" data-action="iv-think" aria-pressed="${u.think}">${u.think ? "Hide" : "Show"} private thought</button></div>
          ${this.answer(run, i, t)}
        </section>
      </div>
      <aside class="stack iv-side">
        <section class="panel panel-pad">
          <h3 style="margin-bottom:10px">The five blocks</h3>
          <div class="legend-blocks">${BLOCKS.map((b) => `<div class="lb"><span class="blk-dot blk-${b.k}">${b.k}</span><div><b>${b.name}</b><div class="small muted">${esc(b.inside)}</div><div class="tiny faint">${b.change}</div></div></div>`).join("")}</div>
        </section>
        ${run.cfg.journey ? this.journeyPanel(run, i) : `<section class="panel panel-pad"><h3>No journey</h3><p class="small muted" style="margin-top:6px">This is the baseline interview. It starts at a neutral mood and carries the persona's own &lt;state&gt; tag forward from one question to the next.</p></section>`}
        <section class="panel panel-pad">
          <h3 style="margin-bottom:8px">This interview</h3>
          <dl class="kv-grid">
            <dt>Persona</dt><dd>${esc(PERSONAS.find((p) => p.id === run.cfg.persona).variant)} (${wordsOf(runPersonaText(run))} words)</dd>
            <dt>Journey cue</dt><dd>${run.cfg.arm === "grounded" ? `${DETAIL[run.cfg.detail].name}, ${TIMING[run.cfg.timing].name.toLowerCase()}${run.legacyArm ? ` <span class="faint">(v3 “${run.legacyArm}”)</span>` : ""}` : "None"}</dd>
            <dt>Memory</dt><dd>${HISTORY[run.cfg.keep].name}</dd>
            <dt>Avg reply</dt><dd>${Math.round(mean(run.turns.filter((x) => x.status === "done").map((x) => x.words || wordsOf(x.reply))) || 0)} words</dd>
            ${run.turns.some((x) => x.tokens) ? `<dt>Avg prompt</dt><dd>~${Math.round(mean(run.turns.map((x) => x.tokens)))} tokens</dd>` : ""}
          </dl>
        </section>
      </aside>
    </div>`;
  },

  qRail(run, i) {
    const n = 7, W = 900, H = 92, l = 20, r = 20, y = 34;
    const xs = (k) => l + (k * (W - l - r)) / (n - 1);
    const qs = questionsOf(run.cfg.product);
    const col = run.cfg.arm === "baseline" ? "#5b5bd6" : "#e8885a";
    let s = `<svg class="twin" viewBox="0 0 ${W} ${H}" role="group" aria-label="Questions in this interview">`;
    s += `<line x1="${l}" x2="${W - r}" y1="${y}" y2="${y}" stroke="${col}" stroke-width="3" stroke-linecap="round"/>`;
    qs.forEach((q, k) => {
      const x = xs(k), sel = k === i, st = run.turns[k];
      s += `<g class="station${sel ? " sel" : ""}" data-action="iv-q" data-i="${k}" tabindex="0" role="button" aria-pressed="${sel}" aria-label="Question ${k + 1}">
        <rect class="hit" x="${x - 52}" y="4" width="104" height="${H - 8}" rx="12" fill="transparent"/>
        <circle cx="${x}" cy="${y}" r="${sel ? 10 : 7.5}" fill="${st.status === "done" ? "#fff" : "#f5f4fa"}" stroke="${st.status === "failed" ? "#e05a6b" : col}" stroke-width="${sel ? 3 : 2.2}" ${st.status === "done" ? "" : 'stroke-dasharray="3 3"'}/>
        ${isScreen(q) ? `<rect x="${x - 3}" y="${y - 3}" width="6" height="6" rx="1" fill="${col}"/>` : ""}
        <text x="${x}" y="${y + 28}" text-anchor="middle" font-size="12" font-weight="${sel ? 700 : 500}" fill="#1f1d3d">Q${k + 1}</text>
        <text x="${x}" y="${y + 43}" text-anchor="middle" font-size="10.5" fill="#8d8ba7">${esc(st.state_before ? moodOf(st.state_before) : "")}</text>
      </g>`;
    });
    return s + `</svg>`;
  },

  changes(run, i, built) {
    const t = run.turns[i], prev = i > 0 ? run.turns[i - 1] : null;
    const qs = questionsOf(run.cfg.product); const q = qs[i];
    const keep = Number(run.cfg.keep);
    const out = [];
    if (!prev) {
      out.push({ k: "A", text: "First question. The persona card is sent once and stays fixed for all seven questions." });
      out.push({ k: "B", text: `Starting state: <code>${esc(t.state_before)}</code>${run.cfg.arm === "grounded" ? " (journey stage 1)." : " (neutral start)."}` });
      out.push({ k: "C", text: "Memory is empty." });
    } else {
      out.push({ k: "B", text: prev.state_before === t.state_before ? `State unchanged: <code>${esc(moodOf(t.state_before))}</code>.` : `State moved from <code>${esc(prev.state_before)}</code> to <code>${esc(t.state_before)}</code>${this.stateSource(run, i)}.` });
      if (keep === 0) out.push({ k: "C", text: `Q${i} was added as a one-line summary. No answers are kept word for word.` });
      else if (keep >= 7 || i <= keep) out.push({ k: "C", text: `Q${i}'s question and spoken reply were added word for word.` });
      else out.push({ k: "C", text: `Q${i - keep} moved out of word-for-word memory into a one-line summary, and Q${i} was added word for word.` });
    }
    out.push({ k: "D", text: `New question${isScreen(q) ? ", with its product screen attached." : ", topic-only with no screen."}` });
    out.push({ k: "E", text: "Reminder rewritten with the current state." });
    return out;
  },
  stateSource(run, i) {
    if (run.cfg.arm === "baseline") return ", the persona's own &lt;state&gt; from the previous answer";
    if (run.cfg.timing === "opening") return ", carried from the persona's own &lt;state&gt;";
    return `, set by journey stage ${i + 1}`;
  },

  promptView(run, i, built, q) {
    const u = ivUi();
    const qs = questionsOf(run.cfg.product);
    const recent = (run.turns[i].recent && run.turns[i].recent.length ? run.turns[i].recent : built.recent);
    const startN = i - recent.length + 1;
    const seg = (k, label, body, extra = "") => `<div class="seg2 blk-${k}"><div class="seg2-lab"><span class="blk-dot blk-${k}">${k}</span>${label}</div>${body}${extra}</div>`;
    const memMsgs = recent.map((m, k) => `
      <div class="msg2 role-user blk-C-msg"><div class="msg2-role">User · Block C memory, word for word · Q${startN + k} question</div><pre>${esc(m.q)}</pre></div>
      <div class="msg2 role-asst blk-C-msg"><div class="msg2-role">Assistant · Block C memory, word for word · Q${startN + k} spoken reply only</div><pre>${esc(m.r)}</pre></div>`).join("");
    const get = (key) => built.blocks.find((b) => b.key === key);
    const C = get("C"), P = get("P"), B = get("B"), D0 = get("D0"), D = get("D"), E = get("E");
    return `<div class="msg-stack">
      <div class="msg2 role-sys">
        <div class="msg2-role spread"><span><span class="blk-dot blk-A">A</span> System · fixed persona and rules card</span><button class="btn ghost sm" data-action="iv-card" aria-expanded="${u.card}">${u.card ? "Hide" : "Show"} full card</button></div>
        ${u.card ? `<pre>${esc(run.system)}</pre>` : `<div class="small muted">Same on all seven questions. ${run.cfg.arm === "grounded" ? `${rulesFor(run.cfg).length} journey rules after the profile.` : "Profile and answer format only, no journey rules."}</div>`}
      </div>
      ${memMsgs || `<div class="msg2 blk-C-msg"><div class="msg2-role">Block C memory, word for word</div><span class="small muted">Empty. ${i === 0 ? "This is the first question." : "This run keeps no verbatim history."}</span></div>`}
      <div class="msg2 role-user new-msg">
        <div class="msg2-role">User · the new message for this question</div>
        ${C ? seg("C", "One-line summaries of older questions", `<pre>${esc(C.text)}</pre>`) : ""}
        ${P ? seg("A", "Profile restated this turn", `<pre class="clip">${esc(P.text)}</pre>`) : ""}
        ${seg("B", "Live mood state", `<pre>${esc(B.text)}</pre>`)}
        ${seg("D", `Current question${isScreen(q) ? " and screenshot" : ""}`, `${D0 ? `<pre class="ctx">${esc(D0.text)}</pre>` : ""}<pre>${esc(D.text)}</pre>`, isScreen(q) ? `<img class="shot2" src="${q.screenshot_data_uri}" alt="Screenshot attached to this message" data-action="zoom" data-pid="${run.cfg.product}" data-i="${i}"/>` : "")}
        ${seg("E", "Final one-line reminder", `<pre>${esc(E.text)}</pre>`)}
      </div>
    </div>`;
  },

  answer(run, i, t) {
    if (t.status !== "done") return `<p class="faint">This answer has not been generated yet (${esc(t.status)}).${t.error ? " " + esc(t.error) : ""}</p>`;
    const u = ivUi();
    return `<div class="answer2">
      ${u.think ? `<div class="think2"><div class="tiny faint">Private thought, &lt;think&gt;. Logged for evaluation and never carried into memory.</div><p>${esc(t.think || "No <think> tag returned.")}</p></div>` : ""}
      <div class="tiny faint" style="margin-bottom:6px">Spoken reply, &lt;reply&gt; · ${t.words || wordsOf(t.reply)} words</div>
      <p class="read">${esc(t.reply)}</p>
      <div class="state-flow">
        <div><span class="tiny faint">State going in</span><code>${esc(t.state_before || "")}</code></div>
        <span class="arrow" aria-hidden="true">→</span>
        <div><span class="tiny faint">State the persona reported, &lt;state&gt;</span><code>${esc(t.model_state || "none returned")}</code></div>
        <span class="arrow" aria-hidden="true">→</span>
        <div><span class="tiny faint">State used for Q${i + 2 <= 7 ? i + 2 : "–"}</span><code>${esc(i < 6 ? (run.turns[i + 1] && run.turns[i + 1].state_before) || t.state_after || "" : t.state_after || "")}</code></div>
      </div>
    </div>`;
  },

  journeyPanel(run, i) {
    const c = DATA.cycles[run.cfg.journey];
    const W = 300, H = 120, l = 26, r = 8, t = 10, b = 20;
    const x = (k) => l + (k * (W - l - r)) / 6, y = (v) => t + ((3 - v) / 6) * (H - t - b);
    const emos = Object.keys(c.stage_emotions);
    const sent = `<svg class="jcmp" viewBox="0 0 ${W} ${H}" aria-label="Sentiment across the seven stages">
      <rect x="${x(i) - 16}" y="${t - 4}" width="32" height="${H - t - b + 8}" rx="8" fill="#edebf7"/>
      ${[-3, 0, 3].map((v) => `<line x1="${l}" x2="${W - r}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? "#d3d0e2" : "#efedf6"}"/><text x="${l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="#8d8ba7">${v > 0 ? "+" : ""}${v}</text>`).join("")}
      <polyline points="${c.stage_sentiments.map((v, k) => `${x(k)},${y(v)}`).join(" ")}" fill="none" stroke="#1f1d3d" stroke-width="1.8" stroke-linejoin="round"/>
      ${c.stage_sentiments.map((v, k) => `<circle cx="${x(k)}" cy="${y(v)}" r="${k === i ? 5 : 3.5}" fill="${v >= 0 ? "#2fa884" : "#e05a6b"}" stroke="#fff" stroke-width="1.5"><title>Stage ${k + 1}: ${v}</title></circle>`).join("")}
      ${[0, 1, 2, 3, 4, 5, 6].map((k) => `<text x="${x(k)}" y="${H - 5}" text-anchor="middle" font-size="10" font-weight="${k === i ? 700 : 400}" fill="#5c5a7a">Q${k + 1}</text>`).join("")}
    </svg>`;
    const heat = `<table class="heat"><tbody>${emos.map((e) => `<tr><th>${e}</th>${c.stage_emotions[e].map((v, k) => `<td class="${k === i ? "on" : ""}" style="--a:${Math.min(1, v / 2.5).toFixed(2)}" title="${e}, stage ${k + 1}: ${v.toFixed(2)}"></td>`).join("")}</tr>`).join("")}</tbody></table>`;
    return `<section class="panel panel-pad">
      <div class="spread"><h3>${esc(c.short_title.replace(/^Cycle \d: /, ""))}</h3><span class="tiny faint">Stage ${i + 1} drives Q${i + 1}</span></div>
      <p class="small muted" style="margin:4px 0 8px">${esc(c.description)}</p>
      <div class="slot-label">How positive or negative the speaker sounded</div>${sent}
      <div class="slot-label" style="margin-top:10px">Six emotions by stage</div>${heat}
      <div class="note focus small" style="margin-top:10px">Stage ${i + 1}: sentiment ${c.stage_sentiments[i] > 0 ? "+" : ""}${c.stage_sentiments[i].toFixed(2)}, top emotion ${esc(c.stage_dominant_emotions[i])}. Derived state <code>${esc(c.stage_target_states[i])}</code>.</div>
    </section>`;
  },

  bind() {
    const save = () => { persist(); App.render(); };
    onDrop("ivrun", (v) => { const u = ivUi(); u.run = v; save(); });
    App.on("iv-product", (el) => { const u = ivUi(); u.product = el.dataset.p; const first = runsForProduct(u.product).find((r) => r.cfg.arm === "grounded") || runsForProduct(u.product)[0]; if (first) u.run = first.id; save(); });
    App.on("iv-q", (el) => { ivUi().q = Number(el.dataset.i); save(); });
    App.on("iv-think", () => { const u = ivUi(); u.think = !u.think; save(); });
    App.on("iv-raw", () => { const u = ivUi(); u.raw = !u.raw; save(); });
    App.on("iv-card", () => { const u = ivUi(); u.card = !u.card; save(); });
    App.on("open-interview", (el) => { const u = ivUi(); const r = runById(el.dataset.run); if (!r) return; u.run = r.id; u.product = r.cfg.product; if (el.dataset.i != null) u.q = Number(el.dataset.i); App.go("interviews"); });
    document.addEventListener("keydown", (e) => {
      if (App.ws !== "interviews" || e.target.closest("input, textarea, [contenteditable]")) return;
      const st = e.target.closest && e.target.closest(".station");
      if (st && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); App.dispatch("iv-q", st); return; }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault(); const u = ivUi(); const from = st ? Number(st.dataset.i) : u.q; u.q = Math.max(0, Math.min(6, from + (e.key === "ArrowRight" ? 1 : -1))); save();
        if (st) { const n = $(`.station[data-i="${u.q}"]`); if (n) n.focus({ preventScroll: true }); }
      }
    });
  },
};
