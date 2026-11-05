/* Experiment Studio · core
   Data model, persistence, prompt assembly (a faithful port of
   src/personas/conversation_loop.py), the drag-and-drop engine, shared
   visuals (journey sparkline, twin rail) and the live Azure runner. */

"use strict";

const DATA = window.STUDIO_DATA;
/* display-only: nicer arrows in journey names (prompt text is untouched) */
Object.values(DATA.cycles).forEach((c) => { c.short_title = c.short_title.replace(/\s*->\s*/g, " → "); c.title = c.title.replace(/\s*->\s*/g, " → "); });
const NEUTRAL = "patience: medium; trust: medium; mood: neutral";
const LOOP_VERSION = "conversation_loop v3 (5-block)";
const STORE_KEY = "experiment_studio_v1";

/* ---------------- catalogue ---------------- */
const PRODUCTS = [
  {
    id: "subscription-management", name: "Subscription Management Assistant", short: "Subscriptions",
    blurb: "A banking-app feature that reviews recurring charges, takes on cancellations, and tracks the merchant's confirmation.",
    decisions: [
      "Do customers understand when a cancellation is complete?",
      "Which details earn enough trust for a customer to let the bank cancel for them?",
      "Should savings suggestions account for subscriptions shared with someone else?",
    ],
  },
  {
    id: "cash-flow-planning", name: "Small Business Cash Flow Planner", short: "Cash flow",
    blurb: "Brings a small business's bank balance together with expected receipts and payments, so the owner can see when a cash gap could occur and test a later payment date.",
    decisions: [
      "What would owners verify before acting on a 30-day forecast?",
      "Does comparing a later receipt date make the timing trade-off clear enough to change a plan?",
      "What should a low-balance alert explain for an owner to act on it rather than ignore it?",
    ],
  },
  {
    id: "mental-wellness", name: "Still", short: "Mental wellness",
    blurb: "A mental wellness app with check-ins, short activities, and summaries a person can share.",
    decisions: [
      "What should the app do when someone stops opening it for a few days?",
      "Does the check-in let people describe how they are doing when no label fits?",
      "Would people use a summary to explain how they have been doing to someone they trust?",
    ],
  },
  {
    id: "sexual-health", name: "Common Ground", short: "Sexual health",
    blurb: "A sexual health preparation concept for exploring questions, preparing for a consultation, and choosing privacy and contact preferences.",
    decisions: [
      "What makes a source trustworthy enough for people to act on its guidance?",
      "How much personal information would people share in exchange for more tailored guidance?",
      "Which privacy and notification choices do people need before they would let the service contact them?",
    ],
  },
];
const PERSONAS = [
  { id: "full_description", name: "Filomena Nguyen", variant: "Full biography", note: "Age, location, background, hobbies and goals" },
  { id: "short_version_1", name: "Filomena Nguyen", variant: "Short bio with demographics", note: "Concise, keeps age and location" },
  { id: "short_version_2", name: "Filomena Nguyen", variant: "Work and habits only", note: "No age, gender or location" },
];
const DETAIL = {
  brief: { name: "Brief cue", sub: "Two or three general behavior rules from the journey's averages." },
  detailed: { name: "Detailed cue", sub: "Adds conditional rules: friction drops, recovery, pacing and dominant emotions." },
};
const TIMING = {
  opening: { name: "Opening turn only", sub: "Q1 starts in the journey's first mood. After that, the persona carries its own state." },
  every: { name: "Every turn", sub: "Before each question, the state is set to that journey stage's mood." },
  full: { name: "Every turn, plus full trajectory", sub: "As every turn, and the card also lists the whole 7-stage mood sequence up front." },
};
const HISTORY = {
  0: { name: "No verbatim history", sub: "Every earlier turn appears only as a one-line summary." },
  1: { name: "Last answer verbatim", sub: "The previous turn in full, older turns as one-line summaries." },
  2: { name: "Last two answers verbatim", sub: "Two turns in full, older turns summarized. This is the saved-run default." },
  7: { name: "Full history verbatim", sub: "Every earlier question and answer in full." },
};
const PROFILE_FREQ = {
  once: { name: "Profile once, in the system card", sub: "The persona is stated once at the top. This is the saved-run default." },
  each: { name: "Profile restated every turn", sub: "The approved profile is repeated in each turn's message." },
};

/* Rubric: five common criteria plus journey implementation checks.
   Anchors are a working draft for the team to refine. */
const COMMON = [
  { id: "persona", group: "Behavioral consistency", name: "Persona consistency", ask: "Does the reply sound like the approved profile?",
    support: "profile",
    anchors: ["Contradicts the profile, or reads as a generic assistant.", "Mostly generic; a weak link to who she is.",
      "Consistent with the profile and uses a few of its traits.", "Clearly rooted in the profile's traits, with no invented biography."] },
  { id: "conversation", group: "Behavioral consistency", name: "Conversation consistency", ask: "Does it agree with what this persona said earlier in the interview?",
    support: "history", naFirst: true,
    anchors: ["Contradicts an earlier reply.", "Ignores earlier replies where they matter.",
      "Consistent, with light reference to earlier points.", "Builds on earlier points accurately."] },
  { id: "specificity", group: "Product feedback", name: "Specificity", ask: "What product point does the reply identify?",
    support: "product", reminder: "Specificity asks what product point the reply identifies.",
    anchors: ["No product point.", "A vague point, such as wanting it to be easy to use.",
      "Names a concrete feature, detail or screen element.", "Names a precise detail and the condition where it matters."] },
  { id: "consequence", group: "Product feedback", name: "User consequence", ask: "What difference does the persona say it makes to her?",
    support: "product", reminder: "User consequence asks what difference the persona says it makes.",
    anchors: ["No consequence stated.", "A consequence is implied but not said.",
      "States the effect on her.", "States the effect and why it matters in her situation."] },
  { id: "insight", group: "Product feedback", name: "Product insight", ask: "What could the team investigate, preserve or change?",
    support: "product", reminder: "Product insight asks what the team could investigate, preserve or change.",
    anchors: ["Nothing the team could act on.", "An obvious or generic takeaway.",
      "A clear thing to investigate, preserve or change.", "A non-obvious direction the team could test."] },
];
const IMPL = [
  { id: "cue_fit", group: "Context and journey implementation", name: "Cue reflected", ask: "Do tone and stance match the cue supplied at this turn?",
    anchors: ["Opposite of the cue.", "Barely reflects it.", "Recognizably reflects it.", "Clearly and naturally reflects it."] },
  { id: "substance", group: "Context and journey implementation", name: "Substance kept", ask: "Does the cue color the reply without crowding out product feedback?",
    anchors: ["Tone replaces substance.", "Mostly tone, little feedback.", "Balanced, with a minor loss of substance.", "Full substance with the cue's color."] },
  { id: "trajectory", group: "Context and journey implementation", name: "Trajectory respected", ask: "Does the shift from the previous turn follow the journey's direction?",
    naFirst: true,
    anchors: ["Moves against the journey.", "Flat where the journey moves.", "Moves in the right direction.", "Matches the direction and size of the move."] },
];
const ALL_CRIT = [...COMMON, ...IMPL];
const EVALUATORS = [
  { id: "human", name: "Human", desc: "Team reviewers" },
  { id: "llm", name: "LLM", desc: "Automated judge" },
  { id: "jev", name: "Jev", desc: "Jev's reviews" },
];

