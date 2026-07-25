import { IsString, IsNotEmpty, IsInt, Min, IsOptional } from 'class-validator';

export class CreateTransferRequestDto {
  // El origen lo fija el servidor a partir de la sede del usuario (obligatorio
  // para el vendedor), así que el frontend no lo envía. Opcional en el DTO para
  // que la validación no rechace la petición antes de que el controlador lo
  // rellene con scopedBranchId.
  @IsString()
  @IsOptional()
  fromBranchId?: string;

  @IsString()
  @IsNotEmpty()
  toBranchId: string;

  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  @IsOptional()
  note?: string;
}
