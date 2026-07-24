import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';

// Agrega una recomendación automática a la lista de compras guardada. La
// cantidad la decide el vendedor (obligatoria, mínimo 1); el sistema no la
// impone.
export class AddRecommendationDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  branchId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  @IsOptional()
  note?: string;
}
