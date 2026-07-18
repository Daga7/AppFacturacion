import { IsNumber, IsString, IsOptional, Min } from 'class-validator';

export class OpenCashDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingAmount: number;

  // Solo la usa el ADMIN; al cajero se le fuerza su propia sede.
  @IsString()
  @IsOptional()
  branchId?: string;
}
