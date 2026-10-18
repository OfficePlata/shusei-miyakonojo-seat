"use client";

import type { Assignment, Attendee, SeatingTable } from "@/lib/types";
import type { useCurrentEvent } from "@/lib/store";
import { formatEventDate } from "@/lib/ui-helpers";
import { byVenueRoleKana } from "@/lib/venue-order";

/**
 * 受付・冊子用の名簿（「元データ」の紙）を、座席表と同じデータから刷る。
 *
 * **なぜここで作るのか**
 * 令和8年9月例会では、名簿を Google スプレッドシートで別に作ったため、
 * 名簿の「座席1回目・2回目」とこのツールの座席表が食い違い、参加者を戸惑わせた。
 * 名簿の卓番号をこのツールの卓割（1回転目・2回転目）から直接入れれば、食い違いは起きない。
 *
 * 列・並び・用紙は元の紙（shusei-miyakonojo-seating/元データ/*.pdf）に合わせている。
 * バッジ購入・名札購入・キャンセルなどは当日の手書き欄なので空欄で出す。
 *
 * 印刷事故を避けるため（PDF_PRINT_SAFE_RULES.md）、グラデーション・影・半透明・破線は使わない。
 */

type CurrentEvent = NonNullable<ReturnType<typeof useCurrentEvent>>;

export const ROSTER_DOCS = {
  booklet: { label: "冊子用 参加者一覧", paper: "A3", orientation: "landscape" },
  own: { label: "受付【都城】", paper: "A3", orientation: "portrait" },
  other: { label: "受付【他会場】", paper: "A3", orientation: "portrait" },
  guest: { label: "受付【ゲスト】", paper: "A3", orientation: "portrait" },
  booth: { label: "ブース出展者", paper: "A4", orientation: "landscape" },
} as const;
export type RosterDoc = keyof typeof ROSTER_DOCS;

/** 他会場・ゲストの参加費。1人6,000円固定（2026-10-11 確認） */
const FEE_PER_PERSON = 6000;

const C = {
  shu: "#c8102e",
  kinDeep: "#b28f2b",
  kuroko: "#1f1d1b",
  line: "#d6cfc2",
  th: "#f1ece3",
  zebra: "#faf8f4",
  sub: "#6b6762",
} as const;

/** 本部シートの並び：バッジ（ゴールド→赤→緑）→ 会員種別 → フリガナ */
const BADGE_RANK: Record<string, number> = { ゴールド: 0, 赤: 1, 緑: 2 };
const TYPE_RANK: Record<string, number> = { 代表: 0, 副代表: 1, 世話人: 2, 一般: 3 };
const rank = (map: Record<string, number>, v: string | undefined) => map[v ?? ""] ?? 9;
/** 姓と名の間の空白を落として比べる。空白が残ると「カワジ ミキ」が「カワシマ」より前に来る */
const kanaOf = (a: Attendee) => (a.kana || a.name).replace(/[\s　]/g, "");
const byKana = (a: Attendee, b: Attendee) => kanaOf(a).localeCompare(kanaOf(b), "ja");
const byBadgeRoleKana = (a: Attendee, b: Attendee) =>
  rank(BADGE_RANK, a.sheet?.badge) - rank(BADGE_RANK, b.sheet?.badge) ||
  rank(TYPE_RANK, a.sheet?.memberType) - rank(TYPE_RANK, b.sheet?.memberType) ||
  byKana(a, b);

const isHome = (a: Attendee) => a.category !== "guest" && !(a.venue ?? "").trim();
const isOther = (a: Attendee) => a.category !== "guest" && !!(a.venue ?? "").trim();
const isGuest = (a: Attendee) => a.category === "guest";

const mark = (v: boolean | undefined) => (v ? "◯" : "");

/**
 * カラー絵文字を落とす。会社名などに 💕 が入っていると、Chrome は透明つきの画像として
 * PDF に埋め込み、複合機の事故の原因になる（PDF_PRINT_SAFE_RULES.md §2。ポータルと同じ扱い）
 */
