import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePriceRequestDto } from './dto/create-price-request.dto';

const REQUEST_INCLUDE = {
  product: { include: { category: true } },
  requestedBy: { select: { id: true, username: true } },
  resolvedBy: { select: { id: true, username: true } },
} as const;

@Injectable()
export class PriceRequestsService {
  constructor(private prisma: PrismaService) {}

  // El vendedor propone un nuevo precio. Se guarda el precio vigente como
  // referencia; el precio del producto NO cambia hasta que el admin apruebe.
  async create(dto: CreatePriceRequestDto, userId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    if (Math.abs(Number(product.salePrice) - dto.suggestedPrice) < 0.01) {
      throw new BadRequestException(
        'El precio sugerido es igual al precio actual',
      );
    }

    const request = await this.prisma.priceChangeRequest.create({
      data: {
        productId: dto.productId,
        currentPrice: product.salePrice,
        suggestedPrice: dto.suggestedPrice,
        reason: dto.reason?.trim() || null,
        requestedById: userId,
      },
      include: REQUEST_INCLUDE,
    });
    return JSON.parse(JSON.stringify(request)) as typeof request;
  }

  async findAll(status?: RequestStatus) {
    const requests = await this.prisma.priceChangeRequest.findMany({
      where: status ? { status } : {},
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return JSON.parse(JSON.stringify(requests)) as typeof requests;
  }

  async findOne(id: string) {
    const request = await this.prisma.priceChangeRequest.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    return JSON.parse(JSON.stringify(request)) as NonNullable<typeof request>;
  }

  // Aprobación (solo ADMIN): actualiza el precio del producto y registra quién
  // y cuándo, en una transacción.
  async approve(id: string, adminId: string) {
    const request = await this.prisma.priceChangeRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Esta solicitud ya fue resuelta');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: request.productId },
        data: { salePrice: request.suggestedPrice },
      });
      await tx.priceChangeRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          resolvedById: adminId,
          resolvedAt: new Date(),
        },
      });
    });

    return this.findOne(id);
  }

  // Rechazo (solo ADMIN): el precio permanece igual; solo se marca la solicitud.
  async reject(id: string, adminId: string) {
    const request = await this.prisma.priceChangeRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Esta solicitud ya fue resuelta');
    }

    await this.prisma.priceChangeRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        resolvedById: adminId,
        resolvedAt: new Date(),
      },
    });

    return this.findOne(id);
  }
}
