# TracInvent Phase 5 — Commercial Licensing & Activation

Phase 5 adds offline-first licensing, subscription management, feature gating, and secure updates.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  AuthGate → LicenseGate → App (HomeScreen)                   │
└────────────────────────────┬─────────────────────────────────┘
                             │
                    LicenseProvider
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
LicenseActivationService  FeatureGateService  SecureUpdateService
        │                    │                    │
   SQLite v5 tables     Nav + FeatureGate    Update manifest API
   SharedPreferences    widgets              (forced upgrades)
        │
   HMAC-signed keys (offline validation)
   Device fingerprint binding
```

## DB Schema (v5)

**Tables** (`lib/data/database/licensing_schema.dart`):

| Table | Purpose |
|-------|---------|
| `license_records` | Active subscription, tier, expiry, signed payload |
| `license_activations` | Device fingerprint bindings per license |
| `subscription_events` | Activation, renewal, expiry audit trail |
| `update_manifest_cache` | Cached secure update manifest |

Migration: `WmsSchema.version = 5` → `_migrateV4ToV5`

## License Key Format

```
TRINV-{base64url(payload)}-{sig8}
```

Payload (JSON):
```json
{
  "licenseId": "uuid",
  "organizationName": "Acme Retail",
  "tier": "pro",
  "maxDevices": 3,
  "issuedAt": "2026-05-23T...",
  "expiresAt": "2027-05-23T...",
  "features": { "pos": true, "mobileSync": true, "analytics": true, ... }
}
```

Signature: `HMAC-SHA256(canonical_json, TRACINVENT_LICENSE_SECRET)`

### Generate keys

```bash
cd backend/licensing
python generate_key.py --org "Acme Retail" --tier pro --days 365 --devices 3
```

## Activation Flow

1. User signs in (existing auth)
2. **LicenseGate** loads `LicenseProvider`
3. No license → **14-day trial** auto-starts (all Pro features)
4. User enters key in **Settings → License** or **LicenseActivationScreen**
5. `LicenseCryptoService.parseLicenseKey()` validates HMAC offline
6. `DeviceFingerprintService` hashes machine identity
7. If activations < `maxDevices`, row inserted in `license_activations`
8. `license_records` stored with **tamperHash** for local integrity checks
9. On each launch: `validateLocalLicense()` checks expiry + tamper + updates `lastValidatedAt`

## Subscription System

| State | Behavior |
|-------|----------|
| **Trial** | 14 days, full Pro features, banner shown |
| **Active** | Features from license tier until `expiresAt` |
| **Expired** | Activation screen; optional Basic-only continue |
| **Suspended** | Tamper detected → subscription_events logged |

Renewal: issue new key with extended `expiresAt`; user activates again (same org).

## Feature Gating

**Tiers:**

| Feature | Basic | Pro / Trial |
|---------|-------|-------------|
| Inventory, warehouses | ✓ | ✓ |
| POS, suppliers, customers, PO, ledger | ✗ | ✓ |
| Mobile sync / mobile hubs | ✗ | ✓ |
| Analytics | ✗ | ✓ |
| Advanced retail | ✗ | ✓ |

**Implementation:**
- `FeatureGateService.canAccess(license, feature)`
- `FeatureGate` widget wraps Pro screens
- Sidebar nav shows lock icon + snackbar when blocked

## Security Design

| Layer | Mechanism |
|-------|-----------|
| Key integrity | HMAC-SHA256 signed payload |
| Tamper detection | `tamperHash` on DB record fields |
| Device binding | SHA-256 fingerprint (OS + hostname + user) |
| Activation limits | Count of `license_activations` vs `maxDevices` |
| Local storage | SQLite + SharedPreferences (trial start date) |
| Secret | `--dart-define=TRACINVENT_LICENSE_SECRET=...` in production |

## Secure Updates

**Service:** `SecureUpdateService`  
**Endpoint:** `GET /api/v1/updates/manifest`

```json
{
  "min_version": "1.0.0",
  "latest_version": "1.1.0",
  "force_update": false,
  "download_url": "https://...",
  "checksum_sha256": "...",
  "release_notes": "..."
}
```

If `currentVersion < min_version` and `force_update=true`, **LicenseGate** blocks app with download button.

Existing GitHub update flow (`UpdateProvider`) remains for optional upgrades.

## Files Added

```
lib/data/database/licensing_schema.dart
lib/models/license_models.dart
lib/services/device_fingerprint_service.dart
lib/services/license_crypto_service.dart
lib/services/license_activation_service.dart
lib/services/feature_gate_service.dart
lib/services/secure_update_service.dart
lib/providers/license_provider.dart
lib/screens/licensing/license_gate.dart
lib/screens/licensing/license_activation_screen.dart
lib/widgets/feature_gate.dart
lib/widgets/license_status_panel.dart
backend/licensing/generate_key.py
RETAIL_PHASE5.md
```

## Testing

1. Launch app → trial banner (14 days)
2. Generate Pro key: `python backend/licensing/generate_key.py --org Test --tier pro --days 365 --devices 2`
3. Settings → License → Activate key
4. Verify POS/Mobile nav unlocks
5. Basic key → POS nav locked with lock icon
6. Set `TRACINVENT_FORCE_UPDATE=true` + `TRACINVENT_MIN_VERSION=9.9.9` on API → forced update screen

## Production Checklist

- [ ] Change `TRACINVENT_LICENSE_SECRET` on server and Flutter build
- [ ] Host update manifest over HTTPS
- [ ] Optional: wire `/licenses/validate` for online revocation
- [ ] Store sale keys in CRM; never commit secrets to git
