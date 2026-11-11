# Firestore schema for Experiment Studio

## Collection

- `studioWorkspaces/{workspaceId}`

## Document shape

```json
{
  "schemaVersion": 1,
  "passcode": "team-shared-code",
  "updatedBy": "Reviewer name",
  "updatedAt": "<server timestamp>",
  "migrationIds": ["mig_abcd1234"],
  "payload": {
    "reviews": {
      "human:Alice": {
        "C1_sub_coarse_full#0": {
          "scores": { "persona": { "v": 2, "evidence": [], "note": "" } },
          "flags": { "factual": { "on": false, "note": "" } },
          "startedAt": "ISO",
          "updatedAt": "ISO",
          "commonSubmittedAt": "ISO",
          "implSubmittedAt": "ISO"
        }
      }
    },
    "observations": [
      {
        "id": "obs_...",
        "study": "study_...",
        "q": 0,
        "title": "",
        "base": [],
        "grnd": [],
        "kind": "both|baseline|config|none",
        "author": "Reviewer",
        "at": "ISO"
      }
    ],
    "liveRuns": {
      "run_...": { "id": "run_...", "createdAt": "ISO", "cfg": {}, "turns": [] }
    },
    "liveStudies": {
      "study_...": { "id": "study_...", "createdAt": "ISO", "groundedRuns": [], "baselineRuns": [] }
    }
  }
}
```

## Merge rules used by the app

- Reviews merge by `updatedAt` (fallback: submit/start timestamps).
- Observations merge by `id`, preferring later `at`.
- `liveRuns` and `liveStudies` merge by id, preferring later `createdAt`.
- Migration uses idempotency keys in `migrationIds` (array union).
