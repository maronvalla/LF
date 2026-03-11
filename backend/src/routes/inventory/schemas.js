const { z } = require("zod");

const transferSchema = z.object({
  productId: z.string().uuid(),
  qty: z.number().positive(),
  fromCode: z.string().trim().min(2).max(60),
  toCode: z.string().trim().min(2).max(60),
});

const adjustSchema = z.object({
  productId: z.string().uuid(),
  qtyDelta: z.number().refine((value) => value !== 0, "qtyDelta no puede ser 0"),
  locationCode: z.enum(["GALPON", "LOCAL"]),
  reason: z.enum(["AJUSTE_INICIAL", "AJUSTE"]),
});

const expireSchema = z.object({
  productId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  locationCode: z.string().trim().min(2).max(60),
  expirationDate: z.string().date().optional().nullable(),
  notes: z.string().trim().max(300).optional().nullable(),
});

const startStockControlSchema = z.object({
  startLocationCode: z.enum(["LOCAL", "GALPON"]),
});

const saveLocationCountsSchema = z.object({
  locationCode: z.enum(["LOCAL", "GALPON"]),
  stopAfterThis: z.boolean().optional().default(false),
  counts: z
    .array(
      z.object({
        productId: z.string().trim().min(1).max(120),
        actualQty: z.coerce.number().nonnegative(),
      })
    )
    .min(1),
});

module.exports = {
  transferSchema,
  adjustSchema,
  expireSchema,
  startStockControlSchema,
  saveLocationCountsSchema,
};