/* ---------------- helpers ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}
function shortId(str) { return hash(str).slice(0, 4).toUpperCase().padStart(4, "0"); }
function seeded(seed) { let s = parseInt(hash(seed), 36) || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0) / 4294967296; }
function shuffle(arr, seed) { const r = seeded(seed); const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function firstSentence(text) {
  const cleaned = String(text).trim().split(/\s+/).join(" ");
  const parts = cleaned.split(/(?<=[.!?])\s+/);
  return parts.length ? parts[0] : cleaned;
}
function moodOf(state) { const m = /mood:\s*([^;]+)/i.exec(state || ""); return m ? m[1].trim() : state || ""; }
function wordsOf(s) { return String(s || "").trim().split(/\s+/).filter(Boolean).length; }
function fmtTime(iso) { if (!iso) return ""; const d = new Date(iso); return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
function median(xs) { const a = xs.filter((x) => typeof x === "number").sort((p, q) => p - q); if (!a.length) return null; const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
function mean(xs) { const a = xs.filter((x) => typeof x === "number"); return a.length ? a.reduce((p, q) => p + q, 0) / a.length : null; }
function productOf(id) { return PRODUCTS.find((p) => p.id === id); }
function questionsOf(pid) { return (DATA.products[pid] || { questions: [] }).questions; }
function qShort(pid, i) { const q = questionsOf(pid)[i]; return q ? `Q${i + 1}${q.has_screenshot === "True" ? " · screen" : ""}` : `Q${i + 1}`; }
function isScreen(q) { return q && (q.has_screenshot === true || q.has_screenshot === "True"); }
function ytLink(id) { return /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null; }
const ICON = {
  check: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3 3 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  same: '<svg width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="3" fill="currentColor"/></svg>',
  diff: '<svg width="14" height="14" viewBox="0 0 16 16"><path d="M8 2l6 11H2z" fill="currentColor"/></svg>',
  x: '<svg width="12" height="12" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  up: '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 1l4 7H1z" fill="currentColor"/></svg>',
  down: '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 9L1 2h8z" fill="currentColor"/></svg>',
  eq: '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="3" width="8" height="1.6" fill="currentColor"/><rect x="1" y="5.6" width="8" height="1.6" fill="currentColor"/></svg>',
  lock: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" stroke-width="1.5"/></svg>',
};

/* ---------------- persistence ---------------- */
const STORE = loadStore();
function loadStore() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { s = null; }
  s = s || {};
  s.reviewer = s.reviewer || { name: "", lane: "human" };
  s.reviews = s.reviews || {};        // reviews[evaluatorKey][itemId]
  s.liveRuns = s.liveRuns || {};      // runs generated in this browser
  s.liveStudies = s.liveStudies || {};
  s.observations = s.observations || []; // compare-view observations
  s.draft = s.draft || null;          // design in progress
  s.ui = s.ui || {};
  s.conn = s.conn || null;
  return s;
}
let saveTimer = null;
function persist(immediate) {
  clearTimeout(saveTimer);
  const write = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(STORE)); }
    catch (e) { toast("This browser's storage is full. Export your work from the menu to keep it."); }
  };
  if (immediate) write(); else saveTimer = setTimeout(write, 250);
}

/* ---------------- prompt assembly ----------------
   Mirrors build_card / build_messages / update_session_state. */
function trajectoryRule(cyc) {
  const fine = cyc.rules.fine || [];
  return fine.find((r) => r.startsWith("Across the 7 questions")) || null;
}
function rulesFor(cfg) {
  if (cfg.arm === "baseline" || !cfg.journey || !DATA.cycles[cfg.journey]) return [];
  const cyc = DATA.cycles[cfg.journey];
  let rules = cfg.detail === "detailed" ? (cyc.rules.fine || []).filter((r) => !r.startsWith("Across the 7 questions")) : (cyc.rules.coarse || []).slice();
  if (cfg.timing === "full") { const t = trajectoryRule(cyc); if (t) rules.push(t); }
  return rules;
}
function buildCard(personaText, rules) {
  let body = `Who you are:\n${personaText.trim()}`;
  if (rules.length) body += `\n\nHow you behave in this interview:\n` + rules.map((r) => `- ${r}`).join("\n");
  return `${body}\n\n${DATA.format_block}`;
}
function openingState(cfg) {
  if (cfg.arm === "baseline" || !cfg.journey) return NEUTRAL;
  return DATA.cycles[cfg.journey].stage_target_states[0];
}
/* Cue state supplied for question index qi (0-based). prevParsed is the model's own <state> from qi-1. */
function nextStateAfter(cfg, parsed, turnDone, current) {
  const has = (s, k) => s && s.toLowerCase().includes(k);
  if (cfg.arm === "baseline" || !cfg.journey) return has(parsed, "patience:") && has(parsed, "trust:") ? parsed : current;
  const cyc = DATA.cycles[cfg.journey];
  const tgt = cyc.stage_target_states[Math.min(cyc.stage_target_states.length - 1, turnDone)];
  if (cfg.timing === "every" || cfg.timing === "full") return tgt;
  return has(parsed, "patience:") && has(parsed, "mood:") ? parsed : tgt;
}
/* turns: [{q, r}] earlier turns of THIS interview */
function buildTurn(cfg, personaText, qObj, turns, state) {
  const keep = cfg.keep == null ? 2 : Number(cfg.keep);
  const older = keep > 0 ? turns.slice(0, Math.max(0, turns.length - keep)) : turns.slice();
  const recent = keep > 0 ? turns.slice(-keep) : [];
  const summary = older.map((t) => `- Asked about: ${firstSentence(t.q)} You said: ${firstSentence(t.r)}`);
  const instr = (qObj.participant_instruction || "").trim();
  const blocks = [];
  if (summary.length) blocks.push({ key: "C", label: "Earlier turns, summarized", text: "Earlier in this conversation:\n" + summary.join("\n") });
  if (cfg.profileFreq === "each") blocks.push({ key: "P", label: "Profile restated", text: `Reminder of who you are:\n${personaText.trim()}` });
  blocks.push({ key: "B", label: "Live state", text: `Your current state: ${state}` });
  if (instr) blocks.push({ key: "D0", label: "Interview context", text: `Context: ${instr}` });
  blocks.push({ key: "D", label: "Question", text: `Question: ${qObj.question.trim()}` });
  blocks.push({ key: "E", label: "Reminder", text: `(Stay in character as yourself, currently ${state}. Respond using <think>, <reply>, and <state> tags.)` });
  const userText = blocks.map((b) => b.text).join("\n\n");
  return { recent, older, blocks, userText };
}
function toMessages(system, recent, userText, imageUri) {
  const m = [{ role: "system", content: system }];
  recent.forEach((t) => { m.push({ role: "user", content: t.q }); m.push({ role: "assistant", content: t.r }); });
  m.push({ role: "user", content: imageUri ? [{ type: "text", text: userText }, { type: "image_url", image_url: { url: imageUri } }] : userText });
  return m;
}
function parseOut(raw) {
  const ex = (tag) => { const m = raw.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i")); return m ? m[1].trim() : null; };
  const think = ex("think"), state = ex("state");
  let reply = ex("reply");
  if (!reply) reply = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<state>[\s\S]*?<\/state>/gi, "").trim() || raw.trim();
  return { think, reply, state };
}
function configKey(cfg) {
  return [cfg.product, cfg.persona, cfg.profileHash || "seed", cfg.arm, cfg.arm === "baseline" ? "-" : cfg.journey,
    cfg.arm === "baseline" ? "-" : cfg.detail, cfg.arm === "baseline" ? "-" : cfg.timing, cfg.keep, cfg.profileFreq].join("|");
}
/* Model settings both arms must share. Saved v3 runs have none recorded (null), so they never count as a match for a new launch. */
function modelSig(m) { return m && m.deployment ? [m.deployment, Number(m.temperature), Number(m.maxTokens), Number(m.top_p ?? 0.9)].join("|") : null; }
function launchModel() { const c = getConn(); return { deployment: c.deployment, apiVersion: c.apiVersion, temperature: Number(c.temperature), maxTokens: Number(c.maxTokens), top_p: 0.9 }; }
function modelLine(m) { return m && m.deployment ? `${m.deployment}, temperature ${m.temperature}, max ${m.maxTokens} tokens` : "not recorded"; }
/* The shared policy both arms must agree on; a change here needs a new baseline. */
function sharedKey(cfg) { return [cfg.product, cfg.persona, cfg.profileHash || "seed", cfg.keep, cfg.profileFreq].join("|"); }

