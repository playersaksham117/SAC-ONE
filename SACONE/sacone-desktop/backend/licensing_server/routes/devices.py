from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from ..models import ResetDeviceRequest
from .deps import get_supabase, require_admin, verify_jwt_user

router = APIRouter(prefix="/devices", tags=["devices"])


@router.get("/mine")
async def get_my_devices(
    user_id: Annotated[str, Depends(verify_jwt_user)],
    sb=Depends(get_supabase),
):
    """Return all active devices for the authenticated user."""
    res = (
        sb.table("devices")
        .select("id, device_name, os_version, app_version, activation_date, last_seen, is_active")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .order("last_seen", desc=True)
        .execute()
    )
    return {"ok": True, "devices": res.data}


@router.post("/reset")
async def reset_device(
    req: ResetDeviceRequest,
    _admin=Depends(require_admin),
    sb=Depends(get_supabase),
):
    """Admin: deactivate a specific device and free one activation slot."""
    now = datetime.now(timezone.utc).isoformat()

    # Deactivate device
    sb.table("devices").update(
        {"is_active": False, "deactivated_at": now,
         "deactivated_reason": req.reason or "Admin reset"}
    ).eq("id", req.device_id).execute()

    # Find and deactivate related activation
    act_res = (
        sb.table("activations")
        .select("id, license_id")
        .eq("device_id", req.device_id)
        .eq("is_active", True)
        .execute()
    )
    for act in act_res.data or []:
        sb.table("activations").update(
            {"is_active": False, "deactivated_at": now,
             "deactivated_reason": req.reason or "Admin reset"}
        ).eq("id", act["id"]).execute()

        # Decrement active_device_count on the license
        sb.rpc(
            "decrement_active_count",
            {"p_license_id": act["license_id"]},
        ).execute()

    sb.table("audit_logs").insert(
        {"action": "device_reset",
         "details": {"device_id": req.device_id, "reason": req.reason}}
    ).execute()
    return {"ok": True, "message": "Device deactivated and activation slot freed"}
