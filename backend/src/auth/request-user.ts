import type { Request as ExpressRequest } from 'express';

// Forma del usuario que el JwtStrategy adjunta a cada request autenticado.
export interface AuthUser {
  id: string;
  username: string;
  role: string;
  branchId: string;
  branchName: string;
}

export interface RequestWithUser extends ExpressRequest {
  user: AuthUser;
}

// Sede efectiva para consultas/creaciones: el cajero (vendedor) queda siempre
// atado a su propia sede sin importar lo que envíe; los demás roles usan la
// sede pedida (parámetro/DTO) o, si no se indica, un fallback opcional.
export function scopedBranchId(
  user: AuthUser,
  requested?: string,
  fallback?: string,
): string | undefined {
  if (user.role === 'CASHIER') return user.branchId;
  return requested ?? fallback;
}
