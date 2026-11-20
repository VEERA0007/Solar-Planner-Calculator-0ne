# Firestore Security Specification — Shared USC History & Solar Inverter Sync Hub

## 1. Data Invariants

### Collection A: `/usc_history/{entryId}`
1. **Public Read Scope Only**: Every document in `/usc_history/{entryId}` MUST have `visibility == 'public'` and contain NO PII (`email`, `phone`, `address`). Both `get` and `list` rules explicitly require `existing().visibility == 'public'`.
2. **Verified Identity on Writes**: Only authenticated users with `request.auth.token.email_verified == true` may create, update, or delete `/usc_history/{entryId}` documents.
3. **Immutable Ownership & Identifiers**: On `create`, `ownerId == request.auth.uid`, `id == entryId`, and `createdAt == request.time`. On `update`, `id`, `uscNumber`, `stateId`, `visibility`, `ownerId`, and `createdAt` MUST remain unchanged, and `updatedAt == request.time`.
4. **Strict Schema & Bounded Arrays**: Every string field enforces `.size()` limits verbatim from `firebase-blueprint.json`. The optional `months` list is strictly bounded to `size() <= 24` with first-element type validation (`months[0] is map`). Shadow/ghost fields are rejected via `hasAll` + `hasOnly` on create and `affectedKeys().hasOnly(...)` on update.

### Collection B: `/inverter_plants/{plantId}`
5. **Non-Secret Hardware & Telemetry Only**: Inverter plant documents store ONLY non-secret hardware identifiers (`brand`, `plantName`, `stationId`, `loggerSerial`, `installedCapacityKwp`, `exportTariffInr`, `meterMode`, `autoSyncMinutes`) and synchronized telemetry snapshots (`todayGenKwh`, `livePowerKw`, optional CT/smart-meter fields). API keys, passwords, and bearer tokens are NEVER stored in Firestore.
6. **Verified Owner/Admin Write Control**: Public cross-browser reads require `existing().visibility == 'public'`. Creating a plant requires `isVerifiedUser()`, `ownerId == request.auth.uid`, `id == plantId`, and server timestamps (`request.time`). Updates are partitioned into Tier 1 (Owner/Admin full config + telemetry update) and Tier 2 (Owner/Admin telemetry-only sync refresh), both wrapped by `isValidInverterPlant(...)` and `affectedKeys().hasOnly(...)`. Only Owner or Admin may delete.

### Subcollection C: `/inverter_plants/{plantId}/daily_logs/{dateKey}`
7. **Master Gate Relational Sync (Pillar 1)**: Every single-document `create`, `update`, and `delete` on `/inverter_plants/{plantId}/daily_logs/{dateKey}` MUST fetch the parent `/inverter_plants/{plantId}` document via `get()` (after static auth + schema validation for Denial-of-Wallet protection) and verify that the parent exists and the caller is either the parent's `ownerId` or the bootstrapped verified Admin (`veera.official1997@gmail.com`).
8. **Strict Calendar Date Key & Zero Cost-Explosion on List (Pillars 3 & 8)**: `dateKey` MUST match `^[0-9]{4}-[0-9]{2}-[0-9]{2}$` and equal `incoming().dateKey`, while `incoming().plantId == plantId`. `allow list` validates `existing().visibility == 'public'` directly on `resource.data` without calling `get()`.
9. **Global Default Deny**: `match /{document=**} { allow read, write: if false; }` is enforced first so no undeclared collection is accessible.

---

## 2. The "Dirty Dozen" Adversarial Payloads

| # | Attack Vector | Target Operation | Malicious Payload / Condition | Expected Result |
|---|---------------|-----------------|-------------------------------|-----------------|
| 1 | Unauthenticated Create | `create /usc_history/102603120_telangana` | `auth == null` with valid payload | `PERMISSION_DENIED` |
| 2 | Unverified Email Spoofing | `delete /inverter_plants/home_5kw` | `email: 'veera.official1997@gmail.com'`, `email_verified: false` | `PERMISSION_DENIED` |
| 3 | Identity Spoofing (`ownerId`) | `create /inverter_plants/home_5kw` | `ownerId: 'victim_uid'` while `auth.uid == 'attacker_uid'` | `PERMISSION_DENIED` |
| 4 | Shadow / Ghost Secret Field Injection | `create /inverter_plants/home_5kw` | Adds unexpected `apiSecret: 'xyz'` or `isAdmin: true` | `PERMISSION_DENIED` |
| 5 | Path Variable ID Poisoning | `create /inverter_plants/bad$id!...` | Document ID contains invalid chars or exceeds 128 chars | `PERMISSION_DENIED` |
| 6 | Client Timestamp Forgery | `create /inverter_plants/home_5kw` | `createdAt` or `updatedAt` set to client date instead of `request.time` | `PERMISSION_DENIED` |
| 7 | Array Exhaustion (`months`) | `create /usc_history/102603120_telangana` | `months` array contains 25+ elements or non-map first element | `PERMISSION_DENIED` |
| 8 | Invalid Date Key on Daily Log | `create /inverter_plants/home_5kw/daily_logs/today` | `dateKey` does not match `YYYY-MM-DD` | `PERMISSION_DENIED` |
| 9 | Orphaned Subcollection Write (Master Gate) | `create /inverter_plants/nonexistent_plant/daily_logs/2026-11-20` | Parent plant document does not exist | `PERMISSION_DENIED` |
| 10 | Cross-Owner Daily Log Injection (Master Gate) | `create /inverter_plants/home_5kw/daily_logs/2026-11-20` | Verified user `uid_b` writes a log under `uid_a`'s plant | `PERMISSION_DENIED` |
| 11 | Value Poisoning on Allowed Update Key | `update /inverter_plants/home_5kw` | Updates `todayGenKwh` to `-50` or `"9999"` (wrong type/out of bounds) | `PERMISSION_DENIED` |
| 12 | Undeclared Collection Access | `read` / `write /private_secrets/doc1` | Any user tries to access an unlisted collection | `PERMISSION_DENIED` |
