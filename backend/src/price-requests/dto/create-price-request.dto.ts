import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class CreatePriceRequestDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  suggestedPrice: number;

  @IsString()
  @IsOptional()
  reason?: string;
}
