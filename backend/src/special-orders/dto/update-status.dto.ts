import { IsEnum } from 'class-validator';
import { SpecialOrderStatus } from '@prisma/client';

export class UpdateStatusDto {
  @IsEnum(SpecialOrderStatus)
  status: SpecialOrderStatus;
}