/* ---------------- runs & studies ---------------- */
const SAVED_RUNS = {};
const SAVED_STUDIES = {};
(function buildSaved() {
  const map = {
    "S1_sub_text_only_full": null, "S4_wellness_text_only_full": null,
  };
  Object.entries(DATA.sessions).forEach(([key, s]) => {
    if (/^S[2356]_/.test(key)) return; // S2, S3, S5, S6 duplicate the C1 sessions
    const arm = s.arm === "text_only" ? "baseline" : "grounded";
    const cycle = arm === "baseline" ? null : Object.values(DATA.cycles).find((c) => c.video_id === s.video_id).id;
    const cfg = {
      product: s.product_id, persona: s.persona_variant, profileHash: "seed", arm, journey: cycle,
      detail: s.arm === "fine" ? "detailed" : s.arm === "coarse" ? "brief" : null,
      timing: s.arm === "fine" ? "full" : s.arm === "coarse" ? "opening" : null,
      keep: 2, profileFreq: "once",
    };
    const qs = questionsOf(s.product_id);
    SAVED_RUNS[key] = {
      id: key, origin: "saved", cfg, legacyArm: s.arm, system: s.system_card,
      model: null, createdAt: null, replicate: 1,
      versions: { persona: hash(DATA.persona_texts[s.persona_variant]), pack: hash(JSON.stringify(qs.map((q) => q.question))), journey: cycle ? DATA.cycles[cycle].video_id : "none", loop: LOOP_VERSION },
      turns: s.turns.map((t, i) => ({
        i, status: "done", reply: t.reply, think: t.think, state_before: t.state_before, state_after: t.state_after,
        model_state: t.model_raw_state, user: t.assembled_user_block, words: Number(t.reply_words) || wordsOf(t.reply), tokens: Number(t.tokens) || null,
        recent: safeJson(t.verbatim_recent, []),
      })),
    };
  });
  const baselines = Object.values(SAVED_RUNS).filter((r) => r.cfg.arm === "baseline");
  Object.values(SAVED_RUNS).filter((r) => r.cfg.arm === "grounded").forEach((g) => {
    const b = baselines.find((x) => sharedKey(x.cfg) === sharedKey(g.cfg));
    const cyc = DATA.cycles[g.cfg.journey];
    const id = "study_" + g.id;
    SAVED_STUDIES[id] = {
      id, origin: "saved", name: `${productOf(g.cfg.product).short} · ${cyc.short_title.replace(/^Cycle \d: /, "")} · ${DETAIL[g.cfg.detail].name.toLowerCase()}${g.cfg.persona === "full_description" ? "" : ` · ${PERSONAS.find((p) => p.id === g.cfg.persona).variant.toLowerCase()}`}`,
      product: g.cfg.product, decision: "", groundedRuns: [g.id], baselineRuns: b ? [b.id] : [], createdAt: null,
    };
  });
})();
function safeJson(s, d) { try { return typeof s === "string" ? JSON.parse(s) : s || d; } catch (e) { return d; } }
function allRuns() { return { ...SAVED_RUNS, ...STORE.liveRuns }; }
function allStudies() { return { ...SAVED_STUDIES, ...STORE.liveStudies }; }
function runById(id) { return SAVED_RUNS[id] || STORE.liveRuns[id] || null; }
function studyById(id) { return SAVED_STUDIES[id] || STORE.liveStudies[id] || null; }
function personaTextFor(cfg) {
  if (cfg.profileText) return cfg.profileText;
  return DATA.persona_texts[cfg.persona];
}
function runPersonaText(run) { return run.profileText || DATA.persona_texts[run.cfg.persona]; }
function runLabel(run) {
  if (run.cfg.arm === "baseline") return "Baseline";
  const cyc = DATA.cycles[run.cfg.journey];
  return `${cyc.short_title.replace(/^Cycle \d: /, "")}`;
}
function runConfigLine(run) {
  const c = run.cfg;
  const parts = [];
  if (c.arm === "grounded") parts.push(DETAIL[c.detail].name, TIMING[c.timing].name.toLowerCase());
  else parts.push("No journey");
  parts.push(HISTORY[c.keep].name.toLowerCase());
  return parts.join(", ");
}
/* evaluation items: one per run-turn that is generated */
function itemId(runId, i) { return `${runId}#${i}`; }
function parseItem(id) { const [runId, i] = id.split("#"); return { runId, i: Number(i) }; }
function studyItems(study) {
  const out = [];
  [...study.baselineRuns, ...study.groundedRuns].forEach((rid) => {
    const run = runById(rid); if (!run) return;
    run.turns.forEach((t, i) => { if (t.status === "done") out.push(itemId(rid, i)); });
  });
  return out;
}
function anonCode(id) { return "R-" + shortId("anon:" + id); }

/* ---------------- reviews ---------------- */
function evalKey(lane, name) { return lane === "human" ? `human:${(name || "Reviewer").trim()}` : lane === "jev" ? "jev" : `llm:${name || "judge"}`; }
function laneOf(key) { return key.split(":")[0]; }
function reviewsFor(itemIdStr) {
  const out = [];
  Object.entries(STORE.reviews).forEach(([ek, items]) => { if (items[itemIdStr]) out.push({ ek, lane: laneOf(ek), r: items[itemIdStr] }); });
  return out;
}
function myReview(itemIdStr, create) {
  const ek = evalKey(STORE.reviewer.lane, STORE.reviewer.name);
  STORE.reviews[ek] = STORE.reviews[ek] || {};
  if (!STORE.reviews[ek][itemIdStr] && create) STORE.reviews[ek][itemIdStr] = { scores: {}, flags: {}, startedAt: new Date().toISOString() };
  return STORE.reviews[ek][itemIdStr] || null;
}
function reviewStage(r) {
  if (!r) return "none";
  if (r.implSubmittedAt) return "complete";
  if (r.commonSubmittedAt) return "common";
  return Object.keys(r.scores || {}).length ? "started" : "none";
}
function scoreVal(r, cid) { const s = r && r.scores && r.scores[cid]; return s ? s.v : undefined; }
/* Aggregate score for one evaluator lane on one item: median across reviewers of that lane. */
function laneScore(itemIdStr, lane, cid) {
  const vals = reviewsFor(itemIdStr).filter((x) => lane === "all" || x.lane === lane)
    .map((x) => (cid in COMMON_IDX ? (x.r.commonAudit ? x.r.commonAudit[cid] : scoreVal(x.r, cid)) : scoreVal(x.r, cid)))
    .filter((v) => typeof v === "number");
  return median(vals);
}
const COMMON_IDX = Object.fromEntries(COMMON.map((c) => [c.id, true]));
function hasDemo() { return Object.values(STORE.reviews).some((items) => Object.values(items).some((r) => r.demo)); }

/* ---------------- drag and drop engine ----------------
   Pointer-based so it works with mouse, pen and touch.
   Draggables: [data-drag="type"][data-value]. Drop targets: [data-drop="type type2"].
   Click or Enter on a draggable triggers its default drop (data-default-drop). */
