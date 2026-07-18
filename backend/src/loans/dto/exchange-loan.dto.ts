import {
  IsArray,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsUUID,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ExchangeItemDto {
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice: number;
}

// Cambio de mercancía en un préstamo: los productos nuevos reemplazan por
// completo a los actuales; el saldo se recalcula.
export class ExchangeLoanDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExchangeItemDto)
  details: ExchangeItemDto[];
}
