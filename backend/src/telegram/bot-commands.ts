import { money } from '../sync/offline';

// Comandos de consulta del bot de Telegram (además de /vincular):
//   ganancias aguachica          → ganancias de hoy en Aguachica
//   ganancias oca octubre        → las de octubre en Ocaña (la sede puede ir
//                                  abreviada; sin sede, todas)
//   stock 001101                 → existencias de un producto por sede
// Se aceptan con o sin "/" y sin importar mayúsculas ni tildes.

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const TZ = 'America/Bogota';

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export interface Branch {
  id: string;
  name: string;
}

export interface Period {
  from: Date;
  to: Date; // exclusivo
  label: string;
}

export type BotCommand =
  | { kind: 'help' }
  | { kind: 'link' } // /vincular sin un código válido
  | { kind: 'profit'; branchIds: string[] | null; period: Period }
  | { kind: 'stock'; query: string }
  | { kind: 'error'; message: string };

export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Medianoche de Colombia del día de `date`, corrida `days` días.
const bogotaMidnight = (date: Date, days = 0) => {
  const b = new Date(date.getTime() - BOGOTA_OFFSET_MS);
  return new Date(
    Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() + days) +
      BOGOTA_OFFSET_MS,
  );
};

const monthStart = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 1) + BOGOTA_OFFSET_MS);

const longDate = (date: Date) =>
  date.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TZ,
  });

const shortTime = (date: Date) =>
  date
    .toLocaleTimeString('es-CO', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: TZ,
    })
    .replace(/\s/g, ' ');

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function dayPeriod(now: Date, daysAgo = 0): Period {
  const from = bogotaMidnight(now, -daysAgo);
  if (daysAgo === 0) {
    return {
      from,
      to: now,
      label: `Hoy, ${longDate(now)} (hasta las ${shortTime(now)})`,
    };
  }
  return {
    from,
    to: bogotaMidnight(now, 1 - daysAgo),
    label: `${daysAgo === 1 ? 'Ayer, ' : ''}${longDate(from)}`,
  };
}

// Mes completo; si es el mes en curso, hasta ahora. Sin año, el mes más
// reciente con ese nombre (en noviembre, "diciembre" es el del año pasado).
export function monthPeriod(
  now: Date,
  month: number,
  year?: number,
): Period | null {
  const today = new Date(now.getTime() - BOGOTA_OFFSET_MS);
  const y =
    year ??
    (month > today.getUTCMonth()
      ? today.getUTCFullYear() - 1
      : today.getUTCFullYear());
  const from = monthStart(y, month);
  if (from > now) return null;
  const end = monthStart(y, month + 1);
  const name = `${capitalize(MONTHS[month])} de ${y}`;
  if (end <= now) return { from, to: end, label: name };
  return {
    from,
    to: now,
    label: `${name} (del 1 al ${today.getUTCDate()}, hasta las ${shortTime(now)})`,
  };
}

