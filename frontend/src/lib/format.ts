// Helpers de formato compartidos por toda la app.

export const formatMoney = (value: number | string) =>
  `$${Number(value).toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;

// Fechas y horas siempre en hora de Colombia: un mismo registro debe verse
// igual en el computador del local y en el celular del administrador, sin
// importar la zona horaria que tenga configurada cada aparato.
export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  });

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CO", {
    dateStyle: "medium",
    timeZone: "America/Bogota",
  });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bogota",
  });

// Número de factura al estilo "F0001" (único por sucursal).
export const invoiceCode = (n: number) => `F${String(n).padStart(4, "0")}`;

// --- Rangos de fecha en hora de Colombia -----------------------------------
// Los reportes ("ventas de hoy", "ventas del mes") deben ser iguales en todos
// los dispositivos: lo que cuenta es el día en Bogotá, no la zona horaria que
// tenga configurado el celular o el computador. Por eso los rangos se calculan
// siempre sobre America/Bogota (UTC-5, sin horario de verano) en vez de usar
// `setHours(0,0,0,0)`, que depende del reloj local del aparato.

export const BOGOTA_TZ = "America/Bogota";

// Desfase fijo de Colombia respecto a UTC, en milisegundos.
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

// Fecha calendario en Bogotá (año, mes 1-12, día) del instante dado.
export const bogotaParts = (date: Date = new Date()) => {
  const shifted = new Date(date.getTime() - BOGOTA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
};

// Instante ISO de la medianoche en Bogotá del día indicado.
export const bogotaDayStart = (year: number, month: number, day: number) =>
  new Date(
    Date.UTC(year, month - 1, day, 0, 0, 0, 0) + BOGOTA_OFFSET_MS,
  ).toISOString();

// Inicio del día de hoy en Bogotá.
export const todayStartISO = () => {
  const { year, month, day } = bogotaParts();
  return bogotaDayStart(year, month, day);
};

// Fin del día de hoy en Bogotá (último milisegundo).
export const todayEndISO = () => {
  const { year, month, day } = bogotaParts();
  return new Date(
    new Date(bogotaDayStart(year, month, day)).getTime() + 86400000 - 1,
  ).toISOString();
};

// Rango [desde, hasta] de un mes completo en Bogotá. `month` es 1-12.
export const bogotaMonthRange = (year: number, month: number) => {
  const from = bogotaDayStart(year, month, 1);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const to = new Date(
    new Date(bogotaDayStart(nextYear, nextMonth, 1)).getTime() - 1,
  ).toISOString();
  return { from, to };
};

// Clave YYYY-MM-DD del día en Bogotá al que pertenece una fecha ISO. Se usa
// para agrupar ventas por día de forma idéntica en todos los dispositivos.
export const bogotaDayKey = (iso: string) => {
  const { year, month, day } = bogotaParts(new Date(iso));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
