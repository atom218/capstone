const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'experiment-studio.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const legacy = {
  scores: Object.fromEntries(['persona', 'conversation', 'specificity', 'consequence', 'insight'].map((id, i) => [id, { v: i % 4, evidence: [{ text: 'Recorded evidence' }], note: 'Recorded rationale' }])),
  flags: { factual: { on: true, note: 'Keep the existing factual flag' } },
  commonAudit: { persona: 0, conversation: 1, specificity: 2, consequence: 3, insight: 0 },
  startedAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:02:00Z',
  commonSubmittedAt: '2026-11-01T10:01:00Z', implSubmittedAt: '2026-11-01T10:02:00Z',
  auditTrail: [{ at: '2026-11-01T10:00:30Z', scores: { persona: 1 } }],
};
function createSession(stored = {}) {
  const persisted = JSON.stringify(stored);
  const context = vm.createContext({
    window: { scrollTo() {} }, document: { addEventListener() {} },
    localStorage: { getItem() { return persisted; }, setItem() { throw Error('Persistence is forbidden in tests'); } },
    setTimeout() { return 0; }, clearTimeout() {}, console,
  });
  for (const script of scripts) if (script.trim()) vm.runInContext(script, context);
  vm.runInContext('persist = () => {}; App.render = () => {}; toast = () => {}; Evaluate.bind();', context);
  return {
    run: (code) => vm.runInContext(code, context),
    json: (code) => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, context)),
  };
}
function oldSession() {
  return createSession({ reviewer: { name: 'Existing reviewer', lane: 'human' }, reviews: { 'human:Existing reviewer': { 'C1_sub_fine_full#2': legacy } } });
}

test('opening and rendering a historical review does not modify its recorded evaluation', () => {
  const s = oldSession();
  assert.deepEqual(s.json('STORE.reviews["human:Existing reviewer"]["C1_sub_fine_full#2"]'), legacy);
  const rendered = s.run('evalUi().item = "C1_sub_fine_full#2"; evalUi().view = "item"; Evaluate.itemView(evalUi())');
  assert.match(rendered, /Human likeness/);
  assert.match(rendered, /Contextual responsiveness/);
  assert.match(rendered, /recorded with earlier guidance/);
  assert.deepEqual(s.json('STORE.reviews["human:Existing reviewer"]["C1_sub_fine_full#2"]'), legacy);
  assert.equal(s.run('laneScore("C1_sub_fine_full#2", "human", "likeness")'), null);
  assert.equal(s.run('laneScore("C1_sub_fine_full#2", "human", "context")'), null);
});

test('new ratings can be added to a completed review without replacing original ratings or audits', () => {
  const s = oldSession();
  s.run('evalUi().item = "C1_sub_fine_full#2"; App.dispatch("score", {dataset:{c:"likeness",v:"3"}}); App.dispatch("score", {dataset:{c:"context",v:"2"}}); App.dispatch("submit-additional", {});');
  const after = s.json('myReview("C1_sub_fine_full#2")');
  for (const key of ['flags', 'commonAudit', 'commonSubmittedAt', 'implSubmittedAt', 'auditTrail', 'startedAt']) assert.deepEqual(after[key], legacy[key]);
  for (const [id, score] of Object.entries(legacy.scores)) assert.deepEqual(after.scores[id], score);
  assert.deepEqual(after.additionalAudit, { likeness: 3, context: 2 });
  assert.equal(after.additionalRubricVersion, '2026-11-12-human-v2');
  assert.equal(after.rubricVersion, undefined, 'do not relabel historical core scores');
  assert.equal(s.run('laneScore("C1_sub_fine_full#2", "human", "likeness")'), 3);
  assert.equal(s.run('reviewStage(myReview("C1_sub_fine_full#2"))'), 'complete');
  const before = s.json('myReview("C1_sub_fine_full#2")');
  s.run('App.dispatch("score", {dataset:{c:"persona",v:"3"}}); App.dispatch("submit-common", {});');
  assert.deepEqual(s.json('myReview("C1_sub_fine_full#2")'), before, 'locked core ratings are untouched');
});

