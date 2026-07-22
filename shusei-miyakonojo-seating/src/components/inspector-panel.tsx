"use client";

import { useMemo } from "react";
import { useStore, useCurrentEvent } from "@/lib/store";
import type { Attendee } from "@/lib/types";
import { CATEGORY_ORDER } from "@/lib/types";
import { CATEGORY_STYLES } from "@/lib/ui-helpers";
import { evaluateSeating } from "@/lib/auto-assign";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Building2,
  Crown,
  Layers,
  Lock,
  LockOpen,
  Pencil,
  Trash2,
  UserMinus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  onEditAttendee: (a: Attendee) => void;
}

export function InspectorPanel({ onEditAttendee }: Props) {
  const event = useCurrentEvent();
  const selectedAttendeeId = useStore((s) => s.selectedAttendeeId);
  const selectedTableId = useStore((s) => s.selectedTableId);

  const stats = useMemo(
    () =>
      event
        ? evaluateSeating(event.attendees, event.tables, event.assignments)
        : null,
    [event],
  );

  const selectedAttendee = event?.attendees.find(
    (a) => a.id === selectedAttendeeId,
  );
  const selectedTable = event?.tables.find((t) => t.id === selectedTableId);

  if (!event || !stats) return null;

  const seatedPct = stats.total ? (stats.seated / stats.total) * 100 : 0;

  return (
    <div className="scroll-slim flex h-full flex-col gap-3 overflow-y-auto bg-card p-3">
      {/* 進捗 */}
      <section className="rounded-xl border bg-gradient-to-b from-card to-secondary/30 p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            <Users className="size-3.5" />
            着席状況
          </span>
          <span className="text-xs font-semibold tabular-nums">
            {stats.seated} / {stats.total} 名
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary transition-all"
            style={{ width: `${seatedPct}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
          <span>未着席 {stats.total - stats.seated}名</span>
          <span>空席 {stats.emptySeats}</span>
        </div>
      </section>

      {/* 品質 */}
      <section className="rounded-xl border p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            <BarChart3 className="size-3.5" />
            配置の品質
          </span>
          <ScoreBadge score={stats.score} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <QualityStat
            icon={Layers}
            label="同業種の同卓"
            value={stats.industryClashes}
            good={stats.industryClashes === 0}
          />
          <QualityStat
            icon={Building2}
            label="同社の同卓"
            value={stats.companyClashes}
            good={stats.companyClashes === 0}
          />
          <QualityStat
            icon={Users}
            label="ゲストのみの卓"
            value={stats.guestOnlyTables}
            good={stats.guestOnlyTables === 0}
          />
          <QualityStat
            icon={Crown}
            label="使用テーブル"
            value={`${stats.tablesUsed}/${event.tables.length}`}
            good
          />
        </div>
      </section>

      {/* 選択された出席者 */}
      {selectedAttendee && (
        <AttendeeInspector
          attendee={selectedAttendee}
          onEdit={() => onEditAttendee(selectedAttendee)}
        />
      )}

      {/* 選択されたテーブル */}
      {selectedTable && !selectedAttendee && (
        <TableInspector tableId={selectedTable.id} />
      )}

      {/* 凡例 */}
      {!selectedAttendee && !selectedTable && (
        <section className="rounded-xl border p-3">
          <div className="mb-2 text-xs font-bold text-muted-foreground">
            凡例
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {CATEGORY_ORDER.map((c) => (
              <div key={c} className="flex items-center gap-1.5 text-xs">
                <span
                  className={cn("size-3 rounded-full", CATEGORY_STYLES[c].dot)}
                />
                {CATEGORY_STYLES[c].label}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            出席者カードや席をクリックすると、ここに詳細が表示されます。
          </p>
        </section>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-emerald-100 text-emerald-700"
      : score >= 55
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", color)}>
      スコア {score}
    </span>
  );
}

function QualityStat({
  icon: Icon,
  label,
  value,
  good,
}: {
  icon: typeof Layers;
  label: string;
  value: string | number;
  good?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-secondary/30 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </div>
      <div
        className={cn(
          "text-lg font-bold tabular-nums",
          good ? "text-foreground" : "text-amber-600",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function AttendeeInspector({
  attendee,
  onEdit,
}: {
  attendee: Attendee;
  onEdit: () => void;
}) {
  const event = useCurrentEvent();
  const unassign = useStore((s) => s.unassign);
  const toggleLock = useStore((s) => s.toggleLock);
  const style = CATEGORY_STYLES[attendee.category];

  const assignment = event?.assignments.find(
    (a) => a.attendeeId === attendee.id,
  );
  const table = event?.tables.find((t) => t.id === assignment?.tableId);
  const locked = event?.lockedAttendeeIds.includes(attendee.id);

  return (
    <section className="rounded-xl border p-3">
      <div className="mb-2 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("mt-1 size-3 rounded-full", style.dot)} />
          <div>
            <div className="text-sm font-bold">{attendee.name}</div>
            {attendee.kana && (
              <div className="text-[11px] text-muted-foreground">
                {attendee.kana}
              </div>
            )}
          </div>
        </div>
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", style.solid)}>
          {style.label}
        </span>
      </div>

      <dl className="space-y-1 text-xs">
        <Row label="会社" value={attendee.company} />
        <Row label="業種" value={attendee.industry} />
        {attendee.role && <Row label="役職" value={attendee.role} />}
        {attendee.referrer && <Row label="紹介者" value={attendee.referrer} />}
        <Row
          label="座席"
          value={
            table && assignment
              ? `${table.name} 卓 ${assignment.seatIndex + 1}番`
              : "未着席"
          }
        />
        {attendee.notes && <Row label="備考" value={attendee.notes} />}
      </dl>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" className="h-7 gap-1" onClick={onEdit}>
          <Pencil className="size-3.5" />
          編集
        </Button>
        {assignment && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1"
              onClick={() => toggleLock(attendee.id)}
            >
              {locked ? (
                <>
                  <LockOpen className="size-3.5" />
                  固定解除
                </>
              ) : (
                <>
                  <Lock className="size-3.5" />
                  席を固定
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-destructive hover:text-destructive"
              onClick={() => unassign(attendee.id)}
            >
              <UserMinus className="size-3.5" />
              着席解除
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

function TableInspector({ tableId }: { tableId: string }) {
  const event = useCurrentEvent();
  const updateTable = useStore((s) => s.updateTable);
  const removeTable = useStore((s) => s.removeTable);
  const unassign = useStore((s) => s.unassign);
  const selectAttendee = useStore((s) => s.selectAttendee);

  const table = event?.tables.find((t) => t.id === tableId);
  if (!table || !event) return null;

  const occupants = event.assignments
    .filter((a) => a.tableId === tableId)
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((a) => ({
      seat: a.seatIndex,
      attendee: event.attendees.find((x) => x.id === a.attendeeId),
    }))
    .filter((o) => o.attendee) as { seat: number; attendee: Attendee }[];

  return (
    <section className="rounded-xl border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          {table.kind === "head" ? (
            <Crown className="size-3.5 text-amber-500" />
          ) : (
            <Users className="size-3.5" />
          )}
          テーブル詳細
        </span>
        <span className="text-xs text-muted-foreground">
          {occupants.length}/{table.capacity}名
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">卓名</label>
          <Input
            value={table.name}
            onChange={(e) => updateTable(table.id, { name: e.target.value })}
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">席数</label>
          <Input
            type="number"
            min={1}
            max={16}
            value={table.capacity}
            onChange={(e) =>
              updateTable(table.id, {
                capacity: Math.max(1, Math.min(16, parseInt(e.target.value) || 1)),
              })
            }
            className="h-8"
          />
        </div>
      </div>

      <div className="space-y-1">
        {occupants.length === 0 ? (
          <p className="py-2 text-center text-xs text-muted-foreground">
            まだ誰も着席していません
          </p>
        ) : (
          occupants.map(({ seat, attendee }) => (
            <div
              key={attendee.id}
              className="flex items-center gap-2 rounded-md border bg-secondary/30 px-2 py-1"
            >
              <span className="w-5 text-center text-[11px] font-bold text-muted-foreground">
                {seat + 1}
              </span>
              <span
                className={cn(
                  "size-2 rounded-full",
                  CATEGORY_STYLES[attendee.category].dot,
                )}
              />
              <button
                className="min-w-0 flex-1 truncate text-left text-xs font-medium hover:text-primary"
                onClick={() => selectAttendee(attendee.id)}
              >
                {attendee.name}
                <span className="ml-1 text-[10px] text-muted-foreground">
                  {attendee.industry}
                </span>
              </button>
              <button
                className="text-muted-foreground hover:text-destructive"
                onClick={() => unassign(attendee.id)}
                title="着席解除"
              >
                <UserMinus className="size-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <Button
        size="sm"
        variant="ghost"
        className="mt-3 w-full gap-1 text-destructive hover:text-destructive"
        onClick={() => {
          if (confirm(`テーブル「${table.name}」を削除しますか？`)) {
            removeTable(table.id);
            toast.success("テーブルを削除しました");
          }
        }}
      >
        <Trash2 className="size-3.5" />
        このテーブルを削除
      </Button>
    </section>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="w-12 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 font-medium">{value}</dd>
    </div>
  );
}
