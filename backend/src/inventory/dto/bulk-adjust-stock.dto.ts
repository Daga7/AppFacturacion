import {
  IsString,
  IsInt,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
  ArrayMinSize,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InventoryMovementType } from '@prisma/client';

export class BulkAdjustItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class BulkAdjustStockDto {
  @IsString()
  @IsNotEmpty()
  branchId: string;

  @IsEnum(InventoryMovementType)
  type: InventoryMovementType;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkAdjustItemDto)
  items: BulkAdjustItemDto[];

  @IsString()
  @IsOptional()
  note?: string;
}
