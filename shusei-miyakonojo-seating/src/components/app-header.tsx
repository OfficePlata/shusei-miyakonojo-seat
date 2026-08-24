"use client";

import type { SeatingEvent } from "@/lib/types";
import { EventSwitcher } from "./event-switcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/lib/store";
import { nextTableName } from "@/lib/events";
import { useCurrentEvent } from "@/lib/store";
import {
  CloudDownload,
  CloudUpload,
  Eraser,
  LayoutGrid,
  Loader2,
  MoreVertical,
  Plus,
  Printer,
  RefreshCw,
  Rows4,
  Sparkles,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  onNewEvent: () => void;
  onEditEvent: (e: SeatingEvent) => void;
  onAutoAssign: () => void;
  onTableConfig: () => void;
  onPrint: () => void;
}

export function AppHeader({
  onNewEvent,
  onEditEvent,
  onAutoAssign,
  onTableConfig,
  onPrint,
}: Props) {
  const event = useCurrentEvent();
  const addTable = useStore((s) => s.addTable);
  const clearAssignments = useStore((s) => s.clearAssignments);
  const loadAttendees = useStore((s) => s.loadAttendeesFromLark);
  const saveSeating = useStore((s) => s.saveSeatingToLark);
  const sync = useStore((s) => s.sync);
  const activeRotation = useStore((s) => s.activeRotation);
  const setRotation = useStore((s) => s.setRotation);
  const runSecondRotation = useStore((s) => s.runSecondRotation);
  const clearSecondRotation = useStore((s) => s.clearSecondRotation);
  const arrangeTables = useStore((s) => s.arrangeTables);
  const hasSecond = !!event?.assignments2?.length;
  const seated = event?.assignments.length ?? 0;

  /** 2回転目を作る。TM とゲストはそのまま、残りの顔ぶれを入れ替える */
  const handleSecondRotation = () => {
    if (!event) return;
    if (seated === 0) {
      toast.error("先に1回転目を配置してください");
      return;
    }
    if (hasSecond && !confirm("2回転目を作り直します。よろしいですか？")) return;
    runSecondRotation();
    toast.success("2回転目を作りました（TM とゲストは同じ卓のまま）");
  };

  /** Lark の出欠記録から、出席の回答がある人を読み込む */
  const handleLoad = async () => {
    if (!event) return;
    if (
      event.attendees.length > 0 &&
      !confirm(
        `「${event.title}」の参加者を Lark の最新の出欠で読み直します。\n` +
          `このツールで手を加えた参加者（追加・編集）は失われます。よろしいですか？`,
      )
    ) {
      return;
    }
    try {
      const n = await loadAttendees();
      toast.success(`参加者 ${n} 名を読み込みました（出席の回答がある人）`);
    } catch (e) {
      toast.error(
        `読み込めませんでした: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };

  /** 卓割を Lark へ保存する。ポータルの受付名簿がこの結果を読む */
  const handleSave = async () => {
    if (!event) return;
    try {
      const r = await saveSeating();
      const extra =
        r.unknownAttendees > 0
          ? `（このツールで手で足した ${r.unknownAttendees} 名は Lark に行が無いため保存できません）`
          : "";
      toast.success(`卓割を保存しました。${r.updated} 名に反映${extra}`);
    } catch (e) {
      toast.error(
        `保存できませんでした: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };

  const handleAddTable = () => {
    if (!event) return;
    const name = nextTableName(event.tables);
    const maxY = event.tables.reduce((m, t) => Math.max(m, t.y), 0);
    addTable({
      name,
      capacity: 8,
      shape: "round",
      kind: "normal",
      x: 60,
      y: maxY + 40,
    });
    toast.success(`テーブル「${name}」を追加しました`);
  };

  return (
    <header className="no-print z-20 flex h-16 items-center gap-3 border-b bg-gradient-to-r from-[hsl(var(--shusei-red-dark))] to-primary px-3 text-white shadow-md sm:px-4">
      {/* ブランド */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-10 items-center rounded-lg bg-white px-2.5 shadow-sm">
          <img
            src="/brand/logo-header.webp"
            alt="守成クラブ 都城会場"
            className="h-5 w-auto object-contain sm:h-6"
          />
        </div>
        <div className="hidden font-brand text-base font-bold leading-none text-white lg:block">
          座席表メーカー
        </div>
      </div>

      <div className="mx-1 hidden h-8 w-px bg-white/20 sm:block" />

      {/* 例会切り替え */}
      <EventSwitcher onNewEvent={onNewEvent} onEditEvent={onEditEvent} />

      <div className="flex-1" />

      {/* アクション */}
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleAddTable}
          className="hidden gap-1.5 text-white hover:bg-white/15 hover:text-white md:inline-flex"
        >
          <Plus className="size-4" />
          <Table2 className="size-4" />
          卓を追加
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onTableConfig}
          className="hidden gap-1.5 text-white hover:bg-white/15 hover:text-white md:inline-flex"
        >
          <LayoutGrid className="size-4" />
          レイアウト
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleLoad}
          disabled={sync !== "idle"}
          className="hidden gap-1.5 text-white hover:bg-white/15 hover:text-white lg:inline-flex"
          title="Lark の出欠記録から参加者を読み込む"
        >
          {sync === "loading" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CloudDownload className="size-4" />
          )}
          参加者を取得
        </Button>

        {/* 回転の切り替え。2回転目が無いうちは作るボタンだけ出す */}
        <div className="hidden items-center rounded-md bg-white/15 p-0.5 sm:flex">
          <button
            type="button"
            onClick={() => setRotation(1)}
            className={cn(
              "rounded px-2 py-1 text-xs font-bold transition-colors",
              activeRotation === 1
                ? "bg-white text-primary shadow-sm"
                : "text-white/80 hover:text-white",
            )}
          >
            1回転目
          </button>
          {hasSecond ? (
            <button
              type="button"
              onClick={() => setRotation(2)}
              className={cn(
                "rounded px-2 py-1 text-xs font-bold transition-colors",
                activeRotation === 2
                  ? "bg-white text-primary shadow-sm"
                  : "text-white/80 hover:text-white",
              )}
            >
              2回転目
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSecondRotation}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-bold text-white/80 transition-colors hover:text-white"
              title="TM とゲストはそのままで、残りの席を入れ替える"
            >
              <RefreshCw className="size-3" />
              2回転目を作る
            </button>
          )}
        </div>

        <Button
          onClick={onAutoAssign}
          size="sm"
          className="gap-1.5 bg-white font-bold text-primary shadow-sm hover:bg-white/90"
        >
          <Sparkles className="size-4" />
          自動配置
        </Button>

        <Button
          onClick={handleSave}
          disabled={sync !== "idle"}
          size="sm"
          className="gap-1.5 bg-white font-bold text-primary shadow-sm hover:bg-white/90"
          title="卓割を Lark に保存する（受付名簿に反映される）"
        >
          {sync === "saving" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CloudUpload className="size-4" />
          )}
          卓割を保存
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={onPrint}
          className="text-white hover:bg-white/15 hover:text-white"
          title="印刷 / PDF"
        >
          <Printer className="size-5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/15 hover:text-white"
            >
              <MoreVertical className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={handleAddTable} className="md:hidden">
              <Plus className="mr-2 size-4" />
              テーブルを追加
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onTableConfig} className="md:hidden">
              <LayoutGrid className="mr-2 size-4" />
              会場レイアウト設定
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLoad} className="lg:hidden">
              <CloudDownload className="mr-2 size-4" />
              参加者を Lark から取得
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onPrint}>
              <Printer className="mr-2 size-4" />
              印刷 / PDF出力
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { arrangeTables(4); toast.success("卓を横4列に並べ直しました"); }}>
              <Rows4 className="mr-2 size-4" />
              卓を横4列に並べ直す
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSecondRotation} className="sm:hidden">
              <RefreshCw className="mr-2 size-4" />
              {hasSecond ? "2回転目を作り直す" : "2回転目を作る"}
            </DropdownMenuItem>
            {hasSecond && (
              <DropdownMenuItem
                onClick={() => {
                  if (confirm("2回転目を捨てますか？")) {
                    clearSecondRotation();
                    toast.success("2回転目を捨てました");
                  }
                }}
              >
                <Eraser className="mr-2 size-4" />
                2回転目を捨てる
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => {
                if (confirm("座席の配置をすべてリセットしますか？")) {
                  clearAssignments();
                  toast.success("座席をリセットしました");
                }
              }}
            >
              <Eraser className="mr-2 size-4" />
              座席をすべてリセット
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
