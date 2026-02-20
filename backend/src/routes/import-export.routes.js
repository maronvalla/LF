const express = require("express");
const multer = require("multer");
const { asyncHandler } = require("../utils/async-handler");
const { logAudit } = require("../services/audit");
const importExportService = require("../services/import-export.service");
const { isAdmin } = require("../middleware/rbac");

const router = express.Router();

function requireAdminOnly(req, res, next) {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: "Solo ADMIN puede importar o exportar datos" });
  }
  return next();
}

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedExtensions = [".csv", ".xlsx", ".xls"];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf("."));
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten archivos CSV o Excel (.xlsx, .xls)"), false);
    }
  },
});

// GET /api/import-export/template/:entity - Download CSV template
router.get(
  "/template/:entity",
  requireAdminOnly,
  asyncHandler(async (req, res) => {
    const { entity } = req.params;
    const format = req.query.format || "csv";

    if (!["products", "customers", "suppliers"].includes(entity)) {
      return res.status(400).json({ message: "Entidad no soportada" });
    }

    if (format === "xlsx") {
      const buffer = importExportService.generateTemplateExcel(entity);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${entity}_plantilla.xlsx"`);
      res.send(buffer);
    } else {
      const csv = await importExportService.generateTemplate(entity);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${entity}_plantilla.csv"`);
      res.send(csv);
    }
  })
);

// GET /api/import-export/export/:entity - Export data
router.get(
  "/export/:entity",
  requireAdminOnly,
  asyncHandler(async (req, res) => {
    const { entity } = req.params;
    const format = req.query.format || "csv";

    if (!["products", "customers", "suppliers"].includes(entity)) {
      return res.status(400).json({ message: "Entidad no soportada" });
    }

    const dateStr = new Date().toISOString().slice(0, 10);

    await logAudit({
      actorUserId: req.user.id,
      action: `${entity.toUpperCase()}_EXPORT`,
      entity: entity,
      entityId: null,
      metadata: { type: format === "xlsx" ? "excel_export" : "csv_export" },
    });

    if (format === "xlsx") {
      const buffer = await importExportService.exportDataExcel(entity);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${entity}_export_${dateStr}.xlsx"`);
      res.send(buffer);
    } else {
      const csv = await importExportService.exportData(entity);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${entity}_export_${dateStr}.csv"`);
      res.send(csv);
    }
  })
);

// POST /api/import-export/validate/:entity - Validate file without importing
router.post(
  "/validate/:entity",
  requireAdminOnly,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const { entity } = req.params;

    if (!["products", "customers", "suppliers"].includes(entity)) {
      return res.status(400).json({ message: "Entidad no soportada" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Archivo requerido (CSV o Excel)" });
    }

    const result = await importExportService.validateImport(entity, req.file.buffer, req.file.originalname);
    res.json(result);
  })
);

// POST /api/import-export/import/:entity - Import data from file
router.post(
  "/import/:entity",
  requireAdminOnly,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const { entity } = req.params;

    if (!["products", "customers", "suppliers"].includes(entity)) {
      return res.status(400).json({ message: "Entidad no soportada" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Archivo requerido (CSV o Excel)" });
    }

    const result = await importExportService.importData(entity, req.file.buffer, req.file.originalname, req.user.id);

    await logAudit({
      actorUserId: req.user.id,
      action: `${entity.toUpperCase()}_IMPORT`,
      entity: entity,
      entityId: null,
      metadata: {
        type: req.file.originalname.endsWith(".xlsx") ? "excel_import" : "csv_import",
        summary: result.summary,
      },
    });

    res.json(result);
  })
);

module.exports = router;
