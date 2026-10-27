import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// --- Supuestos del módulo ambiental ----------------------------------------
// Hojas evitadas = consumo diario de papel de la sede antes de la app (línea
// base del diagnóstico ambiental) × días en que la sede registró su operación
// en la app (al menos una venta o una apertura de caja).

// Hojas que cada sede gastaba al día en facturas, cuadernos de ventas, abonos
// y cierres de caja. Llave: nombre de la sede en minúscula y sin tildes.
export const DAILY_SHEETS_BY_BRANCH: Record<string, number> = {
  aguachica: 5,
  ocana: 3,
};

// Inicio del piloto en las sedes (hora de Colombia): desde ese día se cuenta.
export const PILOT_START = { year: 2026, month: 10, day: 1 };

export const SHEETS_PER_NOTEBOOK = 100;
export const SHEETS_PER_REAM = 500;
// 5 g por hoja × 0,95 kg de CO2e por kg de papel producido.
export const CO2E_KG_PER_SHEET = 0.00475;
// Cuaderno de 100 hojas a $8.000.
export const COST_PER_SHEET = 80;
const DAYS_PER_YEAR = 365;

// "month": el mes en curso; "total": acumulado desde el inicio del piloto.
export type EnvironmentPeriod = 'month' | 'total';

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

// Medianoche en Colombia de una fecha calendario (mes 1-12). El día puede
// desbordar: el día 32 de octubre es el 1 de noviembre.
const bogotaMidnight = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day) + BOGOTA_OFFSET_MS);

// Día calendario en Colombia (YYYY-MM-DD) al que pertenece un instante.
const bogotaDayKey = (date: Date) =>
  new Date(date.getTime() - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);

const branchKey = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

@Injectable()
export class EnvironmentService {
  constructor(private prisma: PrismaService) {}

  async summary(period: EnvironmentPeriod, now = new Date()) {
    const today = bogotaDayKey(now);
    const [year, month, day] = today.split('-').map(Number);
    const monthKey = today.slice(0, 7);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    const pilotStart = bogotaMidnight(
      PILOT_START.year,
      PILOT_START.month,
      PILOT_START.day,
    );
    const monthStart = bogotaMidnight(year, month, 1);
    const from =
      period === 'month' && monthStart > pilotStart ? monthStart : pilotStart;
    // Fin del día de hoy: lo que falta del mes es proyección.
    const until = bogotaMidnight(year, month, day + 1);

    // Días con operación de cada sede desde el inicio del piloto.
    const rows = await this.prisma.$queryRaw<
      { branchId: string; day: string }[]
    >`
      SELECT "branchId", to_char("at" - interval '5 hours', 'YYYY-MM-DD') AS "day"
      FROM (
        SELECT "branchId", "createdAt" AS "at" FROM "Sale"
        UNION ALL
        SELECT "branchId", "openedAt" AS "at" FROM "CashSession"
      ) ops
      WHERE "at" >= ${pilotStart} AND "at" < ${until}
      GROUP BY 1, 2
    `;
    const activeDays = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!activeDays.has(r.branchId)) activeDays.set(r.branchId, new Set());
      activeDays.get(r.branchId)!.add(r.day);
    }

    // Días del mes posteriores a hoy (y dentro del piloto) que se proyectan.
    const futureDays = Array.from(
      { length: daysInMonth - day },
      (_, i) => day + 1 + i,
    ).filter((d) => bogotaMidnight(year, month, d) >= pilotStart);

    const fromKey = bogotaDayKey(from);
    const branches = await this.prisma.branch.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const perBranch = branches.map((b) => {
      const dailySheets = DAILY_SHEETS_BY_BRANCH[branchKey(b.name)] ?? 0;
      const days = [...(activeDays.get(b.id) ?? [])];
      const periodDays = days.filter((d) => d >= fromKey).length;
      const monthDays = days.filter((d) => d.startsWith(monthKey)).length;
      return {
        id: b.id,
        name: b.name,
        dailySheets,
        activeDays: periodDays,
        sheets: dailySheets * periodDays,
        // Si la sede sigue registrando todo en la app los días que faltan.
        monthEndSheets: dailySheets * (monthDays + futureDays.length),
        yearSheets: dailySheets * DAYS_PER_YEAR,
      };
    });

    const sheetsOn = (dayKey: string) =>
      perBranch.reduce(
        (sum, b) =>
          sum + (activeDays.get(b.id)?.has(dayKey) ? b.dailySheets : 0),
        0,
      );
    const dailyBaseline = perBranch.reduce((sum, b) => sum + b.dailySheets, 0);

    // Mes en curso: un punto por día (lo que falta, proyectado). Acumulado:
    // un punto por mes desde el inicio del piloto.
    let series: { key: string; sheets: number; projected: number }[];
    if (period === 'month') {
      series = Array.from({ length: daysInMonth }, (_, i) => {
        const key = `${monthKey}-${String(i + 1).padStart(2, '0')}`;
        return {
          key,
          sheets: sheetsOn(key),
          projected: futureDays.includes(i + 1) ? dailyBaseline : 0,
        };
      });
    } else {
      series = [];
      for (let i = 0; ; i++) {
        const key = new Date(
          Date.UTC(PILOT_START.year, PILOT_START.month - 1 + i, 1),
        )
          .toISOString()
          .slice(0, 7);
        if (key > monthKey) break;
        series.push({
          key,
          sheets: perBranch.reduce(
            (sum, b) =>
              sum +
              b.dailySheets *
                [...(activeDays.get(b.id) ?? [])].filter((d) =>
                  d.startsWith(key),
                ).length,
            0,
          ),
          projected: key === monthKey ? dailyBaseline * futureDays.length : 0,
        });
      }
    }

    // Registros que antes se anotaban en papel y ahora quedan en la app.
    const range = { gte: from, lt: until };
    const [
      sales,
      loanPayments,
      inventoryMovements,
      cashCloses,
      transfers,
      specialOrders,
      warranties,
    ] = await Promise.all([
      this.prisma.sale.count({
        where: { status: 'COMPLETED', createdAt: range },
      }),
      this.prisma.loanPayment.count({ where: { createdAt: range } }),
      this.prisma.inventoryMovement.count({ where: { createdAt: range } }),
      this.prisma.cashSession.count({
        where: { status: 'CLOSED', closedAt: range },
      }),
      this.prisma.branchTransferRequest.count({ where: { createdAt: range } }),
      this.prisma.specialOrder.count({ where: { createdAt: range } }),
      this.prisma.warrantyClaim.count({ where: { createdAt: range } }),
    ]);

    return {
      period,
      asOf: today,
      from: fromKey,
      pilotStart: bogotaDayKey(pilotStart),
      monthEnd: `${monthKey}-${String(daysInMonth).padStart(2, '0')}`,
      factors: {
        sheetsPerNotebook: SHEETS_PER_NOTEBOOK,
        sheetsPerReam: SHEETS_PER_REAM,
        co2eKgPerSheet: CO2E_KG_PER_SHEET,
        costPerSheet: COST_PER_SHEET,
      },
      branches: perBranch,
      records: {
        sales,
        loanPayments,
        inventoryMovements,
        cashCloses,
        requests: transfers + specialOrders + warranties,
      },
      series,
    };
  }
}
