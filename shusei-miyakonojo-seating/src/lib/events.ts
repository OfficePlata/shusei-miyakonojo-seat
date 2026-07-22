import type { SeatingTable, TableKind } from "./types";

/** シンプルな一意ID（iframe 互換のため crypto.randomUUID は使わない） */
export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export interface EventSeed {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  venue: string;
}

/** shusei-miyakonojo.com/events のスケジュールを初期データ化 */
export const EVENT_SEEDS: EventSeed[] = [
  {
    id: "evt-2026-07",
    title: "令和8年7月例会",
    date: "2026-07-23",
    venue: "グランドパティオ都城",
  },
  {
    id: "evt-2026-08",
    title: "令和8年8月例会",
    date: "2026-08-27",
    venue: "グランドパティオ都城",
  },
  {
    id: "evt-2026-09",
    title: "令和8年9月例会",
    date: "2026-09-24",
    venue: "グランドパティオ都城",
  },
  {
    id: "evt-2026-10",
    title: "令和8年10月例会",
    date: "2026-10-22",
    venue: "グランドパティオ都城",
  },
  {
    id: "evt-2026-11",
    title: "令和8年11月例会",
    date: "2026-11-26",
    venue: "グランドパティオ都城",
  },
  {
    id: "evt-2026-12",
    title: "令和8年12月例会",
    date: "2026-12-17",
    venue: "グランドパティオ都城",
  },
];

const TABLE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export interface TableLayoutOptions {
  tableCount: number;
  seatsPerTable: number;
  includeHeadTable: boolean;
  headTableSeats: number;
  columns: number;
}

export const DEFAULT_LAYOUT: TableLayoutOptions = {
  tableCount: 12,
  seatsPerTable: 8,
  includeHeadTable: true,
  headTableSeats: 6,
  columns: 4,
};

// キャンバス上の配置間隔
const CELL_W = 260;
const CELL_H = 260;
const MARGIN_X = 60;
const MARGIN_Y = 60;

export function generateTables(opts: TableLayoutOptions): SeatingTable[] {
  const tables: SeatingTable[] = [];
  const cols = Math.max(1, opts.columns);

  let index = 0;

  if (opts.includeHeadTable) {
    // 来賓卓は最上段中央に横長で配置
    tables.push({
      id: uid("tbl"),
      name: "来賓席",
      capacity: opts.headTableSeats,
      shape: "rect",
      kind: "head",
      x: MARGIN_X + ((cols - 1) * CELL_W) / 2,
      y: MARGIN_Y,
    });
  }

  const startY = opts.includeHeadTable ? MARGIN_Y + CELL_H : MARGIN_Y;

  for (let i = 0; i < opts.tableCount; i++) {
    const col = index % cols;
    const row = Math.floor(index / cols);
    tables.push({
      id: uid("tbl"),
      name: TABLE_LETTERS[i] ?? `T${i + 1}`,
      capacity: opts.seatsPerTable,
      shape: "round",
      kind: "normal" as TableKind,
      x: MARGIN_X + col * CELL_W,
      y: startY + row * CELL_H,
    });
    index++;
  }

  return tables;
}

export function nextTableName(existing: SeatingTable[]): string {
  const used = new Set(existing.map((t) => t.name));
  for (const letter of TABLE_LETTERS) {
    if (!used.has(letter)) return letter;
  }
  let i = existing.length + 1;
  while (used.has(`T${i}`)) i++;
  return `T${i}`;
}