const DnD = { handlers: {}, active: null };
function onDrop(type, fn) { DnD.handlers[type] = fn; }
function initDnD() {
  document.addEventListener("pointerdown", (e) => {
    const el = e.target.closest("[data-drag]");
    if (!el || el.classList.contains("disabled") || e.button > 0) return;
    if (e.target.closest("button, a, input, textarea, [contenteditable]") && !e.target.closest(".drag-handle-ok")) return;
    DnD.active = { el, type: el.dataset.drag, value: el.dataset.value, x0: e.clientX, y0: e.clientY, started: false, ghost: null, over: null, pid: e.pointerId };
  });
  document.addEventListener("pointermove", (e) => {
    const a = DnD.active; if (!a) return;
    if (!a.started) {
      if (Math.hypot(e.clientX - a.x0, e.clientY - a.y0) < 6) return;
      a.started = true;
      const r = a.el.getBoundingClientRect();
      a.dx = a.x0 - r.left; a.dy = a.y0 - r.top;
      a.ghost = a.el.cloneNode(true);
      a.ghost.classList.add("ghost-drag");
      a.ghost.style.width = r.width + "px";
      document.body.appendChild(a.ghost);
      document.body.classList.add("dragging");
      $$("[data-drop]").forEach((z) => { if (accepts(z, a.type)) z.classList.add("can-drop"); });
    }
    e.preventDefault();
    a.lastX = e.clientX; a.lastY = e.clientY;
    startAutoScroll(a);
    a.ghost.style.left = e.clientX - a.dx + "px";
    a.ghost.style.top = e.clientY - a.dy + "px";
    a.ghost.style.display = "none";
    const under = document.elementFromPoint(e.clientX, e.clientY);
    a.ghost.style.display = "";
    const zone = under && under.closest("[data-drop]");
    const ok = zone && accepts(zone, a.type) ? zone : null;
    if (a.over !== ok) { if (a.over) a.over.classList.remove("over"); if (ok) ok.classList.add("over"); a.over = ok; }
  }, { passive: false });
  const end = (e, cancelled) => {
    const a = DnD.active; if (!a) return;
    DnD.active = null;
    if (!a.started) {
      if (!cancelled && a.el.dataset.defaultDrop) fire(a.type, a.value, a.el.dataset.defaultDrop, a.el);
      return;
    }
    a.ghost.remove();
    cancelAnimationFrame(a.raf);
    document.body.classList.remove("dragging");
    $$(".can-drop, .over").forEach((z) => z.classList.remove("can-drop", "over"));
    if (!cancelled && a.over) fire(a.type, a.value, a.over.dataset.dropId || a.over.dataset.drop, a.el, a.over);
  };
  document.addEventListener("pointerup", (e) => end(e, false));
  document.addEventListener("pointercancel", (e) => end(e, true));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && DnD.active) end(e, true);
    const el = document.activeElement;
    if ((e.key === "Enter" || e.key === " ") && el && el.dataset && el.dataset.drag && el.dataset.defaultDrop && !el.classList.contains("disabled")) {
      e.preventDefault(); fire(el.dataset.drag, el.dataset.value, el.dataset.defaultDrop, el);
    }
  });
}
/* Scroll the page while a drag is held near the top or bottom edge, so off-screen targets are reachable on small screens. */
function startAutoScroll(a) {
  if (a.raf) return;
  const step = () => {
    if (DnD.active !== a) { a.raf = null; return; }
    const edge = 70, h = window.innerHeight;
    const bar = document.getElementById("topbar");
    const top = bar && getComputedStyle(bar).position === "sticky" ? bar.getBoundingClientRect().bottom : 0;
    let dy = 0;
    if (a.lastY < top + edge) dy = -Math.ceil((top + edge - a.lastY) / 4);
    else if (a.lastY > h - edge) dy = Math.ceil((a.lastY - (h - edge)) / 4);
    if (dy) {
      window.scrollBy(0, dy);
      a.ghost.style.display = "none";
      const under = document.elementFromPoint(a.lastX, a.lastY);
      a.ghost.style.display = "";
      const zone = under && under.closest("[data-drop]");
      const ok = zone && accepts(zone, a.type) ? zone : null;
      if (a.over !== ok) { if (a.over) a.over.classList.remove("over"); if (ok) ok.classList.add("over"); a.over = ok; }
    }
    a.raf = requestAnimationFrame(step);
  };
  a.raf = requestAnimationFrame(step);
}
function accepts(zone, type) { return (zone.dataset.drop || "").split(/\s+/).includes(type); }
function fire(type, value, target, el, zone) { const fn = DnD.handlers[type]; if (fn) fn(value, target, el, zone); }

/* ---------------- shared visuals ---------------- */
function sparkline(cyc, opts = {}) {
  const w = opts.w || 220, h = opts.h || 44, pad = 4;
  const s = cyc.stage_sentiments;
  const x = (i) => pad + (i * (w - pad * 2)) / (s.length - 1);
  const y = (v) => h / 2 - (v / 3) * (h / 2 - pad);
  const pts = s.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `M${x(0)},${h / 2} L` + s.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" L") + ` L${x(s.length - 1)},${h / 2} Z`;
  const id = "sp" + cyc.id + (opts.key || "");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Sentiment across 7 stages: ${s.join(", ")}">
    <defs><clipPath id="${id}a"><rect x="0" y="0" width="${w}" height="${h / 2}"/></clipPath><clipPath id="${id}b"><rect x="0" y="${h / 2}" width="${w}" height="${h / 2}"/></clipPath></defs>
    <line x1="0" x2="${w}" y1="${h / 2}" y2="${h / 2}" stroke="#d3d0e2" stroke-dasharray="2 3"/>
    <path d="${area}" fill="#2fa884" opacity=".16" clip-path="url(#${id}a)"/>
    <path d="${area}" fill="#e05a6b" opacity=".16" clip-path="url(#${id}b)"/>
    <polyline points="${pts}" fill="none" stroke="#1f1d3d" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    ${s.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="2.2" fill="#1f1d3d"/>`).join("")}
  </svg>`;
}

/* The twin rail: baseline and grounded tracks with 7 stations.
   opts.mode = "design" (cue badges) or "scores" (score dots per arm). */
