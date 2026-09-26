import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateReturnDto {
  // Línea de la venta que se devuelve (la venta y el producto salen de ahí).
  @IsUUID()
  saleDetailId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  // Cómo se le devuelve el dinero al cliente. Solo el efectivo sale de la caja.
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  reason?: string;

  // Solo para el admin; al cajero siempre se le usa su propia sede.
  @IsUUID()
  @IsOptional()
  branchId?: string;
}
