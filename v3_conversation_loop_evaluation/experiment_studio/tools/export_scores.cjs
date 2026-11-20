#!/usr/bin/env node
/* Download every evaluator's scores from the shared workspace into CSV files.
   Uses the same functions as the Data menu, so the files match the website.

     node tools/export_scores.cjs            # writes into exports/
*/
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { loadStudio, workspace } = require("./studio_node.cjs");

(async () => {
  const studio = loadStudio();
  const ws = await workspace(studio);
  await ws.loadAllReviews();
  const out = path.resolve(__dirname, "..", "exports");
  fs.mkdirSync(out, { recursive: true });
  const files = {
    "experiment-studio-comparison-all-evaluators.csv": "csvText(comparisonRows())",
    "experiment-studio-new-rubric-rationales.csv": "csvText(rubricDetailRows())",
    "experiment-studio-scores-raw.csv": "csvText(scoreRows())",
  };
  for (const [name, expr] of Object.entries(files)) {
    fs.writeFileSync(path.join(out, name), studio.run(expr) + "\n", "utf8");
    console.log(path.join("exports", name));
  }
  const counts = studio.run(`JSON.stringify(Object.fromEntries([["Claude (previous)", PREVIOUS_JUDGE_KEY], ...RUBRIC_JUDGES.map((j) => [j.name, j.key]), ["Jev", "jev"]].map(([n, k]) => [n, rubricTargetItems().filter((id) => STORE.reviews[k] && STORE.reviews[k][id]).length])))`);
  console.log(`Answers per evaluator: ${counts}`);
})().catch((err) => { console.error(err); process.exit(1); });
