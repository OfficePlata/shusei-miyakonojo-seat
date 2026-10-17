import { computeTableLayout } from "@/components/table-node";
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
  // 令和8年10月例会から 15卓×8名（2026-10-11 確認）
  tableCount: 15,
  seatsPerTable: 8,
  // 都城の例会では来賓席を使わない（2026-10-11 確認）。必要な回だけ「卓の設定」で足す
  includeHeadTable: false,
  headTableSeats: 6,
  columns: 4,
};

// キャンバス上の配置間隔の下限。実際の間隔は卓の大きさから決める（cellSize）
export const CELL_W = 260;
export const CELL_H = 260;
export const MARGIN_X = 60;
export const MARGIN_Y = 60;

/** 隣り合う卓の席の輪どうしの空き */
const TABLE_GAP = 28;

/** 卓の外寸（席の輪まで含む）。表示（table-node）と同じ計算 */
export function tableBox(t: Pick<SeatingTable, "capacity" | "shape">): { w: number; h: number } {
  const l = computeTableLayout(t as SeatingTable);
  return { w: l.nodeW, h: l.nodeH };
}

/**
 * 並べるときの1マスの大きさ。いちばん大きい丸卓に合わせる。
 * 以前は 260px 固定で、8人掛け（外寸 約257px）までしか収まらず、10人掛けにすると隣の卓と重なった
 */
export function cellSize(tables: Pick<SeatingTable, "capacity" | "shape" | "kind">[]): { w: number; h: number } {
  let w = CELL_W;
  let h = CELL_H;
  for (const t of tables) {
    if (t.kind === "head") continue;
    const b = tableBox(t);
    w = Math.max(w, b.w + TABLE_GAP);
    h = Math.max(h, b.h + TABLE_GAP);
  }
  return { w, h };
}

/** 卓を名前順に横 cols 列で並べる。来賓卓は最上段の中央 */
export function layoutGrid(tables: SeatingTable[], cols: number): SeatingTable[] {
  const c = Math.max(1, Math.floor(cols));
  const { w, h } = cellSize(tables);
  const head = tables.filter((t) => t.kind === "head");
  const normal = tables.filter((t) => t.kind !== "head").sort((a, b) => compareTableName(a.name, b.name));
  const headH = head.reduce((m, t) => Math.max(m, tableBox(t).h + TABLE_GAP), 0);
  const startY = MARGIN_Y + headH;
  return [
    ...head.map((t) => ({
      ...t,
      x: MARGIN_X + ((c - 1) * w) / 2 + (w - tableBox(t).w) / 2,
      y: MARGIN_Y,
    })),
    ...normal.map((t, i) => ({
      ...t,
      x: MARGIN_X + (i % c) * w,
      y: startY + Math.floor(i / c) * h,
    })),
  ];
}

/** 2つの卓が重なっているか（席の輪まで含めた外寸で判定） */
function overlaps(a: SeatingTable, b: SeatingTable): boolean {
  const ba = tableBox(a);
  const bb = tableBox(b);
  return a.x < b.x + bb.w && b.x < a.x + ba.w && a.y < b.y + bb.h && b.y < a.y + ba.h;
}

export function hasOverlap(tables: SeatingTable[]): boolean {
  for (let i = 0; i < tables.length; i++) {
    for (let j = i + 1; j < tables.length; j++) {
      if (overlaps(tables[i], tables[j])) return true;
    }
  }
  return false;
}

/** いまの配置の列数。いちばん上の段に並んでいる卓の数（分からなければ4） */
function currentColumns(tables: SeatingTable[]): number {
  const normal = tables.filter((t) => t.kind !== "head");
  if (normal.length === 0) return 4;
  const top = Math.min(...normal.map((t) => t.y));
  const n = normal.filter((t) => t.y - top < 100).length;
  return n >= 2 ? n : 4;
}

/**
 * 卓が重なっていれば、いまの列数のまま名前順に並べ直す。重なっていなければそのまま返す
 * （手で動かした配置を、重なりが無いのに崩さない）
 */
export function fixOverlaps(tables: SeatingTable[]): SeatingTable[] {
  return hasOverlap(tables) ? layoutGrid(tables, currentColumns(tables)) : tables;
}

/** いまの配置の列数（卓を整列するときに保つ） */
export function columnsOf(tables: SeatingTable[]): number {
  return currentColumns(tables);
}

/**
 * 卓を手で動かしたときの置き場所。重ならなければ落とした位置のまま。
 * 他の卓に重なるなら、格子のマスのうち落とした位置にいちばん近い空きへ寄せる
 */
export function dropPosition(tables: SeatingTable[], moving: SeatingTable, x: number, y: number): { x: number; y: number } {
  const others = tables.filter((t) => t.id !== moving.id);
  const at = { ...moving, x, y };
  if (!others.some((t) => overlaps(at, t))) return { x, y };

  const { w, h } = cellSize(tables);
  const cols = Math.max(currentColumns(tables), Math.ceil((x - MARGIN_X) / w) + 2);
  const rows = Math.ceil(tables.length / Math.max(1, currentColumns(tables))) + 3;
  const cells: { x: number; y: number; d: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = MARGIN_X + c * w;
      const cy = MARGIN_Y + r * h;
      cells.push({ x: cx, y: cy, d: (cx - x) ** 2 + (cy - y) ** 2 });
    }
  }
  cells.sort((a, b) => a.d - b.d);
  for (const c of cells) {
    if (!others.some((t) => overlaps({ ...moving, x: c.x, y: c.y }, t))) return { x: c.x, y: c.y };
  }
  // 空きが無ければ元の位置に戻す
  return { x: moving.x, y: moving.y };
}

/**
 * 卓を1つ足すときの置き場所。いまの列数の格子で、どの卓とも重ならない最初のマス
 */
export function freeSlot(
  tables: SeatingTable[],
  next: Pick<SeatingTable, "capacity" | "shape" | "kind">,
): { x: number; y: number } {
  const cols = currentColumns(tables);
  const { w, h } = cellSize([...tables, next]);
  const startY = Math.min(MARGIN_Y, ...tables.filter((t) => t.kind !== "head").map((t) => t.y));
  for (let i = 0; i < 500; i++) {
    const pos = { x: MARGIN_X + (i % cols) * w, y: startY + Math.floor(i / cols) * h };
    const probe = { ...next, ...pos, id: "", name: "" } as SeatingTable;
    if (!tables.some((t) => overlaps(probe, t))) return pos;
  }
  const bottom = tables.reduce((m, t) => Math.max(m, t.y + tableBox(t).h), MARGIN_Y);
  return { x: MARGIN_X, y: bottom + TABLE_GAP };
}

export function generateTables(opts: TableLayoutOptions): SeatingTable[] {
  const tables: SeatingTable[] = [];

  if (opts.includeHeadTable) {
    tables.push({
      id: uid("tbl"),
      name: "来賓席",
      capacity: opts.headTableSeats,
      shape: "rect",
      kind: "head",
      x: 0,
      y: 0,
    });
  }

  for (let i = 0; i < opts.tableCount; i++) {
    tables.push({
      id: uid("tbl"),
      name: String(i + 1),
      capacity: opts.seatsPerTable,
      shape: "round",
      kind: "normal" as TableKind,
      x: 0,
      y: 0,
    });
  }

  // 位置は卓の大きさに合わせて格子に置く（人数を増やしても重ならない）
  return layoutGrid(tables, opts.columns);
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
