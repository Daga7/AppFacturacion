import { IsString, IsOptional, ValidateIf, IsNotEmpty } from 'class-validator';

// Ítem manual de la lista de compras. Debe traer al menos un productId (para
// referenciar un producto existente) o un label (texto libre) — se valida en
// el servicio. La nota es la observación del vendedor.
export class CreatePurchaseItemDto {
  @IsString()
  @IsOptional()
  productId?: string;

  @ValidateIf((o: CreatePurchaseItemDto) => !o.productId)
  @IsString()
  @IsNotEmpty()
  label?: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsString()
  @IsOptional()
  branchId?: string;
}