function twinRail(opts) {
  const n = 7, W = 960, left = 92, right = 24, H = opts.mode === "scores" ? 214 : 232;
  const xs = (i) => left + (i * (W - left - right)) / (n - 1);
  const yB = opts.mode === "scores" ? 64 : 176, yG = opts.mode === "scores" ? 150 : 96;
  const cyc = opts.journey ? DATA.cycles[opts.journey] : null;
  const sel = opts.selected;
  let svg = `<svg class="twin" viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(opts.aria || "Turn timeline")}">`;
  if (opts.mode === "design") {
    svg += `<text x="0" y="${yG + 4}" font-size="12.5" font-weight="600" fill="#a4522a">Grounded</text>`;
    svg += `<text x="0" y="${yB + 4}" font-size="12.5" font-weight="600" fill="#3b3ba8">Baseline</text>`;
    if (cyc) {
      const top = 18, bot = 70, mid = (top + bot) / 2;
      const y = (v) => mid - (v / 3) * ((bot - top) / 2);
      svg += `<text x="0" y="${mid + 4}" font-size="11.5" fill="#8d8ba7">Journey</text>`;
      svg += `<line x1="${left}" x2="${W - right}" y1="${mid}" y2="${mid}" stroke="#e6e4f0" stroke-dasharray="2 4"/>`;
      const pts = cyc.stage_sentiments.map((v, i) => [xs(i), y(v)]);
      svg += `<path d="M${pts.map((p) => p.join(",")).join(" L")}" fill="none" stroke="#1f1d3d" stroke-width="1.8" stroke-linejoin="round"/>`;
      pts.forEach((p, i) => {
        const v = cyc.stage_sentiments[i];
        svg += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${v >= 0 ? "#2fa884" : "#e05a6b"}" stroke="#fff" stroke-width="2"/>`;
        const cue = opts.cueAt ? opts.cueAt(i) : null;
        if (cue) svg += `<line x1="${p[0]}" x2="${p[0]}" y1="${p[1] + 6}" y2="${yG - 12}" stroke="#e8885a" stroke-width="1.4" stroke-dasharray="${cue.dash ? "3 3" : "0"}" opacity=".75"/>`;
      });
    }
  } else {
    svg += `<text x="0" y="${yB + 4}" font-size="12.5" font-weight="600" fill="#3b3ba8">Baseline</text>`;
    svg += `<text x="0" y="${yG + 4}" font-size="12.5" font-weight="600" fill="#a4522a">Grounded</text>`;
  }
  svg += `<line x1="${left}" x2="${W - right}" y1="${yB}" y2="${yB}" stroke="#5b5bd6" stroke-width="3" stroke-linecap="round" opacity=".9"/>`;
  svg += `<line x1="${left}" x2="${W - right}" y1="${yG}" y2="${yG}" stroke="#e8885a" stroke-width="3" stroke-linecap="round" opacity=".9"/>`;
  for (let i = 0; i < n; i++) {
    const x = xs(i);
    const isSel = sel === i;
    svg += `<g class="station${isSel ? " sel" : ""}" data-action="${opts.action}" data-i="${i}" tabindex="0" role="button" aria-pressed="${isSel}" aria-label="Question ${i + 1}">`;
    svg += `<rect class="hit" x="${x - 46}" y="${opts.mode === "design" ? 8 : 18}" width="92" height="${H - (opts.mode === "design" ? 14 : 24)}" rx="12" fill="transparent"/>`;
    if (opts.mode === "design") {
      const screen = opts.screens && opts.screens[i];
      [yB, yG].forEach((yy, k) => {
        svg += `<circle cx="${x}" cy="${yy}" r="${isSel ? 9 : 7}" fill="#fff" stroke="${k ? "#e8885a" : "#5b5bd6"}" stroke-width="${isSel ? 3 : 2.2}"/>`;
        if (screen) svg += `<rect x="${x - 3}" y="${yy - 3}" width="6" height="6" rx="1" fill="${k ? "#e8885a" : "#5b5bd6"}"/>`;
      });
      const cue = opts.cueAt ? opts.cueAt(i) : null;
      if (cue) svg += `<text x="${x}" y="${yG - 16}" text-anchor="middle" font-size="11" fill="#a4522a">${esc(cue.label)}</text>`;
      svg += `<text x="${x}" y="${yB + 28}" text-anchor="middle" font-size="12" font-weight="${isSel ? 700 : 500}" fill="#1f1d3d">Q${i + 1}</text>`;
      if (screen) svg += `<text x="${x}" y="${yB + 43}" text-anchor="middle" font-size="10.5" fill="#8d8ba7">screen</text>`;
    } else {
      const b = opts.scoreAt(i, "b"), g = opts.scoreAt(i, "g");
      const yS = (v, base) => base;
      const r = (v) => (v == null ? 6 : 13);
      if (b != null && g != null && b !== g) {
        svg += `<line x1="${x}" x2="${x}" y1="${yB + r(b)}" y2="${yG - r(g)}" stroke="${g > b ? "#2fa884" : "#e05a6b"}" stroke-width="2.5"/>`;
        svg += `<text x="${i === n - 1 ? x - 10 : x + 10}" text-anchor="${i === n - 1 ? "end" : "start"}" y="${(yB + yG) / 2 + 4}" font-size="12" font-weight="600" fill="${g > b ? "#1d7f62" : "#b8364a"}">${g > b ? "+" : ""}${fmtNum(g - b)}</text>`;
      } else if (b != null && g != null) {
        svg += `<line x1="${x}" x2="${x}" y1="${yB + r(b)}" y2="${yG - r(g)}" stroke="#d3d0e2" stroke-width="1.5" stroke-dasharray="3 3"/>`;
        svg += `<text x="${i === n - 1 ? x - 10 : x + 10}" text-anchor="${i === n - 1 ? "end" : "start"}" y="${(yB + yG) / 2 + 4}" font-size="12" fill="#8d8ba7">same</text>`;
      }
      [[b, yB, "#5b5bd6"], [g, yG, "#e8885a"]].forEach(([v, yy, c]) => {
        if (v == null) svg += `<circle cx="${x}" cy="${yy}" r="6" fill="#fff" stroke="${c}" stroke-width="1.6" stroke-dasharray="2 2"/>`;
        else svg += `<circle cx="${x}" cy="${yy}" r="${r(v)}" fill="${c}" stroke="#fff" stroke-width="2"/><text x="${x}" y="${yy + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${fmtNum(v)}</text>`;
      });
      svg += `<text x="${x}" y="${H - 8}" text-anchor="middle" font-size="12" font-weight="${isSel ? 700 : 500}" fill="#1f1d3d">Q${i + 1}</text>`;
    }
    svg += `</g>`;
  }
  svg += `</svg>`;
  return svg;
}
function fmtNum(v) { return v == null ? "–" : Number.isInteger(v) ? String(v) : v.toFixed(1); }

