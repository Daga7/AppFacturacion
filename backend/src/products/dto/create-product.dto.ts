import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
  IsNotEmpty,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  barcode: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  purchasePrice: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salePrice: number;

  // Ambos precios son obligatorios y deben ser mayores a 0.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'El precio detal debe ser mayor a 0' })
  retailPrice: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'El precio mayor debe ser mayor a 0' })
  wholesalePrice: number;

  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
