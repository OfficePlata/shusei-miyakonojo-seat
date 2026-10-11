"use client";

import type { Attendee, SeatingTable } from "@/lib/types";
import type { useCurrentEvent } from "@/lib/store";
import { formatEventDate } from "@/lib/ui-helpers";
import { remarksCell, venueCell } from "@/components/print-view";

/**
 * 座席表の「見やすいデザイン」。印刷画面のツールバーで「これまでのデザイン」と切り替える。
 *
 * 載せる項目（No.・会場・氏名・役割、凡例、未着席）は、これまでのデザインと**同じ**。
 * 見た目だけを、ポータルの印刷物（sewaninja-portal の「見やすい版」）と同じ意匠にそろえている。
 *
 * PDF_PRINT_SAFE_RULES.md に合わせて、次は使わない:
 * グラデーション / 影 / 半透明（Tailwind の `/70` なども含む）/ 破線・点線 / SVG アイコン /
 * 角丸＋overflow:hidden の組み合わせ。色はすべて不透明の16進で書く。
 */

type CurrentEvent = NonNullable<ReturnType<typeof useCurrentEvent>>;

/** 卓ひとつの幅は、これまでのデザインと同じ 372px（A3ヨコに4卓が原寸で並ぶ寸法） */
export const CLEAR_CARD_W = 372;
/** 枠線1px を左右から引いた残り（370px）を4列に配る */
const COL = { no: 26, venue: 94, name: 140, duty: 110 } as const;
/**
 * 行の高さ。これまでのデザイン（20px）より1px低い。卓の帯が増えたぶんをここで吸収し、
 * 13卓（4段）が**縮小前の寸法で** A3ヨコ1ページに収まるようにしている。
 * 「1ページに収める」は見た目を縮めるだけで、印刷のページ割りは縮小前の高さで決まるため、
 * 縮小前に溢れると4段目が2ページ目へ送られる（2026-10-11 実測）。
 */
const ROW_H = 19;

const C = {
  shu: "#c8102e",
  kinDeep: "#b28f2b",
  kuroko: "#1f1d1b",
  shuLine: "#e5a3ae",
  kinLine: "#d9c27f",
  kinPale: "#fbf6e9",
  line: "#e0d9cd",
  th: "#f1ece3",
  guest: "#e9e4db",
  sub: "#6b6762",
} as const;

