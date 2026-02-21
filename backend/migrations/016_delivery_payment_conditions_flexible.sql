BEGIN;

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_condition_chk;
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_delivery_payment_chk;

ALTER TABLE sales
ADD CONSTRAINT sales_payment_condition_chk
CHECK (
  payment_condition IS NULL
  OR payment_condition ~ '^[A-Z0-9_]{3,64}$'
);

ALTER TABLE sales
ADD CONSTRAINT sales_delivery_payment_chk
CHECK (
  delivery_payment IS NULL
  OR delivery_payment ~ '^[A-Z0-9_]{3,64}$'
);

UPDATE sales
SET payment_condition = 'PAGO_ENTREGA_TRANSFERENCIA'
WHERE payment_condition = 'PAGO_LOCAL_TRANSFERENCIA';

UPDATE sales
SET delivery_payment = 'PAGO_ENTREGA_TRANSFERENCIA'
WHERE delivery_payment = 'PAGO_LOCAL_TRANSFERENCIA';

COMMIT;

