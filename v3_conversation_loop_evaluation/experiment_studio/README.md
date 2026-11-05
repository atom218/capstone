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

### 1. Get the journey design branch

You need access to the GitHub repository, Git, Python 3, and a web browser.
The dashboard uses only Python's standard library: no `pip install`, Node.js,
or notebook setup is required. An Azure key is needed only to generate new
interviews or use the LLM judge. Saved interviews and manual reviews work
without one.

For a first checkout, open Terminal (macOS/Linux) or PowerShell (Windows):

```sh
git clone --branch journey-selection-and-design https://github.com/accenture-labs-de-sf/Synthetic-User-Personas-Accenture-x-Northwestern.git
cd Synthetic-User-Personas-Accenture-x-Northwestern
```

If you already have the repository, run these commands from its root instead.
Save or commit any work in progress before switching branches.

```sh
git fetch origin
git switch journey-selection-and-design
git pull --ff-only origin journey-selection-and-design
```

Keep the full repository checkout. The launcher reads the saved v3 dashboard
and imports its local helper from the parent folder.

### 2. Start the dashboard

On macOS/Linux, run from the repository root:

```sh
cd v3_conversation_loop_evaluation/experiment_studio
python3 run_studio.py
```

On Windows, run from the repository root:

```powershell
cd v3_conversation_loop_evaluation/experiment_studio
py -3 run_studio.py
```

On macOS, you can also open the `experiment_studio` folder in Finder and
double-click **Start Experiment Studio.command**.

The launcher rebuilds the page from source, serves it at
`http://127.0.0.1:8766/experiment_studio/experiment-studio.html` (or the next
free port if 8766 is taken), and opens it in your default browser. If no browser
opens, copy the exact URL printed in the terminal into your browser. Keep the
terminal window open while you work; press Ctrl+C to stop the server.

The top bar should show **Local helper**. This confirms the browser can reach
the local server; it does not confirm that Azure credentials work. Open
**Interviews** to browse the saved runs without making a model call.

### 3. Enable live interviews and the LLM judge (optional)

From the `experiment_studio` folder, create your local settings file once:

