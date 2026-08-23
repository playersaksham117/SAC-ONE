from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime
import re


# ─── Request models ────────────────────────────────────────────────────────────

class ActivateLicenseRequest(BaseModel):
    license_key: str
    device_id: str          # UUID already registered in Supabase
    fingerprint_hash: str   # SHA-256, validated client-side

    @field_validator("license_key")
    @classmethod
    def validate_key_format(cls, v: str) -> str:
        v = v.strip().upper()
        if not re.match(r'^TRINV-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}$', v):
            raise ValueError("Invalid license key format")
        return v

    @field_validator("fingerprint_hash")
    @classmethod
    def validate_hash(cls, v: str) -> str:
        if not re.match(r'^[0-9a-f]{64}$', v):
            raise ValueError("Invalid fingerprint hash format")
        return v


class ValidateLicenseRequest(BaseModel):
    fingerprint_hash: str
    app_version: str


class GenerateLicenseRequest(BaseModel):
    license_type: str       # free | basic | pro | lifetime
    user_id: Optional[str] = None
    activation_limit: int = 1
    expiry_days: Optional[int] = None  # None = lifetime
    notes: Optional[str] = None

    @field_validator("license_type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in ("free", "basic", "pro", "lifetime"):
            raise ValueError("Invalid license type")
        return v


class RevokeLicenseRequest(BaseModel):
    license_id: str
    reason: Optional[str] = None


class ResetDeviceRequest(BaseModel):
    device_id: str
    reason: Optional[str] = None


# ─── Response models ──────────────────────────────────────────────────────────

class ActivationResponse(BaseModel):
    ok: bool
    status: Optional[str] = None
    license_type: Optional[str] = None
    expiry_date: Optional[datetime] = None
    error: Optional[str] = None


class ValidationResponse(BaseModel):
    ok: bool
    license_type: Optional[str] = None
    expiry_date: Optional[datetime] = None
    error: Optional[str] = None


class GeneratedLicenseResponse(BaseModel):
    ok: bool
    license_key: Optional[str] = None
    license_id: Optional[str] = None
    error: Optional[str] = None
