"use client";

import { useEffect, useRef, useState } from "react";
import { useCurrentEvent } from "@/lib/store";
import type { Attendee, SeatingTable } from "@/lib/types";
import { CATEGORY_ORDER } from "@/lib/types";
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

function TableCard({
  table,
  seats,
}: {
  table: SeatingTable;
  seats: Map<number, Attendee>;
}) {
  const isHead = table.kind === "head";
  const count = seats.size;
  return (
    <div
      className={cn(
        "break-inside-avoid overflow-hidden rounded-lg border",
        isHead ? "border-amber-300" : "border-border",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between px-2.5 py-1.5 text-white",
          isHead ? "bg-amber-500" : "bg-primary",
        )}
      >
        <span className="flex items-center gap-1 font-brand text-base font-bold">
          {isHead && <Crown className="size-4" />}
          {table.name}
          {!isHead && " 卓"}
        </span>
        <span className="text-[11px] font-semibold opacity-90">
          {count}/{table.capacity}
        </span>
      </div>
      <ol className="divide-y">
        {Array.from({ length: table.capacity }).map((_, i) => {
          const att = seats.get(i);
          return (
            <li
              key={i}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 text-xs",
                !att && "bg-muted/30",
              )}
            >
              <span className="w-4 shrink-0 text-center text-[10px] font-bold text-muted-foreground">
                {i + 1}
              </span>
              {att ? (
                <>
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      CATEGORY_STYLES[att.category].dot,
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-bold text-foreground">
                      {att.name}
                    </span>
                    {att.company && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        {att.company}
                      </span>
                    )}
                  </span>
                  {att.isFirstTime && (
                    <span className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700">
                      初
                    </span>
                  )}
                </>
              ) : (
                <span className="text-[10px] text-muted-foreground/60">空席</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
