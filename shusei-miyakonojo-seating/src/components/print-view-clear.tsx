"use client";

import type { Attendee, Duty, SeatingTable } from "@/lib/types";
import type { useCurrentEvent } from "@/lib/store";
import { formatEventDate } from "@/lib/ui-helpers";

/**
 * 座席表の「見やすいデザイン」。印刷画面のツールバーで「これまでのデザイン」と切り替える。
 *
 * 見本は「座席表_9月例会_見やすい版.pdf」（2026-10-11 受領）:
 * - 卓は横7列。紺の帯に大きな卓番号と人数
 * - 中身は 席番号・氏名・役割の札 だけ。空席の行は出さない（行は卓の高さいっぱいに均等に広げる）
 * - ゲストの行は淡いピンク、名前の下に「紹介：〇〇」。他会場は名前の下に「宮崎から参加」
 * - 1回目は青、2回目は橙の札。余ったマスに「見かた」
 *
 * PDF_PRINT_SAFE_RULES.md に合わせて、次は使わない:
 * グラデーション / 影 / 半透明 / 破線・点線（見本の凡例の破線は淡い実線にした）/ SVG アイコン /
 * 角丸＋overflow:hidden の組み合わせ。色はすべて不透明の16進で書く。
 */

type CurrentEvent = NonNullable<ReturnType<typeof useCurrentEvent>>;

/** 横に並べる卓の数。A3ヨコで1卓あたり約210px */
const COLS = 7;

const C = {
  ink: "#1f2430",
  navy: "#1e2533",
  sub: "#6b7280",
  faint: "#9ca3af",
  line: "#e3e6eb",
  cardLine: "#c9ced8",
  guestBg: "#fdeef3",
  other: "#1d4ed8",
  legendBg: "#f6f7f9",
} as const;

/** 役割の札。色だけでなく文字でも分かるようにしている（モノクロ印刷でも読める） */
const BADGE: Record<string, { label: string; bg: string }> = {
  tm: { label: "TM", bg: "#1e2533" },
  mc: { label: "司会", bg: "#0f766e" },
  reception: { label: "受付", bg: "#2f855a" },
  booth: { label: "ブース", bg: "#dd6b20" },
  flyer: { label: "チラシ", bg: "#6b46c1" },
  negotiation: { label: "商談", bg: "#2563eb" },
  guest: { label: "ゲスト", bg: "#d53f7f" },
};
const BADGE_ORDER: (Duty | "guest")[] = ["tm", "mc", "reception", "booth", "flyer", "negotiation", "guest"];

/** 「宮崎会場」→「宮崎から参加」。他会場の人だけ */
function otherVenueNote(a: Attendee): string {
  if (a.category === "guest") return "";
  const v = (a.venue ?? "").trim();
  if (!v || /都城|自会場/.test(v)) return "";
  return `${v.replace(/会場$/, "")}から参加`;
}

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
  const second = rotation !== 1;
  const seated = event.assignments.length;

  return (
    <div style={{ color: C.ink }}>
      {/* 用紙の頭 */}
      <div
        className="mb-3 flex items-end justify-between gap-4 pb-2"
        style={{ borderBottom: `2px solid ${C.ink}` }}
      >
        <div>
          <h1 className="flex items-center gap-3 text-[28px] font-bold leading-tight tracking-wide">
            <span>{event.title}　座席表</span>
            <span
              className="rounded px-3 py-0.5 text-[20px] font-bold"
              style={{ background: second ? "#c2410c" : "#1d5fbf", color: "#fff" }}
            >
              {second ? "2回目" : "1回目"}
            </span>
          </h1>
          <p className="mt-1 text-xs" style={{ color: C.sub }}>
            {formatEventDate(event.date)}　会場：{event.venue}
          </p>
        </div>
        <p className="text-sm" style={{ color: C.sub }}>
          出席 <b className="text-[22px]" style={{ color: C.ink }}>{event.attendees.length}</b>名 ／ 着席{" "}
          <b className="text-[22px]" style={{ color: C.ink }}>{seated}</b>名　・　全{tables.length}テーブル
        </p>
      </div>

      {/* 卓。行ごとに高さがそろい、各卓の中は人数ぶんの行が均等に広がる */}
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gap: 10 }}
      >
        {tables.map((t) => (
          <TableCard key={t.id} table={t} seats={seatMap.get(t.id) ?? new Map()} />
        ))}
        <Legend />
      </div>

      {unseated.length > 0 && (
        <div className="mt-3" style={{ breakInside: "avoid" }}>
          <p className="mb-1 text-sm font-bold">
            未着席 <span style={{ color: C.sub }}>{unseated.length}名</span>
          </p>
          <p className="text-xs leading-relaxed">{unseated.map((a) => a.name).join("　")}</p>
        </div>
      )}
    </div>
  );
}

