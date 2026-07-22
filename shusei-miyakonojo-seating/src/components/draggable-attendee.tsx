"use client";

import { useDraggable } from "@dnd-kit/core";
import type { Attendee } from "@/lib/types";
import { AttendeeCard } from "./attendee-card";
import { cn } from "@/lib/utils";

interface Props {
  attendee: Attendee;
  seatLabel?: string | null;
  locked?: boolean;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export function DraggableAttendee({
  attendee,
  seatLabel,
  locked,
  selected,
  onClick,
  onDoubleClick,
}: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `att:${attendee.id}`,
    data: { attendeeId: attendee.id, from: "list" },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onDoubleClick={onDoubleClick}
      className={cn(
        "cursor-grab touch-none active:cursor-grabbing",
        isDragging && "opacity-30",
      )}
    >
      <AttendeeCard
        attendee={attendee}
        seatLabel={seatLabel}
        locked={locked}
        selected={selected}
        showHandle
        onClick={onClick}
      />
    </div>
  );
}
