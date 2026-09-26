import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SyncOperationType } from '@prisma/client';
import { CreateSaleDto } from '../../sales/dto/create-sale.dto';
import { CreateLoanPaymentDto } from '../../loans/dto/create-loan-payment.dto';

export class SyncOperationDto {
  // Generado por el dispositivo; identifica la operación entre reenvíos.
  @IsUUID()
  id: string;

  @IsEnum(SyncOperationType)
  type: SyncOperationType;

  // online: la persona está esperando la respuesta y aplican las validaciones
  // de siempre. offline: ya ocurrió sin internet; se registra y lo que no
  // cuadre queda como aviso para el administrador.
  @IsIn(['online', 'offline'])
  mode: 'online' | 'offline';

  @IsISO8601()
  occurredAt: string;

  // Descripción legible ("Venta de $50.000...") para los avisos.
  @IsString()
  @IsOptional()
  @MaxLength(500)
  summary?: string;

  // Se valida según el tipo en SyncService.
  @IsObject()
  payload: Record<string, unknown>;
}

export class SyncRequestDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SyncOperationDto)
  operations: SyncOperationDto[];
}

// Payloads por tipo. OPEN_CASH usa OpenCashDto tal cual.

export class SyncSaleDto extends CreateSaleDto {
  @IsUUID()
  saleId: string;

  @IsUUID()
  @IsOptional()
  loanId?: string;
}

export class SyncLoanPaymentDto extends CreateLoanPaymentDto {
  @IsUUID()
  loanId: string;
}

export class SyncReturnLoanDto {
  @IsUUID()
  loanId: string;
}
