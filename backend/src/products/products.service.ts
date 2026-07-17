import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProductDto) {
    const existing = await this.prisma.product.findUnique({
      where: { barcode: dto.barcode },
    });
    if (existing) {
      throw new ConflictException(
        'Ya existe un producto con ese código de barras',
      );
    }

    const product = await this.prisma.product.create({
      data: dto,
      include: { category: true },
    });
    return JSON.parse(JSON.stringify(product)) as typeof product;
  }

  async findAll() {
    const products = await this.prisma.product.findMany({
      include: {
        category: true,
        inventories: { include: { branch: true } },
      },
    });
    return JSON.parse(JSON.stringify(products)) as typeof products;
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true, inventories: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return JSON.parse(JSON.stringify(product)) as typeof product;
  }

  async findByBarcode(barcode: string) {
    const product = await this.prisma.product.findUnique({
      where: { barcode },
      include: { category: true, inventories: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return JSON.parse(JSON.stringify(product)) as typeof product;
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);

    if (dto.barcode) {
      const existing = await this.prisma.product.findUnique({
        where: { barcode: dto.barcode },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(
          'Ya existe un producto con ese código de barras',
        );
      }
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: dto,
      include: { category: true },
    });
    return JSON.parse(JSON.stringify(product)) as typeof product;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.product.delete({ where: { id } });
    return { message: 'Producto eliminado' };
  }
}
