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
  Eraser,
  LayoutGrid,
  MoreVertical,
  Plus,
  Printer,
  Sparkles,
  Table2,
} from "lucide-react";
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
          onClick={onAutoAssign}
          size="sm"
          className="gap-1.5 bg-white font-bold text-primary shadow-sm hover:bg-white/90"
        >
          <Sparkles className="size-4" />
          自動配置
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
            <DropdownMenuItem onClick={onPrint}>
              <Printer className="mr-2 size-4" />
              印刷 / PDF出力
            </DropdownMenuItem>
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
