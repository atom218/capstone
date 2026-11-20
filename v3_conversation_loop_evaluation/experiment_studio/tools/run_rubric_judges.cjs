#!/usr/bin/env node
/* Run the new-rubric LLM judges over every answer the team has evaluated and save
   the results to the shared Firestore workspace (each judge has its own documents).

   It loads the built experiment-studio.html, so packets, prompts and validation are
   exactly the ones the website uses. Model calls go through the deployed backend,
   which holds the Azure key. Completed answers are skipped, so it is safe to rerun.

     node tools/run_rubric_judges.cjs                    # both judges, all pending answers
     node tools/run_rubric_judges.cjs --judges gpt2 --limit 2 --dry-run --show-packet
*/
"use strict";
const { DEFAULT_BASE, loadStudio, workspace, quoteField } = require("./studio_node.cjs");

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i < 0 ? dflt : args[i + 1]; };
const flag = (name) => args.includes(`--${name}`);
const BASE = opt("base", DEFAULT_BASE);
const JUDGE_IDS = opt("judges", "claude2,gpt2").split(",");
const LIMIT = Number(opt("limit", "0")) || Infinity;
const CONCURRENCY = Number(opt("concurrency", "4"));
const ONLY = opt("items", "") ? opt("items", "").split(",") : null;
const DRY = flag("dry-run");

(async () => {
  const studio = loadStudio(BASE);
  const { run, call } = studio;
  const ws = await workspace(studio, BASE);
  const WORKSPACE = ws.cloud.workspaceId;
  const { main } = await ws.loadAllReviews();
  const judges = JUDGE_IDS.map((id) => run(`rubricJudge(${JSON.stringify(id)})`));
  const parts = run("SHARD_PARTS");
  const docId = (j, p) => call("(ws, id, p) => shardDocId(ws, rubricJudge(id), p)", WORKSPACE, j.id, p);
  if (!DRY) {
    for (const j of judges) for (let p = 0; p < parts; p++) {
      if (await ws.readDoc(docId(j, p))) continue;
      await ws.patchDoc(docId(j, p), { schemaVersion: 1, passcode: main.passcode || ws.cloud.passcode || "", updatedBy: "LLM judge runner", updatedAt: new Date().toISOString(),
        payload: { reviews: { [j.key]: {} }, observations: [], liveRuns: {}, liveStudies: {} } });
      console.log(`Created shared document ${docId(j, p)}`);
    }
  }
  const items = ONLY || run("rubricTargetItems()");
  console.log(`${items.length} answers in scope (every answer with a human, Jev or earlier LLM review).`);
  if (flag("show-packet")) {
    console.log(call("(id) => rubricPacketText(rubricPacket(itemContext(id), 'common'))", items[0]));
    if (call("(id) => itemContext(id).run.cfg.arm", items[0]) === "grounded") console.log(call("(id) => rubricPacketText(rubricPacket(itemContext(id), 'journey'))", items[0]));
  }

  const failures = [];
  await Promise.all(judges.map(async (j) => {
    const allPending = items.filter((id) => !call("(k, id) => rubricReviewComplete((STORE.reviews[k] || {})[id])", j.key, id));
    const pending = allPending.slice(0, LIMIT);
    console.log(`${j.name}: ${items.length - allPending.length} already scored, ${pending.length} to score now.`);
    let next = 0, done = 0;
    const worker = async () => {
      while (next < pending.length) {
        const id = pending[next++];
        const t0 = Date.now();
        try {
          const rev = JSON.parse(JSON.stringify(await call("(id, jid) => judgeItemRubric(id, rubricJudge(jid), (m) => console.log('  retry · ' + m))", id, j.id)));
          if (DRY) console.log(JSON.stringify(rev, null, 1));
          else {
            const part = call("(id) => shardPartOf(id)", id);
            await ws.patchDoc(docId(j, part), { updatedBy: "LLM judge runner", updatedAt: new Date().toISOString(), payload: { reviews: { [j.key]: { [id]: rev } } } },
              ["updatedBy", "updatedAt", `payload.reviews.${quoteField(j.key)}.${quoteField(id)}`], true);
          }
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
