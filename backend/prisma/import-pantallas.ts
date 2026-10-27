/**
 * Carga las pantallas de AGUACHICA.xlsx (hoja "Pantallas") como productos,
 * con 50 unidades de inventario inicial en la sucursal Aguachica.
 *
 * Uso:
 *   pnpm exec ts-node --compilerOptions '{"module":"commonjs","moduleResolution":"node"}' prisma/import-pantallas.ts          # dry-run
 *   pnpm exec ts-node --compilerOptions '{"module":"commonjs","moduleResolution":"node"}' prisma/import-pantallas.ts --apply  # escribe
 *
 * Es idempotente: identifica cada producto por su `barcode`, así que
 * re-ejecutarlo actualiza en vez de duplicar.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';

const APPLY = process.argv.includes('--apply');
const BRANCH_NAME = 'Aguachica';
const CATEGORY_NAME = 'Pantallas';
const STOCK = 50;

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

type Item = { barcode: string; name: string; salePrice: number };

async function main() {
  const items: Item[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'pantallas.json'), 'utf8'),
  );
  console.log(`Leídos ${items.length} productos del archivo.`);

  const branch = await prisma.branch.findFirst({ where: { name: BRANCH_NAME } });
  if (!branch) throw new Error(`No existe la sucursal "${BRANCH_NAME}".`);

  let category = await prisma.category.findFirst({ where: { name: CATEGORY_NAME } });
  if (!category) {
    console.log(`Categoría "${CATEGORY_NAME}" no existe -> se creará.`);
    if (APPLY) category = await prisma.category.create({ data: { name: CATEGORY_NAME } });
  }

  const existing = await prisma.product.findMany({
    where: { barcode: { in: items.map((i) => i.barcode) } },
    select: { barcode: true },
  });
  const known = new Set(existing.map((p) => p.barcode));
  const nuevos = items.filter((i) => !known.has(i.barcode)).length;

  console.log(`  nuevos:       ${nuevos}`);
  console.log(`  ya existentes: ${items.length - nuevos} (se actualizarán)`);
  console.log(`  sucursal:     ${branch.name}  ·  stock por producto: ${STOCK}`);

  if (!APPLY) {
    console.log('\n-- DRY RUN: no se escribió nada. Añade --apply para ejecutar. --');
    console.table(items.slice(0, 5));
    return;
  }

  let n = 0;
  for (const it of items) {
    const product = await prisma.product.upsert({
      where: { barcode: it.barcode },
      // En productos que ya existen NO se tocan retailPrice ni wholesalePrice:
      // los define la persona encargada y sobrescribirlos borraría su trabajo.
      update: {
        name: it.name,
        salePrice: it.salePrice,
        categoryId: category!.id,
      },
      create: {
        barcode: it.barcode,
        name: it.name,
        purchasePrice: 0,
        salePrice: it.salePrice,
        retailPrice: it.salePrice,
        wholesalePrice: 0,
        categoryId: category!.id,
      },
    });

    await prisma.inventory.upsert({
      where: { branchId_productId: { branchId: branch.id, productId: product.id } },
      update: { amount: STOCK },
      create: { branchId: branch.id, productId: product.id, amount: STOCK },
    });

    if (++n % 100 === 0) console.log(`  ... ${n}/${items.length}`);
  }
  console.log(`\nListo: ${n} productos cargados con ${STOCK} unidades en ${branch.name}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
