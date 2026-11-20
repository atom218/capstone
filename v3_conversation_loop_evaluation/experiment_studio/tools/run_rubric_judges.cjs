#!/usr/bin/env node
/* Run the new-rubric LLM judges over every answer the team has evaluated and save
   the results to the shared Firestore workspace (one document per judge).

   It loads the built experiment-studio.html, so packets, prompts and validation are
   exactly the ones the website uses. Model calls go through the deployed backend,
   which holds the Azure key. Completed answers are skipped, so it is safe to rerun.

     node tools/run_rubric_judges.cjs                    # both judges, all pending answers
     node tools/run_rubric_judges.cjs --judges gpt2 --limit 2 --dry-run --show-packet
*/
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i < 0 ? dflt : args[i + 1]; };
const flag = (name) => args.includes(`--${name}`);
const BASE = opt("base", "https://capstone-experimentstudio.vercel.app/");
const JUDGE_IDS = opt("judges", "claude2,gpt2").split(",");
const LIMIT = Number(opt("limit", "0")) || Infinity;
const CONCURRENCY = Number(opt("concurrency", "4"));
const ONLY = opt("items", "") ? opt("items", "").split(",") : null;
const DRY = flag("dry-run");

/* ---------- load the Studio ---------- */
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "experiment-studio.html"), "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((s) => s.trim());

async function retryingFetch(url, init, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(240000) });
      if ([429, 500, 502, 503, 504].includes(res.status) && attempt < tries) { await sleep(4000 * attempt); continue; }
      return res;
    } catch (err) {
      if (attempt >= tries) throw err;
      await sleep(4000 * attempt);
    }
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = vm.createContext({
  window: { scrollTo() {} }, document: { addEventListener() {} },
  localStorage: { getItem() { return "{}"; }, setItem() {} },
  sessionStorage: { getItem() { return null; }, setItem() {} },
  location: { protocol: "https:", pathname: "/experiment-studio.html" },
  setTimeout, clearTimeout, console, fetch: retryingFetch, AbortSignal,
});
for (const s of scripts) vm.runInContext(s, ctx);
vm.runInContext(`persist = () => {}; CONN.helper = { hasKey: true }; helperBase = () => ${JSON.stringify(BASE)};`, ctx);
const run = (code) => vm.runInContext(code, ctx);
let cloud, WORKSPACE, DOCS;
/* The workspace config is injected at deploy time, so read it from the deployed page when the local build has none. */
async function loadCloudConfig() {
  cloud = run("window.STUDIO_CLOUD_DEFAULT") || {};
  if (!(cloud.firebase && cloud.firebase.projectId)) {
    const page = await (await retryingFetch(new URL("experiment-studio.html", BASE).href)).text();
    const m = /window\.STUDIO_CLOUD_DEFAULT = (\{.*?\});<\/script>/s.exec(page);
    if (!m) throw new Error("Could not read the workspace config from the deployed page.");
    cloud = JSON.parse(m[1]);
  }
  WORKSPACE = cloud.workspaceId;
  DOCS = `https://firestore.googleapis.com/v1/projects/${cloud.firebase.projectId}/databases/(default)/documents/studioWorkspaces`;
}

/* ---------- Firestore REST helpers ---------- */
function dec(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(dec);
  return null;
}
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(enc) } : {} };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, enc(x)])) } };
}
const quote = (seg) => "`" + seg.replace(/\\/g, "\\\\").replace(/`/g, "\\`") + "`";
async function readDoc(id) {
  const res = await retryingFetch(`${DOCS}/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore read ${id}: HTTP ${res.status} ${await res.text()}`);
  const raw = await res.json();
  return dec({ mapValue: { fields: raw.fields || {} } });
}
async function patchDoc(id, fields, maskPaths, mustExist) {
  const qs = [...(maskPaths || []).map((p) => `updateMask.fieldPaths=${encodeURIComponent(p)}`), ...(mustExist ? ["currentDocument.exists=true"] : [])].join("&");
  const res = await retryingFetch(`${DOCS}/${id}${qs ? "?" + qs : ""}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, k === "updatedAt" ? { timestampValue: v } : enc(v)])) }),
  });
  if (!res.ok) throw new Error(`Firestore write ${id}: HTTP ${res.status} ${await res.text()}`);
}

