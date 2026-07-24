import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

// Agrega una recomendación automática a la lista de compras guardada.
export class AddRecommendationDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  branchId: string;

  @IsString()
  @IsOptional()
  note?: string;
}
