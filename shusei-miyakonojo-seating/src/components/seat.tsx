"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { Attendee } from "@/lib/types";
import { CATEGORY_STYLES, visualCategory } from "@/lib/ui-helpers";
import { Lock, Sparkles, Plus } from "lucide-react";
import { useStore } from "@/lib/store";

const SEAT_SIZE = 62;

interface SeatProps {
  tableId: string;
  seatIndex: number;
  attendee: Attendee | null;
  x: number;
  y: number;
  locked?: boolean;
  selected?: boolean;
  onSelect?: (attendee: Attendee) => void;
}

/** 名字（最初のトークン）を優先表示。長い場合は省略。 */
function shortName(name: string): string {
  const compact = name.replace(/\s+/g, "");
  return compact.length > 5 ? compact.slice(0, 5) : compact;
}

export function Seat({
  tableId,
  seatIndex,
  attendee,
  x,
  y,
  locked,
  selected,
  onSelect,
}: SeatProps) {
  const droppable = useDroppable({
    id: `seat:${tableId}:${seatIndex}`,
    data: { tableId, seatIndex },
  });
  const pendingId = useStore((s) => s.selectedAttendeeId);
  const assignments = useStore((s) =>
    s.events.find((e) => e.id === s.currentEventId)?.assignments,
  );
  const pendingUnseated =
    !!pendingId && !assignments?.some((a) => a.attendeeId === pendingId);

  const placePending = () => {
    if (!pendingId) return;
    useStore.getState().assignSeat(pendingId, tableId, seatIndex);
  };

  return (
    <div
      ref={droppable.setNodeRef}
      className="absolute"
      style={{
        left: x - SEAT_SIZE / 2,
        top: y - SEAT_SIZE / 2,
        width: SEAT_SIZE,
        height: SEAT_SIZE,
      }}
    >
      {attendee ? (
        <SeatOccupant
          attendee={attendee}
          locked={locked}
          selected={selected}
          isOver={droppable.isOver}
          onSelect={onSelect}
        />
      ) : (
        <button
          onClick={placePending}
          className={cn(
            "flex size-full items-center justify-center rounded-full border-2 border-dashed text-[11px] font-medium transition-colors",
            droppable.isOver
              ? "border-primary bg-primary/10 text-primary"
              : pendingUnseated
                ? "border-primary/50 bg-primary/5 text-primary hover:border-primary hover:bg-primary/10"
                : "border-border bg-muted/40 text-muted-foreground/60",
          )}
          title={pendingUnseated ? "ここに配置" : `${seatIndex + 1}番席`}
        >
          {pendingUnseated ? (
            <Plus className="size-4" />
          ) : (
            <span>{seatIndex + 1}</span>
          )}
        </button>
      )}
    </div>
  );
}

function SeatOccupant({
  attendee,
  locked,
  selected,
  isOver,
  onSelect,
}: {
  attendee: Attendee;
  locked?: boolean;
  selected?: boolean;
  isOver?: boolean;
  onSelect?: (a: Attendee) => void;
}) {
  const style = CATEGORY_STYLES[visualCategory(attendee)];
  // TM は卓の顔。ひと目で分かるよう金色で縁取る
  const isTm = attendee.duties?.includes("tm");
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `att:${attendee.id}`,
    data: { attendeeId: attendee.id, from: "seat" },
  });

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onSelect?.(attendee)}
      className={cn(
        "animate-seat-pop flex size-full flex-col items-center justify-center rounded-full border-2 bg-card px-1 text-center shadow-sm transition-all",
        "cursor-grab touch-none active:cursor-grabbing hover:z-10 hover:scale-105 hover:shadow-md",
        isTm
          ? "border-amber-500 ring-2 ring-amber-300 shadow-md z-[5]"
          : style.border,
        selected && "ring-2 ring-offset-1 ring-primary z-10 scale-105",
        isOver && "ring-2 ring-primary",
        isDragging && "opacity-30",
      )}
      title={`${attendee.name}（${attendee.company}）`}
    >
      <span
        className={cn(
          "absolute -top-1 left-1/2 h-1.5 w-6 -translate-x-1/2 rounded-full",
          style.dot,
        )}
        aria-hidden
      />
      <span className="line-clamp-2 text-[10px] font-bold leading-[1.1] text-foreground">
        {shortName(attendee.name)}
      </span>
      {attendee.company && (
        <span className="line-clamp-1 w-full text-[8px] leading-tight text-muted-foreground">
          {attendee.company.replace(/(株式会社|有限会社|合同会社)/g, "")}
        </span>
      )}
      {isTm && (
        <span className="absolute -left-1.5 -top-1.5 rounded-full bg-amber-500 px-1 py-px text-[8px] font-bold leading-none text-white shadow">
          TM
        </span>
      )}
      <span className="absolute -right-1 -top-1 flex gap-0.5">
        {attendee.isFirstTime && (
          <span className="flex size-4 items-center justify-center rounded-full bg-amber-400 text-white shadow">
            <Sparkles className="size-2.5" />
          </span>
        )}
        {locked && (
          <span className="flex size-4 items-center justify-center rounded-full bg-slate-700 text-white shadow">
            <Lock className="size-2.5" />
          </span>
        )}
      </span>
    </button>
  );
}

export { SEAT_SIZE };
