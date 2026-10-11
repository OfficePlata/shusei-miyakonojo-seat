"use client";

import { useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useStore, useCurrentEvent } from "@/lib/store";
import type { Attendee } from "@/lib/types";
import { CATEGORY_ORDER } from "@/lib/types";
import {
  CATEGORY_STYLES,
  VISUAL_ORDER,
  type VisualCategory,
  visualCategory,
} from "@/lib/ui-helpers";
import { DraggableAttendee } from "./draggable-attendee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Download,
  MoreVertical,
  MousePointerClick,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
  UserPlus,
  Sparkles,
} from "lucide-react";
import { attendeesToCSV, downloadCSV } from "@/lib/csv";
import { toast } from "sonner";

interface Props {
  onAddAttendee: () => void;
  onEditAttendee: (a: Attendee) => void;
  onImport: () => void;
}

export function AttendeePanel({ onAddAttendee, onEditAttendee, onImport }: Props) {
  const event = useCurrentEvent();
  const loadSample = useStore((s) => s.loadSampleAttendees);
  const clearAttendees = useStore((s) => s.clearAttendees);
  const selectedAttendeeId = useStore((s) => s.selectedAttendeeId);
  const selectAttendee = useStore((s) => s.selectAttendee);

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"unseated" | "all">("unseated");
  const [catFilter, setCatFilter] = useState<VisualCategory | "all">("all");

  const { setNodeRef, isOver } = useDroppable({ id: "unseated" });

  const assignedIds = useMemo(
    () => new Set((event?.assignments ?? []).map((a) => a.attendeeId)),
    [event?.assignments],
  );
  const lockedIds = useMemo(
    () => new Set(event?.lockedAttendeeIds ?? []),
    [event?.lockedAttendeeIds],
  );

  const seatLabelFor = (attendeeId: string): string | null => {
    const a = event?.assignments.find((x) => x.attendeeId === attendeeId);
    if (!a) return null;
    const t = event?.tables.find((x) => x.id === a.tableId);
    if (!t) return null;
    return `${t.name}-${a.seatIndex + 1}`;
  };

  const attendees = useMemo(() => event?.attendees ?? [], [event?.attendees]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return attendees
      .filter((a) => (tab === "unseated" ? !assignedIds.has(a.id) : true))
      .filter((a) =>
        catFilter === "all" ? true : visualCategory(a) === catFilter,
      )
      .filter((a) => {
        if (!q) return true;
        return (
          a.name.toLowerCase().includes(q) ||
          (a.kana ?? "").toLowerCase().includes(q) ||
          a.company.toLowerCase().includes(q) ||
          a.industry.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const oa = CATEGORY_ORDER.indexOf(a.category);
        const ob = CATEGORY_ORDER.indexOf(b.category);
        if (oa !== ob) return oa - ob;
        return (a.kana || a.name).localeCompare(b.kana || b.name, "ja");
      });
  }, [attendees, tab, catFilter, query, assignedIds]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: attendees.length,
      unseated: attendees.filter((a) => !assignedIds.has(a.id)).length,
    };
    for (const cat of VISUAL_ORDER)
      c[cat] = attendees.filter((a) => visualCategory(a) === cat).length;
    return c;
  }, [attendees, assignedIds]);

  const handleExport = () => {
    if (!event) return;
    downloadCSV(`${event.title}_出席者.csv`, attendeesToCSV(attendees));
    toast.success("出席者リストを書き出しました");
  };

  return (
    <div className="flex h-full flex-col bg-card">
      {/* ヘッダー */}
      <div className="border-b px-3 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-bold">
            <Users className="size-4 text-primary" />
            出席者
            <span className="rounded-full bg-secondary px-1.5 text-xs font-semibold text-muted-foreground">
              {counts.all}
            </span>
          </h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onImport}>
                <Upload className="mr-2 size-4" />
                CSVを取り込み
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExport}>
                <Download className="mr-2 size-4" />
                CSVで書き出し
              </DropdownMenuItem>
              <DropdownMenuItem onClick={loadSample}>
                <Sparkles className="mr-2 size-4" />
                サンプルを読み込み
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  if (confirm("出席者と座席をすべて削除しますか？")) {
                    clearAttendees();
                    toast.success("出席者を削除しました");
                  }
                }}
              >
                <Trash2 className="mr-2 size-4" />
                すべて削除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mb-2 flex gap-1.5">
          <Button size="sm" className="h-8 flex-1 gap-1" onClick={onAddAttendee}>
            <UserPlus className="size-4" />
            追加
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1"
            onClick={onImport}
          >
            <Upload className="size-4" />
            取込
          </Button>
        </div>

        {/* 検索 */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="氏名・会社・業種で検索"
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      {/* タブ */}
      <div className="flex gap-1 border-b px-3 py-2">
        <TabButton
          active={tab === "unseated"}
          onClick={() => setTab("unseated")}
          label="未着席"
          count={counts.unseated}
        />
        <TabButton
          active={tab === "all"}
          onClick={() => setTab("all")}
          label="全員"
          count={counts.all}
        />
      </div>

      {/* カテゴリフィルタ */}
      <div className="flex flex-wrap gap-1 border-b px-3 py-2">
        <FilterChip
          active={catFilter === "all"}
          onClick={() => setCatFilter("all")}
          label="すべて"
        />
        {VISUAL_ORDER.filter((cat) => counts[cat] > 0).map((cat) => (
          <FilterChip
            key={cat}
            active={catFilter === cat}
            onClick={() => setCatFilter(cat)}
            label={CATEGORY_STYLES[cat].label}
            count={counts[cat]}
            dot={CATEGORY_STYLES[cat].dot}
          />
        ))}
      </div>

      {/* 選択中ヒント */}
      {(() => {
        const sel = attendees.find((a) => a.id === selectedAttendeeId);
        if (!sel || assignedIds.has(sel.id)) return null;
        return (
          <div className="mx-2 mt-2 flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs text-primary">
            <MousePointerClick className="size-3.5 shrink-0" />
            <span className="truncate">
              選択中「<b>{sel.name}</b>」・空席をクリックで配置
            </span>
          </div>
        );
      })()}

      {/* リスト */}
      <div
        ref={setNodeRef}
        className={cn(
          "scroll-slim flex-1 space-y-1.5 overflow-y-auto p-2 transition-colors",
          isOver && "bg-primary/5 ring-2 ring-inset ring-primary/40",
        )}
      >
        {filtered.length === 0 ? (
          <EmptyState
            tab={tab}
            hasAttendees={attendees.length > 0}
            onAdd={onAddAttendee}
            onImport={onImport}
            onSample={loadSample}
          />
        ) : (
          filtered.map((a) => (
            <DraggableAttendee
              key={a.id}
              attendee={a}
              seatLabel={seatLabelFor(a.id)}
              locked={lockedIds.has(a.id)}
              selected={selectedAttendeeId === a.id}
              onClick={() => selectAttendee(a.id)}
              onDoubleClick={() => onEditAttendee(a)}
            />
          ))
        )}
      </div>

      {tab === "unseated" && filtered.length > 0 && (
        <div className="border-t px-3 py-2 text-center text-[11px] text-muted-foreground">
          カードを席へドラッグ、または席からここへ戻せます
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 rounded-md px-2 py-1.5 text-sm font-semibold transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-secondary",
      )}
    >
      {label}
      <span
        className={cn(
          "ml-1 rounded-full px-1.5 text-xs",
          active ? "bg-white/20" : "bg-secondary",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  dot,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  dot?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:bg-secondary",
      )}
    >
      {dot && <span className={cn("size-2 rounded-full", dot)} />}
      {label}
      {count != null && <span className="opacity-70">{count}</span>}
    </button>
  );
}

function EmptyState({
  tab,
  hasAttendees,
  onAdd,
  onImport,
  onSample,
}: {
  tab: string;
  hasAttendees: boolean;
  onAdd: () => void;
  onImport: () => void;
  onSample: () => void;
}) {
  if (tab === "unseated" && hasAttendees) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
        <div className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Users className="size-6" />
        </div>
        全員の着席が完了しました
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Users className="size-6" />
      </div>
      <p className="text-sm text-muted-foreground">
        出席者がまだいません。
        <br />
        追加・CSV取込・サンプルから始めましょう。
      </p>
      <div className="flex flex-col gap-1.5">
        <Button size="sm" onClick={onAdd} className="gap-1">
          <Plus className="size-4" />
          出席者を追加
        </Button>
        <Button size="sm" variant="outline" onClick={onImport} className="gap-1">
          <Upload className="size-4" />
          CSVを取り込み
        </Button>
        <Button size="sm" variant="ghost" onClick={onSample} className="gap-1">
          <Sparkles className="size-4" />
          サンプルを読み込み
        </Button>
      </div>
    </div>
  );
}
