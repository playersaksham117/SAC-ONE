import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// ERP modules (owned by sacone-api)
import { getDb, resetDb, blankDb, initMasterDb, getDbMode } from "./erp/db.mjs";
import { executeQuery, executeRpc } from "./erp/queryEngine.mjs";
import { handlePosSyncHttp } from "./erp/posSyncApi.mjs";
import { handlePosCorsPreflight } from "./erp/posSyncCors.mjs";
import { isPosSyncPath } from "./erp/posSyncRoutes.mjs";
import { handleRbacHttp } from "./erp/rbacApi.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Stay in sacone-api — Prisma, uploads, and ERP all resolve here
process.chdir(__dirname);

dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, ".env.local") });

const app = express();
const PORT = Number(process.env.SACONE_API_PORT || 4000);

// Initialize master PostgreSQL (or pg-mem fallback) before routes
await initMasterDb();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  "/uploads",
  express.static(path.join(__dirname, "public", "uploads"))
);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "sacone-api",
    modules: ["erp", "webstore-api"],
  });
});

// ─── ERP (SACONE) routes ───────────────────────────────────────────────────
app.get("/api/db/health", (_req, res) => {
  getDb();
  res.json({ ok: true, mode: getDbMode() });
});

/** Dump all ERP tables as JSON (for SQLite master / Mongo sync). */
app.get("/api/db/export-json", (_req, res) => {
  try {
    const db = getDb();
    const tables = [
      "users",
      "app_settings",
      "product_categories",
      "warehouses",
      "storage_locations",
      "inventory_items",
      "stock",
      "stock_movements",
      "stock_adjustments",
      "transactions",
      "suppliers",
      "customer_groups",
      "customers",
      "party_contacts",
      "party_notes",
      "crm_follow_ups",
      "vendor_price_history",
      "vendor_ratings",
      "purchase_orders",
      "purchase_order_items",
      "sales",
      "sale_items",
      "ledger_entries",
      "roles",
      "permissions",
      "role_permissions",
      "user_roles",
      "approval_requests",
      "approval_history",
      "audit_logs",
      "cash_register_sessions",
    ];
    const out: Record<string, unknown[]> = {};
    for (const table of tables) {
      try {
        out[table] = db.prepare(`SELECT * FROM ${table}`).all();
      } catch {
        out[table] = [];
      }
    }
    res.json({
      ok: true,
      exportedAt: new Date().toISOString(),
      mode: getDbMode(),
      tables: out,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: String((err as Error)?.message || err),
    });
  }
});

app.post("/api/db/query", (req, res) => {
  const userId = req.headers["x-user-id"] as string | undefined;
  const result = executeQuery(req.body, { userId });
  res.json(result);
});

app.post("/api/db/rpc/:name", (req, res) => {
  const result = executeRpc(req.params.name, req.body || {});
  res.json(result);
});

app.post("/api/db/reset", (req, res) => {
  const blank = req.body?.mode === "blank" || req.body?.blank === true;
  if (blank) blankDb();
  else resetDb();
  res.json({
    ok: true,
    message: blank
      ? "Database cleared — add your own products and warehouses"
      : "Demo database reset with seed data",
  });
});

app.use((req, res, next) => {
  if (!isPosSyncPath(req.path)) return next();
  if (handlePosCorsPreflight(req, res)) return;
  handlePosSyncHttp(
    req,
    res,
    req.body,
    req.originalUrl || req.path,
    req.method
  );
});

app.use("/api/rbac", (req, res) => {
  handleRbacHttp(
    req,
    res,
    req.body,
    req.path ? `/api/rbac${req.path}` : "/api/rbac",
    req.method || "GET",
    req.originalUrl
  );
});

// Legacy POS sync alias
app.post("/api/pos/sync", (req, res) => {
  handlePosSyncHttp(req, res, req.body);
});

// ─── Web Store routes ─────────────────────────────────────────────────────
const { registerStoreRoutes } = await import("./store/register.ts");
await registerStoreRoutes(app);

app.listen(PORT, () => {
  getDb();
  console.log(`[sacone-api] Unified REST API at http://localhost:${PORT}`);
  console.log(`[sacone-api] Database: ${getDbMode()}`);
  console.log(`[sacone-api] ERP: /api/db/*, /api/rbac/*, /api/v1/sync/*`);
  console.log(`[sacone-api] Store: /api/store/*, /api/orders, /api/admin/*`);
});
