-- Agrega los dos precios de venta (detal y mayor) a products.
-- Se crean con DEFAULT 0 para que las filas existentes no violen el NOT NULL,
-- luego se rellenan con el precio de venta actual y por ultimo se quita el
-- default para que toda fila nueva tenga que traer ambos valores explicitos.

ALTER TABLE "Product" ADD COLUMN "precio_detal" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN "precio_mayor" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- Backfill: ambos toman el precio de venta actual (0 si no hubiera).
UPDATE "Product"
SET "precio_detal" = COALESCE("salePrice", 0),
    "precio_mayor" = COALESCE("salePrice", 0);

-- Producto 001001: el precio mayor queda como el que ya tenia y el detal en 120000.
UPDATE "Product"
SET "precio_detal" = 120000
WHERE "barcode" = '001001';

ALTER TABLE "Product" ALTER COLUMN "precio_detal" DROP DEFAULT;
ALTER TABLE "Product" ALTER COLUMN "precio_mayor" DROP DEFAULT;
