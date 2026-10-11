"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useStore, useCurrentEvent } from "@/lib/store";
import type { Attendee, SeatingEvent } from "@/lib/types";
import { AppHeader } from "@/components/app-header";
import { AttendeePanel } from "@/components/attendee-panel";
import { SeatingCanvas } from "@/components/seating-canvas";
import { InspectorPanel } from "@/components/inspector-panel";
import { AttendeeCard } from "@/components/attendee-card";
import { AttendeeDialog } from "@/components/attendee-dialog";
import { ImportDialog } from "@/components/import-dialog";
import { TableConfigDialog } from "@/components/table-config-dialog";
import { AutoAssignDialog } from "@/components/auto-assign-dialog";
import { EventDialog } from "@/components/event-dialog";
import { PrintView } from "@/components/print-view";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { BarChart3, Users } from "lucide-react";
import { toast } from "sonner";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const seedIfEmpty = useStore((s) => s.seedIfEmpty);
  const event = useCurrentEvent();

  // dialog states
  const [attendeeDialog, setAttendeeDialog] = useState(false);
  const [editingAttendee, setEditingAttendee] = useState<Attendee | null>(null);
  const [importDialog, setImportDialog] = useState(false);
  const [tableConfig, setTableConfig] = useState(false);
  const [autoAssign, setAutoAssign] = useState(false);
  const [eventDialog, setEventDialog] = useState(false);
  const [editingEvent, setEditingEvent] = useState<SeatingEvent | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  const [activeAttendee, setActiveAttendee] = useState<Attendee | null>(null);
  const scaleRef = useRef(0.8);

  const selectAttendee = useStore((s) => s.selectAttendee);
  const selectTable = useStore((s) => s.selectTable);
  const assignSeat = useStore((s) => s.assignSeat);
  const unassign = useStore((s) => s.unassign);
  const moveTable = useStore((s) => s.moveTable);
  const selectedTableId = useStore((s) => s.selectedTableId);

  const loadMeetingsFromLark = useStore((s) => s.loadMeetingsFromLark);

  useEffect(() => {
    // まず手元の状態で画面を出し、そのあと Lark の例会一覧で揃える。
    // 通信に失敗しても（社外・オフライン）ツールは手元のデータで動く。
    seedIfEmpty();
    setMounted(true);
    loadMeetingsFromLark()
      .then(() => {
        // 参加者がまだ手元に無い例会だけ、続けて Lark から読む。
        // 開いてすぐ名簿と卓割が出るようにするため。
        // 途中まで並べた下書きがある例会は触らない（勝手に消さない）
        const s = useStore.getState();
        const current = s.events.find((e) => e.id === s.currentEventId);
        if (!current || current.attendees.length > 0) return;
        return s.loadAttendeesFromLark(current.id).then((n) => {
          if (n > 0) toast.success(`参加者 ${n}名を読み込みました`);
        });
      })
      .catch((e: unknown) => {
        toast.error(
          `Lark から読み込めませんでした: ${e instanceof Error ? e.message : String(e)}`,
        );
      });
  }, [seedIfEmpty, loadMeetingsFromLark]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const openAddAttendee = () => {
    setEditingAttendee(null);
    setAttendeeDialog(true);
  };
  const openEditAttendee = (a: Attendee) => {
    setEditingAttendee(a);
    setAttendeeDialog(true);
  };

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    if (id.startsWith("att:")) {
      const attId = id.slice(4);
      const att = event?.attendees.find((a) => a.id === attId) ?? null;
      setActiveAttendee(att);
      document.body.classList.add("dragging");
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveAttendee(null);
    document.body.classList.remove("dragging");
    const { active, over, delta } = e;
    const id = String(active.id);

    if (id.startsWith("table:")) {
      const tableId = id.slice(6);
      const t = event?.tables.find((x) => x.id === tableId);
      if (t) {
        const s = scaleRef.current || 1;
        moveTable(
          tableId,
          Math.round(t.x + delta.x / s),
          Math.round(t.y + delta.y / s),
        );
      }
      return;
    }

    if (id.startsWith("att:")) {
      const attId = id.slice(4);
      if (!over) return;
      const overId = String(over.id);
      if (overId === "unseated") {
        unassign(attId);
        return;
      }
      if (overId.startsWith("seat:")) {
        const data = over.data.current as
          | { tableId: string; seatIndex: number }
          | undefined;
        if (data) {
          assignSeat(attId, data.tableId, data.seatIndex);
          selectAttendee(attId);
        }
      }
    }
  };

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center bg-washi">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="size-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <span className="text-sm">座席表を読み込み中…</span>
        </div>
      </div>
    );
  }

  const lockedIds = new Set(event?.lockedAttendeeIds ?? []);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveAttendee(null);
        document.body.classList.remove("dragging");
      }}
    >
      <div className="app-workspace flex h-screen flex-col overflow-hidden bg-background">
        <AppHeader
          onNewEvent={() => {
            setEditingEvent(null);
            setEventDialog(true);
          }}
          onEditEvent={(e) => {
            setEditingEvent(e);
            setEventDialog(true);
          }}
          onAutoAssign={() => setAutoAssign(true)}
          onTableConfig={() => setTableConfig(true)}
          onPrint={() => setPrintOpen(true)}
        />

        <div className="flex flex-1 overflow-hidden">
          {/* 左：出席者パネル（デスクトップ） */}
          <aside className="hidden w-72 shrink-0 border-r lg:block">
            <AttendeePanel
              onAddAttendee={openAddAttendee}
              onEditAttendee={openEditAttendee}
              onImport={() => setImportDialog(true)}
            />
          </aside>

          {/* 中央：座席キャンバス */}
          <main className="relative flex-1 overflow-hidden">
            {event && (
              <SeatingCanvas
                tables={event.tables}
                assignments={event.assignments}
                attendees={event.attendees}
                lockedIds={lockedIds}
                selectedTableId={selectedTableId}
                onSelectTable={selectTable}
                onSelectAttendee={(a) => selectAttendee(a.id)}
                onBackgroundClick={() => {
                  selectAttendee(null);
                  selectTable(null);
                }}
                onScaleChange={(s) => (scaleRef.current = s)}
              />
            )}

            {/* モバイル用パネルトリガー */}
            <div className="absolute left-3 top-3 flex gap-2 lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button size="sm" className="gap-1.5 shadow-md">
                    <Users className="size-4" />
                    出席者
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-80 p-0">
                  <SheetTitle className="sr-only">出席者</SheetTitle>
                  <AttendeePanel
                    onAddAttendee={openAddAttendee}
                    onEditAttendee={openEditAttendee}
                    onImport={() => setImportDialog(true)}
                  />
                </SheetContent>
              </Sheet>
            </div>
            <div className="absolute right-3 top-3 xl:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1.5 shadow-md"
                  >
                    <BarChart3 className="size-4" />
                    情報
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80 p-0">
                  <SheetTitle className="sr-only">配置情報</SheetTitle>
                  <InspectorPanel onEditAttendee={openEditAttendee} />
                </SheetContent>
              </Sheet>
            </div>
          </main>

          {/* 右：インスペクター（大画面） */}
          <aside className="hidden w-80 shrink-0 border-l xl:block">
            <InspectorPanel onEditAttendee={openEditAttendee} />
          </aside>
        </div>
      </div>

      {/* ドラッグ中のプレビュー */}
      <DragOverlay dropAnimation={null}>
        {activeAttendee ? (
          <div className="w-56 rotate-2 cursor-grabbing">
            <AttendeeCard attendee={activeAttendee} />
          </div>
        ) : null}
      </DragOverlay>

      {/* ダイアログ類 */}
      <AttendeeDialog
        open={attendeeDialog}
        onOpenChange={setAttendeeDialog}
        editing={editingAttendee}
      />
      <ImportDialog open={importDialog} onOpenChange={setImportDialog} />
      <TableConfigDialog open={tableConfig} onOpenChange={setTableConfig} />
      <AutoAssignDialog open={autoAssign} onOpenChange={setAutoAssign} />
      <EventDialog
        open={eventDialog}
        onOpenChange={setEventDialog}
        editing={editingEvent}
      />
      <PrintView open={printOpen} onClose={() => setPrintOpen(false)} />
    </DndContext>
  );
}