function TableCard({ table, seats }: { table: SeatingTable; seats: Map<number, Attendee> }) {
  const people = [...seats.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div
      className="flex flex-col rounded-md bg-white"
      style={{ border: `1px solid ${C.cardLine}`, breakInside: "avoid", minHeight: 300 }}
    >
      {/* 紺の帯。角は帯そのものを丸める（親で切り抜かない） */}
      <div
        className="flex items-end justify-between rounded-t-[5px] px-2.5 pb-1 pt-0.5"
        style={{ background: C.navy, color: "#fff" }}
      >
        <span className="flex items-baseline gap-1">
          <span className="text-[30px] font-bold leading-none tabular-nums">{table.name}</span>
          <span className="text-[11px]">テーブル</span>
        </span>
        <span className="text-[11px]">{people.length}名</span>
      </div>

      <div className="flex flex-1 flex-col">
        {people.map(([seat, a], i) => (
          <Row key={a.id} seatNo={seat + 1} a={a} last={i === people.length - 1} />
        ))}
      </div>
    </div>
  );
}

function Row({ seatNo, a, last }: { seatNo: number; a: Attendee; last: boolean }) {
  const guest = a.category === "guest";
  const sub = guest ? (a.referrer ? `紹介：${a.referrer}` : "") : otherVenueNote(a);
  const badges = BADGE_ORDER.filter((k) =>
    k === "guest" ? guest : (a.duties ?? []).includes(k as Duty),
  );

  return (
    <div
      className="flex flex-1 items-center gap-1.5 px-2 py-1"
      style={{
        background: guest ? C.guestBg : undefined,
        borderBottom: last ? undefined : `1px solid ${C.line}`,
        minHeight: 34,
      }}
    >
      <span className="w-3 shrink-0 text-right text-[10px]" style={{ color: C.faint }}>
        {seatNo}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold leading-tight">
          {a.name}
          {a.isFirstTime && <span className="ml-1 text-[10px]" style={{ color: "#c2410c" }}>初</span>}
        </span>
        {sub && (
          <span
            className="block truncate text-[9.5px] leading-tight"
            style={{ color: guest ? C.sub : C.other }}
          >
            {sub}
          </span>
        )}
      </span>
      {badges.length > 0 && (
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          {badges.map((k) => (
            <Badge key={k} kind={k} />
          ))}
        </span>
      )}
    </div>
  );
}

function Badge({ kind }: { kind: string }) {
  const b = BADGE[kind];
  if (!b) return null;
  return (
    <span
      className="rounded-[3px] px-1.5 text-[9.5px] font-bold leading-[15px]"
      style={{ background: b.bg, color: "#fff" }}
    >
      {b.label}
    </span>
  );
}

/** 見かた。見本は破線の枠だが、破線は印刷禁止なので淡い実線にする */
function Legend() {
  const items: [string, string][] = [
    ["tm", "テーブルマスター"],
    ["reception", "受付担当"],
    ["booth", "ブース出展"],
    ["flyer", "チラシPR"],
    ["guest", "ゲスト（下に紹介者）"],
  ];
  return (
    <div
      className="rounded-md p-3 text-[10.5px]"
      style={{ border: `1px solid ${C.cardLine}`, background: C.legendBg, breakInside: "avoid" }}
    >
      <p className="mb-2 text-xs font-bold">見かた</p>
      <div className="flex flex-col gap-1.5">
        {items.map(([k, label]) => (
          <span key={k} className="flex items-center gap-2">
            <span className="w-11 shrink-0">
              <Badge kind={k} />
            </span>
            <span style={{ color: C.sub }}>{label}</span>
          </span>
        ))}
        <span className="flex items-center gap-2">
          <span
            className="w-11 shrink-0 rounded-[3px] text-center text-[9.5px] font-bold leading-[15px]"
            style={{ border: `1px solid ${C.other}`, color: C.other }}
          >
            宮崎
          </span>
          <span style={{ color: C.sub }}>他会場からの参加（名前の下に表示）</span>
        </span>
      </div>
    </div>
  );
}
