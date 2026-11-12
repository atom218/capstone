# Synthetic User Personas — Accenture × Northwestern

Behaviorally grounded synthetic user personas for early product-testing interviews.

A synthetic persona is usually built from a written biography alone, so it answers every
interview question in the same even, slightly generic voice. This project gives the
persona a **real human emotional journey** taken from a public video dataset (CMU-MOSEI)
and tests whether that grounding makes its interview answers more realistic and more
useful to a product team, before any real users are recruited.

The experiment is always a **paired comparison**: the same persona answers the same
product questions twice, once with the biography only (the *baseline*) and once with
the biography plus behavioral rules derived from a real person's emotional journey (the
*grounded* interview). Reviewers and an LLM judge then score both answers blind.

This README is the single entry point for the project. It is written so that a new
teammate, a client reviewer, or an LLM coding assistant can read it top to bottom and
understand what exists, how it works, where everything lives, and what is still open.
The longer original plan is in [`docs/project-plan.md`](docs/project-plan.md).

---

## Quick facts

- **Who.** An Accenture × Northwestern capstone. Adolfo wrote the *Conversation Loop
  Guide* that V3 follows. Prakhar built the product packs and Experiment Studio. Wenjun
  built the persona variants.
- **Active branch.** `journey-selection-and-design`. All work described here lives on this
  branch. `main` only has the original scaffold.
- **Grounding data.** CMU-MOSEI sentiment (−3 to +3) and six emotion labels (happy,
  sad, anger, surprise, disgust, fear) on real YouTube speakers. Only labels and
  transcripts are used, never raw audio or video.
- **Model.** Azure OpenAI `gpt-4o` (API version `2024-12-01-preview`). Endpoint defaults
  are in `v3_conversation_loop_evaluation/experiment_studio/.env.example`. The API key is
  never committed.
- **Persona.** Filomena Nguyen, a 30-year-old operations manager from Parsons, West
  Virginia, from the NVIDIA Nemotron-Personas library (uuid
  `0ee14f548c2c48c99b6ed3d8369e194b`), in three biography lengths.
- **Products tested.** Four products with 7 interview questions each. Three of each
  product's questions show a screenshot.
  - *Subscription Manager*, a banking app feature.
  - *Still*, a mental wellness app.
  - *Cash Flow Planner*.
  - *Common Ground*, a sexual health app.
- **Current state.** Version 3 (the five-block conversation loop) has **108 saved
  interviews (756 answers)**. This is the full matrix: 4 products × 3 biography lengths ×
  (1 baseline + 4 emotional cycles × 2 cue levels). Every grounded interview has a matched
  baseline. The original 20 are in the V3 dashboard and the other 88 are in
  `v3_conversation_loop_evaluation/expanded_runs/`. All 108 can be browsed, reviewed and
  compared in **Experiment Studio**, a local web app.

---

## Glossary

These terms are used throughout the code, dashboards and this document.

- **Emotional journey / emotional cycle.** How one real speaker's sentiment and emotions
  move over the course of their CMU-MOSEI video. Each video is cut into equal time slices
  (5 in V2, 7 in V3), and each slice gets a sentiment score and six emotion scores. "Cycle"
  and "journey" mean the same thing here.
- **Stage.** One time slice of a journey. In V3, stage *n* lines up with interview question *n*.
- **Arm.** One prompting condition in the comparison:
  - `text_only` is the **baseline**: biography only, no journey. The dashboards call it
    "No Mood Rules".
  - `coarse` adds 2–3 general behavior rules from the journey's averages. The dashboards
    call it "Basic Mood Rules", and Experiment Studio calls it "Brief cue".
  - `fine` adds the coarse rules plus conditional rules about friction, recovery, pacing
    and dominant emotions, and the stage-by-stage mood sequence. The dashboards call it
    "Detailed Mood Rules", and Experiment Studio calls it "Detailed cue".
- **Block A–E.** The five parts of every V3 prompt, from Adolfo's *Conversation Loop
  Guide*. They are explained under "How the V3 conversation loop works" below.
