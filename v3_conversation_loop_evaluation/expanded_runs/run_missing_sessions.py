"""Generate the V3 interviews that are not saved yet.

Covers 4 products x 3 persona variants x (text_only baseline + 4 cycles x coarse/fine),
using the same five-block loop, cards, memory policy (last 2 answers verbatim) and model
settings as the saved V3 runs. Sessions that already exist in the V3 dashboard data or in
expanded_runs.json are skipped, so the script can be stopped and resumed.

    cd v3_conversation_loop_evaluation/expanded_runs
    /opt/miniconda3/bin/python run_missing_sessions.py            # everything missing
    /opt/miniconda3/bin/python run_missing_sessions.py --limit 1  # smoke test

Inputs (git-ignored, fetched from the team Drive):
    inputs/product_supplier.py and inputs/product_inputs/ (from product_interview_inputs.zip)

The Azure key is read from AZURE_OPENAI_API_KEY, a git-ignored .env file, or the team
Drive notebook used for the original runs. It is held in memory only and never written.
"""

import argparse
import base64
import csv
import io
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

HERE = Path(__file__).resolve().parent
V3 = HERE.parent
REPO = V3.parent
sys.path.insert(0, str(REPO / "src"))
sys.path.insert(0, str(HERE / "inputs"))

from personas.conversation_loop import (  # noqa: E402
    GroundingMetrics,
    Session,
    build_card,
    build_messages,
    estimate_tokens,
    first_sentence,
    parse_structured_output,
    update_session_state,
)
import product_supplier as ps  # noqa: E402

OUT_JSON = HERE / "expanded_runs.json"
OUT_CSV = HERE / "expanded_runs.csv"
DASHBOARD = V3 / "conversation-loop-evaluation-dashboard.html"
KEY_NOTEBOOK = "gdrive:Northwestern x Accenture/Dataset/CMU-MOSEI/poc_grounded_interview_chain.ipynb"

PRODUCTS = ["subscription-management", "mental-wellness", "cash-flow-planning", "sexual-health"]
PRODUCT_CODE = {"subscription-management": "sub", "mental-wellness": "wellness",
                "cash-flow-planning": "cashflow", "sexual-health": "sexual"}
PERSONAS = ["full_description", "short_version_1", "short_version_2"]
PERSONA_CODE = {"full_description": "full", "short_version_1": "short_demographics",
                "short_version_2": "short_behavioral"}
PERSONA_UUID = "0ee14f548c2c48c99b6ed3d8369e194b"
NEUTRAL = "patience: medium; trust: medium; mood: neutral"
TEMPERATURE = 0.7
TOP_P = 0.9
MAX_TOKENS = 360
KEEP = 2
THUMB_WIDTH = 520

CSV_COLUMNS = ["session_id", "product_id", "product_name", "persona_uuid", "persona_name", "persona_variant",
               "arm", "video_id", "turn", "question_id", "phase", "has_screenshot", "screenshot_path", "question",
               "state_before", "think", "reply", "model_raw_state", "state_after", "reply_words",
               "prompt_tokens_est", "system_card", "assembled_user_block"]


def load_v3_data():
    html = DASHBOARD.read_text(encoding="utf-8")
    marker = "const D = "
    data, _ = json.JSONDecoder().raw_decode(html[html.index(marker) + len(marker):])
    return data


def read_env_file(path):
    out = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def load_connection(defaults):
    env = {}
    for p in (V3 / "experiment_studio" / ".env", REPO / ".env"):
        env = {**read_env_file(p), **env}
    env = {**env, **{k: v for k, v in os.environ.items() if k.startswith("AZURE_OPENAI_")}}
    conn = {
        "endpoint": env.get("AZURE_OPENAI_ENDPOINT") or defaults["endpoint"],
        "deployment": env.get("AZURE_OPENAI_DEPLOYMENT") or defaults["deployment"],
        "api_version": env.get("AZURE_OPENAI_API_VERSION") or defaults["api_version"],
        "key": env.get("AZURE_OPENAI_API_KEY", ""),
    }
    if not conn["key"]:
        raw = subprocess.run(["rclone", "cat", KEY_NOTEBOOK], capture_output=True, check=True).stdout.decode("utf-8")
        src = "\n".join("".join(c.get("source", [])) for c in json.loads(raw)["cells"])
        m = re.search(r"subscription_key\s*=\s*[\"']([^\"']{16,})[\"']", src)
        if not m:
            sys.exit("No Azure key found. Set AZURE_OPENAI_API_KEY or add it to experiment_studio/.env.")
        conn["key"] = m.group(1)
    return conn


