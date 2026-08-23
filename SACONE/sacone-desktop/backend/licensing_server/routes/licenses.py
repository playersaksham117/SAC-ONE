import hashlib
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from jose import JWTError, jwt

from ..config import settings
from ..models import (
    ActivateLicenseRequest,
    ActivationResponse,
    GenerateLicenseRequest,
    GeneratedLicenseResponse,
    RevokeLicenseRequest,
    ValidateLicenseRequest,
    ValidationResponse,
)
from .deps import get_supabase, require_admin, verify_jwt_user

router = APIRouter(prefix="/licenses", tags=["licenses"])


def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def _generate_license_key() -> str:
    """Generate TRINV-XXXXXXXX-XXXXXXXX-XXXXXXXX format license key."""
    chars = string.ascii_uppercase + string.digits
    segments = ["".join(secrets.choice(chars) for _ in range(8)) for _ in range(3)]
    return f"TRINV-{segments[0]}-{segments[1]}-{segments[2]}"


@router.post("/activate", response_model=ActivationResponse)
async def activate_license(
    req: ActivateLicenseRequest,
    user_id: Annotated[str, Depends(verify_jwt_user)],
    sb=Depends(get_supabase),
):
    """
    Called by Flutter after the user enters their license key.
    Validates the key, checks activation limits, and records the binding.
    """
    key_hash = _hash_key(req.license_key)

    try:
        result = sb.rpc(
            "activate_license",
            {
                "p_license_key_hash": key_hash,
                "p_user_id": user_id,
                "p_device_id": req.device_id,
            },
        ).execute()
        data = result.data
        if not data or not data.get("ok"):
            return ActivationResponse(
                ok=False, error=data.get("error") if data else "Activation failed"
            )

        # Audit log
        sb.table("audit_logs").insert(
            {
                "user_id": user_id,
                "device_id": req.device_id,
                "action": "license_activated",
                "details": {
                    "license_type": data.get("license_type"),
                    "key_hash_prefix": key_hash[:8],
                },
            }
        ).execute()

        return ActivationResponse(
            ok=True,
            status=data.get("status"),
            license_type=data.get("license_type"),
            expiry_date=data.get("expiry_date"),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/validate", response_model=ValidationResponse)
async def validate_license(
    req: ValidateLicenseRequest,
    user_id: Annotated[str, Depends(verify_jwt_user)],
    sb=Depends(get_supabase),
):
    """
    Called on app startup and periodically to confirm the license is still valid.
    """
    try:
        result = sb.rpc(
            "validate_activation",
            {
                "p_user_id": user_id,
                "p_fingerprint_hash": req.fingerprint_hash,
            },
        ).execute()
        data = result.data
        if not data or not data.get("ok"):
            return ValidationResponse(
                ok=False, error=data.get("error") if data else "Validation failed"
            )
        return ValidationResponse(
            ok=True,
            license_type=data.get("license_type"),
            expiry_date=data.get("expiry_date"),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/generate", response_model=GeneratedLicenseResponse)
async def generate_license(
    req: GenerateLicenseRequest,
    _admin=Depends(require_admin),
    sb=Depends(get_supabase),
):
    """Admin: generate a new license key."""
    key = _generate_license_key()
    key_hash = _hash_key(key)

    expiry = None
    if req.expiry_days:
        expiry = (datetime.now(timezone.utc) + timedelta(days=req.expiry_days)).isoformat()

    try:
        res = (
            sb.table("licenses")
            .insert(
                {
                    "license_key": key,
                    "license_key_hash": key_hash,
                    "user_id": req.user_id,
                    "license_type": req.license_type,
                    "activation_limit": req.activation_limit,
                    "expiry_date": expiry,
                    "notes": req.notes,
                    "status": "unactivated",
                }
            )
            .select("id")
            .execute()
        )
        license_id = res.data[0]["id"]
        return GeneratedLicenseResponse(ok=True, license_key=key, license_id=license_id)
    except Exception as exc:
        return GeneratedLicenseResponse(ok=False, error=str(exc))


@router.post("/revoke")
async def revoke_license(
    req: RevokeLicenseRequest,
    _admin=Depends(require_admin),
    sb=Depends(get_supabase),
):
    """Admin: revoke a license immediately."""
    sb.table("licenses").update({"status": "revoked"}).eq("id", req.license_id).execute()
    sb.table("activations").update(
        {"is_active": False, "deactivated_at": datetime.now(timezone.utc).isoformat(),
         "deactivated_reason": req.reason or "Admin revoke"}
    ).eq("license_id", req.license_id).execute()
    sb.table("audit_logs").insert(
        {"action": "license_revoked", "details": {"license_id": req.license_id, "reason": req.reason}}
    ).execute()
    return {"ok": True}