/* ---------------- toast, modal, drawer ---------------- */
function toast(msg) {
  $$(".toast").forEach((n) => n.remove());
  const t = document.createElement("div");
  t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
function openLayer(html, kind = "modal", wide) {
  closeLayer();
  const scrim = document.createElement("div"); scrim.className = "scrim"; scrim.dataset.action = "close-layer";
  const box = document.createElement("div"); box.className = kind + (wide ? " wide" : ""); box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
  box.innerHTML = html;
  document.body.append(scrim, box);
  document.body.classList.add("layer-open");
  const f = box.querySelector("input, button, textarea"); if (f) f.focus();
  return box;
}
function closeLayer() { $$(".scrim, .modal, .drawer").forEach((n) => n.remove()); document.body.classList.remove("layer-open"); }
function imageModal(uri, caption) {
  openLayer(`<div class="spread"><h3>${esc(caption || "Screen")}</h3><button class="btn ghost sm" data-action="close-layer">Close</button></div><img src="${uri}" alt="${esc(caption || "Product screen")}" style="width:100%;border-radius:10px;border:1px solid var(--line)"/>`, "modal", true);
}

/* ---------------- Azure connection & runner ---------------- */
const CONN = { helper: null };
function connDefaults() {
  const d = DATA.azure_default || {};
  return { endpoint: d.endpoint || "", deployment: d.deployment || "gpt-4o", apiVersion: d.api_version || "2024-12-01-preview", key: "", temperature: 0.7, maxTokens: 360 };
}
function getConn() {
  // Precedence: what the person saved in the dialog, then the team's .env (via run_studio.py), then built-in defaults.
  const env = CONN.envConfig ? Object.fromEntries(["endpoint", "deployment", "apiVersion"].filter((k) => CONN.envConfig[k]).map((k) => [k, CONN.envConfig[k]])) : {};
  let c = { ...connDefaults(), ...env, ...(STORE.conn || {}) };
  try { const k = sessionStorage.getItem("experiment_studio_key"); if (k && !c.key) c.key = k; } catch (e) {}
  return c;
}
function connReady() { const c = getConn(); return !!(c.endpoint && c.deployment && (c.key || (CONN.helper && CONN.helper.hasKey))); }
function detectHelper() {
  if (!/^https?:$/.test(location.protocol)) return Promise.resolve();
  const base = helperBase();
  return fetch(base + "api/health").then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!(j && j.ok)) return;
    CONN.helper = { hasKey: !!j.has_key };
    // run_studio.py also shares endpoint and deployment from .env (never the key).
    return fetch(base + "api/config").then((r) => (r.ok ? r.json() : null)).then((cfg) => {
      if (!cfg) return;
      CONN.envConfig = cfg;
      CONN.token = cfg.token || null; // per-session secret that proves the request came from this page
      CONN.helper.hasKey = CONN.helper.hasKey || !!cfg.has_key;
    }).catch(() => {});
  }).catch(() => {});
}
function helperBase() { return location.pathname.includes("/experiment_studio/") ? "../" : ""; }
function normEndpoint(e) {
  e = String(e || "").trim(); if (!e) return e;
  if (!/^https?:\/\//i.test(e)) e = "https://" + e;
  return e.replace(/\/openai(\/.*)?$/i, "").replace(/\/+$/, "");
}
async function chat(messages, { temperature, maxTokens, json, deployment, apiVersion } = {}) {
  const c = { ...getConn(), ...(deployment ? { deployment } : {}), ...(apiVersion ? { apiVersion } : {}) };
  const url = `${normEndpoint(c.endpoint)}/openai/deployments/${encodeURIComponent(c.deployment)}/chat/completions?api-version=${encodeURIComponent(c.apiVersion)}`;
  const payload = { messages, temperature: temperature ?? c.temperature, top_p: 0.9, max_tokens: maxTokens ?? c.maxTokens };
  if (json) payload.response_format = { type: "json_object" };
  const res = CONN.helper
    ? await fetch(helperBase() + "api/chat", { method: "POST", headers: { "Content-Type": "application/json", "api-key": c.key, ...(CONN.token ? { "X-Studio-Token": CONN.token } : {}) }, body: JSON.stringify({ url, payload }) })
    : await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "api-key": c.key }, body: JSON.stringify(payload) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.error ? body.error.message || JSON.stringify(body.error) : "no details returned"}`);
  return { text: ((body.choices && body.choices[0] && body.choices[0].message.content) || "").trim(), usage: body.usage || null };
}
function connModal(after) {
  const c = getConn();
  const helperNote = CONN.helper
    ? `<div class="note ok">Connected through the local helper${CONN.helper.hasKey ? ". It already has the team's API key from your .env file, so leave the key field empty." : ". No key was found in a .env file, so paste one below or add it to .env and restart."}</div>`
    : `<div class="note warn">Live calls work most reliably through the local helper. In Terminal, run <code>python3 run_studio.py</code> from the <code>experiment_studio</code> folder and use the page it opens.</div>`;
  const box = openLayer(`
    <div class="spread"><h2>Model connection</h2><button class="btn ghost sm" data-action="close-layer">Close</button></div>
    ${helperNote}
    <div class="field"><label for="cEndpoint">Azure OpenAI endpoint</label><input id="cEndpoint" value="${esc(c.endpoint)}"/></div>
    <div class="slot-pair">
      <div class="field"><label for="cDeployment">Deployment</label><input id="cDeployment" value="${esc(c.deployment)}"/></div>
      <div class="field"><label for="cVersion">API version</label><input id="cVersion" value="${esc(c.apiVersion)}"/></div>
    </div>
    <div class="slot-pair">
      <div class="field"><label for="cTemp">Temperature</label><input id="cTemp" type="number" step="0.1" min="0" max="2" value="${c.temperature}"/></div>
      <div class="field"><label for="cMax">Max reply tokens</label><input id="cMax" type="number" step="20" min="80" max="2000" value="${c.maxTokens}"/></div>
    </div>
    <div class="field"><label for="cKey">API key (kept for this browser tab only)</label><input id="cKey" type="password" value="${esc(c.key)}" placeholder="Paste the Azure key"/></div>
    <div class="row" style="justify-content:flex-end"><button class="btn primary" id="cSave">Save connection</button></div>`);
  box.querySelector("#cSave").onclick = () => {
    const v = (id) => box.querySelector(id).value.trim();
    STORE.conn = { endpoint: v("#cEndpoint"), deployment: v("#cDeployment"), apiVersion: v("#cVersion"), temperature: Number(v("#cTemp")) || 0.7, maxTokens: Number(v("#cMax")) || 360 };
    try { sessionStorage.setItem("experiment_studio_key", v("#cKey")); } catch (e) {}
    persist(true); closeLayer(); toast("Connection saved");
    if (after) after(); else App.render();
  };
}

/* Generate (or resume) one run turn by turn. Failed turns can be resumed without touching completed ones. */
const RUNNING = new Set();
async function generateRun(runId, onTick) {
  const run = STORE.liveRuns[runId]; if (!run || RUNNING.has(runId)) return;
  RUNNING.add(runId);
  const qs = questionsOf(run.cfg.product);
  const personaText = runPersonaText(run);
  try {
    for (let i = 0; i < qs.length; i++) {
      const t = run.turns[i];
      if (t.status === "done") continue;
      const prior = run.turns.slice(0, i).map((x, k) => ({ q: qs[k].question, r: x.reply }));
      let state = i === 0 ? openingState(run.cfg) : run.turns[i - 1].state_after;
      const built = buildTurn(run.cfg, personaText, qs[i], prior, state);
      const image = isScreen(qs[i]) ? qs[i].screenshot_data_uri : null;
      t.status = "running"; t.error = null; onTick && onTick();
      try {
        const res = await chat(toMessages(run.system, built.recent, built.userText, image), run.model ? { temperature: run.model.temperature, maxTokens: run.model.maxTokens, deployment: run.model.deployment, apiVersion: run.model.apiVersion } : {});
        const p = parseOut(res.text);
        Object.assign(t, {
          status: "done", reply: p.reply, think: p.think, model_state: p.state, state_before: state,
          state_after: nextStateAfter(run.cfg, p.state, i + 1, state), user: built.userText, raw: res.text,
          usage: res.usage, words: wordsOf(p.reply), tokens: res.usage ? res.usage.prompt_tokens : null, at: new Date().toISOString(),
          recent: built.recent,
        });
      } catch (err) {
        t.status = "failed"; t.error = String(err.message || err);
        persist(true); onTick && onTick();
        break; // later turns depend on this one
      }
      persist(true); onTick && onTick();
    }
  } finally { RUNNING.delete(runId); persist(true); onTick && onTick(); }
}
function runProgress(run) {
  const c = { done: 0, failed: 0, running: 0, pending: 0 };
  run.turns.forEach((t) => (c[t.status] = (c[t.status] || 0) + 1));
  return c;
}
function progBar(run) {
  return `<div class="prog" aria-label="Generation progress">${run.turns.map((t) => `<i class="${t.status === "done" ? "done" : t.status === "running" ? "run" : t.status === "failed" ? "fail" : ""}" title="Q${t.i + 1}: ${t.status}"></i>`).join("")}</div>`;
}

/* ---------------- LLM judge ---------------- */
function judgePrompt(item, pass) {
  const { run, i, q, turn } = item;
  const crits = pass === "impl" ? IMPL : COMMON;
  const prior = run.turns.slice(0, i).map((t, k) => `Q${k + 1}: ${questionsOf(run.cfg.product)[k].question}\nA${k + 1}: ${t.reply}`).join("\n\n");
  const lines = crits.map((c) => `- ${c.id} (${c.name}): ${c.ask}\n  0 = ${c.anchors[0]}\n  1 = ${c.anchors[1]}\n  2 = ${c.anchors[2]}\n  3 = ${c.anchors[3]}`).join("\n");
  let ctx = `Approved persona profile:\n${runPersonaText(run)}\n\nEarlier replies in this interview:\n${prior || "(none, this is the first question)"}\n\nQuestion ${i + 1}${isScreen(q) ? " (shown with a product screen)" : " (topic-only, no screen)"}:\n${q.question}\n\nReply to score:\n${turn.reply}`;
  if (pass === "impl") ctx += `\n\nCue supplied at this turn: ${turn.state_before}\nBehavior rules in the system card:\n${rulesFor(run.cfg).map((r) => "- " + r).join("\n") || "(none)"}\nPrevious turn's cue: ${i ? run.turns[i - 1].state_before : "(first turn)"}`;
  return [
    { role: "system", content: "You are a careful UX research reviewer scoring one synthetic interview reply against a rubric. Score each criterion independently on 0-3 using the anchors. Use \"na\" only where the criterion cannot apply (for example conversation consistency or trajectory on the first question). Quote the exact words that support each score. Respond with JSON only." },
    { role: "user", content: `${ctx}\n\nCriteria:\n${lines}\n\nReturn JSON: {"scores": {"<criterion id>": {"v": 0|1|2|3|"na", "evidence": ["exact quote"], "note": "one sentence"}}, "factual_concern": "" }` },
  ];
}
function itemContext(id) {
  const { runId, i } = parseItem(id);
  const run = runById(runId); if (!run || !Number.isInteger(i) || !run.turns[i]) return null;
  const q = questionsOf(run.cfg.product)[i];
  return { id, run, i, q, turn: run.turns[i] };
}
async function judgeItem(id, deployment) {
  const item = itemContext(id); if (!item) return;
  const ek = `llm:${deployment}`;
  STORE.reviews[ek] = STORE.reviews[ek] || {};
  const rev = STORE.reviews[ek][id] || { scores: {}, flags: {}, startedAt: new Date().toISOString() };
  const apply = (out, crits) => {
    const sc = (out && out.scores) || {};
    crits.forEach((c) => {
      const s = sc[c.id]; if (!s) return;
      const v = s.v === "na" || s.v === "n/a" ? "na" : Number(s.v);
      rev.scores[c.id] = { v: v === "na" || (v >= 0 && v <= 3) ? v : undefined, evidence: (s.evidence || []).filter(Boolean).slice(0, 3).map((t) => ({ text: String(t) })), note: s.note || "" };
    });
    if (out && out.factual_concern) rev.flags.factual = { on: true, note: out.factual_concern };
  };
  const r1 = await chat(judgePrompt(item, "common"), { temperature: 0, maxTokens: 900, json: true });
  apply(safeJson(r1.text, {}), COMMON);
  rev.commonSubmittedAt = new Date().toISOString();
  rev.commonAudit = Object.fromEntries(COMMON.map((c) => [c.id, scoreVal(rev, c.id)]));
  if (item.run.cfg.arm === "grounded") {
    const r2 = await chat(judgePrompt(item, "impl"), { temperature: 0, maxTokens: 700, json: true });
    apply(safeJson(r2.text, {}), IMPL);
  } else IMPL.forEach((c) => (rev.scores[c.id] = { v: "na", evidence: [], note: "Baseline: no journey supplied." }));
  rev.implSubmittedAt = new Date().toISOString();
  STORE.reviews[ek][id] = rev;
  persist(true);
}