```sh
# macOS/Linux
cp .env.example .env
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

Open `.env` in a text editor and enter the team's Azure OpenAI key after
`AZURE_OPENAI_API_KEY=`. Confirm the endpoint, deployment name, and API version
with the teammate who manages the Azure resource; the example file contains
project defaults. Keep the filename exactly `.env`, not `.env.txt`.
Do not overwrite an existing `.env` when repeating setup.

Get the key from the team's shared password vault. `.env` is git-ignored and
must stay on your computer. The launcher reads the key into the local Python
process; the browser receives the endpoint, deployment, and an indication
that a key is available, without receiving the file's key. Shell environment
variables take precedence over the file, and a repo-root `.env` also works.

Stop and restart the launcher after changing `.env`, then reload the page.
Click **Local helper** to open **Model connection**. If the dialog says the
helper already has the key, leave its API key field empty. Check the endpoint
and deployment, then select **Save connection**. Settings previously saved in
this dialog override the endpoint and deployment supplied by `.env`.

To run a study, open **Design study**, complete the configuration, and select
**Launch comparison** (or **Run another replicate** for an existing
configuration). Answers appear as each turn finishes. Live interviews and the
LLM judge send requests to the configured Azure resource and use its quota.

You can also enter the key directly in **Model connection** without creating
`.env`; that key is kept in browser session storage for the current tab.

### 4. Save and share your work

Reviews, observations, and new runs are saved in that browser's local storage.
They do not automatically sync to GitHub or to teammates. Use **Data → Export
everything (JSON)** to back up or share your work; the recipient can use
**Data → Import a JSON export**. Use **Export scores (CSV)** for a score table.

Continue using the same browser profile and local URL, including its port.
A different browser, port, or direct-file URL has separate storage. Export
your work before changing these or clearing browser data. A teammate must
start the dashboard on their own computer; your `127.0.0.1` URL points only
to your computer.

### If something does not open

| Symptom | What to do |
|--------|------------|
| `python3` or `py` is not found | Install Python 3, reopen your terminal, and retry. If Windows has `python` instead of `py`, use `python run_studio.py` after confirming `python --version` reports Python 3. |
| Git reports that the repository cannot be found or access is denied | Sign in to GitHub with an account that has access to the repository and retry the clone or fetch. |
| The macOS double-click launcher does not run | Use the terminal command in step 2. |
| The browser cannot reach the page | Check that the launcher is still running and use the exact URL printed in its terminal. |
| The top bar says **Not connected** or **Direct** | Start `run_studio.py` and open its printed URL, then reload the page. |
| Live calls fail or no API key is found | Check `.env`, restart the launcher, and check **Model connection** for saved settings that override the file. Use the error shown by the dashboard when asking the Azure resource owner for help. |
| Reviews seem to be missing | Return to the original browser profile and port, or import your JSON backup. |

For a quick look without Python, open `experiment-studio.html` directly in
your browser. It includes the saved interviews and supports manual review;
use the launcher above for live model calls and a consistent local URL.

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
in the system card. The model settings for the original 20 runs were not
recorded, so the run inspector says so. New runs save the deployment,
temperature, token limit and input versions.

## Expanded saved runs

The original v3 dashboard covers 20 interviews on two products. The other 88
interviews in the full matrix were generated with the same loop and settings,
and are stored separately in `../expanded_runs/`. The full matrix is:

- 4 products;
- 3 persona variants;
- for each product and persona, a baseline plus 4 cycles × brief and detailed
  cues.

So every product now has a matched baseline for every persona, including the
short-persona runs S7 and S8.

- `expanded_runs/run_missing_sessions.py` builds the same Block A cards and
  prompts as `src/personas/conversation_loop.py`. Its settings are temperature
  0.7, `top_p` 0.9, 360 tokens and two verbatim turns. It skips any
  configuration already in the v3 dashboard or in `expanded_runs.json`, so it
  can be stopped and resumed.
- It reads the Cash Flow Planner and Common Ground packs from
  `expanded_runs/inputs/`. This folder is git-ignored. Unzip
  `product_interview_inputs.zip` from the team Drive (Product → Product specs
  and prototypes) into it, so it contains `product_supplier.py` and
  `product_inputs/`.
- It writes `expanded_runs.json` (read by `build_studio.py`) and
  `expanded_runs.csv` (same columns as `conversation_loop_evaluation_runs.csv`).
- `build_studio.py` merges `expanded_runs.json` into the page when the file
  exists. Sessions from the v3 dashboard win on any id clash.

New session ids follow the existing pattern:

- `B_<product>_text_only_<persona>` for baselines, for example
  `B_cashflow_text_only_full`;
- `C<n>_<product>_<arm>_<persona>` for grounded runs, for example
  `C3_sexual_fine_short_behavioral`.

```
cd v3_conversation_loop_evaluation/expanded_runs
/opt/miniconda3/bin/python run_missing_sessions.py   # needs numpy, pandas, Pillow
```

The Azure key comes from `AZURE_OPENAI_API_KEY`, `experiment_studio/.env`, or
the team Drive notebook the original runs used. It is kept in memory only.

## Where data lives

Reviews, observations and launched runs are saved in the browser's local
storage as you work. The **Data** menu exports everything as JSON (which can
be imported elsewhere) or exports scores as CSV, for example into `results/`.

## Known gaps

- NVIDIA persona-library retrieval is not connected. A plain-language brief can
  be added to a saved persona as labeled supplied facts.
- The 0–3 anchors and the implementation checks are working drafts for the
  team to agree on.
- "Load illustrative scores" in Compare fills clearly flagged placeholder
  scores so the view can be explored before real reviews exist. Remove them
  before reading any result.
