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
      name: String(i + 1),
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

/** テーブル名を数値優先で比較する（"1","2",…,"10","11" を正しい順に並べる） */
export function compareTableName(a: string, b: string): number {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  const aIsNum = !Number.isNaN(na) && String(na) === a.trim();
  const bIsNum = !Number.isNaN(nb) && String(nb) === b.trim();
  if (aIsNum && bIsNum) return na - nb; // 数字同士は数値順（10 が 2 より後ろに来る）
  if (aIsNum) return -1; // 数字を先頭側に
  if (bIsNum) return 1;
  return a.localeCompare(b, "ja"); // それ以外（来賓席 など）は日本語順
}

/** テーブル追加時の次の番号（既存の最大番号 + 1） */
export function nextTableName(existing: SeatingTable[]): string {
  const nums = existing
    .map((t) => Number.parseInt(t.name, 10))
    .filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return String(max + 1);
}