const COLOR_EMOJI = /[\u{1F000}-\u{1FAFF}\u{1FC00}-\u{1FFFF}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;
const printable = (v: string) => v.replace(COLOR_EMOJI, "");
const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

export function RosterSheet({
  doc,
  event,
  rotation,
}: {
  doc: RosterDoc;
  event: CurrentEvent;
  rotation: 1 | 2;
}) {
  // ストアは「表示中の回転」を assignments に、もう一方を assignments2 に持っている。
  // 名簿には常に 1回目・2回目 の順で出すので、表示中の回転に関わらず並べ直す
  const first = rotation === 2 ? (event.assignments2 ?? event.assignments) : event.assignments;
  const second = rotation === 2 ? event.assignments : event.assignments2;
  const seat1 = tableNameMap(first, event.tables);
  const seat2 = tableNameMap(second ?? [], event.tables);
  const hasSecond = !!second?.length;

  const home = event.attendees.filter(isHome);
  const other = event.attendees.filter(isOther);
  const guest = event.attendees.filter(isGuest);
  const unseated1 = event.attendees.filter((a) => !seat1.has(a.id)).length;

  const meta = `${formatEventDate(event.date)}　会場：${event.venue}`;
  const warn = [
    unseated1 > 0 ? `1回目の席が決まっていない人が ${unseated1}名います` : "",
    !hasSecond ? "2回目の卓割がまだありません（座席2回目は空欄で出ます）" : "",
  ].filter(Boolean);

  const seatCols = (a: Attendee) => [seat1.get(a.id) ?? "", seat2.get(a.id) ?? ""];

  let body: React.ReactNode;
  let title: string;
  let stat: { label: string; value: number };

  if (doc === "booklet") {
    title = `都城会場　${event.title}　参加者一覧`;
    stat = { label: "参加者", value: event.attendees.length };
    const head = ["No.", "ブース", "チラシPR", "商談報告", "会員分類", "名前", "フリガナ", "所属", "会員種別", "車座1回目", "車座2回目", "会社名", "事業案内", "紹介者"];
    const widths = [34, 40, 46, 46, 60, 96, 116, 90, 60, 50, 50, 170, 0, 90];
    const rows = (list: Attendee[], venueOf: (a: Attendee) => string) =>
      list.map((a, i) => [
        String(i + 1),
        mark(a.sheet?.booth),
        mark(a.sheet?.flyer),
        mark(a.sheet?.negotiation),
        a.sheet?.badge ?? "",
        a.name,
        a.kana ?? "",
        venueOf(a),
        a.sheet?.memberType ?? "",
        ...seatCols(a),
        a.company,
        a.sheet?.business ?? "",
        a.sheet?.referrer || a.referrer || "",
      ]);
    body = (
      <>
        <Band title="都城会場" count={home.length} />
        <Table head={head} widths={widths} rows={rows([...home].sort(byBadgeRoleKana), () => "都城会場")} center={[0, 1, 2, 3, 4, 9, 10]} strong={[5]} />
        {other.length > 0 && (
          <>
            <Band title="他会場" count={other.length} tone="kin" />
            <Table head={head} widths={widths} rows={rows([...other].sort(byVenueRoleKana), (a) => a.venue ?? "")} center={[0, 1, 2, 3, 4, 9, 10]} strong={[5]} />
          </>
        )}
        {guest.length > 0 && (
          <>
            <Band title="ゲスト" count={guest.length} tone="kin" />
            <Table head={head} widths={widths} rows={rows([...guest].sort(byKana), () => "")} center={[0, 1, 2, 3, 4, 9, 10]} strong={[5]} />
          </>
        )}
      </>
    );
  } else if (doc === "own" || doc === "other") {
    // 他会場は会場ごとに固めて（会場は五十音、その中は役職順）、受付で探しやすくする
    const list = doc === "own" ? [...home].sort(byKana) : [...other].sort(byVenueRoleKana);
    title = `${event.title}　出席者名簿　${doc === "own" ? "都城会場" : "他会場"}`;
    stat = { label: "出席者", value: list.length };
    const groups: { venue: string; people: Attendee[] }[] = [];
    for (const a of list) {
      const v = doc === "own" ? "" : (a.venue ?? "").trim();
      const last = groups[groups.length - 1];
      if (last && last.venue === v) last.people.push(a);
      else groups.push({ venue: v, people: [a] });
    }
    const no = new Map(list.map((a, i) => [a.id, i + 1]));
    body = (
      <>
        {groups.map((g) => (
          <div key={g.venue || "home"}>
            {doc === "other" && <Band title={g.venue} count={g.people.length} tone="kin" />}
            <Table
              head={["No.", "ブース出展", "チラシPR", "商談報告", "二部会", "バッジ購入", "名札購入", "座席1回目", "座席2回目", "名前", "フリガナ", "キャンセル", "会場名", "守成役職", "バッチ", "会社名（屋号）", "紹介者"]}
              widths={[30, 40, 40, 40, 52, 40, 40, 44, 44, 96, 112, 44, 92, 56, 60, 0, 88]}
              rows={g.people.map((a) => [
                String(no.get(a.id)),
                mark(a.sheet?.booth),
                mark(a.sheet?.flyer),
                mark(a.sheet?.negotiation),
                a.sheet?.afterParty === "参加予定" ? "参加予定" : "",
                "",
                "",
                ...seatCols(a),
                a.name,
                a.kana ?? "",
                "",
                doc === "own" ? "都城会場" : (a.venue ?? ""),
                a.sheet?.memberType ?? "",
                a.sheet?.badge ?? "",
                a.company,
                a.sheet?.referrer || "",
              ])}
              center={[0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 13, 14]}
              strong={[7, 8, 9]}
              tall
            />
          </div>
        ))}
        {doc === "other" && <Totals count={list.length} />}
      </>
    );
  } else if (doc === "guest") {
    const list = [...guest].sort(byKana);
    title = `${event.title}　出席者名簿　ゲスト`;
    stat = { label: "ゲスト", value: list.length };
    body = (
      <>
        <Table
          head={["No.", "二部会", "座席1回目", "座席2回目", "名前", "フリガナ", "キャンセル", "会社名（屋号）", "紹介者"]}
          widths={[34, 60, 60, 60, 120, 130, 60, 0, 120]}
          rows={list.map((a, i) => [
            String(i + 1),
            a.sheet?.afterParty === "参加予定" ? "参加予定" : "",
            ...seatCols(a),
            a.name,
            a.kana ?? "",
            "",
            a.company,
            a.referrer || a.sheet?.referrer || "",
          ])}
          center={[0, 1, 2, 3, 6]}
          strong={[2, 3, 4]}
          tall
        />
        <Totals count={list.length} />
      </>
    );
  } else {
    // ブース：自会場（フリガナ順）→ 他会場（会場の五十音 → 役職 → フリガナ）
    const list = [
      ...home.filter((a) => a.sheet?.booth).sort(byKana),
      ...other.filter((a) => a.sheet?.booth).sort(byVenueRoleKana),
    ];
    title = "ブース出展者";
    stat = { label: "出展", value: list.length };
    body = list.length === 0 ? (
      <p className="py-6 text-center text-sm" style={{ color: C.sub }}>
        ブース出展の回答はまだありません（本部シートの取り込み後に出ます）。
      </p>
    ) : (
      <Table
        head={["No.", "お名前", "会社名", "会場名", "会員ランク", "出展料", "キャンセル", "その他"]}
        widths={[34, 120, 0, 110, 70, 80, 70, 150]}
        rows={list.map((a, i) => [
          String(i + 1),
          a.name,
          a.company,
          isOther(a) ? (a.venue ?? "") : "都城会場",
          a.sheet?.badge ?? "",
          "",
          "",
          "",
        ])}
        center={[0, 4, 6]}
        strong={[1]}
        tall
      />
    );
  }

  return (
    <div style={{ color: C.kuroko }}>
      {warn.length > 0 && (
        <div
          className="no-print mb-3 rounded-md px-3 py-2 text-xs font-semibold"
          style={{ background: "#fcf1f3", border: `1px solid #e5a3ae`, color: C.shu }}
        >
          {warn.map((w) => (
            <p key={w}>⚠ {w}</p>
          ))}
        </div>
      )}
      <p
        className="no-print mb-3 rounded-md px-3 py-2 text-xs"
        style={{ background: C.zebra, border: `1px solid ${C.line}`, color: C.sub }}
      >
        印刷の前に、ヘッダの「卓割を保存」で Lark へ保存してください。ポータルの受付名簿も同じ卓番号になります。
      </p>

      <div
        className="mb-3 flex items-end justify-between gap-4 pb-2"
        style={{ borderBottom: `2px solid ${C.kuroko}` }}
      >
        <div>
          <p className="text-[11px] font-semibold" style={{ color: C.sub }}>
            守成クラブ 都城会場
          </p>
          <h1 className="font-brand text-[24px] font-bold leading-tight tracking-wide">{title}</h1>
          <p className="mt-0.5 text-xs" style={{ color: C.sub }}>
            {meta}
          </p>
        </div>
        <div className="text-right leading-none">
          <div className="mb-1 text-[11px]" style={{ color: C.sub }}>
            {stat.label}
          </div>
          <span className="text-[30px] font-bold tabular-nums" style={{ color: C.shu }}>
            {stat.value}
          </span>
          <span className="ml-0.5 text-xs">名</span>
        </div>
      </div>

      {body}

      <div
        className="mt-4 flex justify-between pt-1.5 text-[10px]"
        style={{ borderTop: `1px solid ${C.line}`, color: C.sub }}
      >
        <span>守成クラブ 都城会場　座席表メーカー（座席表と同じ卓割から作成）</span>
        <span>作成日：{new Date().toLocaleDateString("ja-JP")}</span>
      </div>
    </div>
  );
}

/** attendeeId → 卓名 */
function tableNameMap(assignments: Assignment[], tables: SeatingTable[]): Map<string, string> {
  const nameOf = new Map(tables.map((t) => [t.id, t.kind === "head" ? "主賓" : t.name]));
  const map = new Map<string, string>();
  for (const a of assignments) {
    const n = nameOf.get(a.tableId);
    if (n) map.set(a.attendeeId, n);
  }
  return map;
}

function Band({ title, count, tone = "shu" }: { title: string; count: number; tone?: "shu" | "kin" }) {
  return (
    <h2
      className="mb-1 mt-3 flex items-baseline gap-2 rounded px-3 py-1 text-sm font-bold first:mt-0"
      style={{ background: tone === "shu" ? C.shu : C.kinDeep, color: "#fff", breakAfter: "avoid" }}
    >
      {title}
      <span className="text-lg tabular-nums">{count}</span>
      <span className="text-[10px]">名</span>
    </h2>
  );
}

/**
 * 名簿の表。列幅 0 は残りの幅を使う列。
 * thead は各ページの頭に繰り返し出る（Chrome は印刷時に thead を繰り返す）。
 */
function Table({
  head,
  widths,
  rows,
  center = [],
  strong = [],
  tall = false,
}: {
  head: string[];
  widths: number[];
  rows: string[][];
  center?: number[];
  strong?: number[];
  /** 受付で手書きするので行を高くする */
  tall?: boolean;
}) {
  const cell = { border: `1px solid ${C.line}` };
  return (
    <table className="w-full table-fixed border-collapse text-[11px] leading-snug">
      <colgroup>
        {widths.map((w, i) => (
          <col key={i} style={w ? { width: w } : undefined} />
        ))}
      </colgroup>
      <thead>
        <tr style={{ background: C.th }}>
          {head.map((h) => (
            <th
              key={h}
              className="px-1 py-1 text-center text-[10px] font-bold leading-tight"
              style={{ ...cell, borderBottom: `2px solid ${C.kuroko}` }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ background: i % 2 ? C.zebra : "#fff", breakInside: "avoid" }}>
            {r.map((v, j) => (
              <td
                key={j}
                className={`px-1.5 ${tall ? "py-1.5" : "py-1"} align-middle ${center.includes(j) ? "text-center" : ""} ${strong.includes(j) ? "font-bold" : ""}`}
                style={{ ...cell, color: strong.includes(j) ? C.kuroko : undefined }}
              >
                {printable(v)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 他会場・ゲストの集計。結果欄は当日の手書き用 */
function Totals({ count }: { count: number }) {
  const cell = { border: `1px solid ${C.line}` };
  return (
    <table className="ml-auto mt-3 border-collapse text-xs" style={{ breakInside: "avoid" }}>
      <tbody>
        {[
          ["合計人数", `${count}名`],
          ["合計金額", yen(count * FEE_PER_PERSON)],
          ["結果人数", ""],
          ["結果金額", ""],
        ].map(([k, v]) => (
          <tr key={k}>
            <th className="w-24 px-3 py-1.5 text-left font-bold" style={{ ...cell, background: C.th }}>
              {k}
            </th>
            <td className="w-36 px-3 py-1.5 text-right font-bold tabular-nums" style={cell}>
              {v}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
