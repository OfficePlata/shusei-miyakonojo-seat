"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Assignment, Attendee, SeatingTable } from "@/lib/types";
import { TableNode, computeTableLayout } from "./table-node";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LayoutGrid,
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
  /** 変わると全体表示に合わせ直す（例会の切り替え・卓の並べ直し・卓の増減） */
  fitKey?: string;
  /** 「卓を整列」。いまの列数のまま卓番号順に並べ直す */
  onArrange?: () => void;
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
  fitKey,
  onArrange,
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
    // 上は「会場前方」の札、下は拡大縮小の道具箱に隠れないよう余白を取る
    const TOP = 44;
    const BOTTOM = 68;
    const cw = el.clientWidth - 48;
    const ch = el.clientHeight - TOP - BOTTOM;
    const w = maxX - minX;
    const h = maxY - minY;
    const s = clampScale(Math.min(cw / w, ch / h, 1.2));
    setScale(s);
    setTx((el.clientWidth - w * s) / 2 - minX * s);
    setTy(TOP + Math.max(0, (ch - h * s) / 2) - minY * s);
  }, [contentBounds]);

  // 開いたとき・例会を切り替えたとき・卓を並べ直したときに全体表示へ合わせる。
  // 卓を1つ手で動かしただけでは合わせ直さない（見ている場所が飛ぶと操作しにくい）
  const fittedKey = useRef<string | null>(null);
  useEffect(() => {
    const key = fitKey ?? String(tables.length > 0);
    if (!tables.length || fittedKey.current === key) return;
    fittedKey.current = key;
    requestAnimationFrame(fit);
  }, [fitKey, tables.length, fit]);

  // キーボード：F で全体表示、＋／− で拡大縮小。文字の入力中は奪わない
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "f" || e.key === "F") fit();
      else if (e.key === "+" || e.key === "=") zoomAt(0.15);
      else if (e.key === "-") zoomAt(-0.15);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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

  /**
   * ホイール・トラックパッド。
   * - ピンチ（ブラウザは ctrlKey 付きのホイールとして送る）と Ctrl/⌘＋ホイール … 拡大縮小
   * - マウスのホイール（1目盛り 120 単位）… 拡大縮小（従来どおり）
   * - トラックパッドの2本指スクロール … 画面の移動。以前はこれも拡大縮小になり、思った所へ動けなかった
   */
  const onWheel = (e: React.WheelEvent) => {
    const native = e.nativeEvent as WheelEvent & { wheelDeltaY?: number; wheelDeltaX?: number };
    const isMouseWheel =
      e.deltaX === 0 &&
      (e.deltaMode !== 0 || (!!native.wheelDeltaY && native.wheelDeltaY % 120 === 0));
    if (e.ctrlKey || e.metaKey || isMouseWheel) {
      // ピンチは細かい値が連続で来るので量に比例させる。ホイールは1目盛りずつ
      const delta = e.ctrlKey && !isMouseWheel ? -e.deltaY * 0.01 : e.deltaY > 0 ? -0.12 : 0.12;
      zoomAt(Math.max(-0.3, Math.min(0.3, delta)), e.clientX, e.clientY);
      return;
    }
    setTx((t) => t - e.deltaX);
    setTy((t) => t - e.deltaY);
  };

  // React の onWheel は passive なので preventDefault が効かない。ページ全体の拡大を止めるため直に付ける
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const stop = (ev: WheelEvent) => ev.preventDefault();
    el.addEventListener("wheel", stop, { passive: false });
    return () => el.removeEventListener("wheel", stop);
  }, []);

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
          title="縮小（−）"
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
          title="拡大（＋）"
        >
          <Plus className="size-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={fit}
          title="全体表示（F）"
        >
          <Maximize2 className="size-4" />
        </Button>
        {onArrange && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 px-2 text-xs"
            onClick={onArrange}
            title="卓を番号順に格子へ並べ直す（列の数はそのまま）"
          >
            <LayoutGrid className="size-4" />
            卓を整列
          </Button>
        )}
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
        背景ドラッグ・2本指スクロールで移動／ピンチ・ホイールで拡大縮小／F で全体表示
      </div>
    </div>
  );
}
