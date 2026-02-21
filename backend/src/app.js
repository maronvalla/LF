const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const { authRequired } = require("./middleware/auth");
const authRoutes = require("./routes/auth.routes");
const usersRoutes = require("./routes/users.routes");
const customersRoutes = require("./routes/customers.routes");
const productsRoutes = require("./routes/products.routes");
const inventoryRoutes = require("./routes/inventory.routes");
const salesRoutes = require("./routes/sales.routes");
const deliveriesRoutes = require("./routes/deliveries.routes");
const enviosRoutes = require("./routes/envios.routes");
const rutasRoutes = require("./routes/rutas.routes");
const auditRoutes = require("./routes/audit.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const suppliersRoutes = require("./routes/suppliers.routes");
const purchasesRoutes = require("./routes/purchases.routes");
const categoriesRoutes = require("./routes/categories.routes");
const brandsRoutes = require("./routes/brands.routes");
const rubrosRoutes = require("./routes/rubros.routes");
const importExportRoutes = require("./routes/import-export.routes");
const settingsRoutes = require("./routes/settings.routes");
const cajaRoutes = require("./routes/caja.routes");

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      // Permitir cualquier origen para desarrollo y uso móvil local
      return callback(null, true);
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/users", authRequired, usersRoutes);
app.use("/api/customers", authRequired, customersRoutes);
app.use("/api/products", authRequired, productsRoutes);
app.use("/api/inventory", authRequired, inventoryRoutes);
app.use("/api/sales", authRequired, salesRoutes);
app.use("/api/deliveries", authRequired, deliveriesRoutes);
app.use("/api/envios", authRequired, enviosRoutes);
app.use("/api/rutas", authRequired, rutasRoutes);
app.use("/api/audit", authRequired, auditRoutes);
app.use("/api/dashboard", authRequired, dashboardRoutes);
app.use("/api/suppliers", authRequired, suppliersRoutes);
app.use("/api/purchases", authRequired, purchasesRoutes);
app.use("/api/categories", authRequired, categoriesRoutes);
app.use("/api/brands", authRequired, brandsRoutes);
app.use("/api/rubros", authRequired, rubrosRoutes);
app.use("/api/import-export", authRequired, importExportRoutes);
app.use("/api/settings", authRequired, settingsRoutes);
app.use("/api/caja", authRequired, cajaRoutes);

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  console.error(err);
  res.status(status).json({ ok: false, message: err.message || "Error interno" });
});

module.exports = { app };
