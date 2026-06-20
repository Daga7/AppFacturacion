import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as bcrypt from "bcrypt";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10);

  const company = await prisma.company.create({
    data: {
      name: 'Comercializadora XYZ',
    },
  });

  const branchOcana = await prisma.branch.create({
    data: {
      name: 'Ocaña',
      companyId: company.id,
    },
  });

  const branchAguachica = await prisma.branch.create({
    data: {
      name: 'Aguachica',
      companyId: company.id,
    },
  });

  await prisma.user.create({
    data: {
      username: 'admin',
      passwordHash,
      role: 'ADMIN',
      branchId: branchOcana.id,
    },
  });
}

main()
  .then(() => {
    console.log('Seed completado');
  })
  .catch((error) => {
    console.error(error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });