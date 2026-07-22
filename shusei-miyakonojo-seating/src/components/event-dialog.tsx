"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";
import type { SeatingEvent } from "@/lib/types";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: SeatingEvent | null;
}

export function EventDialog({ open, onOpenChange, editing }: Props) {
  const addEvent = useStore((s) => s.addEvent);
  const updateEvent = useStore((s) => s.updateEvent);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [venue, setVenue] = useState("グランドパティオ都城");

  useEffect(() => {
    if (open) {
      setTitle(editing?.title ?? "");
      setDate(editing?.date ?? "");
      setVenue(editing?.venue ?? "グランドパティオ都城");
    }
  }, [open, editing]);

  const submit = () => {
    if (!title.trim()) {
      toast.error("例会名を入力してください");
      return;
    }
    if (editing) {
      updateEvent(editing.id, { title, date, venue });
      toast.success("例会を更新しました");
    } else {
      addEvent({ title, date, venue });
      toast.success("例会を作成しました");
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "例会を編集" : "新しい例会"}</DialogTitle>
          <DialogDescription>
            例会名・開催日・会場を入力してください。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="etitle">例会名</Label>
            <Input
              id="etitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="令和8年◯月例会"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edate">開催日</Label>
            <Input
              id="edate"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evenue">会場</Label>
            <Input
              id="evenue"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button onClick={submit}>{editing ? "更新" : "作成"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
