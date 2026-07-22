"use client";

import { useStore, useCurrentEvent } from "@/lib/store";
import type { SeatingEvent } from "@/lib/types";
import { formatEventDate } from "@/lib/ui-helpers";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  onNewEvent: () => void;
  onEditEvent: (e: SeatingEvent) => void;
}

export function EventSwitcher({ onNewEvent, onEditEvent }: Props) {
  const events = useStore((s) => s.events);
  const current = useCurrentEvent();
  const setCurrentEvent = useStore((s) => s.setCurrentEvent);
  const duplicateEvent = useStore((s) => s.duplicateEvent);
  const deleteEvent = useStore((s) => s.deleteEvent);

  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-10 gap-2 border-white/20 bg-white/10 px-3 text-white hover:bg-white/20 hover:text-white"
        >
          <CalendarDays className="size-4 shrink-0 opacity-90" />
          <span className="flex flex-col items-start leading-tight">
            <span className="text-sm font-bold">
              {current?.title ?? "例会を選択"}
            </span>
            {current && (
              <span className="text-[10px] font-normal opacity-80">
                {formatEventDate(current.date)}・{current.venue}
              </span>
            )}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-80" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>例会を選択</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-72 overflow-y-auto">
          {sorted.map((e) => {
            const active = e.id === current?.id;
            const seated = e.assignments.length;
            return (
              <DropdownMenuItem
                key={e.id}
                className={cn("flex flex-col items-start gap-0.5 py-2", active && "bg-primary/5")}
                onClick={() => setCurrentEvent(e.id)}
              >
                <div className="flex w-full items-center gap-2">
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      active ? "text-primary opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="flex-1 truncate text-sm font-semibold">
                    {e.title}
                  </span>
                </div>
                <span className="pl-6 text-[11px] text-muted-foreground">
                  {formatEventDate(e.date)}・出席 {e.attendees.length}名・着席{" "}
                  {seated}名
                </span>
              </DropdownMenuItem>
            );
          })}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onNewEvent}>
          <Plus className="mr-2 size-4" />
          新しい例会を作成
        </DropdownMenuItem>
        {current && (
          <>
            <DropdownMenuItem onClick={() => onEditEvent(current)}>
              <Pencil className="mr-2 size-4" />
              この例会を編集
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                duplicateEvent(current.id);
                toast.success("例会を複製しました");
              }}
            >
              <Copy className="mr-2 size-4" />
              複製する
            </DropdownMenuItem>
            {events.length > 1 && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  if (confirm(`「${current.title}」を削除しますか？`)) {
                    deleteEvent(current.id);
                    toast.success("例会を削除しました");
                  }
                }}
              >
                <Trash2 className="mr-2 size-4" />
                削除する
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
