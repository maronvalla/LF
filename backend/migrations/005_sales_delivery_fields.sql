-- Add delivery fields to sales table
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS payment_condition TEXT CHECK (payment_condition IN ('PAGADO_LOCAL', 'TRANSFER_PREVIA', 'COBRAR_EN_ENTREGA')),
ADD COLUMN IF NOT EXISTS delivery_address TEXT;
