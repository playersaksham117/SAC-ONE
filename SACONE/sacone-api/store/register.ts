import type { Express } from "express";
import multer from "multer";
import { wrapRoute, wrapUploadRoute } from "./bridge.ts";

const upload = multer({ storage: multer.memoryStorage() });

export async function registerStoreRoutes(app: Express) {
  const [
    ordersRoute,
    orderInvoiceRoute,
    cartsRoute,
    quotesRoute,
    quotePdfRoute,
    quoteEmailRoute,
    adminLoginRoute,
    adminLogoutRoute,
    adminMeRoute,
    adminDashboardRoute,
    adminProductsRoute,
    adminProductIdRoute,
    adminProductSyncRoute,
    adminProductImportRoute,
    adminProductUploadRoute,
    adminOrdersRoute,
    adminOrderIdRoute,
    adminCustomersRoute,
    adminCustomerIdRoute,
    adminQuotesRoute,
    adminQuoteIdRoute,
    adminReportsRoute,
    adminReportsExportRoute,
    adminSettingsRoute,
    webstoreInventoryRoute,
    storeProductsRoute,
    storeStockRoute,
    storeHealthRoute,
    storeRegisterRoute,
  ] = await Promise.all([
    import("./api/orders/route.ts"),
    import("./api/orders/[id]/invoice/route.ts"),
    import("./api/carts/route.ts"),
    import("./api/quotes/route.ts"),
    import("./api/quotes/[id]/pdf/route.ts"),
    import("./api/quotes/[id]/email/route.ts"),
    import("./api/admin/auth/login/route.ts"),
    import("./api/admin/auth/logout/route.ts"),
    import("./api/admin/auth/me/route.ts"),
    import("./api/admin/dashboard/route.ts"),
    import("./api/admin/products/route.ts"),
    import("./api/admin/products/[id]/route.ts"),
    import("./api/admin/products/sync/route.ts"),
    import("./api/admin/products/import/route.ts"),
    import("./api/admin/products/upload/route.ts"),
    import("./api/admin/orders/route.ts"),
    import("./api/admin/orders/[id]/route.ts"),
    import("./api/admin/customers/route.ts"),
    import("./api/admin/customers/[id]/route.ts"),
    import("./api/admin/quotes/route.ts"),
    import("./api/admin/quotes/[id]/route.ts"),
    import("./api/admin/reports/route.ts"),
    import("./api/admin/reports/export/route.ts"),
    import("./api/admin/settings/route.ts"),
    import("./api/v1/webstore/inventory/route.ts"),
    import("./api/store/products/route.ts"),
    import("./api/store/stock/route.ts"),
    import("./api/store/health/route.ts"),
    import("./api/store/register/route.ts"),
  ]);

  app.get("/api/store/products", wrapRoute(storeProductsRoute.GET));
  app.get("/api/store/stock", wrapRoute(storeStockRoute.GET));
  app.get("/api/store/health", wrapRoute(storeHealthRoute.GET));
  app.post("/api/store/register", wrapRoute(storeRegisterRoute.POST));

  app.get("/api/orders", wrapRoute(ordersRoute.GET));
  app.post("/api/orders", wrapRoute(ordersRoute.POST));
  app.get("/api/orders/:id/invoice", wrapRoute(orderInvoiceRoute.GET));

  app.get("/api/carts", wrapRoute(cartsRoute.GET));
  app.post("/api/carts", wrapRoute(cartsRoute.POST));

  app.get("/api/quotes", wrapRoute(quotesRoute.GET));
  app.post("/api/quotes", wrapRoute(quotesRoute.POST));
  app.get("/api/quotes/:id/pdf", wrapRoute(quotePdfRoute.GET));
  app.post("/api/quotes/:id/email", wrapRoute(quoteEmailRoute.POST));

  app.post("/api/admin/auth/login", wrapRoute(adminLoginRoute.POST));
  app.post("/api/admin/auth/logout", wrapRoute(adminLogoutRoute.POST));
  app.get("/api/admin/auth/me", wrapRoute(adminMeRoute.GET));

  app.get("/api/admin/dashboard", wrapRoute(adminDashboardRoute.GET));

  app.get("/api/admin/products", wrapRoute(adminProductsRoute.GET));
  app.post("/api/admin/products", wrapRoute(adminProductsRoute.POST));
  app.post("/api/admin/products/sync", wrapRoute(adminProductSyncRoute.POST));
  app.post("/api/admin/products/import", wrapRoute(adminProductImportRoute.POST));
  app.post(
    "/api/admin/products/upload",
    upload.single("file"),
    wrapUploadRoute(adminProductUploadRoute.POST)
  );
  app.get("/api/admin/products/:id", wrapRoute(adminProductIdRoute.GET));
  app.put("/api/admin/products/:id", wrapRoute(adminProductIdRoute.PUT));
  app.delete("/api/admin/products/:id", wrapRoute(adminProductIdRoute.DELETE));

  app.get("/api/admin/orders", wrapRoute(adminOrdersRoute.GET));
  app.get("/api/admin/orders/:id", wrapRoute(adminOrderIdRoute.GET));
  app.patch("/api/admin/orders/:id", wrapRoute(adminOrderIdRoute.PATCH));

  app.get("/api/admin/customers", wrapRoute(adminCustomersRoute.GET));
  app.get("/api/admin/customers/:id", wrapRoute(adminCustomerIdRoute.GET));
  app.put("/api/admin/customers/:id", wrapRoute(adminCustomerIdRoute.PUT));

  app.get("/api/admin/quotes", wrapRoute(adminQuotesRoute.GET));
  app.get("/api/admin/quotes/:id", wrapRoute(adminQuoteIdRoute.GET));
  app.patch("/api/admin/quotes/:id", wrapRoute(adminQuoteIdRoute.PATCH));
  app.post("/api/admin/quotes/:id", wrapRoute(adminQuoteIdRoute.POST));

  app.get("/api/admin/reports", wrapRoute(adminReportsRoute.GET));
  app.get("/api/admin/reports/export", wrapRoute(adminReportsExportRoute.GET));

  app.get("/api/admin/settings", wrapRoute(adminSettingsRoute.GET));
  app.put("/api/admin/settings", wrapRoute(adminSettingsRoute.PUT));

  app.get(
    "/api/v1/webstore/inventory",
    wrapRoute(webstoreInventoryRoute.GET)
  );
}
