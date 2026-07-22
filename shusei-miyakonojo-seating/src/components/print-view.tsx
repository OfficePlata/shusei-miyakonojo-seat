"use client";

import { useEffect, useRef, useState } from "react";
import { useCurrentEvent } from "@/lib/store";
import type { Attendee, SeatingTable } from "@/lib/types";
import { CATEGORY_ORDER, dutyLabels } from "@/lib/types";
import { CATEGORY_STYLES, formatEventDate } from "@/lib/ui-helpers";
import { compareTableName } from "@/lib/events";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toPng } from "html-to-image";
import { Crown, Download, Printer, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function PrintView({ open, onClose }: Props) {
  const event = useCurrentEvent();
  const areaRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (open) {
      document.body.classList.add("print-mode");
      return () => document.body.classList.remove("print-mode");
    }
  }, [open]);

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

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-neutral-200">
      {/* ツールバー */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b bg-card px-4 py-2.5 shadow-sm">
        <div className="text-sm font-bold">座席表プレビュー</div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={exportPng}
            disabled={exporting}
          >
            <Download className="size-4" />
            {exporting ? "書き出し中…" : "画像で保存"}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="size-4" />
            印刷 / PDF
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="size-5" />
          </Button>
        </div>
      </div>

      {/* 印刷領域 */}
      <div className="mx-auto my-4 max-w-[1200px] px-4">
        <div
          ref={areaRef}
          className="print-area rounded-lg bg-white p-8 shadow-lg"
        >
          {/* ヘッダー */}
          <div className="mb-5 flex items-end justify-between border-b-2 border-primary pb-3">
            <div>
              <img
                src="/brand/logo-header.webp"
                alt="守成クラブ 都城会場"
                className="mb-1.5 h-6 w-auto object-contain"
              />
              <h1 className="font-brand text-3xl font-bold text-foreground">
                {event.title}　座席表
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatEventDate(event.date)}　会場：{event.venue}
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <div>
                出席 {event.attendees.length}名 / 着席{" "}
                {event.assignments.length}名
              </div>
              <div className="mt-2 flex justify-end gap-2">
                {CATEGORY_ORDER.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1">
                    <span
                      className={cn(
                        "size-2.5 rounded-full",
                        CATEGORY_STYLES[c].dot,
                      )}
                    />
                    {CATEGORY_STYLES[c].label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ステージ表示 */}
          <div className="mb-4 text-center text-[11px] font-semibold tracking-widest text-muted-foreground">
            ▲ 会場前方（ステージ・演台）
          </div>

          {/* テーブルカード */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
            <div className="mt-5 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 p-3">
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
        </div>
      </div>
    </div>
  );
}

/** 会場列の表示：ゲストは「ゲスト」、他会場の会員はその会場名、自会場（都城）会員は空欄 */
function venueCell(att: Attendee): string {
  if (att.category === "guest") return "ゲスト";
  const v = (att.venue ?? "").trim();
  if (!v || v === "都城") return "";
  return v;
}

/** 備考列の表示：役割（TM/受付…）＋役職＋ゲストは紹介者＋自由備考 をまとめる */
function remarksCell(att: Attendee): string {
  const parts: string[] = [];
  parts.push(...dutyLabels(att.duties));
  if (att.role) parts.push(att.role);
  if (att.category === "guest" && att.referrer) parts.push(att.referrer);
  if (att.notes) parts.push(att.notes);
  return parts.join("・");
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
  // 手本に合わせ、最低10行（席数が多い場合は席数分）まで枠を出す
  const rows = Math.max(table.capacity, 10);

  return (
    <div
      className={cn(
        "flex break-inside-avoid overflow-hidden rounded border",
        isHead ? "border-amber-400" : "border-neutral-400",
      )}
    >
      {/* 左：卓番号の縦帯 */}
      <div
        className={cn(
          "flex w-8 shrink-0 flex-col items-center justify-center gap-1 border-r px-0.5 text-center",
          isHead
            ? "border-amber-400 bg-amber-100 text-amber-800"
            : "border-neutral-400 bg-neutral-100 text-neutral-700",
        )}
      >
        {isHead ? (
          <Crown className="size-4" />
        ) : (
          <span className="font-brand text-lg font-bold leading-none">
            {table.name}
          </span>
        )}
        <span className="text-[8px] font-semibold opacity-70">
          {count}/{table.capacity}
        </span>
      </div>

      {/* 右：席の明細テーブル */}
      <table className="w-full table-fixed border-collapse text-[10px]">
        <thead>
          <tr className="bg-neutral-100 text-neutral-600">
            <th className="w-5 border-b border-neutral-300 py-0.5 font-semibold">
              No.
            </th>
            <th className="w-9 border-b border-l border-neutral-300 py-0.5 font-semibold">
              会場
            </th>
            <th className="border-b border-l border-neutral-300 py-0.5 font-semibold">
              氏名
            </th>
            <th className="w-12 border-b border-l border-neutral-300 py-0.5 font-semibold">
              備考
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
                  isGuest && "bg-neutral-200/70",
                  !att && "text-neutral-300",
                )}
              >
                <td className="border-b border-neutral-200 text-center font-semibold text-neutral-500">
                  {i + 1}
                </td>
                <td className="truncate border-b border-l border-neutral-200 px-0.5 text-center text-[9px] text-neutral-600">
                  {att ? venueCell(att) : ""}
                </td>
                <td className="truncate border-b border-l border-neutral-200 px-1">
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
                <td className="truncate border-b border-l border-neutral-200 px-0.5 text-center text-[9px] text-neutral-600">
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
