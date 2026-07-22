"use client";

import { cn } from "@/lib/utils";
import type { Attendee } from "@/lib/types";
import { CATEGORY_STYLES } from "@/lib/ui-helpers";
import { GripVertical, Lock, Sparkles, Star } from "lucide-react";

interface Props {
  attendee: Attendee;
  seatLabel?: string | null;
  locked?: boolean;
  selected?: boolean;
  compact?: boolean;
  showHandle?: boolean;
  className?: string;
  onClick?: () => void;
}

export function AttendeeCard({
  attendee,
  seatLabel,
  locked,
  selected,
  compact,
  showHandle,
  className,
  onClick,
}: Props) {
  const style = CATEGORY_STYLES[attendee.category];

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-left shadow-sm transition-all",
        "hover:border-primary/40 hover:shadow-md",
        selected && "ring-2 ring-primary ring-offset-1",
        className,
      )}
    >
      {showHandle && (
        <GripVertical className="size-4 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />
      )}
      <span
        className={cn("size-2.5 shrink-0 rounded-full", style.dot)}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold text-foreground">
            {attendee.name}
          </span>
          {attendee.isFirstTime && (
            <Sparkles className="size-3 shrink-0 text-amber-500" />
          )}
          {locked && <Lock className="size-3 shrink-0 text-muted-foreground" />}
        </div>
        {!compact && (
          <div className="truncate text-[11px] leading-tight text-muted-foreground">
            {attendee.company || "（会社名なし）"}
          </div>
        )}
        {!compact && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span
              className={cn(
                "rounded px-1.5 py-px text-[10px] font-semibold",
                style.solid,
              )}
            >
              {style.label}
            </span>
            {attendee.industry && (
              <span className="rounded border bg-secondary px-1.5 py-px text-[10px] text-secondary-foreground">
                {attendee.industry}
              </span>
            )}
            {attendee.role && (
              <span className="inline-flex items-center gap-0.5 rounded border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-700">
                <Star className="size-2.5" />
                {attendee.role}
              </span>
            )}
          </div>
        )}
      </div>
      {seatLabel && (
        <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary">
          {seatLabel}
        </span>
      )}
    </div>
  );
}
