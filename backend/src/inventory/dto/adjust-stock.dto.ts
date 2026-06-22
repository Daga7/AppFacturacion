import {
  IsString,
  IsInt,
  IsNotEmpty,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { InventoryMovementType } from '@prisma/client';

export class AdjustStockDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  branchId: string;

  @IsInt()
  @IsNotEmpty()
  quantity: number;

  @IsEnum(InventoryMovementType)
  type: InventoryMovementType;

  @IsString()
  @IsOptional()
  note?: string;
}
