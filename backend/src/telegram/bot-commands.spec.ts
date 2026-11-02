import {
  formatProfitReport,
  formatStock,
  parseCommand,
  type ProfitReport,
} from './bot-commands';

const branches = [
  { id: 'agu', name: 'Aguachica' },
  { id: 'oca', name: 'Ocaña' },
];
// Lunes 2 de noviembre de 2026, 3:45 p. m. en Colombia.
const now = new Date('2026-11-02T20:45:00Z');

describe('parseCommand', () => {
  it('"ganancias aguachica" es el día de hoy desde la medianoche de Colombia', () => {
    const cmd = parseCommand('ganancias aguachica', branches, now);
    expect(cmd).toMatchObject({ kind: 'profit', branchIds: ['agu'] });
    if (cmd?.kind !== 'profit') throw new Error();
    expect(cmd.period.from.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    expect(cmd.period.to).toBe(now);
    expect(cmd.period.label).toMatch(/^Hoy, lunes, 2 de noviembre de 2026/);
  });

  it('acepta la sede abreviada, con tilde, mayúsculas o con /', () => {
    for (const text of [
      'ganancias oca',
      'Ganancias Ocaña',
      '/ganancias@BodegonBot OCANA',
    ]) {
      expect(parseCommand(text, branches, now)).toMatchObject({
        kind: 'profit',
        branchIds: ['oca'],
      });
    }
  });

  it('con un mes da el mes completo; el mes en curso, hasta ahora', () => {
    const oct = parseCommand('ganancias oca octubre', branches, now);
    if (oct?.kind !== 'profit') throw new Error();
    expect(oct.period.from.toISOString()).toBe('2026-10-01T05:00:00.000Z');
    expect(oct.period.to.toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(oct.period.label).toBe('Octubre de 2026');

    const nov = parseCommand('ganancias aguachica noviembre', branches, now);
    if (nov?.kind !== 'profit') throw new Error();
    expect(nov.period.from.toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(nov.period.to).toBe(now);
  });

  it('un mes que aún no llega este año es el del año pasado', () => {
    const cmd = parseCommand('ganancias aguachica diciembre', branches, now);
    if (cmd?.kind !== 'profit') throw new Error();
    expect(cmd.period.from.toISOString()).toBe('2025-12-01T05:00:00.000Z');
  });

  it('sin sede son todas', () => {
    expect(parseCommand('ganancias', branches, now)).toMatchObject({
      kind: 'profit',
      branchIds: null,
    });
  });

  it('avisa si no reconoce una palabra', () => {
    expect(parseCommand('ganancias bogota', branches, now)).toMatchObject({
      kind: 'error',
    });
  });

  it('stock con el código; sin código es un error', () => {
    expect(parseCommand('stock 001101', branches, now)).toEqual({
      kind: 'stock',
      query: '001101',
    });
    expect(parseCommand('/stock', branches, now)).toMatchObject({
      kind: 'error',
    });
  });

  it('ayuda, /start y /vincular sin código', () => {
    expect(parseCommand('/start', branches, now)).toEqual({ kind: 'help' });
    expect(parseCommand('ayuda', branches, now)).toEqual({ kind: 'help' });
    expect(parseCommand('/vincular', branches, now)).toEqual({ kind: 'link' });
    expect(parseCommand('hola', branches, now)).toBeNull();
  });
});

describe('formatProfitReport', () => {
  const report: ProfitReport = {
    totals: {
      sales: 2,
      units: 3,
      revenue: 140_000,
      cost: 90_000,
      profit: 50_000,
    },
    branches: [
      {
        branchId: 'agu',
        sales: 2,
        units: 3,
        revenue: 140_000,
        cost: 90_000,
        profit: 50_000,
      },
    ],
    categories: [
      {
        name: 'Pantallas',
        units: 3,
        revenue: 140_000,
        cost: 90_000,
        profit: 50_000,
        products: [
          {
            name: 'PACHA A35 <CM>',
            units: 2,
            revenue: 100_000,
            cost: 60_000,
            profit: 40_000,
          },
        ],
      },
    ],
    emptyCategories: ['Bateria', 'Tapa'],
  };

  it('desglosa por categoría, escapa el HTML y lista las categorías sin ventas', () => {
    const cmd = parseCommand('ganancias aguachica', branches, now);
    if (cmd?.kind !== 'profit') throw new Error();
    const text = formatProfitReport(
      report,
      cmd.period,
      [branches[0]],
      branches,
    );
    expect(text).toContain('Ganancias · Aguachica');
    expect(text).toContain('Ganancia: $50.000 (35,7 %)');
    expect(text).toContain('<b>Pantallas</b>: 3 und');
    expect(text).toContain('PACHA A35 &lt;CM&gt;: 2 und · $40.000');
    expect(text).toContain('Sin ventas: Bateria, Tapa');
  });

  it('sin ventas lo dice', () => {
    const cmd = parseCommand('ganancias oca', branches, now);
    if (cmd?.kind !== 'profit') throw new Error();
    const text = formatProfitReport(
      { ...report, totals: { ...report.totals, sales: 0 } },
      cmd.period,
      [branches[1]],
      branches,
    );
    expect(text).toContain('No hay ventas registradas');
  });
});

describe('formatStock', () => {
  it('muestra el stock por sede y el total', () => {
    const text = formatStock(
      '001101',
      [
        {
          name: 'PACHA A35 CM',
          barcode: '001101',
          isActive: true,
          retailPrice: 90_000,
          salePrice: 90_000,
          wholesalePrice: 80_000,
          category: 'Pantallas',
          stock: new Map([['agu', 12]]),
        },
      ],
      branches,
    );
    expect(text).toContain('• Aguachica: 12 und');
    expect(text).toContain('• Ocaña: 0 und');
    expect(text).toContain('Total: 12 und');
    expect(text).toContain('Precio detal: $90.000 · por mayor: $80.000');
  });

  it('sin coincidencias lo dice', () => {
    expect(formatStock('zzz', [], branches)).toContain(
      'No encontré ningún producto',
    );
  });
});
