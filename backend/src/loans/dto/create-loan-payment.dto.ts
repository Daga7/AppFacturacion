import { IsNumber, IsEnum, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateLoanPaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
}
