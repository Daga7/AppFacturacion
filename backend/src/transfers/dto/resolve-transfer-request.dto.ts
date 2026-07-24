import { IsString, IsOptional } from 'class-validator';

// El administrador puede adjuntar una nota al aprobar o rechazar (opcional).
export class ResolveTransferRequestDto {
  @IsString()
  @IsOptional()
  note?: string;
}
