const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'experiment-studio.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const previous = { scores: { persona: { v: 2, evidence: [], note: 'earlier run' } }, flags: {}, commonSubmittedAt: '2026-11-12T00:00:00Z', implSubmittedAt: '2026-11-12T00:00:00Z', updatedAt: '2026-11-12T00:00:00Z' };

function session() {
  const stored = JSON.stringify({ reviews: { 'llm:claude-opus-5-5-fast': { 'C1_sub_fine_full#3': previous } } });
  const context = vm.createContext({
    window: { scrollTo() {} }, document: { addEventListener() {} },
    localStorage: { getItem() { return stored; }, setItem() {} },
    setTimeout() { return 0; }, clearTimeout() {}, console,
  });
  for (const script of scripts) if (script.trim()) vm.runInContext(script, context);
  vm.runInContext('persist = () => {}; App.render = () => {}; App.renderSoon = () => {}; toast = () => {};', context);
  /* A judge stand-in that returns valid rubric JSON built from the packet's own sources. */
  vm.runInContext(`
    var CALLS = [];
    function validOutput(packet) {
      const answer = packet.sources.find((s) => s.id === packet.target).text;
      const q1 = packet.target === 'answer_q1';
      return { rubric_version: JUDGE_RUBRIC_VERSION, packet_status: 'ready', packet_error_reason: null, factual_flags: [],
        judgments: packet.crits.map((cid) => {
          const na = q1 && (cid === 'conversation' || cid === 'trajectory');
          const j = { target_id: packet.target, target_type: 'answer', source_answer_ids: packet.sourceAnswerIds, criterion_id: cid, rubric_version: JUDGE_RUBRIC_VERSION,
            status: na ? 'not_applicable' : 'scored', score: na ? null : cid === 'conversation' ? 3 : 2, evidence_refs: na ? [] : [{ source_id: packet.target, excerpt: answer.slice(0, 24) }], rationale: 'Test rationale.' };
          if (cid === 'trajectory' && !na) { const prev = packet.sources.find((s) => s.id === packet.sourceAnswerIds[0]); j.evidence_refs.push({ source_id: prev.id, excerpt: prev.text.slice(0, 24) }); }
          if (cid === 'insight') j.product_implication = null;
          if (cid === 'context') j.issue_type = 'both';
          return j;
        }) };
    }
    var MODE = 'valid';
    rubricCall = async (judge, parts, note) => {
      const text = parts.map((p) => p.text || '').join('');
      const pass = /pass: journey/.test(text) ? 'journey' : 'common';
      CALLS.push({ judge: judge.id, pass, note });
      const it = itemContext(CURRENT_ITEM);
      const out = validOutput(rubricPacket(it, pass));
      if (MODE === 'bad-then-good' && CALLS.length === 1) out.judgments[0].evidence_refs[0].excerpt = 'words that are not in the answer';
      if (MODE === 'filtered-then-good' && CALLS.length === 1) throw new Error('model response incomplete: {"reason":"content_filter"}');
      if (MODE === 'always-bad') out.judgments.pop();
      return JSON.stringify(out);
    };
    CONN.helper = { hasKey: true };
  `, context);
  return {
    run: (code) => vm.runInContext(code, context),
    json: (code) => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, context)),
  };
}

test('the common packet is blinded: no run id, condition, journey rules or state cue', () => {
  const s = session();
  const text = s.run('rubricPacketText(rubricPacket(itemContext("C1_sub_fine_full#3"), "common"))');
  const run = s.json('(() => { const r = runById("C1_sub_fine_full"); return { states: r.turns.map((t) => t.state_before), rules: rulesFor(r.cfg), title: DATA.cycles[r.cfg.journey].short_title }; })()');
  assert.doesNotMatch(text, /C1_sub|fine_full|grounded|baseline|Cycle \d/i);
  for (const st of run.states) assert.ok(!text.includes(st), `state cue leaked: ${st}`);
  for (const rule of run.rules) assert.ok(!text.includes(rule), `journey rule leaked: ${rule}`);
  assert.ok(!text.includes(run.title));
  assert.match(text, /criteria_to_score: persona, conversation, specificity, consequence, insight, likeness, context/);
  assert.match(text, /\[source_id: answer_q4\] Current answer \(Q4\); this is the target/);
  assert.match(text, /\[source_id: screen_q3\]/, 'screens shown up to this turn are attached');
  assert.doesNotMatch(text, /answer_q5/, 'later turns are never supplied');
});

