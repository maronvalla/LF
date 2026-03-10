const { z } = require("zod");

const deliveryConditionSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_]{3,64}$/)
  .nullable()
  .optional();

const createSaleSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  customerName: z.string().trim().min(1).max(200).nullable().optional(),
  sellerId: z.string().uuid().nullable().optional(),
  vendedorId: z.string().uuid().nullable().optional(),
  sellerName: z.string().trim().min(1).max(200).nullable().optional(),
  sellerNameSnapshot: z.string().trim().min(1).max(200).nullable().optional(),
  saleType: z.enum(["MOSTRADOR", "ENVIO"]),
  isDelivery: z.boolean().optional(),
  shift: z.enum(["MANIANA", "TARDE"]).nullable().optional(),
  deliverySlot: z.enum(["11", "19"]).nullable().optional(),
  scheduledDate: z.string().date().optional(),
  invoiceType: z.string().trim().min(1).max(80).optional(),
  paymentMethod: z.string().nullable().optional(),
  paymentCondition: deliveryConditionSchema,
  deliveryPayment: deliveryConditionSchema,
  deliveryPaymentMethod: z.enum(["EFECTIVO", "TRANSFERENCIA", "MIXTO"]).nullable().optional(),
  deliveryAddress: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        qty: z.number().positive(),
        unitPrice: z.number().int().nonnegative(),
      })
    )
    .min(1),
});

const cancelSaleSchema = z.object({
  reason: z.string().trim().min(3).max(300),
  overrideApprovedConsolidated: z.boolean().optional(),
});

const saleReturnSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  receiptPhotoBase64: z.string().optional().nullable(),
  receiptPhotoMimeType: z.string().optional().nullable(),
  receiptPhotoName: z.string().optional().nullable(),
  returnedItems: z
    .array(
      z.object({
        saleItemId: z.string().uuid(),
        qty: z.number().positive(),
      })
    )
    .min(1),
  replacementItems: z
    .array(
      z.object({
        productId: z.string().uuid(),
        qty: z.number().positive(),
        unitPrice: z.number().nonnegative(),
      })
    )
    .min(1),
  differencePayment: z
    .object({
      paymentMethod: z.enum(["EFECTIVO", "TRANSFERENCIA", "MIXTO"]),
      cashAmount: z.number().nonnegative().optional().default(0),
      transferAmount: z.number().nonnegative().optional().default(0),
      proofImageBase64: z.string().optional().nullable(),
      proofImageMimeType: z.string().optional().nullable(),
      proofImageName: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

const createBudgetSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  customerName: z.string().trim().min(1).max(200),
  customerPhone: z.string().trim().min(6).max(40),
  sellerName: z.string().trim().min(1).max(200).nullable().optional(),
  saleType: z.enum(["MOSTRADOR", "ENVIO"]),
  shift: z.enum(["MANIANA", "TARDE"]).nullable().optional(),
  scheduledDate: z.string().date().nullable().optional(),
  deliveryAddress: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  budgetNumber: z.string().trim().min(3).max(80),
  invoiceType: z.string().trim().min(1).max(80).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        qty: z.number().positive(),
        unitPrice: z.number().int().nonnegative(),
      })
    )
    .min(1),
});

const checkoutSaleSchema = z.object({
  paymentMethod: z.enum(["EFECTIVO", "TRANSFERENCIA", "MIXTO", "CUENTA_CORRIENTE"]),
  customerId: z.string().uuid().nullable().optional(),
  customerName: z.string().trim().min(1).max(200),
  notes: z.string().nullable().optional(),
  transferAmount: z.number().nonnegative().optional(),
  cashAmount: z.number().nonnegative().optional(),
  proofImageBase64: z.string().optional().nullable(),
  proofImageMimeType: z.string().optional().nullable(),
  proofImageName: z.string().optional().nullable(),
});

const deliveryPartialPlanSchema = z.object({
  paymentMethod: z.enum(["MIXTO"]),
  cashAmount: z.number().positive(),
  transferAmount: z.number().positive(),
});

module.exports = {
  createSaleSchema,
  cancelSaleSchema,
  saleReturnSchema,
  createBudgetSchema,
  checkoutSaleSchema,
  deliveryPartialPlanSchema,
};
