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
}