test('the journey packet carries the exact journey instructions and the common-score lock', () => {
  const s = session();
  const text = s.run('rubricPacketText(rubricPacket(itemContext("C1_sub_fine_full#3"), "journey"))');
  const run = s.json('(() => { const r = runById("C1_sub_fine_full"); return { prev: r.turns[2].state_before, cur: r.turns[3].state_before, rules: rulesFor(r.cfg) }; })()');
  assert.match(text, /common_scores_locked: true/);
  assert.match(text, /criteria_to_score: cue_fit, substance, trajectory/);
  for (const rule of run.rules) assert.ok(text.includes(rule));
  assert.ok(text.includes(`Your current state: ${run.cur}`));
  assert.ok(text.includes(`Your current state: ${run.prev}`));
  assert.match(text, /transition for this turn is from state_q3 \(assigned for Q3\) to state_q4/);
  assert.match(text, /source_answer_ids=answer_q3, answer_q4/);
});

test('validation rejects invented excerpts, missing criteria and a scored Q1 conversation', () => {
  const s = session();
  s.run('CURRENT_ITEM = "C1_sub_fine_full#0"; var P = rubricPacket(itemContext(CURRENT_ITEM), "common"); var OUT = validOutput(P);');
  assert.deepEqual(s.json('rubricValidate(OUT, P, itemContext(CURRENT_ITEM)).issues'), []);
  s.run('OUT.judgments[2].evidence_refs = [{ source_id: "answer_q1", excerpt: "an invented quote" }]');
  assert.match(s.run('rubricValidate(OUT, P, itemContext(CURRENT_ITEM)).issues.join(" ")'), /does not appear exactly/);
  s.run('OUT = validOutput(P); OUT.judgments = OUT.judgments.filter((j) => j.criterion_id !== "likeness")');
  assert.match(s.run('rubricValidate(OUT, P, itemContext(CURRENT_ITEM)).issues.join(" ")'), /likeness: return exactly one judgment/);
  s.run('OUT = validOutput(P); const c = OUT.judgments.find((j) => j.criterion_id === "conversation"); c.status = "scored"; c.score = 3; c.evidence_refs = [{ source_id: "answer_q1", excerpt: OUT.judgments[0].evidence_refs[0].excerpt }]');
  assert.match(s.run('rubricValidate(OUT, P, itemContext(CURRENT_ITEM)).issues.join(" ")'), /Q1 has no earlier turn/);
});

test('scores land in the new judge lane and the previous Claude lane is untouched', async () => {
  const s = session();
  s.run('CURRENT_ITEM = "C1_sub_fine_full#3"');
  await s.run('judgeItemRubric(CURRENT_ITEM, rubricJudge("gpt2"))');
  const rev = s.json('STORE.reviews["llm:gpt-6.1-sol:rubric2"]["C1_sub_fine_full#3"]');
  assert.equal(rev.rubricVersion, s.run('JUDGE_RUBRIC_VERSION'));
  assert.deepEqual(Object.keys(rev.scores).sort(), ['consequence', 'context', 'conversation', 'cue_fit', 'insight', 'likeness', 'persona', 'specificity', 'substance', 'trajectory']);
  assert.equal(rev.scores.persona.status, 'scored');
  assert.equal(rev.scores.persona.v, 2);
  assert.ok(s.run('rubricReviewComplete(STORE.reviews["llm:gpt-6.1-sol:rubric2"]["C1_sub_fine_full#3"])'));
  assert.deepEqual(s.json('STORE.reviews["llm:claude-opus-5-5-fast"]["C1_sub_fine_full#3"]'), previous);
  assert.deepEqual(s.json('CALLS.map((c) => c.pass)'), ['common', 'journey']);
  assert.equal(s.run('laneOf("llm:gpt-6.1-sol:rubric2")'), 'gpt2');
  assert.equal(s.run('laneOf("llm:claude-opus-5-5-fast")'), 'llm');
});

test('baseline answers skip the journey call and record not_applicable', async () => {
  const s = session();
  s.run('CURRENT_ITEM = "S1_sub_text_only_full#2"');
  await s.run('judgeItemRubric(CURRENT_ITEM, rubricJudge("claude2"))');
  const rev = s.json('STORE.reviews["llm:claude-opus-5-5-fast:rubric2"]["S1_sub_text_only_full#2"]');
  for (const cid of ['cue_fit', 'substance', 'trajectory']) assert.equal(rev.scores[cid].status, 'not_applicable');
  assert.deepEqual(s.json('CALLS.map((c) => c.pass)'), ['common']);
});

