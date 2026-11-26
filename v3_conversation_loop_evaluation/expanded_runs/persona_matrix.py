"""Persona matrix shared by Experiment Studio and the interview runner.

The saved interviews are Filomena Nguyen only. This module adds the same
4 products × 3 biography lengths × (baseline + 4 cycles × brief/detailed)
matrix for the other active people in persona_library.json. It never calls
a model. Generation stays in run_missing_sessions.py and runs only when a
person slug is passed explicitly.
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
LIBRARY_PATH = HERE / "persona_library.json"

PRODUCTS = ["subscription-management", "mental-wellness", "cash-flow-planning", "sexual-health"]
PRODUCT_CODE = {
    "subscription-management": "sub",
    "mental-wellness": "wellness",
    "cash-flow-planning": "cashflow",
    "sexual-health": "sexual",
}
CONDITIONS = [("text_only", None)] + [
    (arm, cycle) for cycle in ("C1", "C2", "C3", "C4") for arm in ("coarse", "fine")
]


def load_library(path=LIBRARY_PATH):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def active_people(library=None):
    library = library or load_library()
    return [p for p in library["people"] if p.get("active")]


def variant_meta(library=None):
    library = library or load_library()
    return library["variants"]


def persona_key(person, variant_id):
    """Studio id. Filomena's three ids stay exactly as the saved runs use them."""
    if person.get("legacy_keys"):
        return variant_id
    return f"{person['slug']}__{variant_id}"


def session_id(person, product_id, variant_id, arm, cycle):
    code = next(v["code"] for v in variant_meta() if v["id"] == variant_id)
    product = PRODUCT_CODE[product_id]
    core = f"B_{product}_text_only_{code}" if arm == "text_only" else f"{cycle}_{product}_{arm}_{code}"
    if person.get("legacy_keys"):
        return core
    return f"{person['slug']}_{core}"


def split_persona_key(key, library=None):
    library = library or load_library()
    for person in library["people"]:
        for variant in library["variants"]:
            if persona_key(person, variant["id"]) == key:
                return person["slug"], variant["id"]
    if key in {v["id"] for v in library["variants"]}:
        return "filomena", key
    return None, key


def all_specs(library, cycles):
    """One spec per interview. `cycles` maps C1..C4 to objects with video_id."""
    specs = []
    for person in active_people(library):
        for product_id in PRODUCTS:
            for variant in library["variants"]:
                for arm, cycle in CONDITIONS:
                    video = "none" if cycle is None else cycles[cycle]["video_id"]
                    specs.append({
                        "session_id": session_id(person, product_id, variant["id"], arm, cycle),
                        "person": person["slug"],
                        "persona_name": person["name"],
                        "persona_uuid": person["uuid"],
                        "persona_variant": persona_key(person, variant["id"]),
                        "variant_id": variant["id"],
                        "product_id": product_id,
                        "arm": arm,
                        "cycle": cycle,
                        "video_id": video,
                    })
    return specs


def logical_key(spec):
    return (spec["person"], spec["product_id"], spec["variant_id"], spec["arm"], spec["video_id"] or "none")


def existing_logical_keys(sessions, library=None):
    library = library or load_library()
    keys = set()
    for session in sessions.values():
        slug, variant_id = split_persona_key(session.get("persona_variant"), library)
        if not slug:
            continue
        keys.add((slug, session.get("product_id"), variant_id, session.get("arm"), session.get("video_id") or "none"))
    return keys


def missing_specs(library, cycles, sessions):
    have = existing_logical_keys(sessions, library)
    return [spec for spec in all_specs(library, cycles) if logical_key(spec) not in have]


def coverage(library, cycles, sessions):
    missing = missing_specs(library, cycles, sessions)
    per = len(PRODUCTS) * len(library["variants"]) * len(CONDITIONS)
    rows = []
    for person in active_people(library):
        pending = [s for s in missing if s["person"] == person["slug"]]
        rows.append({
            "slug": person["slug"],
            "name": person["name"],
            "uuid": person["uuid"],
            "expected": per,
            "pending": len(pending),
            "saved": per - len(pending),
            "session_ids": [s["session_id"] for s in pending],
        })
    return rows


def studio_entries(library=None):
    library = library or load_library()
    entries = []
    for person in active_people(library):
        for variant in library["variants"]:
            entries.append({
                "id": persona_key(person, variant["id"]),
                "person": person["slug"],
                "name": person["name"],
                "uuid": person["uuid"],
                "role": person.get("role", ""),
                "variant": variant["label"],
                "variantId": variant["id"],
                "note": variant["note"],
            })
    return entries


def apply_to_studio_data(data, library=None):
    """Add persona texts and the pending matrix. Does not change saved sessions."""
    library = library or load_library()
    for person in active_people(library):
        for variant in library["variants"]:
            key = persona_key(person, variant["id"])
            text = person["texts"][variant["id"]].strip()
            current = (data.get("persona_texts") or {}).get(key)
            if current is None:
                data.setdefault("persona_texts", {})[key] = text
            elif current.strip() != text:
                raise SystemExit(f"Persona text for {key} does not match persona_library.json")
    entries = studio_entries(library)
    rows = coverage(library, data["cycles"], data["sessions"])
    data["persona_library"] = {
        "source": library["source"],
        "license": library["license"],
        "selection": library["selection"],
        "entries": entries,
        "matrix": {
            "products": len(PRODUCTS),
            "variants": len(library["variants"]),
            "conditions": len(CONDITIONS),
            "interviews_per_person": len(PRODUCTS) * len(library["variants"]) * len(CONDITIONS),
            "answers_per_person": 7 * len(PRODUCTS) * len(library["variants"]) * len(CONDITIONS),
        },
        "coverage": [{k: v for k, v in row.items() if k != "session_ids"} for row in rows],
    }
    return data
