import { IsString, IsNotEmpty, IsInt, Min, IsOptional } from 'class-validator';

export class CreateTransferRequestDto {
  @IsString()
  @IsNotEmpty()
  fromBranchId: string;

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
