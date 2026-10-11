"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore, useCurrentEvent } from "@/lib/store";
import type { Attendee, SeatingTable } from "@/lib/types";
import { dutyLabels } from "@/lib/types";
import { CATEGORY_STYLES, formatEventDate } from "@/lib/ui-helpers";
import { compareTableName } from "@/lib/events";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toPng } from "html-to-image";
import { Crown, Download, Printer, X } from "lucide-react";
import { toast } from "sonner";
import { ClearSheet } from "@/components/print-view-clear";
import { ROSTER_DOCS, RosterSheet, type RosterDoc } from "@/components/roster-sheets";

interface Props {
  open: boolean;
  onClose: () => void;
}

// 96dpi での 1mm あたり px（CSS の物理サイズ換算）
const MM = 96 / 25.4;
const PAGE_MARGIN_MM = 8;
const PAPERS = {
  a4: { label: "A4", w: 297, h: 210 },
  a3: { label: "A3", w: 420, h: 297 },
} as const;
type Paper = keyof typeof PAPERS;

/**
 * 印刷のデザイン。classic は世話人が使ってきた手本どおりの座席表（中身は一切変えない）、
 * clear はポータルの印刷物と同じ「見やすい版」の意匠（print-view-clear.tsx）。載せる項目は同じ。
 */
const DESIGNS = {
  classic: "これまでのデザイン",
  clear: "見やすいデザイン",
} as const;
type Design = keyof typeof DESIGNS;
/** 端末ごとに最後に選んだデザインを覚える。store.ts（Lark と同期する状態）には入れない */
const DESIGN_KEY = "seat:print-design";

function loadDesign(): Design {
  try {
    const v = localStorage.getItem(DESIGN_KEY);
    return v === "clear" ? "clear" : "classic";
  } catch {
    return "classic";
  }
}

/**
 * 卓の表の列幅（px）。世話人が使っている手本の座席表と同じ寸法にしてある。
 * 卓ひとつで 30+30+104+104+104 = 372px、横に4卓で 1488px。A3ヨコにそのまま収まる。
 */
const COL = { tableNo: 30, no: 30, venue: 104, name: 104, duty: 104 } as const;
const CARD_W = COL.tableNo + COL.no + COL.venue + COL.name + COL.duty;