def call_azure(conn, messages):
    url = f"{conn['endpoint'].rstrip('/')}/openai/deployments/{conn['deployment']}/chat/completions?api-version={conn['api_version']}"
    payload = json.dumps({"messages": messages, "temperature": TEMPERATURE, "top_p": TOP_P, "max_tokens": MAX_TOKENS}).encode("utf-8")
    for attempt in range(8):
        req = urllib.request.Request(url, data=payload, method="POST",
                                     headers={"api-key": conn["key"], "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            return body["choices"][0]["message"]["content"].strip(), body.get("usage", {})
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < 7:
                wait = float(e.headers.get("retry-after") or 0) or min(60, 4 * 2 ** attempt)
                time.sleep(wait)
                continue
            raise RuntimeError(f"Azure HTTP {e.code}: {e.read().decode('utf-8', 'ignore')[:300]}") from None
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt < 7:
                time.sleep(min(60, 4 * 2 ** attempt))
                continue
            raise


def grounding_from_cycle(c):
    m = c["metrics"]
    return GroundingMetrics(
        video_id=c["video_id"], journey_label=c["label"], shape=c["shape"],
        valence_mean=m["valence_mean"], arousal_mean=m["arousal_mean"],
        valence_drop_after_friction=m["valence_drop_after_friction"], recovery_rate=m["recovery_rate"],
        arousal_var=m["arousal_var"], sentiment_span=c["sentiment_span"], dominant_emotions=[],
        stage_sentiments=c["stage_sentiments"], stage_dominant_emotions=c["stage_dominant_emotions"],
        initial_state=c["initial_state"], stage_target_states=c["stage_target_states"],
    )


def thumbnail_uri(png_path):
    from PIL import Image
    im = Image.open(png_path).convert("RGB")
    im = im.resize((THUMB_WIDTH, round(im.height * THUMB_WIDTH / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=72)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def product_entry(iv):
    """Product pack in the same shape as the V3 dashboard's D.products entries."""
    qs = []
    for q in iv["questions"]:
        shot = q.get("screenshot")
        qs.append({
            "turn": str(q["order"]), "question_id": q["question_id"], "phase": q["phase"],
            "participant_instruction": q["participant_instruction"], "question": q["question"],
            "has_screenshot": "True" if shot else "False",
            "screenshot_path": shot["relative_path"] if shot else "",
            "screenshot_data_uri": thumbnail_uri(shot["path"]) if shot else "",
        })
    return {"product_id": iv["product_id"], "product_name": iv["product_name"], "questions": qs}


def plan_sessions(data):
    cycles = data["cycles"]
    by_video = {c["video_id"]: cid for cid, c in cycles.items()}
    have = set()
    for s in data["sessions"].values():
        have.add((s["product_id"], s["persona_variant"], s["arm"], by_video.get(s["video_id"])))
    specs = []
    for prod in PRODUCTS:
        for persona in PERSONAS:
            combos = [("text_only", None)] + [(arm, cid) for cid in sorted(cycles) for arm in ("coarse", "fine")]
            for arm, cid in combos:
                if (prod, persona, arm, cid) in have:
                    continue
                pc, rc = PRODUCT_CODE[prod], PERSONA_CODE[persona]
                sid = f"B_{pc}_text_only_{rc}" if arm == "text_only" else f"{cid}_{pc}_{arm}_{rc}"
                specs.append({"session_id": sid, "product_id": prod, "persona_variant": persona, "arm": arm, "cycle": cid})
    return specs


def run_session(spec, data, interviews, conn):
    iv = interviews[spec["product_id"]]
    arm = spec["arm"]
    cyc = data["cycles"][spec["cycle"]] if spec["cycle"] else None
    grounding = grounding_from_cycle(cyc) if cyc else None
    card = build_card(data["persona_texts"][spec["persona_variant"]], cyc["rules"][arm] if cyc else [])
    sess = Session(
        session_id=spec["session_id"], product_id=spec["product_id"], product_name=iv["product_name"],
        persona_uuid=PERSONA_UUID, persona_name="Filomena Nguyen", persona_variant=spec["persona_variant"],
        arm=arm, journey_label=cyc["label"] if cyc else "None (Text-only baseline)",
        video_id=cyc["video_id"] if cyc else "none", card=card,
        state=grounding.initial_state if grounding else NEUTRAL,
    )
    turns = []
    for t_idx, q in enumerate(iv["questions"], 1):
        shot = q.get("screenshot")
        recent = sess.turns[-KEEP:]
        older = sess.turns[:-KEEP]
        msgs, user_text = build_messages(sess, question_text=q["question"],
                                         participant_instruction=q["participant_instruction"],
                                         image_data_uri=shot["data_uri"] if shot else None, keep=KEEP)
        raw, usage = call_azure(conn, msgs)
        think, reply, parsed_state = parse_structured_output(raw)
        before = sess.state
        sess.state = update_session_state(arm, parsed_state, t_idx, grounding, sess.state)
        sess.turns.append((q["question"], reply))
        turns.append({
            "turn": t_idx, "question_id": q["question_id"], "phase": q["phase"], "has_screenshot": bool(shot),
            "screenshot_path": shot["relative_path"] if shot else "", "question": q["question"],
            "state_before": before, "think": think or "", "reply": reply, "model_raw_state": parsed_state or "",
            "state_after": sess.state, "reply_words": len(reply.split()), "tokens": estimate_tokens(msgs),
            "assembled_user_block": user_text,
            "verbatim_recent": [{"q": a, "r": b} for a, b in recent],
            "older_summary": [f"- Asked about: {first_sentence(a)} You said: {first_sentence(b)}" for a, b in older],
            "usage": usage,
        })
    return {
        "session_id": spec["session_id"], "product_id": spec["product_id"], "product_name": iv["product_name"],
        "persona_variant": spec["persona_variant"], "arm": arm, "video_id": sess.video_id, "system_card": card,
        "turns": turns,
        "model": {"deployment": conn["deployment"], "api_version": conn["api_version"],
                  "temperature": TEMPERATURE, "top_p": TOP_P, "max_tokens": MAX_TOKENS, "keep": KEEP},
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }


def write_outputs(out):
    tmp = OUT_JSON.with_suffix(".tmp")
    tmp.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    tmp.replace(OUT_JSON)
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        w.writeheader()
        for s in out["sessions"].values():
            for t in s["turns"]:
                w.writerow({
                    **{k: s[k] for k in ("session_id", "product_id", "product_name", "persona_variant", "arm", "video_id", "system_card")},
                    "persona_uuid": PERSONA_UUID, "persona_name": "Filomena Nguyen",
                    **{k: t[k] for k in ("turn", "question_id", "phase", "has_screenshot", "screenshot_path", "question",
                                         "state_before", "think", "reply", "model_raw_state", "state_after",
                                         "reply_words", "assembled_user_block")},
                    "prompt_tokens_est": t["tokens"],
                })


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="run at most this many sessions")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--only", default="", help="comma-separated session ids to run")
    args = ap.parse_args()

    data = load_v3_data()
    interviews = {p: ps.get_product_interview(p, root=HERE / "inputs" / "product_inputs", image_mode="data_uri") for p in PRODUCTS}
    out = json.loads(OUT_JSON.read_text(encoding="utf-8")) if OUT_JSON.exists() else {"sessions": {}, "products": {}}
    for p in PRODUCTS:
        if p not in data["products"] and p not in out["products"]:
            out["products"][p] = product_entry(interviews[p])

    specs = [s for s in plan_sessions(data) if s["session_id"] not in out["sessions"]]
    if args.only:
        wanted = set(args.only.split(","))
        specs = [s for s in specs if s["session_id"] in wanted]
    if args.limit:
        specs = specs[: args.limit]
    print(f"{len(out['sessions'])} already generated, {len(specs)} to run", flush=True)
    write_outputs(out)
    if not specs:
        return

    conn = load_connection(data["azure_default"])
    lock = threading.Lock()
    done = failed = 0
    start = time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(run_session, s, data, interviews, conn): s for s in specs}
        for fut in as_completed(futures):
            spec = futures[fut]
            try:
                res = fut.result()
            except Exception as e:  # keep going; the session is retried on the next run
                failed += 1
                print(f"FAILED {spec['session_id']}: {e}", flush=True)
                continue
            with lock:
                out["sessions"][res["session_id"]] = res
                write_outputs(out)
                done += 1
            print(f"[{done + failed}/{len(specs)}] {res['session_id']} ok ({time.time() - start:.0f}s)", flush=True)
    print(f"Finished: {done} ok, {failed} failed. Total generated: {len(out['sessions'])}", flush=True)


if __name__ == "__main__":
    main()
