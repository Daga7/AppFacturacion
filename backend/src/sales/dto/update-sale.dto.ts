import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { SaleDetailDto, SalePaymentDto } from './create-sale.dto';

// La edición reemplaza por completo los productos y pagos de la venta;
// el backend revierte el inventario anterior y aplica el nuevo estado.
export class UpdateSaleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleDetailDto)
  details: SaleDetailDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalePaymentDto)
  payments: SalePaymentDto[];
}
