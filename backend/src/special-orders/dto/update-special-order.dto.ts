import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsDateString,
  Min,
} from 'class-validator';

// Edición de los datos de un pedido especial (solo ADMIN). Todos los campos son
// opcionales: se actualiza únicamente lo que llega. No incluye el estado ni los
// pagos (esos tienen sus propios endpoints). El total no puede quedar por
// debajo de lo ya abonado (validado en el servicio).
export class UpdateSpecialOrderDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  partName?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @IsOptional()
  totalAmount?: number;

  @IsDateString()
  @IsOptional()
  estimatedArrival?: string;
}
