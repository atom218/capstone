#!/usr/bin/env node
/* One-time move of rubric-judge results from the original two documents per judge
   (<workspace>--judge-*-rubric2-p0/p1) into per-product documents. The originals are
   left in place as a backup. Every copied review is read back and compared. */
"use strict";
const { loadStudio, workspace } = require("./studio_node.cjs");

(async () => {
  const studio = loadStudio();
  const ws = await workspace(studio);
  const WS = ws.cloud.workspaceId;
  const main = await ws.readDoc(WS);
  const judges = studio.run("RUBRIC_JUDGES.map((j) => ({ id: j.id, key: j.key, shard: j.shard, name: j.name }))");
  let problems = 0;
  for (const j of judges) {
    const old = {};
    for (const p of ["p0", "p1"]) {
      const doc = await ws.readDoc(`${WS}--${j.shard}-${p}`);
      Object.assign(old, ((doc && doc.payload && doc.payload.reviews) || {})[j.key] || {});
    }
    const groups = {};
    for (const [id, rev] of Object.entries(old)) (groups[studio.call("(id) => shardPartOf(id)", id)] ||= {})[id] = rev;
    for (const [part, items] of Object.entries(groups)) {
      const id = studio.call("(ws, j, p) => shardDocId(ws, rubricJudge(j), p)", WS, j.id, part);
      const existing = await ws.readDoc(id);
      const current = ((existing && existing.payload && existing.payload.reviews) || {})[j.key] || {};
      studio.ctx.__m = [current, items, j.key];
      const merged = studio.run("mergeReviews({ [__m[2]]: __m[0] }, { [__m[2]]: __m[1] })[__m[2]]");
      await ws.patchDoc(id, { schemaVersion: 1, passcode: main.passcode, updatedBy: "LLM judge runner", updatedAt: new Date().toISOString(),
        payload: { reviews: { [j.key]: JSON.parse(JSON.stringify(merged)) }, observations: [], liveRuns: {}, liveStudies: {} } });
      const back = (((await ws.readDoc(id)).payload || {}).reviews || {})[j.key] || {};
      const bad = Object.keys(items).filter((k) => studio.call("(a, b) => stableJson(a) === stableJson(b)", back[k], items[k]) !== true);
      problems += bad.length;
      console.log(`${j.name} → ${id}: ${Object.keys(items).length} copied, ${Object.keys(back).length} stored, ${bad.length} mismatches${bad.length ? ": " + bad.join(", ") : ""}`);
    }
    console.log(`${j.name}: ${Object.keys(old).length} reviews in the original documents.`);
  }
  console.log(problems ? `\n${problems} mismatches. Do not deploy.` : "\nAll reviews copied and verified.");
  process.exit(problems ? 2 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