test('an invalid response is retried with the problems listed; persistent failures store nothing', async () => {
  const s = session();
  s.run('CURRENT_ITEM = "C2_sub_coarse_full#1"; MODE = "bad-then-good"');
  await s.run('judgeItemRubric(CURRENT_ITEM, rubricJudge("claude2"))');
  assert.match(s.run('CALLS[1].note'), /CORRECTION REQUIRED[\s\S]*does not appear exactly/);
  s.run('CALLS.length = 0; MODE = "always-bad"; CURRENT_ITEM = "C2_sub_coarse_full#2"');
  await assert.rejects(s.run('judgeItemRubric(CURRENT_ITEM, rubricJudge("claude2"))'), /did not return a valid rubric judgment after 3 attempts/);
  assert.equal(s.run('(STORE.reviews["llm:claude-opus-5-5-fast:rubric2"] || {})["C2_sub_coarse_full#2"]'), undefined);
  s.run('CALLS.length = 0; MODE = "filtered-then-good"; CURRENT_ITEM = "S1_sub_text_only_full#3"');
  await s.run('judgeItemRubric(CURRENT_ITEM, rubricJudge("gpt2"))');
  assert.ok(s.run('rubricReviewComplete(STORE.reviews["llm:gpt-6.1-sol:rubric2"]["S1_sub_text_only_full#3"])'), 'a content-filter stop is retried');
});

test('a scored trajectory and a conversation deduction must quote the earlier answer', () => {
  const s = session();
  s.run('CURRENT_ITEM = "C1_sub_fine_full#3"; var PJ = rubricPacket(itemContext(CURRENT_ITEM), "journey"); var OJ = validOutput(PJ);');
  assert.deepEqual(s.json('rubricValidate(OJ, PJ, itemContext(CURRENT_ITEM)).issues'), []);
  s.run('OJ.judgments.find((j) => j.criterion_id === "trajectory").evidence_refs.pop()');
  assert.match(s.run('rubricValidate(OJ, PJ, itemContext(CURRENT_ITEM)).issues.join(" ")'), /trajectory must cite both/);
  s.run('var PC = rubricPacket(itemContext(CURRENT_ITEM), "common"); var OC = validOutput(PC); OC.judgments.find((j) => j.criterion_id === "conversation").score = 1;');
  assert.match(s.run('rubricValidate(OC, PC, itemContext(CURRENT_ITEM)).issues.join(" ")'), /conversation deduction must cite/);
});

test('judge lanes split deterministically across documents', () => {
  const s = session();
  const parts = s.json('(() => { const ids = []; Object.values(SAVED_RUNS).forEach((r) => r.turns.forEach((_, i) => ids.push(itemId(r.id, i)))); return ids.map(shardPartOf); })()');
  const counts = [0, 0];
  parts.forEach((p) => counts[p]++);
  assert.ok(counts[0] > parts.length * 0.35 && counts[1] > parts.length * 0.35, `unbalanced split ${counts}`);
  assert.equal(s.run('shardPartOf("C1_sub_fine_full#3")'), s.run('shardPartOf("C1_sub_fine_full#3")'));
  assert.equal(s.run('shardDocId("ws", rubricJudge("gpt2"), 1)'), 'ws--judge-gpt-rubric2-p1');
});

test('the comparison export puts every evaluator side by side per criterion', async () => {
  const s = session();
  s.run('CURRENT_ITEM = "C1_sub_fine_full#3"');
  await s.run('judgeItemRubric(CURRENT_ITEM, rubricJudge("gpt2"))');
  const rows = s.json('comparisonRows()');
  const head = rows[0];
  const at = head.indexOf('persona_human_median');
  assert.deepEqual(head.slice(at, at + 6), ['persona_human_median', 'persona_human_n', 'persona_claude_previous', 'persona_claude_new', 'persona_gpt_new', 'persona_jev']);
  const row = rows.find((r) => r[0] === 'C1_sub_fine_full#3');
  assert.match(row[1], /^Q4 · Subscription Management Assistant · .+ · Full biography$/);
  assert.equal(row[at + 2], 2, 'previous Claude score kept');
  assert.equal(row[at + 4], 2, 'new GPT score');
  const detail = s.json('rubricDetailRows()');
  assert.ok(detail.some((r) => r[2] === 'GPT-6.1 (new rubric)' && r[3] === 'Trajectory respected' && r[6] === 'Test rationale.'));
});

test('the main workspace document never carries the new judge lanes', () => {
  const s = session();
  s.run('STORE.reviews["llm:gpt-6.1-sol:rubric2"] = { "C1_sub_fine_full#3": { scores: {} } }');
  const keys = s.json('Object.keys(withoutShardLanes(STORE.reviews))');
  assert.ok(keys.includes('llm:claude-opus-5-5-fast'));
  assert.ok(!keys.includes('llm:gpt-6.1-sol:rubric2'));
});
