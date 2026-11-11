# Firebase setup for shared evaluation

## 1) Create Firestore

- Create or choose a Firebase project.
- Enable Firestore (Native mode).

## 2) Configure security rules

1. Open `firestore.rules` in this folder.
2. Replace `REPLACE_WITH_TEAM_PASSCODE` with your shared team passcode.
3. Deploy rules:

```sh
firebase deploy --only firestore:rules
```

This no-login mode is intentionally lightweight: writes require the passcode
and expected schema fields. For stronger protection, move to Firebase Auth and
per-user rules.

## 3) Provide web config to Studio

Set these values in Vercel env vars (or in local `.env`):

- `STUDIO_FIREBASE_ENABLED=true`
- `STUDIO_FIREBASE_WORKSPACE_ID`
- `STUDIO_SHARED_PASSCODE`
- `STUDIO_FIREBASE_API_KEY`
- `STUDIO_FIREBASE_AUTH_DOMAIN`
- `STUDIO_FIREBASE_PROJECT_ID`
- `STUDIO_FIREBASE_APP_ID`
- `STUDIO_FIREBASE_STORAGE_BUCKET`
- `STUDIO_FIREBASE_MESSAGING_SENDER_ID`

## 4) Seed existing local evaluations (optional)

In Studio:

- Open **Team sync settings**.
- Save your Firebase config and connect.
- Click **Upload local data now** once.

The upload uses a migration id stored in Firestore (`migrationIds`) so repeated
clicks do not duplicate records.