test('new reviews require both added measures before the common pass is submitted', () => {
  const s = createSession({ reviewer: { name: 'New reviewer', lane: 'human' } });
  s.run('evalUi().item="C1_sub_fine_full#2"; for (const c of CORE_COMMON) App.dispatch("score", {dataset:{c:c.id,v:"2"}}); App.dispatch("submit-common", {});');
  assert.equal(s.run('myReview(evalUi().item).commonSubmittedAt'), undefined);
  s.run('App.dispatch("score", {dataset:{c:"likeness",v:"3"}}); App.dispatch("score", {dataset:{c:"context",v:"2"}}); App.dispatch("submit-common", {});');
  assert.ok(s.run('myReview(evalUi().item).commonSubmittedAt'));
  assert.equal(s.run('myReview(evalUi().item).rubricVersion'), '2026-11-12-human-v2');
  assert.deepEqual(s.json('myReview(evalUi().item).additionalAudit'), { likeness: 3, context: 2 });
});

test('imports preserve legacy audit history and accept new measure fields without backfilling older scores', () => {
  const s = oldSession();
  assert.deepEqual(s.json('cleanReview(myReview("C1_sub_fine_full#2"))'), legacy);
  s.run('evalUi().item="C1_sub_fine_full#2"; App.dispatch("score",{dataset:{c:"likeness",v:"na"}}); App.dispatch("score",{dataset:{c:"context",v:"0"}}); App.dispatch("submit-additional",{});');
  assert.deepEqual(s.json('cleanReview(myReview(evalUi().item))'), s.json('myReview(evalUi().item)'));
});

test('Firestore merges retain other reviewers, observations and historical fields when additional scores are saved', () => {
  const s = oldSession();
  s.run('evalUi().item="C1_sub_fine_full#2"; const before=JSON.parse(JSON.stringify(STORE.reviews)); App.dispatch("score",{dataset:{c:"likeness",v:"3"}}); App.dispatch("score",{dataset:{c:"context",v:"2"}}); App.dispatch("submit-additional",{}); const merged=mergeSyncData({reviews:{...before,"human:Teammate":{"C1_sub_fine_full#1":{scores:{persona:{v:0}}}}},observations:[{id:"keep",at:"2026-11-01",title:"Preserve observation"}]},{reviews:STORE.reviews});');
  assert.deepEqual(s.json('merged.reviews["human:Teammate"]'), { 'C1_sub_fine_full#1': { scores: { persona: { v: 0 } } } });
  assert.deepEqual(s.json('merged.reviews["human:Existing reviewer"]["C1_sub_fine_full#2"].commonAudit'), legacy.commonAudit);
  assert.deepEqual(s.json('merged.observations'), [{ id: 'keep', at: '2026-11-01', title: 'Preserve observation' }]);
});

test('all human criteria have four clear definitions and four illustrative examples; automated criteria stay unchanged', () => {
  const s = createSession();
  assert.equal(s.run('CORE_COMMON.length'), 5);
  assert.deepEqual(s.json('ADDED_MEASURES.map(c=>c.id)'), ['likeness', 'context']);
  assert.equal(s.run('ALL_CRIT.every(c=>c.anchors.length===4 && c.examples.length===4 && c.guidance)'), true);
  assert.deepEqual(s.json('JUDGE_COMMON.map(c=>c.id)'), ['persona', 'conversation', 'specificity', 'consequence', 'insight']);
  const prompt = s.json('judgePrompt(itemContext("C1_sub_fine_full#2"), "common")');
  assert.doesNotMatch(JSON.stringify(prompt), /Human likeness|Contextual responsiveness/);
});

test('comparison and CSV exports include the added measures, leaving missing historical values blank', () => {
  const s = oldSession();
  assert.match(s.run('Compare.render()'), /Earlier reviews without these ratings stay unscored/);
  assert.equal(s.json('critSummary(studyById(cmpUi().study), "likeness", "human")').scored, 0);
  s.run('download=(name,text,type)=>{window.exported={name,text,type}}; exportScoresCsv();');
  const csv=s.run('window.exported.text');
  assert.match(csv.split('\n')[0], /"likeness","context"/);
  assert.match(csv.split('\n')[0], /"additional_rubric_version"/);
  assert.match(csv, /Keep the existing factual flag/);
});

