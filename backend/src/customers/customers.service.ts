import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async findAll(branchId?: string) {
    const customers = await this.prisma.customer.findMany({
      where: branchId ? { branchId } : {},
      include: { branch: true },
      orderBy: { firstName: 'asc' },
    });
    return JSON.parse(JSON.stringify(customers)) as typeof customers;
  }

  async create(dto: CreateCustomerDto) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId },
    });
    if (!branch) throw new NotFoundException('Sucursal no encontrada');

    const customer = await this.prisma.customer.create({
      data: dto,
      include: { branch: true },
    });
    return JSON.parse(JSON.stringify(customer)) as typeof customer;
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Cliente no encontrado');

    const customer = await this.prisma.customer.update({
      where: { id },
      data: dto,
      include: { branch: true },
    });
    return JSON.parse(JSON.stringify(customer)) as typeof customer;
  }

  // Borrado total del cliente y todo lo que dependa de él: ventas, detalles,
  // pagos, préstamos, abonos y los movimientos de inventario que quedaron
  // ligados a esas ventas. Es irreversible y solo lo puede pedir un ADMIN
  // (ver guard en el controller). No se toca Inventory.amount: el stock ya
  // se movió cuando ocurrió la venta y revertirlo es una decisión aparte.
  async remove(id: string) {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Cliente no encontrado');

    await this.prisma.$transaction(async (tx) => {
      const sales = await tx.sale.findMany({
        where: { customerId: id },
        select: { id: true },
      });
      const saleIds = sales.map((s) => s.id);

      const details = await tx.saleDetail.findMany({
        where: { saleId: { in: saleIds } },
        select: { id: true },
      });
      const detailIds = details.map((d) => d.id);

      const loans = await tx.loan.findMany({
        where: { customerId: id },
        select: { id: true },
      });
      const loanIds = loans.map((l) => l.id);

      await tx.loanPayment.deleteMany({ where: { loanId: { in: loanIds } } });
      await tx.loan.deleteMany({ where: { customerId: id } });
      await tx.inventoryMovement.deleteMany({
        where: { saleDetailId: { in: detailIds } },
      });
      await tx.salePayment.deleteMany({ where: { saleId: { in: saleIds } } });
      await tx.saleReturn.deleteMany({ where: { saleId: { in: saleIds } } });
      await tx.saleDetail.deleteMany({ where: { saleId: { in: saleIds } } });
      await tx.sale.deleteMany({ where: { customerId: id } });
      await tx.customer.delete({ where: { id } });
    });

    return { deleted: true };
  }
}
