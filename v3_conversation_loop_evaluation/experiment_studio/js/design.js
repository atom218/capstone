/* Experiment Studio · Design study workspace */
"use strict";

const STEPS = [
  { id: "product", name: "Product and decision" },
  { id: "audience", name: "Audience" },
  { id: "journey", name: "Behavioral journey" },
  { id: "delivery", name: "Journey delivery" },
  { id: "carry", name: "What carries forward" },
];

function draft() {
  if (!STORE.draft) {
    STORE.draft = {
      name: "Untitled study", product: null, decision: "", persona: null, profile: null, journey: null, compare: [],
      detail: null, timing: null, keep: 2, profileFreq: "once", replicates: 1, step: "product", turn: 0, brief: "",
    };
  }
  const d = STORE.draft;
  if (!(Number.isInteger(d.turn) && d.turn >= 0 && d.turn <= 6)) d.turn = 0;
  if (d.product && !questionsOf(d.product).length) d.product = null;
  if (d.journey && !DATA.cycles[d.journey]) d.journey = null;
  d.compare = (d.compare || []).filter((c) => DATA.cycles[c]);
  if (d.persona && !DATA.persona_texts[d.persona]) { d.persona = null; d.profile = null; }
  if (d.persona && !d.profile) d.profile = seedProfile(d.persona);
  if (!HISTORY[d.keep]) d.keep = 2;
  if (!PROFILE_FREQ[d.profileFreq]) d.profileFreq = "once";
  if (d.detail && !DETAIL[d.detail]) d.detail = null;
  if (d.timing && !TIMING[d.timing]) d.timing = null;
  if (!STEPS.some((x) => x.id === d.step)) d.step = "product";
  d.replicates = Math.max(1, Math.min(5, Number(d.replicates) || 1));
  return d;
}
function seedProfile(personaId) {
  const sentences = DATA.persona_texts[personaId].split(/(?<=[.!?])\s+/).filter(Boolean);
  return { lines: sentences.map((t) => ({ text: t, prov: "seed" })), approved: false };
}
function profileText(p) { return p.lines.map((l) => l.text.trim()).filter(Boolean).join(" "); }
function profileIsSeed(d) { return d.profile && d.persona && profileText(d.profile) === DATA.persona_texts[d.persona].trim(); }
function sharedCfg(d) {
  const seed = profileIsSeed(d);
  const txt = d.profile ? profileText(d.profile) : "";
  return { product: d.product, persona: d.persona, profileHash: seed ? "seed" : hash(txt), profileText: seed ? null : txt, keep: Number(d.keep), profileFreq: d.profileFreq };
}
function groundedCfg(d) { return { ...sharedCfg(d), arm: "grounded", journey: d.journey, detail: d.detail, timing: d.timing }; }
function baselineCfg(d) { return { ...sharedCfg(d), arm: "baseline", journey: null, detail: null, timing: null }; }
function stepFilled(d, id) {
  if (id === "product") return !!d.product;
  if (id === "audience") return !!(d.profile && d.profile.approved);
  if (id === "journey") return !!d.journey;
  if (id === "delivery") return !!(d.detail && d.timing);
  if (id === "carry") return d.keep != null && !!d.profileFreq;
  return false;
}
function completedRunsMatching(cfg) {
  const k = configKey(cfg);
  return Object.values(allRuns()).filter((r) => configKey(r.cfg) === k && r.turns.every((t) => t.status === "done"));
}

