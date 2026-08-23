from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt
from supabase import Client, create_client

from ..config import settings


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """Return a Supabase client using the service role key (bypasses RLS)."""
    return create_client(settings.supabase_url, settings.supabase_service_key)


def verify_jwt_user(authorization: Annotated[str, Header()] = "") -> str:
    """
    Extract and verify Supabase JWT from the Authorization header.
    Returns the user's UUID (sub claim).
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: no sub")
        return user_id
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"Token error: {exc}") from exc


def require_admin(x_admin_key: Annotated[str, Header(alias="X-Admin-Key")] = "") -> bool:
    """
    Simple admin authentication using a static API key stored in env.
    Replace with proper admin JWT verification in production.
    """
    if x_admin_key != settings.admin_api_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid admin key",
        )
    return True
