"use client";

import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { Assignment, Attendee, SeatingTable } from "@/lib/types";
import { Seat, SEAT_SIZE } from "./seat";
import { GripHorizontal, Crown } from "lucide-react";

interface SeatPos {
  x: number;
  y: number;
}

interface Layout {
  nodeW: number;
  nodeH: number;
  seats: SeatPos[];
  body:
    | { shape: "round"; cx: number; cy: number; r: number }
    | { shape: "rect"; x: number; y: number; w: number; h: number };
}

const GAP = 10;
const PAD = SEAT_SIZE / 2 + 6;

export function computeTableLayout(table: SeatingTable): Layout {
  const n = Math.max(1, table.capacity);

  if (table.shape === "round") {
    const ring = Math.max(78, (n * (SEAT_SIZE + GAP)) / (2 * Math.PI));
    const bodyR = Math.max(38, ring - SEAT_SIZE / 2 - 14);
    const size = 2 * (ring + SEAT_SIZE / 2) + 12;
    const c = size / 2;
    const seats: SeatPos[] = [];
    for (let i = 0; i < n; i++) {
      const angle = (-90 + (360 / n) * i) * (Math.PI / 180);
      seats.push({
        x: c + ring * Math.cos(angle),
        y: c + ring * Math.sin(angle),
      });
    }
    return {
      nodeW: size,
      nodeH: size,
      seats,
      body: { shape: "round", cx: c, cy: c, r: bodyR },
    };
  }

  // rect (来賓席など): 1〜2行に配置
  const perRow = n <= 8 ? n : Math.ceil(n / 2);
  const rows = Math.ceil(n / perRow);
  const rowW = perRow * (SEAT_SIZE + GAP);
  const nodeW = rowW + PAD;
  const barH = 40;
  const nodeH = rows * (SEAT_SIZE + GAP) + barH + GAP + 12;

  const seats: SeatPos[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const countInRow = Math.min(perRow, n - row * perRow);
    const rowStart = (nodeW - countInRow * (SEAT_SIZE + GAP)) / 2;
    seats.push({
      x: rowStart + col * (SEAT_SIZE + GAP) + (SEAT_SIZE + GAP) / 2,
      y: PAD + row * (SEAT_SIZE + GAP),
    });
  }

  return {
    nodeW,
    nodeH,
    seats,
    body: {
      shape: "rect",
      x: PAD / 2,
      y: nodeH - barH - 6,
      w: nodeW - PAD,
      h: barH,
    },
  };
}

interface Props {
  table: SeatingTable;
  assignments: Assignment[];
  attendeeMap: Map<string, Attendee>;
  lockedIds: Set<string>;
  selected: boolean;
  scale?: number;
  onSelectTable: (id: string) => void;
  onSelectAttendee: (a: Attendee) => void;
}

export function TableNode({
  table,
  assignments,
  attendeeMap,
  lockedIds,
  selected,
  scale = 1,
  onSelectTable,
  onSelectAttendee,
}: Props) {
  const layout = computeTableLayout(table);
  const isHead = table.kind === "head";

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `table:${table.id}`,
      data: { tableId: table.id, kind: "table" },
    });

  const seatByIndex = new Map<number, string>();
  for (const a of assignments) {
    if (a.tableId === table.id) seatByIndex.set(a.seatIndex, a.attendeeId);
  }
  const occupied = assignments.filter((a) => a.tableId === table.id).length;

  return (
    <div
      ref={setNodeRef}
      className={cn("absolute select-none", isDragging && "z-30")}
      style={{
        left: table.x,
        top: table.y,
        width: layout.nodeW,
        height: layout.nodeH,
        transform: transform
          ? `translate3d(${transform.x / scale}px, ${transform.y / scale}px, 0)`
          : undefined,
      }}
    >
      {/* テーブル本体 */}
      {layout.body.shape === "round" ? (
        <button
          onClick={() => onSelectTable(table.id)}
          className={cn(
            "absolute flex flex-col items-center justify-center rounded-full border-2 shadow-inner transition-colors",
            isHead
              ? "border-amber-300 bg-gradient-to-b from-amber-50 to-amber-100"
              : "border-border bg-gradient-to-b from-white to-secondary",
            selected && "border-primary ring-2 ring-primary/40",
          )}
          style={{
            left: layout.body.cx - layout.body.r,
            top: layout.body.cy - layout.body.r,
            width: layout.body.r * 2,
            height: layout.body.r * 2,
          }}
        >
          <span
            className={cn(
              "font-brand text-2xl font-bold",
              isHead ? "text-amber-700" : "text-foreground",
            )}
          >
            {table.name}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground">
            {occupied}/{table.capacity}
          </span>
        </button>
      ) : (
        <button
          onClick={() => onSelectTable(table.id)}
          className={cn(
            "absolute flex items-center justify-center gap-2 rounded-lg border-2 shadow-inner transition-colors",
            "border-amber-300 bg-gradient-to-b from-amber-50 to-amber-100",
            selected && "border-primary ring-2 ring-primary/40",
          )}
          style={{
            left: layout.body.x,
            top: layout.body.y,
            width: layout.body.w,
            height: layout.body.h,
          }}
        >
          <Crown className="size-4 text-amber-600" />
          <span className="font-brand text-lg font-bold text-amber-700">
            {table.name}
          </span>
          <span className="text-[10px] font-medium text-amber-700/70">
            {occupied}/{table.capacity}
          </span>
        </button>
      )}

      {/* 席 */}
      {layout.seats.map((pos, i) => {
        const attId = seatByIndex.get(i) ?? null;
        const attendee = attId ? attendeeMap.get(attId) ?? null : null;
        return (
          <Seat
            key={i}
            tableId={table.id}
            seatIndex={i}
            attendee={attendee}
            x={pos.x}
            y={pos.y}
            locked={attId ? lockedIds.has(attId) : false}
            onSelect={onSelectAttendee}
          />
        );
      })}

      {/* 移動ハンドル */}
      <button
        {...listeners}
        {...attributes}
        className={cn(
          "absolute left-1/2 top-0 flex h-6 -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border bg-card px-2 text-[10px] font-semibold text-muted-foreground opacity-0 shadow-sm transition-opacity",
          "cursor-grab touch-none active:cursor-grabbing hover:bg-secondary",
          "group-hover/canvas:opacity-100",
        )}
        title="ドラッグして移動"
      >
        <GripHorizontal className="size-3" />
        移動
      </button>
    </div>
  );
}
