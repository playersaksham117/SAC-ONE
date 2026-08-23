from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query

from .deps import get_supabase, require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users")
async def list_users(
    _admin=Depends(require_admin),
    sb=Depends(get_supabase),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
):
    res = (
        sb.table("profiles")
        .select(
            "id, full_name, email, mobile_number, company_name, country, "
            "registration_date, last_login, license_status, license_type, "
            "device_count, subscription_expiry"
        )
        .order("registration_date", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return {"ok": True, "users": res.data, "count": len(res.data)}


@router.get("/licenses")
async def list_licenses(
    _admin=Depends(require_admin),
    sb=Depends(get_supabase),
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
):
    query = sb.table("licenses").select(
        "id, license_key, user_id, license_type, purchase_date, "
        "expiry_date, activation_limit, active_device_count, status, notes"
    )
    if status:
        query = query.eq("status", status)
    res = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return {"ok": True, "licenses": res.data}


@router.get("/activations")
async def list_activations(
    _admin=Depends(require_admin),
    sb=Depends(get_supabase),
    user_id: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
):
    query = sb.table("activations").select(
        "id, license_id, device_id, user_id, activated_at, last_validated, is_active"
    )
    if user_id:
        query = query.eq("user_id", user_id)
    res = query.order("activated_at", desc=True).limit(limit).execute()
    return {"ok": True, "activations": res.data}


@router.get("/stats")
async def usage_stats(
    _admin=Depends(require_admin),
    sb=Depends(get_supabase),
):
    total_users = sb.table("profiles").select("id", count="exact").execute()
    active_licenses = (
        sb.table("licenses").select("id", count="exact").eq("status", "active").execute()
    )
    total_devices = (
        sb.table("devices").select("id", count="exact").eq("is_active", True).execute()
    )
    plan_breakdown = sb.table("profiles").select("license_type").execute()
    plans: dict[str, int] = {}
    for row in plan_breakdown.data or []:
        t = row.get("license_type", "free")
        plans[t] = plans.get(t, 0) + 1

    return {
        "ok": True,
        "total_users": total_users.count,
        "active_licenses": active_licenses.count,
        "active_devices": total_devices.count,
        "plan_breakdown": plans,
    }


@router.patch("/users/{user_id}/upgrade")
async def upgrade_plan(
    user_id: str,
    new_plan: str,
    _admin=Depends(require_admin),
    sb=Depends(get_supabase),
):
    if new_plan not in ("free", "basic", "pro", "lifetime"):
        return {"ok": False, "error": "Invalid plan"}
    sb.table("profiles").update({"license_type": new_plan}).eq("id", user_id).execute()
    sb.table("audit_logs").insert(
        {"user_id": user_id, "action": "plan_upgraded",
         "details": {"new_plan": new_plan}}
    ).execute()
    return {"ok": True}


@router.patch("/users/{user_id}/disable")
async def disable_user_license(
    user_id: str,
    _admin=Depends(require_admin),
    sb=Depends(get_supabase),
):
    sb.table("profiles").update({"license_status": "suspended"}).eq("id", user_id).execute()
    sb.table("licenses").update({"status": "suspended"}).eq("user_id", user_id).execute()
    sb.table("audit_logs").insert(
        {"user_id": user_id, "action": "license_suspended"}
    ).execute()
    return {"ok": True}
