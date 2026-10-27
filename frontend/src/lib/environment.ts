// Tipos y cálculos del módulo de impacto ambiental (/environment/summary).
// El servidor entrega las hojas evitadas y los factores; las equivalencias
// (cuadernos, resmas, CO2e, ahorro) se calculan aquí con esos mismos factores.

export type EnvironmentPeriod = "month" | "total";

export interface EnvironmentFactors {
  sheetsPerNotebook: number;
  sheetsPerReam: number;
  co2eKgPerSheet: number;
  costPerSheet: number;
}

export interface EnvironmentBranch {
  id: string;
  name: string;
  // Línea base: hojas al día que la sede usaba antes de la app.
  dailySheets: number;
  // Días del período en que la sede registró ventas o abrió caja.
  activeDays: number;
  sheets: number;
  monthEndSheets: number;
  yearSheets: number;
}

export interface EnvironmentPoint {
  // YYYY-MM-DD (mes en curso) o YYYY-MM (acumulado).
  key: string;
  sheets: number;
  // Hojas estimadas de los días del mes que aún no llegan.
  projected: number;
}

export interface EnvironmentSummary {
  period: EnvironmentPeriod;
  asOf: string;
  from: string;
  pilotStart: string;
  monthEnd: string;
  factors: EnvironmentFactors;
  branches: EnvironmentBranch[];
  records: {
    sales: number;
    loanPayments: number;
    inventoryMovements: number;
    cashCloses: number;
    requests: number;
  };
  series: EnvironmentPoint[];
}

export const equivalences = (sheets: number, f: EnvironmentFactors) => ({
  notebooks: sheets / f.sheetsPerNotebook,
  reams: sheets / f.sheetsPerReam,
  co2eKg: sheets * f.co2eKgPerSheet,
  savings: sheets * f.costPerSheet,
});

// Fila de una tabla por sede: un valor por sede y al final el total, con el
// mismo formato.
export const branchValues = (
  branches: EnvironmentBranch[],
  value: (b: EnvironmentBranch) => number,
  format: (n: number) => string,
) => [
  ...branches.map((b) => format(value(b))),
  format(branches.reduce((sum, b) => sum + value(b), 0)),
];

export const formatSheets = (n: number) => n.toLocaleString("es-CO");

export const formatDecimal = (n: number) =>
  n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "26 de oct" a partir de "2026-10-26" (la fecha ya viene en hora de Colombia).
export const dayLabel = (key: string) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

// "oct de 2026" a partir de "2026-10".
export const monthLabel = (key: string) =>
  new Date(`${key}-15T12:00:00Z`).toLocaleDateString("es-CO", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
