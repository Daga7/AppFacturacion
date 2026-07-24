import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsEnum,
  IsDateString,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateSpecialOrderDto {
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsString()
  @IsNotEmpty()
  partName: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  totalAmount: number;

  // Abono inicial. Puede ser 0 (aún sin abonar); si es > 0 se exige método.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  depositAmount: number;

  @ValidateIf((o: CreateSpecialOrderDto) => o.depositAmount > 0)
  @IsEnum(PaymentMethod)
  depositMethod?: PaymentMethod;

  @IsDateString()
  @IsOptional()
  estimatedArrival?: string;

  // El vendedor no la envía (se toma su sede); el admin sí puede elegirla.
  @IsString()
  @IsOptional()
  branchId?: string;
}
