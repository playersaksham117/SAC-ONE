#!/usr/bin/env python3
"""
TracInvent license key generator (Phase 5).

Usage:
  python generate_key.py --org "Acme Retail" --tier pro --days 365 --devices 3

Requires TRACINVENT_LICENSE_SECRET env (must match Flutter dart-define / default dev secret).
"""

import argparse
import base64
import hashlib
import hmac
import json
import os
import uuid
from datetime import datetime, timedelta

SECRET = os.getenv("TRACINVENT_LICENSE_SECRET", "tracinvent-license-secret-change-in-prod")

TIER_FEATURES = {
    "basic": {
        "pos": False,
        "wmsAdvanced": False,
        "mobileSync": False,
        "analytics": False,
        "multiWarehouse": True,
        "advancedRetail": False,
    },
    "pro": {
        "pos": True,
        "wmsAdvanced": True,
        "mobileSync": True,
        "analytics": True,
        "multiWarehouse": True,
        "advancedRetail": True,
    },
    "enterprise": {
        "pos": True,
        "wmsAdvanced": True,
        "mobileSync": True,
        "analytics": True,
        "multiWarehouse": True,
        "advancedRetail": True,
    },
}


def sign_payload(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hmac.new(SECRET.encode(), canonical.encode(), hashlib.sha256).hexdigest()


def generate_key(org: str, tier: str, days: int, devices: int) -> str:
    now = datetime.utcnow()
    payload = {
        "licenseId": str(uuid.uuid4()),
        "organizationName": org,
        "tier": tier,
        "maxDevices": devices,
        "issuedAt": now.isoformat(),
        "expiresAt": (now + timedelta(days=days)).isoformat(),
        "features": TIER_FEATURES.get(tier, TIER_FEATURES["basic"]),
    }
    sig = sign_payload(payload)
    b64 = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    short_sig = sig[:8].upper()
    return f"TRINV-{b64}-{short_sig}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate TracInvent license keys")
    parser.add_argument("--org", required=True, help="Organization name")
    parser.add_argument("--tier", default="pro", choices=["basic", "pro", "enterprise"])
    parser.add_argument("--days", type=int, default=365, help="Subscription length in days")
    parser.add_argument("--devices", type=int, default=2, help="Max device activations")
    args = parser.parse_args()

    key = generate_key(args.org, args.tier, args.days, args.devices)
    print("License Key:")
    print(key)
    print()
    print(f"Organization: {args.org}")
    print(f"Tier: {args.tier}")
    print(f"Valid for: {args.days} days")
    print(f"Max devices: {args.devices}")


if __name__ == "__main__":
    main()