/* ---------- main ---------- */
(async () => {
  await loadCloudConfig();
  const main = await readDoc(WORKSPACE);
  if (!main) throw new Error(`Workspace ${WORKSPACE} not found`);
  ctx.__main = main.payload.reviews || {};
  run("Object.entries(__main).forEach(([ek, items]) => { STORE.reviews[ek] = items; })");
  const judges = JUDGE_IDS.map((id) => run(`rubricJudge(${JSON.stringify(id)})`));
  const parts = run("SHARD_PARTS");
  const docFor = (j, itemId) => run(`shardDocId(${JSON.stringify(WORKSPACE)}, rubricJudge(${JSON.stringify(j.id)}), shardPartOf(${JSON.stringify(itemId)}))`);
  for (const j of judges) {
    const lane = {};
    for (let p = 0; p < parts; p++) {
      const id = run(`shardDocId(${JSON.stringify(WORKSPACE)}, rubricJudge(${JSON.stringify(j.id)}), ${p})`);
      let doc = await readDoc(id);
      if (!doc && !DRY) {
        await patchDoc(id, { schemaVersion: 1, passcode: main.passcode || cloud.passcode || "", updatedBy: "LLM judge runner", updatedAt: new Date().toISOString(),
          payload: { reviews: { [j.key]: {} }, observations: [], liveRuns: {}, liveStudies: {} } });
        doc = await readDoc(id);
        console.log(`Created shared document ${id}`);
      }
      Object.assign(lane, ((doc && doc.payload && doc.payload.reviews) || {})[j.key] || {});
    }
    ctx.__lane = lane;
    run(`STORE.reviews[${JSON.stringify(j.key)}] = __lane`);
  }
  const items = ONLY || run("rubricTargetItems()");
  console.log(`${items.length} answers in scope (every answer with a human, Jev or earlier LLM review).`);
  if (flag("show-packet")) {
    ctx.__id = items[0];
    console.log(run("rubricPacketText(rubricPacket(itemContext(__id), 'common'))"));
    if (run("itemContext(__id).run.cfg.arm") === "grounded") console.log(run("rubricPacketText(rubricPacket(itemContext(__id), 'journey'))"));
  }

  const failures = [];
  await Promise.all(judges.map(async (j) => {
    const pending = items.filter((id) => !run(`rubricReviewComplete(STORE.reviews[${JSON.stringify(j.key)}][${JSON.stringify(id)}])`)).slice(0, LIMIT);
    console.log(`${j.name}: ${items.length - pending.length} already scored, ${pending.length} to score.`);
    let next = 0, done = 0;
    const worker = async () => {
      while (next < pending.length) {
        const id = pending[next++];
        const t0 = Date.now();
        try {
          ctx.__args = { id, jid: j.id };
          const rev = JSON.parse(JSON.stringify(await run("judgeItemRubric(__args.id, rubricJudge(__args.jid), (m) => console.log('  retry · ' + m))")));
          if (DRY) console.log(JSON.stringify(rev, null, 1));
          else await patchDoc(docFor(j, id), { updatedBy: "LLM judge runner", updatedAt: new Date().toISOString(), payload: { reviews: { [j.key]: { [id]: rev } } } },
            ["updatedBy", "updatedAt", `payload.reviews.${quote(j.key)}.${quote(id)}`], true);
          done++;
          const s = rev.scores;
          console.log(`${j.short} ${done}/${pending.length} ${id} (${((Date.now() - t0) / 1000).toFixed(0)}s): ${Object.keys(s).map((c) => `${c}=${s[c].status === "scored" ? s[c].v : s[c].status === "not_applicable" ? "NA" : "IE"}`).join(" ")}`);
        } catch (err) {
          failures.push(`${j.short} ${id}: ${err.message || err}`);
          console.log(`${j.short} FAILED ${id}: ${err.message || err}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
  }));
  console.log(failures.length ? `\n${failures.length} answers failed and stay pending (rerun to retry):\n${failures.join("\n")}` : "\nAll requested answers scored.");
  process.exit(failures.length ? 2 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