export function PrintView({ open, onClose }: Props) {
  const event = useCurrentEvent();
  const rotation = useStore((s) => s.activeRotation);
  const areaRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [paper, setPaper] = useState<Paper>("a3");
  const [fitOnePage, setFitOnePage] = useState(true);
  const [scale, setScale] = useState(1);
  const [design, setDesignState] = useState<Design>("classic");
  /** 何を刷るか。座席表か、同じ卓割から作る受付・冊子用の名簿（roster-sheets.tsx） */
  const [doc, setDoc] = useState<"seat" | RosterDoc>("seat");

  // 初回表示時に端末の記憶を読む（SSR 時は localStorage が無いので effect で読む）
  useEffect(() => {
    if (open) setDesignState(loadDesign());
  }, [open]);

  const setDesign = (d: Design) => {
    setDesignState(d);
    try {
      localStorage.setItem(DESIGN_KEY, d);
    } catch {
      // 保存できなくても印刷はできる
    }
  };

  // 用紙の内寸（余白を除いた印字可能領域）を px 換算
  const innerW = Math.round((PAPERS[paper].w - PAGE_MARGIN_MM * 2) * MM);
  const innerH = Math.round((PAPERS[paper].h - PAGE_MARGIN_MM * 2) * MM);

  useEffect(() => {
    if (open) {
      document.body.classList.add("print-mode");
      return () => document.body.classList.remove("print-mode");
    }
  }, [open]);

  // コンテンツの実高さを測り、1ページに収まる縮小率を算出する
  useLayoutEffect(() => {
    if (!open) return;
    const el = areaRef.current;
    if (!el) return;
    const measure = () => {
      const contentH = el.scrollHeight;
      const s =
        fitOnePage && contentH > 0 ? Math.min(1, innerH / contentH) : 1;
      setScale(s);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, fitOnePage, innerH, innerW, event, design]);

  if (!open || !event) return null;

  const attendeeMap = new Map(event.attendees.map((a) => [a.id, a]));
  const seatMap = new Map<string, Map<number, Attendee>>();
  for (const t of event.tables) seatMap.set(t.id, new Map());
  for (const a of event.assignments) {
    const att = attendeeMap.get(a.attendeeId);
    if (att) seatMap.get(a.tableId)?.set(a.seatIndex, att);
  }

  const assignedIds = new Set(event.assignments.map((a) => a.attendeeId));
  const unseated = event.attendees.filter((a) => !assignedIds.has(a.id));

  const orderedTables = [...event.tables].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "head" ? -1 : 1;
    return compareTableName(a.name, b.name);
  });

  const exportPng = async () => {
    if (!areaRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(areaRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${event.title}_座席表.png`;
      a.click();
      toast.success("画像を保存しました");
    } catch {
      toast.error("画像の書き出しに失敗しました");
    } finally {
      setExporting(false);
    }
  };

  const overflowing = fitOnePage && scale < 0.999;
  const paperLabel =
    doc === "seat"
      ? `${PAPERS[paper].label}・ヨコ`
      : `${ROSTER_DOCS[doc].paper}・${ROSTER_DOCS[doc].orientation === "landscape" ? "ヨコ" : "タテ"}`;

  return (
    <div className="print-overlay fixed inset-0 z-50 overflow-auto bg-neutral-200">
      {/* 選択中の用紙で印刷サイズを指定（A4/A3 ヨコ） */}
      <style>{
        doc === "seat"
          ? `@media print { @page { size: ${PAPERS[paper].label} landscape; margin: ${PAGE_MARGIN_MM}mm; } }`
          : `@media print { @page { size: ${ROSTER_DOCS[doc].paper} ${ROSTER_DOCS[doc].orientation}; margin: ${PAGE_MARGIN_MM}mm; } }`
      }</style>

      {/* ツールバー */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="text-sm font-bold">印刷プレビュー</div>
          {/* 作る紙。ドロップダウンだと選択肢があることに気づかれないので、全部を並べて見せる */}
          <div className="flex flex-wrap overflow-hidden rounded-md border" role="group" aria-label="作る紙">
            {(["seat", ...Object.keys(ROSTER_DOCS)] as ("seat" | RosterDoc)[]).map((d) => (
              <button
                key={d}
                type="button"
                data-doc={d}
                onClick={() => setDoc(d)}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold transition-colors",
                  doc === d
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-foreground hover:bg-accent",
                )}
              >
                {d === "seat" ? "座席表" : ROSTER_DOCS[d].label}
              </button>
            ))}
          </div>
          {doc === "seat" && (
          <>
          {/* デザイン */}
          <div className="flex overflow-hidden rounded-md border">
            {(Object.keys(DESIGNS) as Design[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDesign(d)}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold transition-colors",
                  design === d
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                {DESIGNS[d]}
              </button>
            ))}
          </div>
          {/* 用紙サイズ */}
          <div className="flex overflow-hidden rounded-md border">
            {(Object.keys(PAPERS) as Paper[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPaper(p)}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold transition-colors",
                  paper === p
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                {PAPERS[p].label}ヨコ
              </button>
            ))}
          </div>
          {/* 1ページに収める */}
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium">
            <input
              type="checkbox"
              checked={fitOnePage}
              onChange={(e) => setFitOnePage(e.target.checked)}
              className="size-3.5 accent-primary"
            />
            1ページに収める
          </label>
          {fitOnePage && (
            <span className="text-[11px] text-muted-foreground">
              {overflowing
                ? `自動縮小 ${Math.round(scale * 100)}%`
                : "原寸で収まっています"}
            </span>
          )}
          </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-1.5", doc !== "seat" && "hidden")}
            onClick={exportPng}
            disabled={exporting}
          >
            <Download className="size-4" />
            {exporting ? "書き出し中…" : "画像で保存"}
          </Button>
          {/* プリンター側の用紙の選び間違いが一番多い。今の紙に必要な用紙を常に見せる */}
          <span className="text-xs font-semibold text-muted-foreground">
            プリンターで「{paperLabel}」を選んでください
          </span>
          <Button className="gap-1.5 px-5 font-bold" onClick={() => window.print()}>
            <Printer className="size-4" />
            印刷する
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="size-5" />
          </Button>
        </div>
      </div>

      {/* 名簿。複数ページにまたがるので、座席表のような1ページ枠・自動縮小はしない */}
      {doc !== "seat" && (
        <div className="print-preview-wrap mx-auto my-4 w-fit px-4">
          <div
            className="print-sheet mx-auto bg-white p-3 shadow-lg"
            style={{ width: rosterInnerW(doc) }}
          >
            <RosterSheet doc={doc} event={event} rotation={rotation} />
          </div>
        </div>
      )}

      {/* 印刷領域（用紙1ページを表す枠。fitOnePage 時は内容を自動縮小して収める） */}
      <div className={cn("print-preview-wrap mx-auto my-4 w-fit px-4", doc !== "seat" && "hidden")}>
        <div
          className="print-sheet relative mx-auto bg-white shadow-lg"
          style={{
            width: innerW,
            height: fitOnePage ? innerH : "auto",
            overflow: fitOnePage ? "hidden" : "visible",
          }}
        >
          <div
            className="print-scale origin-top-left"
            // zoom で縮める。transform は見た目だけ縮めるので、印刷のページ割りが縮小前の高さで
            // 決まり、下の段や未着席が2ページ目へ送られていた（2026-10-11 実測）。
            // zoom はレイアウトごと縮むので、縮めた寸法のまま1ページに収まる。見た目は同じ
            style={{ width: innerW, zoom: scale }}
          >
            <div ref={areaRef} className="print-area bg-white p-3">
          {design === "clear" ? (
            <ClearSheet
              event={event}
              rotation={rotation}
              tables={orderedTables}
              seatMap={seatMap}
              unseated={unseated}
            />
          ) : (
          <>
          {/* ヘッダー */}
          <div className="mb-3 flex items-end justify-between border-b-2 border-neutral-800 pb-2">
            <div>
              <img
                src="/brand/logo-print.png"
                alt="守成クラブ 都城会場"
                className="mb-1 h-5 w-auto object-contain"
              />
              <h1 className="font-brand text-2xl font-bold text-neutral-900">
                {event.title}　座席表　{rotation === 1 ? "1回目" : "2回目"}
              </h1>
              <p className="mt-0.5 text-xs text-neutral-600">
                {formatEventDate(event.date)}　会場：{event.venue}
              </p>
            </div>
            <div className="text-right text-[11px] text-neutral-600">
              <div className="font-semibold">
                出席 {event.attendees.length}名 / 着席{" "}
                {event.assignments.length}名
              </div>
              {/* モノクロ印刷向けの凡例 */}
              <div className="mt-1.5 flex items-center justify-end gap-3">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-3 w-4 rounded-sm border border-neutral-400 bg-neutral-200" />
                  ゲスト
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="font-bold text-neutral-800">初</span>
                  ＝初参加
                </span>
              </div>
            </div>
          </div>

          {/* テーブルカード */}
          <div
            className="print-grid grid gap-0.5"
            style={{
              gridTemplateColumns: `repeat(4, ${CARD_W}px)`,
              justifyContent: "start",
            }}
          >
            {orderedTables.map((t) => (
              <TableCard
                key={t.id}
                table={t}
                seats={seatMap.get(t.id) ?? new Map()}
              />
            ))}
          </div>

          {/* 未着席 */}
          {unseated.length > 0 && (
            <div className="mt-5 rounded-lg border border-amber-300 bg-[#fffdf5] p-3">
              <div className="mb-1.5 text-sm font-bold text-amber-800">
                未着席（{unseated.length}名）
              </div>
              <div className="flex flex-wrap gap-1.5">
                {unseated.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1 rounded border bg-white px-2 py-0.5 text-xs"
                  >
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        CATEGORY_STYLES[a.category].dot,
                      )}
                    />
                    {a.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-between border-t pt-2 text-[10px] text-muted-foreground">
            <span>守成クラブ 都城会場　座席表メーカー</span>
            <span>
              作成日：
              {new Date().toLocaleDateString("ja-JP")}
            </span>
          </div>
          </>
          )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 名簿の用紙の内寸（px）。余白は座席表と同じ */
function rosterInnerW(doc: RosterDoc): number {
  const { paper, orientation } = ROSTER_DOCS[doc];
  const size = paper === "A3" ? { long: 420, short: 297 } : { long: 297, short: 210 };
  const w = orientation === "landscape" ? size.long : size.short;
  return Math.round((w - PAGE_MARGIN_MM * 2) * MM);
}

/**
 * 会場列：ゲストは「ゲスト」、他会場はその会場名、自会場（都城）は空欄。
 * 幅が限られるので「〇〇会場」の「会場」は落とす（沖縄北部やんばる会場 → 沖縄北部やんばる）
 */
export function venueCell(att: Attendee): string {
  if (att.category === "guest") return "ゲスト";
  const v = (att.venue ?? "").trim();
  if (!v || /都城|自会場/.test(v)) return "";
  return v.replace(/会場$/, "");
}

/**
 * 役割列：ゲストは紹介者の名前、会員は当日の役割（TM・受付・ブースなど）。
 * 手本の座席表に合わせ、世話人の役職と事業案内はここに出さない（列に収まらない）
 */
export function remarksCell(att: Attendee): string {
  if (att.category === "guest") return att.referrer ?? "";
  return dutyLabels(att.duties).join("・");
}

function TableCard({
  table,
  seats,
}: {
  table: SeatingTable;
  seats: Map<number, Attendee>;
}) {
  const isHead = table.kind === "head";
  const count = seats.size;
  // 手本に合わせ、最低10行（席数が多い場合は席数分）まで枠を出す。
  // 空行は当日の飛び込みを書き込む欄になる
  const rows = Math.max(table.capacity, 10);

  return (
    <div
      className={cn(
        "flex break-inside-avoid overflow-hidden border",
        isHead ? "border-amber-400" : "border-neutral-500",
      )}
      style={{ width: CARD_W }}
    >
      {/* 左：卓番号の縦帯 */}
      <div
        className={cn(
          "flex shrink-0 flex-col items-center justify-center gap-0.5 border-r text-center",
          isHead
            ? "border-amber-400 bg-amber-100 text-amber-800"
            : "border-neutral-500 bg-neutral-200 text-neutral-800",
        )}
        style={{ width: COL.tableNo }}
      >
        {isHead ? (
          <Crown className="size-4" />
        ) : (
          <span className="font-brand text-base font-bold leading-none">
            {table.name}
          </span>
        )}
        <span className="text-[8px] font-semibold text-neutral-500">
          {count}/{table.capacity}
        </span>
      </div>

      {/* 右：席の明細テーブル。列幅は手本の座席表に合わせて固定 */}
      <table className="table-fixed border-collapse text-[11px] leading-tight">
        <colgroup>
          <col style={{ width: COL.no }} />
          <col style={{ width: COL.venue }} />
          <col style={{ width: COL.name }} />
          <col style={{ width: COL.duty }} />
        </colgroup>
        <thead>
          <tr className="bg-neutral-200 text-neutral-800">
            <th className="border-b border-neutral-500 py-0.5 text-[10px] font-bold">
              No.
            </th>
            <th className="border-b border-l border-neutral-500 py-0.5 text-[10px] font-bold">
              会場
            </th>
            <th className="border-b border-l border-neutral-500 py-0.5 text-[10px] font-bold">
              氏名
            </th>
            <th className="border-b border-l border-neutral-500 py-0.5 text-[10px] font-bold">
              役割
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => {
            const att = seats.get(i);
            const isGuest = att?.category === "guest";
            return (
              <tr
                key={i}
                className={cn(
                  "align-middle",
                  isGuest && "bg-[#ededed]",
                  !att && "text-neutral-300",
                )}
              >
                <td className="h-5 border-b border-neutral-300 text-center text-[10px] font-semibold text-neutral-500">
                  {i + 1}
                </td>
                <td className="h-5 overflow-hidden whitespace-nowrap border-b border-l border-neutral-300 px-1 text-center text-[10px] text-neutral-700">
                  {att ? venueCell(att) : ""}
                </td>
                <td className="h-5 overflow-hidden whitespace-nowrap border-b border-l border-neutral-300 px-1 text-center">
                  {att ? (
                    <span className="font-bold text-neutral-900">
                      {att.name}
                      {att.isFirstTime && (
                        <span className="ml-0.5 text-[8px] font-bold text-amber-600">
                          初
                        </span>
                      )}
                    </span>
                  ) : (
                    ""
                  )}
                </td>
                <td className="h-5 overflow-hidden whitespace-nowrap border-b border-l border-neutral-300 px-1 text-center text-[10px] text-neutral-700">
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