- **State.** A one-line live mood carried between questions:
  `patience: low|medium|high; trust: low|medium|high; mood: <one word>`.
- **Product pack.** A product's 7 questions, participant instruction and screenshots.

---

## Project history: from clustering to Experiment Studio

The work progressed in stages. Each stage has its own folder with a notebook and a
self-contained HTML dashboard, so earlier results stay viewable.

### Stage 0: clustering emotional journeys

`notebooks/clustering_emotional_journeys.ipynb`

- Starts from CMU-MOSEI's per-utterance labels, cleaned down to **1,279 videos**. Videos are
  kept if they have at least 3 utterances, no unlabeled gap over 10 seconds, and labels
  covering 80% of the span; 3 videos were excluded by hand.
- Each video's sentiment arc is stretched onto 12 points and mean-centered, so the
  clustering groups videos by *how the mood moves*, not by whether the speaker is positive
  overall.
- K-means with k = 6 gives recurring shapes such as "warms up", "dip and recover", "middle
  peak" and "cools off".

### Stage 1 (V1): first proof of concept

`poc_v1_initial_dashboard/`

This stage contains `poc_grounded_interview.ipynb` and `grounded-interview-dashboard.html`.

- One NVIDIA persona answers placeholder personal-finance questions about a bank app,
  three ways:
  - identity only;
  - with a one-sentence journey;
  - with a detailed journey that adds the real sentiment beats and a few transcript lines as
    style anchors.
- It uses four *provisional* journey shapes, folded from the six clusters. Each shape is
  represented by the video closest to the group average.
- **Lesson.** Average videos are emotionally flat (sentiment swings under 1 point), so the
  grounding barely changed the answers.

### Stage 2 (V2): journey selection and journey design

`v2_journey_selection_and_design/`

This stage contains a notebook, `journey-selection-and-design-dashboard.html` and
`journey_configuration_guide.txt`. The code lives in `src/personas/journeys.py`.

This stage made the journey a set of tunable levers. The full explanation is in
`journey_configuration_guide.txt`.

1. **Selection method** decides how 4 videos are picked:
   - `provisional_4`: the V1 approach.
   - `cluster_k4`: k-means with k = 4 on sentiment and emotions.
   - `cluster_high_var`: the cluster shapes, but the most variable member of each.
   - `random_high_var`: random videos with a sentiment range of at least 2.0 and several
     strong emotions.
2. **Granularity**: sentiment only, or sentiment plus the six emotions.
3. **Representation**: plain words (`verbal`) or numbers with the scale explained
   (`quant`).
4. **Stochasticity**: one exact value per stage, or a target range (Adolfo's suggestion, so
   the persona is not locked to a number).
5. **Placement**: the whole journey in the system prompt up front, or one stage injected
   per question.
6. **Prompt mode**: one call per question, or a two-step chain. In the two-step chain, the
   first call drafts the substance and a second call rewrites the tone to match the
   emotion. This is Adolfo and Andy Fano's fix for "context squeezing".

Five configurations, D0–D4, were run on 5 Netflix Subscription Manager screens.

- **Finding.** The baseline produced long, bulleted "AI consultant" checklists. Per-question
  emotion cues on a high-variability, angry video (`8lfS97s2AKc`) produced the most
  human-sounding shifts. For example, the persona reversed her final verdict after a
  frustrating "pending" screen.

### Stage 3 (V3): the five-block conversation loop

`v3_conversation_loop_evaluation/`

This stage contains:

- `conversation_loop_interview.ipynb` and `conversation-loop-evaluation-dashboard.html`;
- `conversation_loop_evaluation_runs.csv` (all 140 saved answers);
- `run_dashboard.py` (the local helper for live calls);
- `experiment_studio/`.

The code lives in `src/personas/conversation_loop.py`.

V3 implements Adolfo's *Conversation Loop Guide* (`Conversation_Loop_Guide.pdf`, on the team
Drive). It combines this with Wenjun's persona variants and Prakhar's product packs. Its
details are in the next section.

The V3 dashboard has five tabs:

