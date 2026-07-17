import {
  IsString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ArrayMinSize,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TransferItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class TransferStockDto {
  @IsString()
  @IsNotEmpty()
  fromBranchId: string;

  @IsString()
  @IsNotEmpty()
  toBranchId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferItemDto)
  items: TransferItemDto[];

  @IsString()
  @IsOptional()
  note?: string;
}