export function ClearSheet({
  event,
  rotation,
  tables,
  seatMap,
  unseated,
}: {
  event: CurrentEvent;
  rotation: number;
  tables: SeatingTable[];
  seatMap: Map<string, Map<number, Attendee>>;
  unseated: Attendee[];
}) {
  return (
    <div style={{ color: C.kuroko }}>
      {/* 用紙の頭：明朝の大見出し＋右上に大きな数字 */}
      <div
        className="mb-3 flex items-end justify-between gap-4 pb-2"
        style={{ borderBottom: `2px solid ${C.kuroko}` }}
      >
        <div>
          <p className="text-[11px] font-semibold" style={{ color: C.sub }}>
            守成クラブ 都城会場
          </p>
          <h1 className="font-brand flex items-center gap-3 text-[28px] font-bold leading-tight tracking-wide">
            <span>{event.title}　座席表</span>
            <span
              className="rounded-full px-3 py-0.5 font-sans text-sm font-bold"
              style={{ background: C.shu, color: "#fff" }}
            >
              {rotation === 1 ? "1回目" : "2回目"}
            </span>
          </h1>
          <p className="mt-0.5 text-xs" style={{ color: C.sub }}>
            {formatEventDate(event.date)}　会場：{event.venue}
          </p>
        </div>

        <div className="flex items-end gap-5">
          {/* モノクロ印刷でも読めるよう、凡例は色と文字の両方で示す */}
          <div className="flex flex-col items-end gap-1 text-[11px]" style={{ color: C.sub }}>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-5 rounded-sm"
                style={{ background: C.guest, border: `1px solid ${C.line}` }}
              />
              ゲスト
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FirstBadge />
              初参加
            </span>
          </div>
          <Stat label="出席" value={event.attendees.length} />
          <Stat label="着席" value={event.assignments.length} />
        </div>
      </div>

      {/* 卓の並び。これまでと同じ4卓・同じ幅（A3ヨコで原寸） */}
      <div
        className="print-grid-clear grid"
        style={{ gridTemplateColumns: `repeat(4, ${CLEAR_CARD_W}px)`, gap: 4 }}
      >
        {tables.map((t) => (
          <ClearTableCard key={t.id} table={t} seats={seatMap.get(t.id) ?? new Map()} />
        ))}
      </div>

      {/* 未着席。黒い縦線の小見出し＋淡い金の札（破線・半透明は使わない） */}
      {unseated.length > 0 && (
        <div className="mt-4">
          <h2
            className="mb-1.5 flex items-baseline gap-2 pl-2 text-sm font-bold"
            style={{ borderLeft: `4px solid ${C.kuroko}` }}
          >
            未着席
            <span className="text-xs font-normal" style={{ color: C.sub }}>
              {unseated.length}名
            </span>
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {unseated.map((a) => (
              <span
                key={a.id}
                className="rounded px-2 py-0.5 text-xs"
                style={{
                  background: a.category === "guest" ? C.guest : C.kinPale,
                  border: `1px solid ${C.kinLine}`,
                }}
              >
                {a.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div
        className="mt-5 flex justify-between pt-1.5 text-[10px]"
        style={{ borderTop: `1px solid ${C.line}`, color: C.sub }}
      >
        <span>守成クラブ 都城会場　座席表メーカー</span>
        <span>作成日：{new Date().toLocaleDateString("ja-JP")}</span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-right leading-none">
      <div className="mb-1 text-[11px]" style={{ color: C.sub }}>
        {label}
      </div>
      <span className="text-[30px] font-bold tabular-nums" style={{ color: C.shu }}>
        {value}
      </span>
      <span className="ml-0.5 text-xs">名</span>
    </div>
  );
}

function FirstBadge() {
  return (
    <span
      className="inline-block rounded-sm px-1 text-[8px] font-bold leading-[13px]"
      style={{ background: C.shu, color: "#fff" }}
    >
      初
    </span>
  );
}

function ClearTableCard({
  table,
  seats,
}: {
  table: SeatingTable;
  seats: Map<number, Attendee>;
}) {
  const isHead = table.kind === "head";
  const count = seats.size;
  // これまでと同じく最低10行。空いた行は当日の飛び込みを書き込む欄
  const rows = Math.max(table.capacity, 10);
  const tone = isHead ? C.kinDeep : C.shu;

  return (
    <div
      className="break-inside-avoid rounded bg-white"
      style={{ width: CLEAR_CARD_W, border: `1px solid ${isHead ? C.kinLine : C.shuLine}` }}
    >
      {/* 卓の帯。主賓卓は金、それ以外は朱（王冠のSVGは使わず文字で示す）。
          角は帯そのものを丸める（親で overflow:hidden して切り抜かない） */}
      <div
        className="flex h-[22px] items-center justify-between rounded-t-[3px] px-2.5"
        style={{ background: tone, color: "#fff" }}
      >
        <span className="flex items-baseline gap-1.5">
          {isHead ? (
            <span className="text-sm font-bold">主賓席</span>
          ) : (
            <>
              <span className="text-[10px] font-semibold">テーブル</span>
              <span className="font-brand text-base font-bold leading-none">{table.name}</span>
            </>
          )}
        </span>
        <span className="text-[10px] font-semibold tabular-nums">
          着席 {count} / {table.capacity}
        </span>
      </div>

      <table className="w-full table-fixed border-collapse text-[11px] leading-tight">
        <colgroup>
          <col style={{ width: COL.no }} />
          <col style={{ width: COL.venue }} />
          <col style={{ width: COL.name }} />
          <col style={{ width: COL.duty }} />
        </colgroup>
        <thead>
          <tr style={{ background: C.th }}>
            {["No.", "会場", "氏名", "役割"].map((h) => (
              <th
                key={h}
                className="py-0 text-[10px] font-bold leading-[15px]"
                style={{ borderBottom: `1px solid ${C.kuroko}` }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => {
            const att = seats.get(i);
            const isGuest = att?.category === "guest";
            const cell = { height: ROW_H, borderBottom: `1px solid ${C.line}` };
            return (
              <tr key={i} className="align-middle" style={isGuest ? { background: C.guest } : undefined}>
                <td
                  className="text-center text-[10px] font-semibold"
                  style={{ ...cell, color: att ? C.sub : "#c9c3b8" }}
                >
                  {i + 1}
                </td>
                <td
                  className="overflow-hidden whitespace-nowrap px-1 text-center text-[10px]"
                  style={{ ...cell, color: C.sub }}
                >
                  {att ? venueCell(att) : ""}
                </td>
                <td className="overflow-hidden whitespace-nowrap px-1 text-center" style={cell}>
                  {att && (
                    <span className="inline-flex items-center gap-1 font-bold">
                      {att.name}
                      {att.isFirstTime && <FirstBadge />}
                    </span>
                  )}
                </td>
                <td
                  className="overflow-hidden whitespace-nowrap px-1 text-center text-[10px]"
                  style={{ ...cell, color: C.sub }}
                >
                  {att ? remarksCell(att) : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
