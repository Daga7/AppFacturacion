import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateWarrantyDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  // Falla que presenta la mercancía.
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason: string;

  // Proveedor al que se le devuelve (opcional).
  @IsString()
  @IsOptional()
  @MaxLength(120)
  supplier?: string;

  // Solo para el admin; al vendedor siempre se le usa su propia sede.
  @IsUUID()
  @IsOptional()
  branchId?: string;
}
