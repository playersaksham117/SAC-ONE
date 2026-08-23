"""
TracInvent Sync Hub — FastAPI backend (Phase 3)
REST API with JWT auth, device registration, event-driven sync push/pull.
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
import hashlib
import json
import os
import sqlite3
import uuid

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

APP_SECRET = os.getenv("TRACINVENT_SECRET", "tracinvent-dev-secret-change-in-prod")
DB_PATH = os.getenv("TRACINVENT_API_DB", os.path.join(os.path.dirname(__file__), "tracinvent_api.db"))

app = FastAPI(title="TracInvent Sync API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SYNC_TABLES = [
    "inventory_items",
    "warehouses",
    "stocks",
    "transactions",
    "suppliers",
    "customers",
    "purchase_orders",
    "sales_invoices",
    "sale_lines",
    "stock_movements",
    "serial_numbers",
]


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_conn()
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS tenants (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            username TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'operator',
            is_active INTEGER NOT NULL DEFAULT 1,
            UNIQUE(tenant_id, username)
        );
        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            name TEXT NOT NULL,
            device_type TEXT NOT NULL,
            api_token TEXT NOT NULL UNIQUE,
            role TEXT NOT NULL DEFAULT 'operator',
            last_seen_at TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sync_changes (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            device_id TEXT NOT NULL,
            table_name TEXT NOT NULL,
            record_id TEXT NOT NULL,
            operation TEXT NOT NULL,
            payload TEXT NOT NULL,
            client_updated_at TEXT NOT NULL,
            server_applied_at TEXT NOT NULL,
            idempotency_key TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS entity_store (
            tenant_id TEXT NOT NULL,
            table_name TEXT NOT NULL,
            record_id TEXT NOT NULL,
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (tenant_id, table_name, record_id)
        );
        CREATE INDEX IF NOT EXISTS idx_entity_updated ON entity_store(tenant_id, updated_at);
        CREATE INDEX IF NOT EXISTS idx_sync_tenant ON sync_changes(tenant_id, server_applied_at);
        """
    )
    # Seed default tenant + admin
    cur.execute("SELECT COUNT(*) FROM tenants")
    if cur.fetchone()[0] == 0:
        tid = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        pwd = hashlib.sha256("admin123".encode()).hexdigest()
        cur.execute("INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)", (tid, "Default Shop", now))
        cur.execute(
            "INSERT INTO users (id, tenant_id, username, password_hash, role) VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), tid, "admin@123", pwd, "admin"),
        )
    conn.commit()
    conn.close()


@app.on_event("startup")
def startup() -> None:
    init_db()


class LoginRequest(BaseModel):
    username: str
    password: str


class DeviceRegisterRequest(BaseModel):
    name: str
    device_type: str = Field(..., pattern="^(desktop|mobile_inventory|mobile_pos)$")
    role: str = "operator"


class SyncChange(BaseModel):
    client_id: str
    table_name: str
    record_id: str
    operation: str
    payload: Dict[str, Any]
    client_updated_at: str


class SyncPushRequest(BaseModel):
    changes: List[SyncChange]


class SyncPullRequest(BaseModel):
    since: Optional[str] = None
    tables: Optional[List[str]] = None


