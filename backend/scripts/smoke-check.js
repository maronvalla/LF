const fs = require("fs");
const path = require("path");
const assert = require("assert");

function checkEnviosRouteUniqueness() {
  const enviosRouter = require("../src/routes/envios.routes");
  const duplicates = enviosRouter.stack.filter(
    (layer) => layer?.route?.path === "/:sale_id/estado" && layer?.route?.methods?.patch
  );
  assert.strictEqual(
    duplicates.length,
    1,
    `Se esperaba 1 ruta PATCH /:sale_id/estado en envios.routes y hay ${duplicates.length}`
  );
}

function checkAppDashboardIntegrity() {
  const dashboardPath = path.join(__dirname, "../../desktop/src/components/Dashboard.jsx");
  const dashboardBlock = fs.readFileSync(dashboardPath, "utf8");
  assert.ok(
    !dashboardBlock.includes("LISTAS_PRECIO.includes"),
    "Dashboard contiene logica de listas de precio fuera de scope"
  );
  assert.ok(
    !dashboardBlock.includes("customers.find("),
    "Dashboard contiene referencias a customers fuera de scope"
  );
}

function checkBackendAppLoads() {
  const { app } = require("../src/app");
  assert.ok(app, "No se pudo inicializar backend/src/app");
}

try {
  checkBackendAppLoads();
  checkEnviosRouteUniqueness();
  checkAppDashboardIntegrity();
  console.log("Smoke check OK");
  process.exit(0);
} catch (err) {
  console.error("Smoke check FAILED:", err.message);
  process.exit(1);
}
