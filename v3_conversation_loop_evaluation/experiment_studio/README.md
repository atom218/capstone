# Experiment Studio

A single-page interface for running matched synthetic interview studies and
judging them. It follows the *Interface plan for synthetic interview studies*
and has four workspaces:

- **Design study.** Build a matched comparison by dragging blocks into five
  sockets, in Adolfo's order: product and decision, audience, behavioral
  journey, journey delivery, and what carries forward. The twin-rail timeline
  shows what the baseline and grounded interviews each receive at any turn.
  The "What changes in this test?" panel shows what both arms share, flags when
  a new baseline is needed, and launches the run.
- **Interviews.** Recreates tab 4 of the v3 dashboard ("Exact Prompt Sent for
  Each Question") for every interview, saved or launched here. Drag an
  interview into the viewer, then step through its seven questions. Each one
  shows what changed since the previous question, the exact prompt split into
  the five blocks (A persona and rules card, B live state, C bounded memory,
  D question and screen, E reminder), the raw message, and the answer with its
  private thought and state hand-off. The blocks are rebuilt with the same
  logic as `conversation_loop.py` and checked against the recorded message.
  All 140 saved answers match exactly.
- **Evaluate.** Opens on "Continue my reviews". Your assignments appear as a
  grid, with questions down the side and interviews across the top, one cell
  per response showing its review status and totals per row and column.
  Interviews carry neutral numbers shuffled for each reviewer, so the grid
  never reveals which one is the baseline. Work in random order (the default),
  question by question, or interview by interview. A list view groups
  responses by question. Responses are anonymized. Reviewers score five common criteria from 0 to 3, with zero,
  unscored and not applicable shown as different states. To attach evidence,
  select words in the answer and drag the chip onto a criterion. Common scores
  are locked for audit before the journey cue is revealed for the
  implementation checks. An LLM judge can score the same queue in its own lane.
- **Compare results.** Drag a grounded configuration onto the right slot and
  its matched baseline fills the left. Select a criterion to see higher, same
  and lower counts and score distributions, then select a question to read both
  verbatim answers side by side. That is two clicks from a criterion to the
  evidence. Observations can be filtered by "Appears in both", "Baseline
  only", "Selected configuration only" and "No material difference". The
  evaluator table shows missing judgments, disagreements and scale
  differences. Journey implementation has its own section at the end, and
  **Inspect the run** opens the persona, product pack, source journey, exact
  turn inputs and configuration.

## Run it locally

Double-click **Start Experiment Studio.command** in Finder, or run:

```
cd v3_conversation_loop_evaluation/experiment_studio
python3 run_studio.py
```

Either one rebuilds the page from source, serves it at
`http://127.0.0.1:8766/experiment_studio/experiment-studio.html` (or the next
free port if 8766 is taken), and opens it in your default browser. Keep the
Terminal window open while you work. Press Ctrl+C or close the window to stop.

Serving it this way also turns on the local helper, which relays launches and
the LLM judge to Azure OpenAI (it reuses `../run_dashboard.py`). The model
button in the top bar reads "Local helper" when it is active.

### Set up the Azure key once

```
cp .env.example .env     # then paste the team's key after AZURE_OPENAI_API_KEY=
```

Get the key from the team's shared password vault, not from chat, email or
GitHub. `.env` is git-ignored (by the repo root and by this folder's own
`.gitignore`), so it stays on your computer. The launcher reads the key into
the local Python process only. The browser is told that a key exists and
receives the endpoint and deployment to prefill the connection dialog, never
the key itself. A value already exported in your shell overrides the file, and
a repo-root `.env` works too.

Without a `.env`, you can still paste the key into the connection dialog. It is
kept only for the current browser tab.

Without the server, `experiment-studio.html` still opens directly from disk for
designing studies, reviewing, and comparing the saved v3 runs.

## Rebuild after editing

The source is `studio_template.html`, `studio.css` and the files in `js/`.
`build_studio.py` inlines them with the saved interviews, journeys, product
packs and screens it reads from `../conversation-loop-evaluation-dashboard.html`.
The v3 files are only read, never changed.

```
python3 build_studio.py
```

| File | Purpose |
|------|---------|
| `Start Experiment Studio.command` | Double-click launcher for macOS |
| `run_studio.py` | Local server: rebuilds, serves, opens the browser, relays model calls, reads `.env` |
| `.env.example` | Template for the local Azure settings; copy to `.env` |
| `js/core.js` | Data model, storage, drag-and-drop engine, twin rail, and a port of `build_card`, `build_messages` and `update_session_state` from `src/personas/conversation_loop.py`. Also the live runner and LLM judge. |
| `js/design.js` | Design study workspace |
| `js/interviews.js` | Interviews workspace: prompt blocks A–E and answers per question |
| `js/evaluate.js` | Evaluate workspace |
| `js/compare.js` | Compare results workspace |
| `js/app.js` | Shell, routing, event delegation |

## How the saved v3 runs map onto the new settings

| v3 arm | Cue detail | Cue timing |
|--------|------------|------------|
| `text_only` | Baseline, no journey | – |
| `coarse` | Brief (coarse rules) | Opening turn only (the persona then carries its own `<state>`) |
| `fine` | Detailed (fine rules) | Every turn, plus the full 7-stage trajectory in the card |

All saved runs used two verbatim turns of history and stated the profile once
in the system card. The two short-persona runs (S7, S8) have no matched
baseline. Launching that configuration from Design study generates one. The
model settings for the saved runs were not recorded, so the run inspector says
so. New runs save the deployment, temperature, token limit and input versions.

## Where data lives

Reviews, observations and launched runs are saved in the browser's local
storage as you work. The **Data** menu exports everything as JSON (which can
be imported elsewhere) or exports scores as CSV, for example into `results/`.

## Known gaps

- Cash flow planner and sexual well-being question packs are not in this
  branch, so those products show as unavailable.
- NVIDIA persona-library retrieval is not connected. A plain-language brief can
  be added to a saved persona as labeled supplied facts.
- The 0–3 anchors and the implementation checks are working drafts for the
  team to agree on.
- "Load illustrative scores" in Compare fills clearly flagged placeholder
  scores so the view can be explored before real reviews exist. Remove them
  before reading any result.