function reusableBaselines(d) {
  const sig = modelSig(launchModel());
  return completedRunsMatching(baselineCfg(d)).filter((r) => modelSig(r.model) === sig);
}
const Design = {
  render() {
    const d = draft();
    return `
      <div class="sockets" role="list" aria-label="Study setup, in order">${STEPS.map((s, i) => this.socket(d, s, i)).join("")}</div>
      <div class="design-grid">
        <div class="stack" style="--gap:18px">
          <div class="bench">
            <aside class="tray" aria-label="Library">${this.tray(d)}</aside>
            <section class="panel panel-pad">${this.canvas(d)}</section>
          </div>
          ${d.product ? this.turnSection(d) : ""}
        </div>
        <aside class="changes">${this.changes(d)}</aside>
      </div>`;
  },

  socket(d, s, i) {
    const filled = stepFilled(d, s.id);
    const val = this.socketValue(d, s.id);
    return `<div class="socket${filled ? " filled" : ""}${d.step === s.id ? " active" : ""}" role="listitem" data-drop="${this.socketAccepts(s.id)}" data-drop-id="${esc(s.id)}">
      <button class="sr-btn" data-action="step" data-step="${s.id}" style="all:unset;position:absolute;inset:0;border-radius:16px;cursor:pointer" aria-label="Open step ${i + 1}: ${s.name}"></button>
      <div class="s-step"><b>${filled ? "✓" : i + 1}</b>${s.name}</div>
      ${val ? `<div class="s-name">${esc(val.title)}</div><div class="s-val">${esc(val.sub || "")}</div>` : `<div class="s-empty">${this.socketEmpty(s.id)}</div>`}
    </div>`;
  },
  socketAccepts(id) {
    return { product: "product", audience: "persona", journey: "journey", delivery: "detail timing", carry: "history freq" }[id];
  },
  socketEmpty(id) {
    return {
      product: "Drop a product here", audience: "Drop a saved persona, then approve its profile",
      journey: "Drop a journey here", delivery: "Drop a cue detail and a cue timing", carry: "Drop history and profile settings",
    }[id];
  },
  socketValue(d, id) {
    if (id === "product" && d.product) return { title: productOf(d.product).name, sub: d.decision || "No decision named yet" };
    if (id === "audience" && d.persona) { const p = PERSONAS.find((x) => x.id === d.persona); return { title: p.name, sub: `${p.variant}${profileIsSeed(d) ? "" : ", edited"} · ${d.profile && d.profile.approved ? "approved" : "awaiting approval"}` }; }
    if (id === "journey" && d.journey) { const c = DATA.cycles[d.journey]; return { title: c.short_title.replace(/^Cycle \d: /, ""), sub: `Source clip ${c.video_id}` }; }
    if (id === "delivery" && (d.detail || d.timing)) return { title: d.detail ? DETAIL[d.detail].name : "Cue detail missing", sub: d.timing ? TIMING[d.timing].name : "Cue timing missing" };
    if (id === "carry") return { title: HISTORY[d.keep].name, sub: PROFILE_FREQ[d.profileFreq].name };
    return null;
  },

  /* ---------- tray (draggable library) ---------- */
  tray(d) {
    const head = (t, hint) => `<h3>${t}</h3><p class="tray-hint">${hint}</p>`;
    if (d.step === "product") {
      return head("Products", "Drag a product into the first socket, or press Enter on it.") + `<div class="tray-list">${PRODUCTS.map((p) => {
        const qs = questionsOf(p.id); const screens = qs.filter(isScreen).length;
        return `<div class="block${d.product === p.id ? " placed" : ""}${p.missing ? " disabled" : ""}" ${p.missing ? 'aria-disabled="true"' : `data-drag="product" data-value="${esc(p.id)}" data-default-drop="product" tabindex="0"`}>
          <div class="b-title">${esc(p.name)}</div><div class="b-sub">${esc(p.blurb)}</div>
          <div class="b-meta">${p.missing ? `<span class="chip warn">Question pack not in this branch</span>` : `<span class="chip">${qs.length} questions</span><span class="chip">${screens} screens</span>`}</div>
        </div>`;
      }).join("")}</div>`;
    }
    if (d.step === "audience") {
      return head("Saved personas", "Saved personas come from the team's standard persona dataset.") + `<div class="tray-list">${PERSONAS.map((p) => `
        <div class="block${d.persona === p.id ? " placed" : ""}" data-drag="persona" data-value="${esc(p.id)}" data-default-drop="audience" tabindex="0">
          <div class="b-title">${esc(p.name)}</div><div class="b-sub">${esc(p.variant)}. ${esc(p.note)}.</div>
          <div class="b-meta"><span class="chip">${wordsOf(DATA.persona_texts[p.id])} words</span>${p.id === "full_description" ? '<span class="chip ok">Has a matched baseline</span>' : '<span class="chip warn">No saved baseline</span>'}</div>
        </div>`).join("")}</div>
        <div style="margin-top:16px">${head("New audience", "Describe the audience in plain language.")}
          <textarea class="note-in" rows="3" data-bind="brief" placeholder="For example: renters in their thirties who share streaming accounts with roommates">${esc(d.brief)}</textarea>
          <div class="row" style="margin-top:8px"><button class="btn sm" data-action="find-seeds">Find candidate seeds</button></div>
        </div>`;
    }
    if (d.step === "journey") {
      return head("Journeys", "Drag one into the socket to use it. Drag two or three into the comparison area to compare first.") + `<div class="tray-list">${Object.values(DATA.cycles).map((c) => `
        <div class="block journey-card${d.journey === c.id ? " placed" : ""}" data-drag="journey" data-value="${esc(c.id)}" data-default-drop="journey" tabindex="0">
          <div class="b-title">${esc(c.short_title.replace(/^Cycle \d: /, ""))}</div>
          ${sparkline(c, { key: "t" })}
          <div class="b-sub">${esc(c.description)}</div>
        </div>`).join("")}</div>`;
    }
    if (d.step === "delivery") {
      return head("Cue detail", "How much of the journey the card describes.") +
        `<div class="token-row">${Object.entries(DETAIL).map(([k, v]) => `<div class="block token${d.detail === k ? " placed" : ""}" data-drag="detail" data-value="${esc(k)}" data-default-drop="delivery" tabindex="0" title="${esc(v.sub)}">${v.name}</div>`).join("")}</div>
        <div style="margin-top:18px">${head("Cue timing", "When the journey reaches the model.")}</div>
        <div class="token-row">${Object.entries(TIMING).map(([k, v]) => `<div class="block token${d.timing === k ? " placed" : ""}" data-drag="timing" data-value="${esc(k)}" data-default-drop="delivery" tabindex="0" title="${esc(v.sub)}">${v.name}</div>`).join("")}</div>
        <p class="tray-hint" style="margin-top:14px">The saved runs used two pairings: brief with opening turn only, and detailed with every turn plus full trajectory.</p>`;
    }
    return head("Prior-answer history", "What the persona can see of its own earlier answers.") +
      `<div class="token-row">${Object.entries(HISTORY).map(([k, v]) => `<div class="block token${String(d.keep) === k ? " placed" : ""}" data-drag="history" data-value="${esc(k)}" data-default-drop="carry" tabindex="0" title="${esc(v.sub)}">${v.name}</div>`).join("")}</div>
      <div style="margin-top:18px">${head("Persona profile", "How often the model receives it.")}</div>
      <div class="token-row">${Object.entries(PROFILE_FREQ).map(([k, v]) => `<div class="block token${d.profileFreq === k ? " placed" : ""}" data-drag="freq" data-value="${esc(k)}" data-default-drop="carry" tabindex="0" title="${esc(v.sub)}">${v.name}</div>`).join("")}</div>`;
  },

  /* ---------- canvas per step ---------- */
  canvas(d) {
    return this["canvas_" + d.step](d);
  },
  canvas_product(d) {
    if (!d.product) return this.emptyCanvas("Start with the product", "Drag a product from the library onto the first socket. Its question sequence and screens appear here.");
    const p = productOf(d.product); const qs = questionsOf(d.product);
    return `<div class="panel-head"><h2>${esc(p.name)}</h2><span class="chip">${qs.length} questions in order</span></div>
      <div class="slot-label">The decision this study should inform</div>
      <div class="decision" data-drop="decision" data-drop-id="decision">
        <input data-bind="decision" value="${esc(d.decision)}" placeholder="Type a decision, or drag a suggestion here" aria-label="Decision to inform"/>
      </div>
      <div class="row wrap" style="margin:8px 0 18px">${(p.decisions || []).map((t) => `<span class="block token" data-drag="decision" data-value="${esc(t)}" data-default-drop="decision" tabindex="0">${esc(t)}</span>`).join("")}</div>
      <div class="slot-label">Question sequence</div>
      <div class="qseq">${qs.map((q, i) => `<div class="qitem">
        <div class="qnum">Q${i + 1}</div>
        <div><div>${esc(q.question)}</div><div class="row" style="margin-top:4px">${isScreen(q) ? '<span class="chip focus">Linked screen</span>' : '<span class="chip">Topic-only</span>'}</div></div>
        <div>${isScreen(q) ? `<img class="thumb" src="${q.screenshot_data_uri}" alt="Screen for Q${i + 1}" data-action="zoom" data-pid="${d.product}" data-i="${i}"/>` : ""}</div>
      </div>`).join("")}</div>`;
  },
  canvas_audience(d) {
    if (!d.persona) return this.emptyCanvas("Choose who is interviewed", "Drag a saved persona onto the Audience socket. You'll review and approve one static profile, used by both interviews.");
    const p = d.profile; const P = PERSONAS.find((x) => x.id === d.persona);
    const counts = { seed: 0, supplied: 0, assumed: 0 }; p.lines.forEach((l) => counts[l.prov]++);
    return `<div class="panel-head"><h2>${esc(P.name)}, ${esc(P.variant.toLowerCase())}</h2>
        ${p.approved ? `<span class="approved-seal">${ICON.check} Approved for both interviews</span>` : `<span class="chip warn">Not approved yet</span>`}</div>
      <p class="muted small" style="margin-bottom:10px">Each line is labeled by where it came from. Click a label to change it. ${p.approved ? "Editing reopens approval." : ""}</p>
      <div class="row wrap" style="margin-bottom:8px">
        <span class="prov seed">Seed detail · ${counts.seed}</span><span class="prov supplied">Supplied fact · ${counts.supplied}</span><span class="prov assumed">Generated assumption · ${counts.assumed}</span>
      </div>
      <div>${p.lines.map((l, i) => `<div class="profile-line">
        <div contenteditable="true" data-bind="profile-line" data-i="${i}" spellcheck="true">${esc(l.text)}</div>
        <div class="row"><button class="prov ${l.prov}" data-action="cycle-prov" data-i="${i}" aria-label="Source: ${provName(l.prov)}. Click to change.">${provName(l.prov)}</button>
        <button class="btn ghost sm" data-action="remove-line" data-i="${i}" aria-label="Remove line">${ICON.x}</button></div>
      </div>`).join("")}</div>
      <div class="row" style="margin-top:10px"><button class="btn sm" data-action="add-line">Add a supplied fact</button>
        ${profileIsSeed(d) ? "" : `<button class="btn ghost sm" data-action="reset-profile">Restore seed text</button>`}</div>
      ${profileIsSeed(d) ? "" : `<div class="note warn" style="margin-top:12px">The profile differs from the saved seed, so saved runs no longer match. Launch will generate a new matched baseline.</div>`}
      <div class="row" style="margin-top:16px;justify-content:flex-end">
        ${p.approved ? `<button class="btn" data-action="unapprove">Reopen for edits</button>` : `<button class="btn primary" data-action="approve">Approve profile</button>`}
      </div>`;
  },
  canvas_journey(d) {
    const cmp = d.compare.map((id) => DATA.cycles[id]).filter(Boolean);
    const sel = d.journey ? DATA.cycles[d.journey] : null;
    const colors = ["#1f1d3d", "#1f1d3d", "#2fa884"];
    let chart = "";
    if (cmp.length) {
      const W = 640, H = 200, l = 34, r = 12, t = 12, b = 26;
      const x = (i) => l + (i * (W - l - r)) / 6, y = (v) => t + ((3 - v) / 6) * (H - t - b);
      chart = `<svg class="jcmp" viewBox="0 0 ${W} ${H}" aria-label="Journey comparison">
        ${[-3, -1.5, 0, 1.5, 3].map((v) => `<line x1="${l}" x2="${W - r}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? "#d3d0e2" : "#efedf6"}"/><text x="${l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#8d8ba7">${v > 0 ? "+" : ""}${v}</text>`).join("")}
        ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="#8d8ba7">Stage ${i + 1}</text>`).join("")}
        ${cmp.map((c, k) => `<polyline points="${c.stage_sentiments.map((v, i) => `${x(i)},${y(v)}`).join(" ")}" fill="none" stroke="${colors[k]}" stroke-width="2.2" stroke-linejoin="round"/>
          ${c.stage_sentiments.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${colors[k]}" stroke="#fff" stroke-width="1.5"><title>${esc(c.short_title)} · stage ${i + 1}: ${v}</title></circle>`).join("")}`).join("")}
      </svg>
      <div class="legend">${cmp.map((c, k) => `<span><i style="background:${colors[k]}"></i>${esc(c.short_title.replace(/^Cycle \d: /, ""))} <button class="btn ghost sm" data-action="uncompare" data-id="${esc(c.id)}" aria-label="Remove from comparison">${ICON.x}</button></span>`).join("")}</div>`;
    }
    return `<div class="panel-head"><h2>Compare, then choose</h2><span class="faint small">Journey choice is independent of the persona's demographics</span></div>
      <div class="dropzone" data-drop="journey" data-drop-id="compare" aria-label="Comparison area">
        ${cmp.length ? chart : `<p class="faint small" style="text-align:center;padding:24px 0">Drag up to three journeys here to overlay their sentiment across the seven stages.</p>`}
      </div>
      ${sel ? this.journeyDetail(sel) : `<p class="muted small" style="margin-top:14px">Drag a journey onto the Behavioral journey socket to use it in this study.</p>`}`;
  },
  journeyDetail(c) {
    const link = ytLink(c.video_id);
    const emos = Object.keys(c.stage_emotions);
    return `<div style="margin-top:20px" class="stack">
      <div class="spread"><h3>${esc(c.short_title.replace(/^Cycle \d: /, ""))}</h3>
        <span class="small">${link ? `<a href="${link}" target="_blank" rel="noopener">Source clip ${esc(c.video_id)}</a>` : `CMU-MOSEI clip ${esc(c.video_id)}`}</span></div>
      <p class="muted">${esc(c.description)}</p>
      <div class="slot-pair">
        <div class="note"><b>Observed in the source</b><br/>Sentiment ratings (−3 to +3) and six emotion intensities annotated on the CMU-MOSEI recording, split into seven stages.</div>
        <div class="note focus"><b>Derived for the interview</b><br/>The per-stage patience, trust and mood states, and the behavior rules written into the card.</div>
      </div>
      <table class="ev-table" style="margin-top:4px">
        <thead><tr><th>Stage</th>${[1, 2, 3, 4, 5, 6, 7].map((i) => `<th>${i}</th>`).join("")}</tr></thead>
        <tbody>
          <tr><td>Observed sentiment</td>${c.stage_sentiments.map((v) => `<td style="color:${v >= 0 ? "#1d7f62" : "#b8364a"};font-weight:600">${v > 0 ? "+" : ""}${v.toFixed(2)}</td>`).join("")}</tr>
          <tr><td>Observed top emotion</td>${c.stage_dominant_emotions.map((v) => `<td class="small">${esc(v)}</td>`).join("")}</tr>
          <tr><td>Derived mood</td>${c.stage_target_states.map((v) => `<td class="small"><span class="chip focus">${esc(moodOf(v))}</span></td>`).join("")}</tr>
        </tbody>
      </table>
      <details><summary class="small" style="cursor:pointer;font-weight:600">Emotion intensities by stage</summary>
        <table class="ev-table"><tbody>${emos.map((e) => `<tr><td>${e}</td>${c.stage_emotions[e].map((v) => `<td class="small" style="background:rgba(91,91,214,${Math.min(0.5, v / 5).toFixed(2)})">${v.toFixed(2)}</td>`).join("")}</tr>`).join("")}</tbody></table>
      </details>
    </div>`;
  },
  canvas_delivery(d) {
    const slot = (type, label, val, dict) => `<div><div class="slot-label">${label}</div>
      <div class="dropzone" data-drop="${type}" data-drop-id="delivery">${val ? `<div class="row"><b>${dict[val].name}</b><button class="btn ghost sm" data-action="clear-${type}" aria-label="Clear">${ICON.x}</button></div><p class="small muted">${dict[val].sub}</p>` : `<p class="faint small">Drag a ${label.toLowerCase()} token here</p>`}</div></div>`;
    const cyc = d.journey ? DATA.cycles[d.journey] : null;
    const qs = d.product ? questionsOf(d.product) : [];
    return `<div class="panel-head"><h2>How the journey reaches the model</h2></div>
      <div class="slot-pair">${slot("detail", "Cue detail", d.detail, DETAIL)}${slot("timing", "Cue timing", d.timing, TIMING)}</div>
      ${cyc && d.detail ? `<div style="margin-top:16px"><div class="slot-label">Rules written into the grounded card</div>
        <ul class="small" style="margin:0;padding-left:18px">${rulesFor(groundedCfg(d)).map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>` : ""}
      ${cyc && qs.length ? `<div style="margin-top:16px"><div class="slot-label">Journey stages aligned to the questions</div>
        <p class="small muted">Select a turn on the timeline below to see its source mapping and the exact cue supplied.</p></div>` : `<div class="note" style="margin-top:14px">Choose a product and a journey to align stages to questions.</div>`}`;
  },
  canvas_carry(d) {
    const slot = (type, label, val, dict) => `<div><div class="slot-label">${label}</div>
      <div class="dropzone" data-drop="${type}" data-drop-id="carry"><div class="row"><b>${dict[val].name}</b>${(type === "history" ? String(val) === "2" : val === "once") ? '<span class="chip">Saved-run default</span>' : ""}</div><p class="small muted">${dict[val].sub}</p></div></div>`;
    return `<div class="panel-head"><h2>What carries forward between turns</h2></div>
      <div class="slot-pair">${slot("history", "Prior-answer history", String(d.keep), HISTORY)}${slot("freq", "Persona profile", d.profileFreq, PROFILE_FREQ)}</div>
      <div class="note" style="margin-top:14px">Both interviews use the same memory policy. Each one sees only its own earlier answers, so a change here applies to the baseline too.</div>`;
  },
  emptyCanvas(title, text) {
    return `<div class="empty">${emptyArt()}<h2>${title}</h2><p class="muted" style="max-width:420px">${text}</p></div>`;
  },

  /* ---------- turn timeline + preview ---------- */
  turnSection(d) {
    const qs = questionsOf(d.product); const i = Math.min(d.turn, qs.length - 1);
    const cyc = d.journey ? DATA.cycles[d.journey] : null;
    const cueAt = cyc && d.timing ? (k) => {
      if (d.timing === "opening" && k > 0) return { label: "own state", dash: true };
      return { label: moodOf(cyc.stage_target_states[k]) };
    } : null;
    return `<section class="panel panel-pad">
      <div class="panel-head"><h2>What the model sees at each turn</h2><span class="faint small">Select a station. Arrow keys move between turns.</span></div>
      ${twinRail({ mode: "design", journey: d.journey, selected: i, action: "turn", cueAt, screens: qs.map(isScreen), aria: "Turn timeline for both interviews" })}
      ${this.preview(d, i)}
    </section>`;
  },
  previewState(cfg, i, matched) {
    if (matched && matched.turns[i]) return { text: matched.turns[i].state_before, from: "recorded in the saved run" };
    if (i === 0) return { text: openingState(cfg), from: cfg.arm === "baseline" ? "neutral start" : "journey stage 1" };
    if (cfg.arm === "grounded" && !cfg.journey) return { text: "[set by the journey once one is chosen]", from: "journey not chosen yet" };
    if (cfg.arm === "grounded" && (cfg.timing === "every" || cfg.timing === "full")) return { text: DATA.cycles[cfg.journey].stage_target_states[i], from: `journey stage ${i + 1}` };
    return { text: `[the persona's own <state> from Q${i}]`, from: "carried by the persona" };
  },
  previewArm(d, cfg, i) {
    const qs = questionsOf(d.product); const q = qs[i];
    const ptxt = d.profile ? profileText(d.profile) : DATA.persona_texts[d.persona || "full_description"];
    const matched = cfg.arm === "grounded" && !(d.journey && d.detail && d.timing) ? null : completedRunsMatching(cfg)[0];
    const prior = qs.slice(0, i).map((qq, k) => ({ q: qq.question, r: matched ? matched.turns[k].reply : `[Answer to Q${k + 1} from this interview]` }));
    const st = this.previewState(cfg, i, matched);
    const built = buildTurn(cfg, ptxt, q, prior, st.text);
    const rules = rulesFor(cfg);
    const isG = cfg.arm === "grounded";
    const diff = (key) => isG && (key === "B" || key === "E") && cfg.journey;
    return `<div class="pv">
      <div class="pv-head ${isG ? "grnd" : "base"}"><span class="dot ${isG ? "grnd" : "base"}"></span>${isG ? "Grounded interview" : "Baseline interview"}
        <span class="grow"></span>${matched ? '<span class="chip ok">Showing a saved run</span>' : ""}</div>
      <div class="pv-block${isG && rules.length ? " diff" : ""}"><div class="pv-lab">System card ${isG && rules.length ? `<span class="chip grnd">+ ${rules.length} journey rules</span>` : ""}</div>
        <div class="small muted">${d.persona ? `Approved profile (${wordsOf(ptxt)} words)` : "Profile not chosen yet"}${rules.length ? ", behavior rules," : ","} and the &lt;think&gt; / &lt;reply&gt; / &lt;state&gt; format.</div>
        ${rules.length ? `<details><summary class="small" style="cursor:pointer">Show the rules</summary><ul class="small" style="margin:6px 0 0;padding-left:18px">${rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></details>` : ""}
      </div>
      <div class="pv-block"><div class="pv-lab">Visible history</div>
        ${built.recent.length ? built.recent.map((t, k) => `<div class="small" style="margin-top:4px"><b>Verbatim Q${i - built.recent.length + k + 1}.</b> <span class="muted">${esc(t.r.length > 150 ? t.r.slice(0, 150) + "…" : t.r)}</span></div>`).join("") : ""}
        ${built.older.length ? `<div class="small muted" style="margin-top:4px">${built.older.length} earlier turn${built.older.length > 1 ? "s" : ""} as one-line summaries</div>` : ""}
        ${!built.recent.length && !built.older.length ? `<div class="small faint">None. This is the first question.</div>` : ""}
      </div>
      ${cfg.profileFreq === "each" ? `<div class="pv-block"><div class="pv-lab">Profile restated</div><div class="small muted">The approved profile is repeated in this turn's message.</div></div>` : ""}
      <div class="pv-block${diff("B") ? " diff" : ""}"><div class="pv-lab">Live state <span class="faint">${esc(st.from)}</span></div><pre>${esc(st.text)}</pre></div>
      <div class="pv-block"><div class="pv-lab">Question ${i + 1}${isScreen(q) ? " with screen" : ", topic-only"}</div>
        <div class="row" style="align-items:flex-start"><div class="small grow">${esc(q.question)}</div>${isScreen(q) ? `<img class="thumb" src="${q.screenshot_data_uri}" alt="Screen" data-action="zoom" data-pid="${d.product}" data-i="${i}"/>` : ""}</div></div>
      <details class="pv-block"><summary class="pv-lab" style="cursor:pointer">Exact message for this turn</summary><div class="clip"><pre>${esc(built.userText)}</pre></div></details>
    </div>`;
  },
  preview(d, i) {
    const g = groundedCfg(d), b = baselineCfg(d);
    const cyc = d.journey ? DATA.cycles[d.journey] : null;
    const mapping = cyc ? `<div class="note focus" style="margin:6px 0 14px"><b>Source mapping for Q${i + 1}.</b> Journey stage ${i + 1} of 7: observed sentiment ${cyc.stage_sentiments[i] > 0 ? "+" : ""}${cyc.stage_sentiments[i].toFixed(2)}, top emotion ${esc(cyc.stage_dominant_emotions[i])}. Derived state: <code>${esc(cyc.stage_target_states[i])}</code>.
      ${d.timing === "opening" && i > 0 ? "With opening-turn timing this stage is not sent; the persona carries its own state instead." : d.timing ? "" : "Choose a cue timing to decide whether it is sent."}</div>` : "";
    return `${mapping}<div class="preview-cols">${this.previewArm(d, b, i)}${this.previewArm(d, { ...g, journey: d.journey }, i)}</div>`;
  },

  /* ---------- what changes panel ---------- */
  changes(d) {
    const ready = STEPS.every((s) => stepFilled(d, s.id));
    const qs = d.product ? questionsOf(d.product).length : 7;
    const b = baselineCfg(d), g = groundedCfg(d);
    const baseExisting = d.product && d.persona ? completedRunsMatching(b) : [];
    const reuse = d.product && d.persona ? reusableBaselines(d).slice(0, d.replicates) : [];
    const newBaselines = d.replicates - reuse.length;
    const unrecorded = baseExisting.filter((r) => !modelSig(r.model)).length;
    const grExisting = ready ? completedRunsMatching(g) : [];
    const interviews = d.replicates + newBaselines;
    const missing = STEPS.filter((s) => !stepFilled(d, s.id)).map((s) => s.name.toLowerCase());
    const cyc = d.journey ? DATA.cycles[d.journey] : null;
    return `<section class="panel panel-pad">
        <h2 style="margin-bottom:10px">What changes in this test?</h2>
        <div class="slot-label">Both interviews receive</div>
        <ul>
          ${[["The approved persona", d.persona ? (profileIsSeed(d) ? "seed profile" : "edited profile") : null], ["Product pack, questions and screens", d.product ? productOf(d.product).short : null],
            ["Model settings", `${getConn().deployment}, temperature ${getConn().temperature}`], ["Memory policy", `${HISTORY[d.keep].name.toLowerCase()}; ${PROFILE_FREQ[d.profileFreq].name.toLowerCase()}`]]
            .map(([t, v]) => `<li><span class="dot" style="background:${v ? "var(--ink-2)" : "var(--line-2)"};margin-top:6px"></span><span>${t}${v ? `<br/><span class="faint small">${esc(v)}</span>` : `<br/><span class="faint small">not chosen yet</span>`}</span></li>`).join("")}
          <li><span class="dot" style="background:var(--ink-2);margin-top:6px"></span><span>Each uses its own earlier answers</span></li>
        </ul>
        <div class="slot-label" style="margin-top:14px">Only the grounded interview receives</div>
        <ul><li><span class="dot grnd" style="margin-top:6px"></span><span>${cyc ? esc(cyc.short_title.replace(/^Cycle \d: /, "")) : "A journey, once chosen"}${d.detail && d.timing ? `<br/><span class="faint small">${DETAIL[d.detail].name}, ${TIMING[d.timing].name.toLowerCase()}</span>` : ""}</span></li></ul>
        <div style="margin-top:14px">${d.product && d.persona ? (
          !newBaselines
            ? `<div class="note ok">${reuse.length} completed baseline${reuse.length > 1 ? "s" : ""} already use${reuse.length > 1 ? "" : "s"} this persona, memory policy and model settings, so launch reuses ${reuse.length > 1 ? "them" : "it"}. Both sides get ${d.replicates}.</div>`
            : reuse.length
            ? `<div class="note warn">${reuse.length} matching baseline${reuse.length > 1 ? "s" : ""} found. Launch adds ${newBaselines} more so both sides get ${d.replicates}.</div>`
            : unrecorded
            ? `<div class="note warn">A saved v3 baseline uses this persona and memory policy, but its model settings were not recorded. Launch generates ${newBaselines} new baseline${newBaselines > 1 ? "s" : ""} with the same settings as the grounded interviews, so both sides match.</div>`
            : `<div class="note warn">No completed baseline uses this persona, memory policy and model settings. Launch adds ${newBaselines} matched baseline${newBaselines > 1 ? "s" : ""}, one per grounded interview.</div>`) : ""}</div>
      </section>
      <section class="panel panel-pad">
        <div class="spread" style="margin-bottom:10px"><h3>Launch</h3>
          <div class="row small"><span class="muted">Replicates</span><div class="stepper"><button data-action="rep" data-d="-1" aria-label="Fewer">−</button><span>${d.replicates}</span><button data-action="rep" data-d="1" aria-label="More">+</button></div></div></div>
        <div class="count-row"><div class="count" title="${d.replicates} grounded + ${newBaselines} new baseline"><b>${interviews}</b><span>new interview${interviews === 1 ? "" : "s"}</span></div><div class="count"><b>${qs}</b><span>questions each</span></div><div class="count"><b>${interviews * qs}</b><span>model calls</span></div></div>
        ${grExisting.length ? `<div class="note ok" style="margin-top:10px">${grExisting.length} completed grounded interview${grExisting.length > 1 ? "s" : ""} already match this configuration. <button class="btn sm" data-action="open-existing" style="margin-top:6px">Open results</button></div>` : ""}
        ${!ready ? `<p class="small faint" style="margin-top:10px">Still needed: ${missing.join(", ")}.</p>` : ""}
        <button class="btn primary" style="width:100%;justify-content:center;margin-top:12px" data-action="launch" ${ready ? "" : "disabled"}>${grExisting.length ? "Run another replicate" : "Launch comparison"}</button>
        <p class="tiny faint" style="margin-top:8px">Input versions and configuration are saved with each run. Generation and review progress are tracked separately.</p>
      </section>
      ${this.runList()}`;
  },
  runList() {
    const studies = Object.values(STORE.liveStudies).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    if (!studies.length) return "";
    return `<section class="panel panel-pad"><h3 style="margin-bottom:10px">Your launched studies</h3><div class="runs">${studies.map((s) => {
      const runs = [...s.baselineRuns, ...s.groundedRuns].map(runById).filter(Boolean).filter((r) => r.origin === "live");
      const items = studyItems(s); const reviewed = items.filter((id) => reviewsFor(id).some((x) => x.r.commonSubmittedAt)).length;
      return `<div class="run"><div class="spread"><b class="small">${esc(s.name)}</b><span class="tiny faint">${fmtTime(s.createdAt)}</span></div>
        ${runs.map((r) => `<div class="row small"><span class="dot ${r.cfg.arm === "baseline" ? "base" : "grnd"}"></span><span style="width:64px">${r.cfg.arm === "baseline" ? "Baseline" : "Grounded"}</span><div class="grow">${progBar(r)}</div>
          ${runProgress(r).done ? `<button class="btn ghost sm" data-action="open-interview" data-run="${esc(r.id)}">View</button>` : ""}${runProgress(r).failed ? `<button class="btn sm" data-action="resume" data-run="${esc(r.id)}">Resume</button>` : RUNNING.has(r.id) ? '<span class="tiny faint">running</span>' : ""}</div>
          ${r.turns.find((t) => t.status === "failed") ? `<div class="tiny" style="color:#b8364a">${esc(r.turns.find((t) => t.status === "failed").error)}</div>` : ""}`).join("")}
        <div class="spread tiny faint"><span>Reviewed ${reviewed} of ${items.length} generated answers</span><button class="btn ghost sm" data-action="open-study" data-study="${esc(s.id)}">Open results</button></div></div>`;
    }).join("")}</div></section>`;
  },

  /* ---------- actions ---------- */
  bind() {
    onDrop("product", (v) => {
      const d = draft(); if (d.product !== v) { d.product = v; d.decision = d.decision || ""; d.turn = 0; }
      d.step = "product"; if (d.name === "Untitled study") d.name = `${productOf(v).short} study`; save();
    });
    onDrop("decision", (v) => { draft().decision = v; save(); });
    onDrop("persona", (v) => { const d = draft(); d.persona = v; d.profile = seedProfile(v); d.step = "audience"; save(); });
    onDrop("journey", (v, target) => {
      const d = draft();
      if (target === "compare") { if (!d.compare.includes(v)) d.compare = [...d.compare, v].slice(-3); }
      else { d.journey = v; if (!d.compare.includes(v)) d.compare = [...d.compare, v].slice(-3); }
      d.step = "journey"; save();
    });
    onDrop("detail", (v) => { const d = draft(); d.detail = v; d.step = "delivery"; save(); });
    onDrop("timing", (v) => { const d = draft(); d.timing = v; d.step = "delivery"; save(); });
    onDrop("history", (v) => { const d = draft(); d.keep = Number(v); d.step = "carry"; save(); });
    onDrop("freq", (v) => { const d = draft(); d.profileFreq = v; d.step = "carry"; save(); });
    const save = () => { persist(); App.render(); };
    App.on("step", (el) => { draft().step = el.dataset.step; save(); });
    App.on("turn", (el) => { draft().turn = Number(el.dataset.i); save(); });
    App.on("zoom", (el) => { const q = questionsOf(el.dataset.pid)[el.dataset.i]; imageModal(q.screenshot_data_uri, `Q${Number(el.dataset.i) + 1} screen`); });
    App.on("cycle-prov", (el) => {
      const d = draft(); const l = d.profile.lines[el.dataset.i];
      l.prov = { seed: "supplied", supplied: "assumed", assumed: "seed" }[l.prov]; d.profile.approved = false; save();
    });
    App.on("remove-line", (el) => { const d = draft(); d.profile.lines.splice(Number(el.dataset.i), 1); d.profile.approved = false; save(); });
    App.on("add-line", () => { const d = draft(); d.profile.lines.push({ text: "New supplied fact.", prov: "supplied" }); d.profile.approved = false; save();
      setTimeout(() => { const els = $$('[data-bind="profile-line"]'); const last = els[els.length - 1]; if (last) { last.focus(); document.getSelection().selectAllChildren(last); } }, 0); });
    App.on("reset-profile", () => { const d = draft(); d.profile = seedProfile(d.persona); save(); });
    App.on("approve", () => { const d = draft(); d.profile.approved = true; d.step = d.journey ? d.step : "journey"; save(); toast("Profile approved for both interviews"); });
    App.on("unapprove", () => { draft().profile.approved = false; save(); });
    App.on("uncompare", (el) => { const d = draft(); d.compare = d.compare.filter((x) => x !== el.dataset.id); save(); });
    App.on("clear-detail", () => { draft().detail = null; save(); });
    App.on("clear-timing", () => { draft().timing = null; save(); });
    App.on("rep", (el) => { const d = draft(); d.replicates = Math.max(1, Math.min(5, d.replicates + Number(el.dataset.d))); save(); });
    App.on("find-seeds", () => {
      const d = draft();
      openLayer(`<div class="spread"><h2>Find candidate seeds</h2><button class="btn ghost sm" data-action="close-layer">Close</button></div>
        <div class="note warn">Retrieval from the NVIDIA persona library is not connected in this branch, so no seeds can be retrieved here.</div>
        <p class="muted">You can still use the brief: start from a saved persona and add the brief as supplied facts. Each fact stays labeled so reviewers can tell it apart from seed details.</p>
        ${d.brief ? `<div class="note">${esc(d.brief)}</div>` : `<p class="faint small">Write a brief in the library first.</p>`}
        <div class="row" style="justify-content:flex-end"><button class="btn primary" data-action="brief-to-facts" ${d.brief ? "" : "disabled"}>Add the brief to the full biography</button></div>`);
    });
    App.on("brief-to-facts", () => {
      const d = draft(); d.persona = d.persona || "full_description"; d.profile = d.profile || seedProfile(d.persona);
      d.brief.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean).forEach((t) => d.profile.lines.push({ text: /[.!?]$/.test(t) ? t : t + ".", prov: "supplied" }));
      d.profile.approved = false; closeLayer(); save();
    });
    App.on("launch", () => launchStudy());
    App.on("resume", (el) => { if (!connReady()) return connModal(() => resume(el.dataset.run)); resume(el.dataset.run); });
    App.on("open-existing", () => {
      const d = draft(); const g = completedRunsMatching(groundedCfg(d))[0];
      const st = Object.values(allStudies()).find((s) => s.groundedRuns.includes(g.id));
      if (st) App.go("compare", { study: st.id });
    });
    App.on("open-study", (el) => App.go("compare", { study: el.dataset.study }));
    App.onInput("brief", (el) => { draft().brief = el.value; persist(); });
    App.onInput("decision", (el) => { draft().decision = el.value; persist(); App.refreshSockets(); });
    App.onInput("profile-line", (el) => {
      const d = draft(); d.profile.lines[el.dataset.i].text = el.textContent; if (d.profile.approved) { d.profile.approved = false; }
      persist(); App.refreshSockets();
    }, "blur-render");
    document.addEventListener("keydown", (e) => {
      if (App.ws !== "design") return;
      const st = e.target.closest && e.target.closest(".station");
      if (st && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        e.preventDefault(); const d = draft(); d.turn = Math.max(0, Math.min(6, Number(st.dataset.i) + (e.key === "ArrowRight" ? 1 : -1))); save();
        { const n = $(`.station[data-i="${d.turn}"]`); if (n) n.focus({ preventScroll: true }); }
      }
      if (st && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); draft().turn = Number(st.dataset.i); save(); }
    });
    function resume(runId) { generateRun(runId, () => App.renderSoon()); }
  },
};
function provName(p) { return { seed: "Seed detail", supplied: "Supplied fact", assumed: "Generated assumption" }[p]; }

function launchStudy() {
  const d = draft();
  if (!connReady()) { connModal(() => launchStudy()); return; }
  const g = groundedCfg(d), b = baselineCfg(d);
  const reuse = reusableBaselines(d).slice(0, d.replicates);
  const now = new Date().toISOString();
  const c = getConn();
  const model = launchModel();
  const mk = (cfg, rep) => {
    const id = `live_${cfg.arm}_${hash(configKey(cfg) + now + rep)}`;
    const ptxt = cfg.profileText || DATA.persona_texts[cfg.persona];
    STORE.liveRuns[id] = {
      id, origin: "live", cfg, profileText: cfg.profileText, replicate: rep, createdAt: now,
      system: buildCard(ptxt, rulesFor(cfg)),
      model: { ...model },
      versions: { persona: hash(ptxt), pack: hash(JSON.stringify(questionsOf(cfg.product).map((q) => q.question))), journey: cfg.journey ? DATA.cycles[cfg.journey].video_id : "none", loop: LOOP_VERSION },
      approvedProfile: d.profile ? JSON.parse(JSON.stringify(d.profile)) : null,
      turns: questionsOf(cfg.product).map((q, i) => ({ i, status: "pending" })),
    };
    return id;
  };
  // Equal numbers on both sides: reuse baselines only when their recorded model settings are identical, then top up.
  const groundedRuns = [], baselineRuns = reuse.map((r) => r.id);
  for (let r = 1; r <= d.replicates; r++) groundedRuns.push(mk(g, r));
  for (let r = baselineRuns.length + 1; r <= d.replicates; r++) baselineRuns.push(mk(b, r));
  const sid = "study_live_" + hash(now + d.name);
  STORE.liveStudies[sid] = { id: sid, origin: "live", name: d.name, product: d.product, decision: d.decision, groundedRuns, baselineRuns, createdAt: now };
  persist(true); App.render(); toast("Launched. Answers will appear as each turn finishes.");
  (async () => {
    for (const id of [...baselineRuns, ...groundedRuns]) { if (STORE.liveRuns[id]) await generateRun(id, () => App.renderSoon()); }
    toast("Generation finished");
  })();
}
function emptyArt() {
  return `<svg viewBox="0 0 120 70" aria-hidden="true"><line x1="10" x2="110" y1="22" y2="22" stroke="#e8885a" stroke-width="3" stroke-linecap="round" opacity=".35"/><line x1="10" x2="110" y1="50" y2="50" stroke="#5b5bd6" stroke-width="3" stroke-linecap="round" opacity=".35"/>${[10, 27, 43, 60, 77, 93, 110].map((x) => `<circle cx="${x}" cy="22" r="4" fill="#fff" stroke="#e8885a" stroke-width="2"/><circle cx="${x}" cy="50" r="4" fill="#fff" stroke="#5b5bd6" stroke-width="2"/>`).join("")}</svg>`;
}
