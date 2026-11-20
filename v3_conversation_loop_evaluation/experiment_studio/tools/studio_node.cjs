/* Shared helpers for command-line tools: load the built Studio into Node and read or
   write the shared Firestore workspace through its public REST API. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const DEFAULT_BASE = "https://capstone-experimentstudio.vercel.app/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/* Runs every inline script of experiment-studio.html in a sandbox; model calls go to `base`/api/chat. */
function loadStudio(base = DEFAULT_BASE) {
  const root = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "experiment-studio.html"), "utf8");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((s) => s.trim());
  const ctx = vm.createContext({
    window: { scrollTo() {} }, document: { addEventListener() {} },
    localStorage: { getItem() { return "{}"; }, setItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {} },
    location: { protocol: "https:", pathname: "/experiment-studio.html" },
    setTimeout, clearTimeout, console, fetch: retryingFetch, AbortSignal,
  });
  for (const s of scripts) vm.runInContext(s, ctx);
  vm.runInContext(`persist = () => {}; CONN.helper = { hasKey: true }; helperBase = () => ${JSON.stringify(base)};`, ctx);
  const run = (code) => vm.runInContext(code, ctx);
  return { ctx, run, call: (fnExpr, ...args) => { ctx.__a = args; return run(`(${fnExpr})(...__a)`); } };
}

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
const quoteField = (seg) => "`" + seg.replace(/\\/g, "\\\\").replace(/`/g, "\\`") + "`";

/* The workspace config is injected at deploy time, so read it from the deployed page when the local build has none. */
async function workspace(studio, base = DEFAULT_BASE) {
  let cloud = studio.run("window.STUDIO_CLOUD_DEFAULT") || {};
  if (!(cloud.firebase && cloud.firebase.projectId)) {
    const page = await (await retryingFetch(new URL("experiment-studio.html", base).href)).text();
    const m = /window\.STUDIO_CLOUD_DEFAULT = (\{.*?\});<\/script>/s.exec(page);
    if (!m) throw new Error("Could not read the workspace config from the deployed page.");
    cloud = JSON.parse(m[1]);
  }
  const docs = `https://firestore.googleapis.com/v1/projects/${cloud.firebase.projectId}/databases/(default)/documents/studioWorkspaces`;
  async function readDoc(id) {
    const res = await retryingFetch(`${docs}/${id}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Firestore read ${id}: HTTP ${res.status} ${await res.text()}`);
    const raw = await res.json();
    return dec({ mapValue: { fields: raw.fields || {} } });
  }
  async function patchDoc(id, fields, maskPaths, mustExist) {
    const qs = [...(maskPaths || []).map((p) => `updateMask.fieldPaths=${encodeURIComponent(p)}`), ...(mustExist ? ["currentDocument.exists=true"] : [])].join("&");
    const res = await retryingFetch(`${docs}/${id}${qs ? "?" + qs : ""}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, k === "updatedAt" ? { timestampValue: v } : enc(v)])) }),
    });
    if (!res.ok) throw new Error(`Firestore write ${id}: HTTP ${res.status} ${await res.text()}`);
  }
  /* Loads the main document and every judge document into the Studio's STORE. */
  async function loadAllReviews() {
    const main = await readDoc(cloud.workspaceId);
    if (!main) throw new Error(`Workspace ${cloud.workspaceId} not found`);
    const reviews = { ...((main.payload || {}).reviews || {}) };
    const judges = studio.run("RUBRIC_JUDGES.map((j) => ({ id: j.id, key: j.key }))");
    for (const j of judges) {
      reviews[j.key] = {};
      for (let p = 0; p < studio.run("SHARD_PARTS"); p++) {
        const doc = await readDoc(studio.call("(ws, id, p) => shardDocId(ws, rubricJudge(id), p)", cloud.workspaceId, j.id, p));
        Object.assign(reviews[j.key], ((doc && doc.payload && doc.payload.reviews) || {})[j.key] || {});
      }
    }
    studio.ctx.__reviews = reviews;
    studio.run("Object.entries(__reviews).forEach(([ek, items]) => { STORE.reviews[ek] = items || {}; })");
    return { main, reviews };
  }
  return { cloud, readDoc, patchDoc, loadAllReviews };
}

module.exports = { DEFAULT_BASE, loadStudio, workspace, quoteField, retryingFetch };
