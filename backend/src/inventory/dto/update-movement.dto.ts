import { IsString, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateMovementDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  note?: string;
}
