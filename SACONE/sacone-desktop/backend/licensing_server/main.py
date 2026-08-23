"""
TracInvent Licensing Server
FastAPI backend for license activation, validation, and admin operations.

Run with:
    uvicorn main:app --host 0.0.0.0 --port 8080 --workers 4

For production deploy on Railway / Render / VPS:
    Set all env vars from .env.example in the dashboard.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from .config import settings
from .routes import admin, devices, licenses

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="TracInvent Licensing API",
    version="1.0.0",
    docs_url="/docs" if settings.environment == "development" else None,
    redoc_url=None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["app://tracinvent"] if settings.environment == "production" else ["*"],
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["*"],
)

if settings.environment == "production":
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["your-domain.com"])

app.include_router(licenses.router, prefix="/api/v1")
app.include_router(devices.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "tracinvent-licensing"}