def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def _verify_token(authorization: Optional[str] = Header(None)) -> Dict[str, str]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    conn = get_conn()
    row = conn.execute(
        "SELECT id, tenant_id, role, device_type FROM devices WHERE api_token = ?",
        (token,),
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid token")
    return {
        "device_id": row["id"],
        "tenant_id": row["tenant_id"],
        "role": row["role"],
        "device_type": row["device_type"],
    }


@app.get("/api/v1/health")
def health() -> Dict[str, Any]:
    return {"status": "ok", "service": "tracinvent-sync-api", "version": "1.0.0"}


@app.post("/api/v1/auth/login")
def login(body: LoginRequest) -> Dict[str, Any]:
    conn = get_conn()
    row = conn.execute(
        "SELECT u.*, t.name as tenant_name FROM users u JOIN tenants t ON t.id = u.tenant_id "
        "WHERE u.username = ? AND u.password_hash = ? AND u.is_active = 1",
        (body.username, _hash_password(body.password)),
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {
        "tenant_id": row["tenant_id"],
        "tenant_name": row["tenant_name"],
        "user_id": row["id"],
        "username": row["username"],
        "role": row["role"],
    }


@app.post("/api/v1/devices/register")
def register_device(body: DeviceRegisterRequest, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    # Requires prior login context via tenant header for simplicity in dev
    tenant_id = None
    if authorization and authorization.startswith("Bearer "):
        ctx = _verify_token(authorization)
        tenant_id = ctx["tenant_id"]
    if not tenant_id:
        # Dev fallback: first tenant
        conn = get_conn()
        row = conn.execute("SELECT id FROM tenants LIMIT 1").fetchone()
        conn.close()
        if not row:
            raise HTTPException(status_code=400, detail="No tenant configured")
        tenant_id = row["id"]

    device_id = str(uuid.uuid4())
    token = str(uuid.uuid4()).replace("-", "")
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    conn.execute(
        "INSERT INTO devices (id, tenant_id, name, device_type, api_token, role, last_seen_at, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (device_id, tenant_id, body.name, body.device_type, token, body.role, now, now),
    )
    conn.commit()
    conn.close()
    return {"device_id": device_id, "api_token": token, "tenant_id": tenant_id}


def _apply_change(tenant_id: str, device_id: str, change: SyncChange) -> str:
    idempotency = f"{device_id}:{change.client_id}"
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    try:
        existing = conn.execute(
            "SELECT id FROM sync_changes WHERE idempotency_key = ?", (idempotency,)
        ).fetchone()
        if existing:
            return "duplicate"

        if change.operation == "delete":
            conn.execute(
                "UPDATE entity_store SET deleted = 1, updated_at = ? "
                "WHERE tenant_id = ? AND table_name = ? AND record_id = ?",
                (now, tenant_id, change.table_name, change.record_id),
            )
        else:
            conn.execute(
                "INSERT INTO entity_store (tenant_id, table_name, record_id, payload, updated_at, deleted) "
                "VALUES (?, ?, ?, ?, ?, 0) "
                "ON CONFLICT(tenant_id, table_name, record_id) DO UPDATE SET "
                "payload = excluded.payload, updated_at = excluded.updated_at, deleted = 0",
                (tenant_id, change.table_name, change.record_id, json.dumps(change.payload), now),
            )

        conn.execute(
            "INSERT INTO sync_changes (id, tenant_id, device_id, table_name, record_id, operation, "
            "payload, client_updated_at, server_applied_at, idempotency_key) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                str(uuid.uuid4()),
                tenant_id,
                device_id,
                change.table_name,
                change.record_id,
                change.operation,
                json.dumps(change.payload),
                change.client_updated_at,
                now,
                idempotency,
            ),
        )
        conn.commit()
        return "applied"
    finally:
        conn.close()


@app.post("/api/v1/sync/push")
def sync_push(body: SyncPushRequest, ctx: Dict[str, str] = Depends(_verify_token)) -> Dict[str, Any]:
    results = []
    for change in body.changes:
        if change.table_name not in SYNC_TABLES:
            results.append({"client_id": change.client_id, "status": "rejected", "reason": "unknown_table"})
            continue
        status = _apply_change(ctx["tenant_id"], ctx["device_id"], change)
        results.append({"client_id": change.client_id, "status": status})

    conn = get_conn()
    conn.execute("UPDATE devices SET last_seen_at = ? WHERE id = ?", (datetime.utcnow().isoformat(), ctx["device_id"]))
    conn.commit()
    conn.close()
    return {"results": results, "server_time": datetime.utcnow().isoformat()}


@app.post("/api/v1/sync/pull")
def sync_pull(body: SyncPullRequest, ctx: Dict[str, str] = Depends(_verify_token)) -> Dict[str, Any]:
    since = body.since or (datetime.utcnow() - timedelta(days=365)).isoformat()
    tables = body.tables or SYNC_TABLES
    conn = get_conn()
    changes: Dict[str, List[Dict[str, Any]]] = {}
    deleted: Dict[str, List[str]] = {}

    for table in tables:
        rows = conn.execute(
            "SELECT record_id, payload, deleted FROM entity_store "
            "WHERE tenant_id = ? AND table_name = ? AND updated_at > ?",
            (ctx["tenant_id"], table, since),
        ).fetchall()
        upserts = []
        dels = []
        for r in rows:
            if r["deleted"]:
                dels.append(r["record_id"])
            else:
                upserts.append(json.loads(r["payload"]))
        if upserts:
            changes[table] = upserts
        if dels:
            deleted[table] = dels

    conn.execute("UPDATE devices SET last_seen_at = ? WHERE id = ?", (datetime.utcnow().isoformat(), ctx["device_id"]))
    conn.commit()
    conn.close()
    return {"server_time": datetime.utcnow().isoformat(), "changes": changes, "deleted": deleted}


@app.get("/api/v1/updates/manifest")
def update_manifest() -> Dict[str, Any]:
    """Secure update manifest — min version, force update flag, checksum."""
    return {
        "min_version": os.getenv("TRACINVENT_MIN_VERSION", "1.0.0"),
        "latest_version": os.getenv("TRACINVENT_LATEST_VERSION", "1.0.0"),
        "force_update": os.getenv("TRACINVENT_FORCE_UPDATE", "false").lower() == "true",
        "download_url": os.getenv("TRACINVENT_DOWNLOAD_URL"),
        "checksum_sha256": os.getenv("TRACINVENT_CHECKSUM_SHA256"),
        "release_notes": os.getenv("TRACINVENT_RELEASE_NOTES", "Bug fixes and improvements"),
    }


@app.post("/api/v1/licenses/validate")
def validate_license(body: Dict[str, Any]) -> Dict[str, Any]:
    """Online license validation (optional — app validates offline by default)."""
    license_key = body.get("license_key", "")
    device_fingerprint = body.get("device_fingerprint", "")
    if not license_key:
        raise HTTPException(status_code=400, detail="license_key required")
    return {
        "valid": True,
        "device_fingerprint": device_fingerprint,
        "message": "Online validation stub — use signed keys for offline activation",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