/* ---------------- illustrative scores ----------------
   Clearly flagged demo data so the results view can be explored before real reviews exist. */
function seedIllustrative(study) {
  const r = seeded("demo:" + study.id);
  const lanes = [["human:Illustrative reviewer A", 0], ["human:Illustrative reviewer B", 0], ["llm:illustrative", 0.4], ["jev", -0.1]];
  studyItems(study).forEach((id) => {
    const it = itemContext(id); const grounded = it.run.cfg.arm === "grounded";
    const txt = it.turn.reply || "";
    const concrete = /(\$|\d|screen|confirm|cancel|usage|date|notif|label|summary|share|bank|merchant)/i.test(txt) ? 0.6 : 0;
    lanes.forEach(([ek, bias], li) => {
      if (li === 1 && r() < 0.35) return; // second reviewer only covers part of the queue
      STORE.reviews[ek] = STORE.reviews[ek] || {};
      const rev = { scores: {}, flags: {}, demo: true, startedAt: new Date().toISOString() };
      COMMON.forEach((c) => {
        if (c.naFirst && it.i === 0) { rev.scores[c.id] = { v: "na", evidence: [] }; return; }
        let base = 1.6 + (c.group === "Product feedback" ? concrete : 0.3) + bias + (r() - 0.5) * 1.6;
        if (grounded && c.id === "persona") base += 0.3;
        if (grounded && c.id === "specificity") base -= 0.15;
        rev.scores[c.id] = { v: Math.max(0, Math.min(3, Math.round(base))), evidence: [], note: "" };
      });
      rev.commonSubmittedAt = rev.startedAt;
      rev.commonAudit = Object.fromEntries(COMMON.map((c) => [c.id, rev.scores[c.id].v]));
      IMPL.forEach((c) => {
        rev.scores[c.id] = !grounded || (c.naFirst && it.i === 0) ? { v: "na", evidence: [] } : { v: Math.max(0, Math.min(3, Math.round(1.8 + (r() - 0.5) * 2))), evidence: [] };
      });
      rev.implSubmittedAt = rev.startedAt;
      STORE.reviews[ek][id] = rev;
    });
  });
  persist(true);
}
function clearIllustrative() {
  Object.keys(STORE.reviews).forEach((ek) => {
    Object.keys(STORE.reviews[ek]).forEach((id) => { if (STORE.reviews[ek][id].demo) delete STORE.reviews[ek][id]; });
    if (!Object.keys(STORE.reviews[ek]).length) delete STORE.reviews[ek];
  });
  persist(true);
}