1. **Compare Mood Rules (3 Levels).** Shows what each arm gives the LLM (the exact rules),
   then the three answers side by side for each of the 7 questions, with the key takeaway
   under the answers.
2. **Compare Bio Lengths.** The same journey with the three biography lengths.
3. **Banking App vs. Wellness App.** The same configuration on both products.
4. **Exact Prompt per Question.** Pick a product and one of the 7 questions to see the
   blocks that change at that turn (B, C, D, E). Block A is fixed and is not repeated.
5. **Try It Live (Run New Answers).** Pick product, persona, arm, emotional cycle and
   question(s). The prompt is assembled at the bottom, can be edited, and is sent to Azure.
   Reset buttons clear live answers. This tab needs the local helper (see "How to run
   everything").

A cycle selector at the top switches all tabs between the four emotional cycles.

### Stage 4: Experiment Studio

`v3_conversation_loop_evaluation/experiment_studio/`, built by Prakhar.

This is a single-page app for designing, running, reviewing and comparing matched
interview studies. It has four workspaces:

- **Design.** Drag blocks into sockets for product, audience, journey, delivery and memory,
  then launch a matched baseline and grounded run.
- **Interviews.** Pick a product, then pick an interview from a scrollable row of blocks.
  Each block shows the cycle's mood line and its condition, such as "Brief cue" or "Short
  bio with demographics". You can then step through the interview question by question,
  with the exact prompt split into Blocks A–E. All 756 saved answers are reproduced
  exactly from the recorded messages.
- **Evaluate.** Human scoring on five core criteria (0–3), plus human likeness,
  contextual responsiveness and separate journey checks. Each human score has a
  plain-language definition and an illustrative example. The optional LLM-judge
  lane retains its earlier rubric.
- **Compare.** The row of blocks has one block per emotional cycle, labelled "Emotional
  cycle N · feeling". Each block has a Brief cue / Detailed cue switch. Click or drag a
  block onto a slot; its matched baseline fills the other. Read score differences per
  criterion and both answers side by side.
  **Inspect the run** opens the persona, product pack, source journey, exact turn inputs
  and configuration.

The full guide is in
[`experiment_studio/README.md`](v3_conversation_loop_evaluation/experiment_studio/README.md).

---

## How the V3 conversation loop works

Every question in an interview is sent as one prompt made of five blocks. Only Block A is
fixed. Blocks B to E are rebuilt at every turn.

- **Block A: the card** (the system message, fixed for the whole interview). It contains:
  - the persona's biography;
  - the arm's behavior rules (none for `text_only`);
  - the required output format: `<think>` (2–3 private sentences), `<reply>` (3–5 spoken
    sentences, no bullets) and `<state>` (the new patience, trust and mood).
- **Block B: the live state.** `Your current state: patience: …; trust: …; mood: …`. It
  starts at `medium; medium; neutral` for the baseline, and at the journey's first-stage
  mood for grounded arms.
- **Block C: bounded memory.** The last 2 turns verbatim (question and reply only), with
  older turns compressed to one line each ("Asked about: … You said: …"). The private
  `<think>` text never enters memory.
- **Block D: the question.** The product's participant instruction, the question, and a
  screenshot on screen questions.
- **Block E: the reminder.** One line restating "stay in character, currently <state>",
  placed right before generation.

### How a journey becomes behavior rules

`compute_grounding_metrics` reads the 7 stages of a recording and computes these values:

- the average sentiment (`valence_mean`);
- the average emotional intensity (`arousal_mean`);
- the biggest drop between stages (`valence_drop_after_friction`);
- how much it bounces back after a drop (`recovery_rate`);
- the variability (`arousal_var`);
- the dominant emotions.

`coarse_rules` and `fine_rules` then turn these numbers into plain-language rules using
fixed thresholds:

| Rule (arm) | Fires when |
|---|---|
| 1. Skeptical, constructive, or measured start (coarse) | average sentiment < −0.15, > 0.35, or in between |
| 2. Reacts visibly vs. understated (coarse) | average intensity > 0.85 |
| 3. Patience wears thin vs. warms up (coarse) | last stage ≥ 0.35 below or above the first |
| 4. Trust drops sharply on vague screens (fine) | biggest drop > 0.35 |
| 5. Holds a grudge vs. acknowledges fixes (fine) | recovery rate < 0.25 |
| 6. Pacing shifts with friction (fine) | variability > 0.25 |
| 7. Dry, slightly sharp edge (fine) | anger or disgust ≥ 0.20 |
| 8. Voices concrete worry (fine) | fear ≥ 0.12 or sadness ≥ 0.20 |
| 9. Lists the Q1–Q7 mood sequence (fine) | always |

For example, cycle 1 (`8lfS97s2AKc`) has these values:

- average sentiment −0.56;
- average intensity 2.10;
- biggest drop 1.13;
- recovery 0.21;
- variability 0.83;
- anger 0.64 and disgust 0.39.

So it triggers the skeptical, visible-reaction, sharp-drop, grudge, pacing and dry-edge
rules.

### Where the moods and patience/trust come from

`_state_from_stage_affect` maps each stage to a state using a hand-made lookup:

- **Patience** is low if sentiment ≤ −0.8 or anger or disgust ≥ 0.6. It is high if
  sentiment ≥ 0.75 and the top emotion is happy.
- **Trust** is low if sentiment ≤ −0.4 or fear, disgust or anger ≥ 0.4. It is high if
  sentiment ≥ 0.65.
- **Mood words** depend on sentiment band and top emotion. For example, very negative with
  surprise gives "blindsided", very negative with anger gives "frustrated", and strongly
  positive in an early stage gives "engaged".

Only patience, trust and mood are tracked, because the guide asks for a compact state the
model can rewrite itself every turn.

### How state carries between questions (`update_session_state`)

- `text_only` keeps the model's own `<state>` if it is well formed.
- `coarse` keeps the model's own `<state>` if valid, and otherwise falls back to the
  journey's next stage.
- `fine` **replaces** the model's state with the recording's next-stage state at every turn.

---

## The four emotional cycles

All four are real CMU-MOSEI recordings picked for high emotional variability. Each is cut
into 7 stages, one per interview question.

| Cycle | Video id | Description |
|---|---|---|
| Emotional cycle 1 | `8lfS97s2AKc` | Roller-Coaster / Cools Off: swings sharply, ends angry and disgusted |
| Emotional cycle 2 | `74101` | Guarded → Late Disgust Drop: steady and guarded, then a late fall |
| Emotional cycle 3 | `24xayGF5yYA` | High-Energy Positive Dip & Recovery: upbeat, dips, recovers |
| Emotional cycle 4 | `2-4autDbHVQ` | Steady Warm-Up: starts reserved, grows warmer and happier |

## Personas and products

- **Persona variants** (Wenjun, `persona_standard_dataset_v3.csv` on the team Drive):
  - `full_description`: 100–150 words with age, location, background, hobbies and goals.
  - `short_version_1`: 40–60 words, keeps demographics.
  - `short_version_2`: 35–55 words, work and habits only, with no age, gender or location.
- **Product packs** (Prakhar's `Product_Interview_Supplier.ipynb`):
  - `subscription-management`, the Subscription Manager in a banking app. Screens appear on
    questions 3, 5 and 6.
  - `mental-wellness`, the *Still* app. Screens appear on questions 3, 4 and 6.
  - `cash-flow-planning`, the *Cash Flow Planner*.
  - `sexual-health`, the *Common Ground* app.

  The Cash Flow Planner and Common Ground packs come from `product_interview_inputs.zip`
  on the team Drive (Product → Product specs and prototypes). To re-run them, unzip it
  into `v3_conversation_loop_evaluation/expanded_runs/inputs/`, which is git-ignored.
  Their questions, screens and answers are already embedded in Experiment Studio.

## Saved V3 interviews

`v3_conversation_loop_evaluation/conversation_loop_evaluation_runs.csv` has 140 rows (20
interviews × 7 questions). Each row contains:

- the question and screenshot path;
- the state before the turn;
- `<think>`, `<reply>` and `<state>`;
- the state after the turn;
- word count;
- the exact system card and assembled user message.

| Sessions | What they are |
|---|---|
| `S1_sub_text_only_full`, `S4_wellness_text_only_full` | Baselines, one per product |
| `S2`, `S3`, `S5`, `S6` | Cycle 1, coarse and fine, both products |
| `S7_sub_fine_short_demographics`, `S8_sub_fine_short_behavioral` | Cycle 1, fine, short biographies (no matched baseline) |
| `C2_*`, `C3_*`, `C4_*` | Cycles 2–4, coarse and fine, both products, full biography |

All saved runs used 2 verbatim turns of memory and stated the biography once in Block A.
The model temperature for these original 20 runs was not recorded.

### Expanded runs (the other 88 interviews)

`v3_conversation_loop_evaluation/expanded_runs/` fills in the rest of the matrix:

- the short-biography baselines and cycles for Subscription Manager and Still;
- every biography length for Cash Flow Planner and Common Ground.

The original 20 were not re-run.

- `run_missing_sessions.py` builds the same Block A cards and prompts as
  `src/personas/conversation_loop.py`. It calls Azure `gpt-4o` with temperature 0.7,
  `top_p` 0.9, at most 360 tokens and 2 verbatim turns. It skips any configuration that
  is already saved, so it can be stopped and resumed. Useful flags are `--only` (a
  comma-separated list of session ids), `--limit` and `--workers`.
- `expanded_runs.json` is read by `build_studio.py` and merged with the V3 dashboard data.
  If the same session appears in both, the V3 dashboard version is used.
- `expanded_runs.csv` has the same columns as `conversation_loop_evaluation_runs.csv`.

Session ids follow the pattern `<cycle>_<product>_<arm>_<persona>`. For example:

- `C3_cashflow_fine_short_behavioral`;
- `B_sexual_text_only_full`, where `B` marks a baseline.

Product codes are `sub`, `wellness`, `cashflow` and `sexual`. Persona codes are `full`,
`short_demographics` and `short_behavioral`.

These runs use the same Block A as the original 20, so the fine-arm issues listed under
"Known issues" apply to them too.

---

## Repository map

```
README.md                         This file
docs/project-plan.md              Original research plan (thesis, arms, evaluation, scope)
src/personas/journeys.py          Journey loading, selection (V2 levers), cue formatting
src/personas/conversation_loop.py Five-block loop: metrics, rules, cards, messages, state
notebooks/                        Working notebooks (clustering, V1, V2, V3 copies)
poc_v1_initial_dashboard/         V1 notebook + dashboard
v2_journey_selection_and_design/  V2 notebook + dashboard + configuration guide
v3_conversation_loop_evaluation/
  conversation_loop_interview.ipynb        V3 notebook (generates the saved runs)
  conversation-loop-evaluation-dashboard.html  V3 dashboard (5 tabs, data embedded)
  conversation_loop_evaluation_runs.csv    All 140 saved answers with exact prompts
  run_dashboard.py                         Local helper for tab 5 live calls
  expanded_runs/                           88 extra interviews (JSON + CSV) and their runner
  experiment_studio/                       Experiment Studio (source, build, launcher)
data/, results/                   Local only, git-ignored
prompts/, evaluation/             Placeholders
```

Files in the repo root that are **not committed** include the process-design deck,
`Conversation_Loop_Guide.pdf`, `CMU_MOSEI_Analysis_Report.pdf`, a data-analysis notebook
and `csv_preview/`. They live on the team Google Drive (Northwestern x Accenture →
Dataset).

---

## How to run everything

All dashboards are single HTML files with their data embedded. Only Python 3 is needed:
no `pip install`, Node.js or notebook server.

- **V1 and V2 dashboards.** Open the `.html` file directly in a browser.
- **V3 dashboard, tabs 1–4.** Open `conversation-loop-evaluation-dashboard.html` directly.
- **V3 dashboard, tab 5 (live runs).** Browsers block direct calls from a local file to
  Azure, so a tiny local relay is needed:
  ```sh
  cd v3_conversation_loop_evaluation
  python3 run_dashboard.py      # serves http://127.0.0.1:8765, forwards only to *.openai.azure.com
  ```
  Paste the key in tab 5, or set `AZURE_OPENAI_API_KEY` before starting.
- **Experiment Studio.**
  ```sh
  cd v3_conversation_loop_evaluation/experiment_studio
  python3 run_studio.py         # rebuilds, serves http://127.0.0.1:8766/experiment_studio/experiment-studio.html
  ```
  On macOS you can also double-click `Start Experiment Studio.command`. For live runs and
  the LLM judge, copy `.env.example` to `.env` and add the key, or paste it in **Local
  helper → Model connection**. After editing `studio.css`, `studio_template.html` or
  `js/*.js`, run `python3 build_studio.py`.
- **Notebooks.** Run them in Colab or locally. They expect the team datasets from the Drive
  and Azure credentials in environment variables.

Reviews and runs are stored locally and synced to the existing Firebase workspace
when **Team sync online** is shown. **Data → Export everything (JSON)** makes a backup.
The [human rubric update notes](v3_conversation_loop_evaluation/experiment_studio/README.md#human-rubric-update---12-november-2026)
explain the two added score fields, historical-review preservation and tests.

---

## Known issues and open decisions

These were found while preparing the client demo. They are documented, not yet fixed.

1. **The fine arm shows the whole journey up front.** Rule 9 in the table above lists the
   full Q1–Q7 mood sequence in Block A. In cycle 1's card it appears as the 7th rule,
   because rules 3 and 8 do not fire for that cycle. Adolfo's guidance was not to reveal the future journey at the start,
   so this rule should probably be removed.
2. **The fine arm overrides the model's own state.** `update_session_state` replaces the
   model's `<state>` with the recording's next stage. The guide says the model's state
   should carry forward, with rules only as a fallback. The options are to carry the
   model's state, or to apply a gentle nudge toward the journey.
3. **Block A edits in V3 tab 5 do not persist.** The prompt is rebuilt when you switch
   questions, so removed text comes back.
4. **The scoring rubric is a working draft.** The 0–3 anchors and journey checks in
   Experiment Studio still need team agreement.

Fixing items 1 and 2 changes the fine arm, so the affected interviews would need to be
re-run.

Two earlier gaps are now closed: the short-biography runs (S7 and S8) have matched
baselines, and the Cash Flow Planner and Common Ground packs are included.

---

## Data, licensing and security

- CMU-MOSEI is research and non-commercial only. It is referenced, not redistributed.
  `data/` is git-ignored.
- The NVIDIA Nemotron-Personas library is CC BY 4.0 (attribution required, commercial use
  allowed).
- **Never commit an API key.** `.env` is git-ignored. Get the key from the team's shared
  password vault, not from chat or email. The local helpers keep the key in the local
  Python process or in browser session storage only.

---

## Notes for LLM assistants working in this repo

- Work on the `journey-selection-and-design` branch, not `main`.
- The source of truth for prompt construction is `src/personas/conversation_loop.py`.
  `experiment_studio/js/core.js` contains a JavaScript port of `build_card`,
  `build_messages` and `update_session_state`, and must stay in sync with it.
- `experiment_studio/experiment-studio.html` is a **build output**. Edit `studio.css`,
  `  studio_template.html` or `js/*.js`, then run `python3 build_studio.py`. The build reads
  saved data from `../conversation-loop-evaluation-dashboard.html` and
  `../expanded_runs/expanded_runs.json`, and never changes either.
- Experiment Studio uses its own names for the v3 arms:
  - `coarse` is "Brief cue" with timing "opening turn only".
  - `fine` is "Detailed cue" with timing "every turn, plus full trajectory".
  - `text_only` is the baseline.

  Saved study ids look like `study_C2_sub_fine_full`.
- Keep dashboards self-contained (data embedded, no external services) so they open
  offline. Live model calls go through the local relays (`run_dashboard.py` on port 8765,
  `run_studio.py` on port 8766).
- Do not commit the untracked root files listed above, and do not upload anything to
  shared drives unless asked.