function submittedRating(scores, extra = {}) {
  return { commonSubmittedAt: '2026-11-13T10:00:00Z', scores: Object.fromEntries(Object.entries(scores).map(([c,v]) => [c,{v}])), commonAudit: scores, ...extra };
}
function aggregationSession(records) {
  return createSession({ reviewer: { name: 'A', lane: 'human' }, reviews: Object.fromEntries(Object.entries(records).map(([name,r]) => ['human:'+name, {'C1_sub_fine_full#2':r}])) });
}
test('human medians exclude drafts and illustrative ratings and retain submitted audit values', () => {
  const one = submittedRating({persona:1}); one.scores.persona.v=3;
  const s=aggregationSession({ A:one, B:submittedRating({persona:1}), C:submittedRating({persona:3}), Draft:{scores:{persona:{v:0}}}, Demo:submittedRating({persona:0},{demo:true}), NA:submittedRating({persona:'na'}) });
  const summary=s.json('humanScoreSummary("C1_sub_fine_full#2","persona")');
  assert.equal(summary.value,1); assert.equal(summary.numeric.length,3); assert.equal(summary.na,1);
  assert.equal(s.run('laneScore("C1_sub_fine_full#2","human","persona")'),1);
  const before=s.json('STORE.reviews');
  const evaluate=s.run('Evaluate.itemView({...evalUi(),item:"C1_sub_fine_full#2"})');
  assert.match(evaluate,/Human \(submitted median\)/);assert.match(evaluate,/4 submitted reviewers/);assert.match(evaluate,/Median from 3 reviewers · scores: 1, 1, 3/);
  const compare=s.run('Compare.evalCompare(studyById("study_C1_sub_fine_full"),2)');
  assert.match(compare,/Human median \(submitted\)/);assert.match(compare,/3 reviewers/);assert.match(compare,/draft; excluded/);
  const card=s.run('Compare.replyCard(studyById("study_C1_sub_fine_full"),runById("C1_sub_fine_full"),2,"g",{lane:"human"},[])');
  assert.match(card,/Median from 3 reviewers · scores: 1, 1, 3/);
  assert.deepEqual(s.json('STORE.reviews'),before);
});
test('even human medians remain fractional, zero is numeric, and all N/A is distinct from missing', () => {
  const s=aggregationSession({ A:submittedRating({persona:1,specificity:0,conversation:'na'}), B:submittedRating({persona:2,specificity:0,conversation:'na'}) });
  assert.equal(s.run('humanScoreSummary("C1_sub_fine_full#2","persona").value'),1.5);
  assert.equal(s.run('humanScoreSummary("C1_sub_fine_full#2","specificity").value'),0);
  assert.equal(s.run('humanScoreSummary("C1_sub_fine_full#2","conversation").value'),'na');
  assert.equal(s.run('laneScore("C1_sub_fine_full#2","human","conversation")'),null);
  assert.equal(s.run('humanScoreSummary("C1_sub_fine_full#2","insight").value'),undefined);
});
test('additional and journey scores only contribute after their own submission, without changing core ratings', () => {
  const s=aggregationSession({ A:submittedRating({persona:2},{scores:{persona:{v:2},likeness:{v:3},cue_fit:{v:3}}}) });
  assert.equal(s.run('humanScoreSummary("C1_sub_fine_full#2","likeness").value'),undefined);
  assert.equal(s.run('humanScoreSummary("C1_sub_fine_full#2","cue_fit").value'),undefined);
  s.run('const r=STORE.reviews["human:A"]["C1_sub_fine_full#2"];r.additionalSubmittedAt="2026-11-13";r.additionalAudit={likeness:2};r.implSubmittedAt="2026-11-13";');
  assert.equal(s.run('humanScoreSummary("C1_sub_fine_full#2","likeness").value'),2);
  assert.equal(s.run('humanScoreSummary("C1_sub_fine_full#2","cue_fit").value'),3);
  assert.equal(s.run('humanScoreSummary("C1_sub_fine_full#2","persona").value'),2);
});
test('all-evaluator summaries exclude human drafts while preserving automated scores', () => {
  const s=aggregationSession({ A:{scores:{persona:{v:0}}} });
  s.run('STORE.reviews["llm:test"]={"C1_sub_fine_full#2":{scores:{persona:{v:2}}}};STORE.reviews.jev={"C1_sub_fine_full#2":{scores:{persona:{v:3}}}};');
  assert.equal(s.run('laneScore("C1_sub_fine_full#2","human","persona")'),null);
  assert.equal(s.run('laneScore("C1_sub_fine_full#2","all","persona")'),2.5);
  assert.equal(s.run('laneScore("C1_sub_fine_full#2","llm","persona")'),2);
  assert.equal(s.run('laneScore("C1_sub_fine_full#2","jev","persona")'),3);
});
