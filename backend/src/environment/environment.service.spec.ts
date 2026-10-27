import { EnvironmentService } from './environment.service';
import { PrismaService } from '../prisma/prisma.service';

// Ambas sedes operaron del 1 al 26 de octubre (piloto del documento).
const days = Array.from(
  { length: 26 },
  (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`,
);
const rows = days.flatMap((day) => [
  { branchId: 'agu', day },
  { branchId: 'oca', day },
]);

const prisma = {
  $queryRaw: jest.fn().mockResolvedValue(rows),
  branch: {
    findMany: jest.fn().mockResolvedValue([
      { id: 'agu', name: 'Aguachica' },
      { id: 'oca', name: 'Ocaña' },
    ]),
  },
  sale: { count: jest.fn().mockResolvedValue(1677) },
  loanPayment: { count: jest.fn().mockResolvedValue(0) },
  inventoryMovement: { count: jest.fn().mockResolvedValue(0) },
  cashSession: { count: jest.fn().mockResolvedValue(52) },
  branchTransferRequest: { count: jest.fn().mockResolvedValue(0) },
  specialOrder: { count: jest.fn().mockResolvedValue(0) },
  warrantyClaim: { count: jest.fn().mockResolvedValue(0) },
} as unknown as PrismaService;

// 26 de octubre, 10:14 p. m. en Colombia.
const now = new Date('2026-10-27T03:14:00Z');

describe('EnvironmentService', () => {
  const service = new EnvironmentService(prisma);

  it('calcula las hojas evitadas por sede y la proyección del mes', async () => {
    const res = await service.summary('month', now);

    expect(res.asOf).toBe('2026-10-26');
    expect(res.monthEnd).toBe('2026-10-31');
    expect(res.branches.map((b) => [b.name, b.activeDays, b.sheets])).toEqual([
      ['Aguachica', 26, 130],
      ['Ocaña', 26, 78],
    ]);
    expect(res.branches.map((b) => b.monthEndSheets)).toEqual([155, 93]);
    expect(res.branches.map((b) => b.yearSheets)).toEqual([1825, 1095]);

    expect(res.series).toHaveLength(31);
    expect(res.series.reduce((s, p) => s + p.sheets, 0)).toBe(208);
    expect(res.series.reduce((s, p) => s + p.projected, 0)).toBe(40);
  });

  it('agrupa el acumulado por mes desde el inicio del piloto', async () => {
    const res = await service.summary('total', now);

    expect(res.from).toBe('2026-10-01');
    expect(res.series).toEqual([
      { key: '2026-10', sheets: 208, projected: 40 },
    ]);
  });
});