/* ---------------- export / import ---------------- */
function download(name, text, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportAll() {
  const out = { exported_at: new Date().toISOString(), loop: LOOP_VERSION, reviews: STORE.reviews, observations: STORE.observations, liveRuns: STORE.liveRuns, liveStudies: STORE.liveStudies };
  download(`experiment-studio-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 2));
}
function exportScoresCsv() {
  const rows = [["evaluator", "item", "anon_code", "run_id", "arm", "journey", "question", ...ALL_CRIT.map((c) => c.id), ...COMMON.map((c) => "common_audit_" + c.id), "factual_concern", "illustrative", "common_submitted_at", "impl_submitted_at"]];
  Object.entries(STORE.reviews).forEach(([ek, items]) => Object.entries(items).forEach(([id, r]) => {
    const it = itemContext(id); if (!it) return;
    rows.push([ek, id, anonCode(id), it.run.id, it.run.cfg.arm, it.run.cfg.journey || "", it.i + 1,
      ...ALL_CRIT.map((c) => (scoreVal(r, c.id) ?? "")), ...COMMON.map((c) => (r.commonAudit ? r.commonAudit[c.id] ?? "" : "")),
      r.flags && r.flags.factual && r.flags.factual.on ? (r.flags.factual.note || "yes") : "", r.demo ? "yes" : "", r.commonSubmittedAt || "", r.implSubmittedAt || ""]);
  }));
  download("experiment-studio-scores.csv", rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
}
/* ---------- import validation ----------
   Exports are shared between teammates, so every field is checked before it is stored.
   IDs must be plain tokens; enums must be known values; text stays text (it is always escaped when shown). */
const SAFE_ID = /^[A-Za-z0-9_.:-]{1,120}$/;
const SAFE_ITEM = /^[A-Za-z0-9_.:-]{1,120}#[0-6]$/;
const isStr = (v, max = 20000) => typeof v === "string" && v.length <= max;
function cleanScore(sc) {
  if (!sc || typeof sc !== "object") return null;
  const v = sc.v === "na" ? "na" : [0, 1, 2, 3].includes(sc.v) ? sc.v : undefined;
  const out = { evidence: Array.isArray(sc.evidence) ? sc.evidence.filter((e) => e && isStr(e.text, 2000)).slice(0, 20).map((e) => ({ text: e.text })) : [], note: isStr(sc.note, 4000) ? sc.note : "" };
  if (v !== undefined) out.v = v;
  return out;
}
function cleanReview(r) {
  if (!r || typeof r !== "object") return null;
  const out = { scores: {}, flags: {} };
  ALL_CRIT.forEach((c) => { const sc = cleanScore(r.scores && r.scores[c.id]); if (sc) out.scores[c.id] = sc; });
  const f = r.flags && r.flags.factual;
  if (f && typeof f === "object") out.flags.factual = { on: !!f.on, note: isStr(f.note, 4000) ? f.note : "" };
  ["startedAt", "updatedAt", "commonSubmittedAt", "implSubmittedAt"].forEach((k) => { if (isStr(r[k], 40)) out[k] = r[k]; });
  if (r.commonAudit && typeof r.commonAudit === "object") out.commonAudit = Object.fromEntries(COMMON.map((c) => [c.id, r.commonAudit[c.id] === "na" || [0, 1, 2, 3].includes(r.commonAudit[c.id]) ? r.commonAudit[c.id] : undefined]));
  if (r.demo) out.demo = true;
  return out;
}
function cleanCfg(c) {
  if (!c || typeof c !== "object") return null;
  if (!DATA.products[c.product] || !DATA.persona_texts[c.persona] || !["baseline", "grounded"].includes(c.arm)) return null;
  if (!HISTORY[c.keep] || !PROFILE_FREQ[c.profileFreq]) return null;
  if (c.arm === "grounded" && (!DATA.cycles[c.journey] || !DETAIL[c.detail] || !TIMING[c.timing])) return null;
  return {
    product: c.product, persona: c.persona, profileHash: isStr(c.profileHash, 40) && SAFE_ID.test(c.profileHash) ? c.profileHash : "seed",
    profileText: isStr(c.profileText, 8000) ? c.profileText : null, arm: c.arm,
    journey: c.arm === "grounded" ? c.journey : null, detail: c.arm === "grounded" ? c.detail : null, timing: c.arm === "grounded" ? c.timing : null,
    keep: Number(c.keep), profileFreq: c.profileFreq,
  };
}
function cleanRun(id, r) {
  if (!SAFE_ID.test(id) || !r || typeof r !== "object" || SAVED_RUNS[id]) return null;
  const cfg = cleanCfg(r.cfg); if (!cfg || !Array.isArray(r.turns) || r.turns.length !== questionsOf(cfg.product).length) return null;
  const m = r.model && typeof r.model === "object" && isStr(r.model.deployment, 100) ? { deployment: r.model.deployment, apiVersion: isStr(r.model.apiVersion, 40) ? r.model.apiVersion : "", temperature: Number(r.model.temperature) || 0, maxTokens: Number(r.model.maxTokens) || 0, top_p: Number(r.model.top_p ?? 0.9) } : null;
  return {
    id, origin: "live", cfg, profileText: cfg.profileText, replicate: Number(r.replicate) || 1, createdAt: isStr(r.createdAt, 40) ? r.createdAt : null,
    system: buildCard(cfg.profileText || DATA.persona_texts[cfg.persona], rulesFor(cfg)), model: m,
    versions: r.versions && typeof r.versions === "object" ? Object.fromEntries(["persona", "pack", "journey", "loop"].map((k) => [k, isStr(r.versions[k], 80) ? r.versions[k] : ""])) : { persona: "", pack: "", journey: "", loop: "" },
    approvedProfile: null,
    turns: r.turns.map((t, i) => {
      const st = ["done", "failed", "pending"].includes(t && t.status) ? t.status : "pending";
      const o = { i, status: st };
      ["reply", "think", "state_before", "state_after", "model_state", "user", "error", "at"].forEach((k) => { if (t && isStr(t[k])) o[k] = t[k]; });
      if (st === "done" && !o.reply) o.status = "pending";
      o.words = o.reply ? wordsOf(o.reply) : 0;
      o.tokens = t && Number.isFinite(t.tokens) ? t.tokens : null;
      o.recent = Array.isArray(t && t.recent) ? t.recent.filter((x) => x && isStr(x.q) && isStr(x.r)).map((x) => ({ q: x.q, r: x.r })) : [];
      return o;
    }),
  };
}
function cleanStudy(id, s, knownRun) {
  if (!SAFE_ID.test(id) || !s || typeof s !== "object" || SAVED_STUDIES[id] || !DATA.products[s.product]) return null;
  const runs = (arr) => (Array.isArray(arr) ? arr.filter((r) => typeof r === "string" && SAFE_ID.test(r) && knownRun(r)) : []);
  const g = runs(s.groundedRuns), b = runs(s.baselineRuns);
  if (!g.length && !b.length) return null;
  return { id, origin: "live", name: isStr(s.name, 200) ? s.name : "Imported study", product: s.product, decision: isStr(s.decision, 1000) ? s.decision : "", groundedRuns: g, baselineRuns: b, createdAt: isStr(s.createdAt, 40) ? s.createdAt : null };
}
function cleanObservation(o) {
  if (!o || !SAFE_ID.test(o.id || "") || !studyById(o.study) || !Number.isInteger(o.q) || o.q < 0 || o.q > 6) return null;
  const quotes = (a) => (Array.isArray(a) ? a.filter((x) => isStr(x, 2000)).slice(0, 20) : []);
  const base = quotes(o.base), grnd = quotes(o.grnd);
  const kind = o.kind === "none" ? "none" : base.length && grnd.length ? "both" : base.length ? "baseline" : grnd.length ? "config" : null;
  if (!kind) return null;
  return { id: o.id, study: o.study, q: o.q, title: isStr(o.title, 2000) ? o.title : "", base, grnd, kind, author: isStr(o.author, 120) ? o.author : "", at: isStr(o.at, 40) ? o.at : "" };
}
function importAll(file) {
  const fr = new FileReader();
  fr.onload = () => {
    const j = safeJson(fr.result, null);
    if (!j || typeof j !== "object" || !j.reviews || typeof j.reviews !== "object") { toast("That file is not an Experiment Studio export."); return; }
    let skipped = 0, added = 0;
    Object.entries(j.liveRuns || {}).forEach(([id, r]) => { const c = cleanRun(id, r); if (c) { STORE.liveRuns[id] = c; added++; } else skipped++; });
    Object.entries(j.liveStudies || {}).forEach(([id, s]) => { const c = cleanStudy(id, s, (rid) => !!runById(rid)); if (c) { STORE.liveStudies[id] = c; added++; } else skipped++; });
    Object.entries(j.reviews).forEach(([ek, items]) => {
      if (!/^(human:[^"<>\n]{1,80}|llm:[A-Za-z0-9_.:-]{1,80}|jev)$/.test(ek) || !items || typeof items !== "object") { skipped++; return; }
      Object.entries(items).forEach(([id, r]) => {
        const c = SAFE_ITEM.test(id) && itemContext(id) ? cleanReview(r) : null;
        if (c) { STORE.reviews[ek] = STORE.reviews[ek] || {}; STORE.reviews[ek][id] = c; added++; } else skipped++;
      });
    });
    const have = new Set(STORE.observations.map((o) => o.id));
    (Array.isArray(j.observations) ? j.observations : []).forEach((o) => { const c = cleanObservation(o); if (c && !have.has(c.id)) { STORE.observations.push(c); added++; } else if (!c) skipped++; });
    persist(true); App.render();
    toast(skipped ? `Imported ${added} items. Skipped ${skipped} that were malformed or unrecognized.` : `Imported ${added} items`);
  };
  fr.readAsText(file);
}