export function parseCommand(
  text: string,
  branches: Branch[],
  now: Date,
): BotCommand | null {
  const words = text.trim().split(/\s+/);
  const head = normalize(words[0]).replace(/^\//, '').replace(/@\w+$/, '');
  const args = words.slice(1);

  if (['start', 'ayuda', 'help', 'comandos'].includes(head)) {
    return { kind: 'help' };
  }
  if (head === 'vincular') return { kind: 'link' };

  if (head === 'stock' || head === 'existencias') {
    const query = args.join(' ').trim();
    if (!query) {
      return {
        kind: 'error',
        message:
          'Escribe el código del producto después de "stock", por ejemplo: stock 001101',
      };
    }
    return { kind: 'stock', query };
  }

  if (head !== 'ganancias' && head !== 'ganancia') return null;

  const branchIds = new Set<string>();
  let all = false;
  let daysAgo = 0;
  let month: number | null = null;
  let year: number | undefined;
  for (const raw of args) {
    const w = normalize(raw).replace(/[.,;:]+$/, '');
    if (!w || w === 'de' || w === 'del') continue;
    if (w === 'hoy') {
      daysAgo = 0;
      continue;
    }
    if (w === 'ayer') {
      daysAgo = 1;
      continue;
    }
    if (w === 'mes') {
      month = new Date(now.getTime() - BOGOTA_OFFSET_MS).getUTCMonth();
      continue;
    }
    if (['todas', 'todo', 'general', 'total'].includes(w)) {
      all = true;
      continue;
    }
    if (/^\d{4}$/.test(w)) {
      year = Number(w);
      continue;
    }
    const exactMonth = MONTHS.indexOf(w);
    if (exactMonth >= 0) {
      month = exactMonth;
      continue;
    }
    const matches =
      w.length >= 3
        ? branches.filter((b) => normalize(b.name).startsWith(w))
        : [];
    if (matches.length === 1) {
      branchIds.add(matches[0].id);
      continue;
    }
    if (matches.length > 1) {
      return {
        kind: 'error',
        message: `"${raw}" coincide con varias sedes (${matches.map((b) => b.name).join(', ')}); escribe más letras.`,
      };
    }
    const monthPrefix =
      w.length >= 3 ? MONTHS.findIndex((m) => m.startsWith(w)) : -1;
    if (monthPrefix >= 0) {
      month = monthPrefix;
      continue;
    }
    return {
      kind: 'error',
      message: `No reconozco "${raw}". Sedes: ${branches.map((b) => b.name).join(', ')}. Para un mes escribe su nombre, por ejemplo: ganancias ${normalize(branches[0]?.name ?? 'sede')} octubre`,
    };
  }

  let period: Period | null;
  if (month !== null) {
    period = monthPeriod(now, month, year);
    if (!period) {
      return {
        kind: 'error',
        message: `${capitalize(MONTHS[month])} de ${year} todavía no ha empezado.`,
      };
    }
  } else {
    period = dayPeriod(now, daysAgo);
  }
  return {
    kind: 'profit',
    branchIds: all || branchIds.size === 0 ? null : [...branchIds],
    period,
  };
}

// --- Textos -----------------------------------------------------------------

const percent = (part: number, total: number) =>
  total > 0 ? `${((100 * part) / total).toFixed(1).replace('.', ',')} %` : '—';

const units = (n: number) => `${n.toLocaleString('es-CO')} und`;

interface Amounts {
  units: number;
  revenue: number;
  cost: number;
  profit: number;
}

export interface ProfitReport {
  totals: Amounts & { sales: number };
  branches: (Amounts & { branchId: string; sales: number })[];
  categories: (Amounts & {
    name: string;
    products: (Amounts & { name: string })[];
  })[];
  emptyCategories: string[];
}

const TOP_PRODUCTS = 5;

export function helpText(branches: Branch[], linked: boolean) {
  const first = (branches[0]?.name ?? 'sede').toLowerCase();
  const lines = [
    '🤖 <b>Comandos del bot</b>',
    '',
    '<b>Ganancias</b> (de hoy si no dices el mes):',
    ...branches.map(
      (b) =>
        `• ganancias ${escapeHtml(b.name.toLowerCase())} — hoy en ${escapeHtml(b.name)}`,
    ),
    `• ganancias ${escapeHtml(first)} octubre — un mes completo`,
    '• ganancias — hoy en todas las sedes',
    '',
    '<b>Existencias</b>:',
    '• stock 001101 — stock de un producto por su código',
    '• stock a35 — busca por nombre si no sabes el código',
  ];
  if (!linked) {
    lines.push(
      '',
      'Este chat aún no está vinculado: genera un código en la app (Vincular Telegram) y envíame /vincular TG-XXXXXX',
    );
  }
  return lines.join('\n');
}

export function formatProfitReport(
  report: ProfitReport,
  period: Period,
  scope: Branch[], // sedes del informe
  allBranches: Branch[],
) {
  const title =
    scope.length === allBranches.length
      ? 'Todas las sedes'
      : scope.map((b) => b.name).join(' y ');
  const lines = [
    `📊 <b>Ganancias · ${escapeHtml(title)}</b>`,
    escapeHtml(period.label),
    '',
  ];
  const t = report.totals;
  if (t.sales === 0) {
    lines.push('No hay ventas registradas en este periodo.');
    return lines.join('\n');
  }

  lines.push(
    `🧾 Ventas: ${t.sales.toLocaleString('es-CO')} · ticket promedio ${money(t.revenue / t.sales)}`,
    `💵 Vendido: ${money(t.revenue)}`,
    `📦 Costo de compra: ${money(t.cost)}`,
    `✅ <b>Ganancia: ${money(t.profit)} (${percent(t.profit, t.revenue)})</b>`,
  );

  if (scope.length > 1) {
    lines.push('', '<b>Por sede</b>');
    for (const b of scope) {
      const r = report.branches.find((x) => x.branchId === b.id);
      lines.push(
        r
          ? `• ${escapeHtml(b.name)}: ${r.sales} ventas · vendido ${money(r.revenue)} · ganancia ${money(r.profit)} (${percent(r.profit, r.revenue)})`
          : `• ${escapeHtml(b.name)}: sin ventas`,
      );
    }
  }

  lines.push('', '<b>Por categoría</b>');
  for (const c of report.categories) {
    lines.push(
      '',
      `▸ <b>${escapeHtml(c.name)}</b>: ${units(c.units)} · ${c.products.length} referencias`,
      `   Vendido ${money(c.revenue)} · costo ${money(c.cost)}`,
      `   Ganancia <b>${money(c.profit)}</b> (${percent(c.profit, c.revenue)})${report.categories.length > 1 ? ` · ${percent(c.profit, t.profit)} del total` : ''}`,
      `   Las que más dejan:`,
      ...c.products
        .slice(0, TOP_PRODUCTS)
        .map(
          (p, i) =>
            `   ${i + 1}. ${escapeHtml(p.name)}: ${units(p.units)} · ${money(p.profit)}`,
        ),
    );
  }
  if (report.emptyCategories.length > 0) {
    lines.push(
      '',
      `Sin ventas: ${escapeHtml(report.emptyCategories.join(', '))}`,
    );
  }
  return lines.join('\n');
}

export interface StockProduct {
  name: string;
  barcode: string;
  isActive: boolean;
  retailPrice: number;
  salePrice: number;
  wholesalePrice: number;
  category: string;
  stock: Map<string, number>; // branchId → unidades
}

const MAX_MATCHES = 10;

export function formatStock(
  query: string,
  products: StockProduct[],
  branches: Branch[],
) {
  const total = (p: StockProduct) =>
    [...p.stock.values()].reduce((sum, n) => sum + n, 0);

  if (products.length === 0) {
    return `No encontré ningún producto con el código o nombre "${escapeHtml(query)}".`;
  }
  if (products.length > 1) {
    const shown = products.slice(0, MAX_MATCHES);
    return [
      `🔎 Productos que coinciden con "${escapeHtml(query)}":`,
      ...shown.map(
        (p) =>
          `• ${escapeHtml(p.barcode)} · ${escapeHtml(p.name)}: ${units(total(p))}${p.isActive ? '' : ' (inactivo)'}`,
      ),
      ...(products.length > MAX_MATCHES ? ['…y más; escribe más letras.'] : []),
      '',
      'Envía stock y el código para ver el detalle por sede.',
    ].join('\n');
  }

  const p = products[0];
  const retail = p.retailPrice > 0 ? p.retailPrice : p.salePrice;
  return [
    `📦 <b>${escapeHtml(p.name)}</b>`,
    `Código: ${escapeHtml(p.barcode)} · ${escapeHtml(p.category)}`,
    `Precio detal: ${money(retail)}${p.wholesalePrice > 0 ? ` · por mayor: ${money(p.wholesalePrice)}` : ''}`,
    ...(p.isActive ? [] : ['⚠️ Producto inactivo']),
    '',
    'Stock:',
    ...branches.map(
      (b) => `• ${escapeHtml(b.name)}: ${units(p.stock.get(b.id) ?? 0)}`,
    ),
    `<b>Total: ${units(total(p))}</b>`,
  ].join('\n');
}
