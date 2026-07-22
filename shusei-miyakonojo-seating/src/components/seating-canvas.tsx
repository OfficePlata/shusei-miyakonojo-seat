"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Assignment, Attendee, SeatingTable } from "@/lib/types";
import { TableNode, computeTableLayout } from "./table-node";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Maximize2,
  Minus,
  Move,
  Plus,
  RotateCcw,
} from "lucide-react";

interface Props {
  tables: SeatingTable[];
  assignments: Assignment[];
  attendees: Attendee[];
  lockedIds: Set<string>;
  selectedTableId: string | null;
  onSelectTable: (id: string) => void;
  onSelectAttendee: (a: Attendee) => void;
  onBackgroundClick?: () => void;
  onScaleChange?: (scale: number) => void;
}

const MIN_SCALE = 0.35;
const MAX_SCALE = 1.8;

export function SeatingCanvas({
  tables,
  assignments,
  attendees,
  lockedIds,
  selectedTableId,
  onSelectTable,
  onSelectAttendee,
  onBackgroundClick,
  onScaleChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.8);
  const [tx, setTx] = useState(40);
  const [ty, setTy] = useState(40);
  const panState = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    ox: number;
    oy: number;
  }>({ active: false, startX: 0, startY: 0, ox: 0, oy: 0 });

  const attendeeMap = new Map(attendees.map((a) => [a.id, a]));

  useEffect(() => {
    onScaleChange?.(scale);
  }, [scale, onScaleChange]);

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const contentBounds = useCallback(() => {
    if (tables.length === 0)
      return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const t of tables) {
      const l = computeTableLayout(t);
      minX = Math.min(minX, t.x);
      minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x + l.nodeW);
      maxY = Math.max(maxY, t.y + l.nodeH);
    }
    return { minX, minY, maxX, maxY };
  }, [tables]);

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { minX, minY, maxX, maxY } = contentBounds();
    const cw = el.clientWidth - 48;
    const ch = el.clientHeight - 48;
    const w = maxX - minX;
    const h = maxY - minY;
    const s = clampScale(Math.min(cw / w, ch / h, 1.2));
    setScale(s);
    setTx((el.clientWidth - w * s) / 2 - minX * s);
    setTy(Math.max(24, (el.clientHeight - h * s) / 2 - minY * s));
  }, [contentBounds]);

  // 初回フィット
  const didFit = useRef(false);
  useEffect(() => {
    if (!didFit.current && tables.length) {
      didFit.current = true;
      requestAnimationFrame(fit);
    }
  }, [tables.length, fit]);

  const zoomAt = (delta: number, cx?: number, cy?: number) => {
    const el = containerRef.current;
    const rect = el?.getBoundingClientRect();
    const px = cx != null && rect ? cx - rect.left : (el?.clientWidth ?? 0) / 2;
    const py = cy != null && rect ? cy - rect.top : (el?.clientHeight ?? 0) / 2;
    setScale((prev) => {
      const next = clampScale(prev * (1 + delta));
      const ratio = next / prev;
      setTx((t) => px - (px - t) * ratio);
      setTy((t) => py - (py - t) * ratio);
      return next;
    });
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0) {
      e.preventDefault();
      zoomAt(e.deltaY > 0 ? -0.12 : 0.12, e.clientX, e.clientY);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // 背景（このdiv自身）でのみパンを開始
    if (e.target !== e.currentTarget) return;
    panState.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      ox: tx,
      oy: ty,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!panState.current.active) return;
    setTx(panState.current.ox + (e.clientX - panState.current.startX));
    setTy(panState.current.oy + (e.clientY - panState.current.startY));
  };

  const endPan = (e: React.PointerEvent) => {
    if (panState.current.active) {
      panState.current.active = false;
      onBackgroundClick?.();
    }
  };

  return (
    <div
      ref={containerRef}
      className="group/canvas relative h-full w-full overflow-hidden bg-washi"
      onWheel={onWheel}
    >
      {/* パン用の背景レイヤー */}
      <div
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerLeave={endPan}
      />

      {/* 変形コンテナ */}
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
        }}
      >
        {tables.map((t) => (
          <TableNode
            key={t.id}
            table={t}
            assignments={assignments}
            attendeeMap={attendeeMap}
            lockedIds={lockedIds}
            selected={selectedTableId === t.id}
            scale={scale}
            onSelectTable={onSelectTable}
            onSelectAttendee={onSelectAttendee}
          />
        ))}
      </div>

      {/* ステージ表示（会場の前方） */}
      <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-border/70 bg-card/80 px-4 py-1 text-[11px] font-semibold tracking-widest text-muted-foreground shadow-sm backdrop-blur">
        ─── 会場前方（ステージ） ───
      </div>

      {/* ズームツールバー */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-xl border bg-card/95 p-1 shadow-lg backdrop-blur">
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={() => zoomAt(-0.15)}
          title="縮小"
        >
          <Minus className="size-4" />
        </Button>
        <span className="w-12 text-center text-xs font-semibold tabular-nums text-muted-foreground">
          {Math.round(scale * 100)}%
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={() => zoomAt(0.15)}
          title="拡大"
        >
          <Plus className="size-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={fit}
          title="全体表示"
        >
          <Maximize2 className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={() => {
            setScale(0.8);
            setTx(40);
            setTy(40);
          }}
          title="リセット"
        >
          <RotateCcw className="size-4" />
        </Button>
      </div>

      {/* 操作ヒント */}
      <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-1.5 rounded-lg border bg-card/80 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
        <Move className="size-3.5" />
        背景ドラッグで移動・ホイールで拡大縮小
      </div>
    </div>
  );
}
