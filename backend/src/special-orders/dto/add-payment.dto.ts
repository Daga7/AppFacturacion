import { IsNumber, IsEnum, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

// Abono adicional o pago del saldo de un pedido especial. El backend decide si
// es DEPOSIT o FINAL según si con este pago se completa el total.
export class AddPaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
}
