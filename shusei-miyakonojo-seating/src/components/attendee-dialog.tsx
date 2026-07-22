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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useStore, useCurrentEvent } from "@/lib/store";
import type { Attendee, AttendeeCategory } from "@/lib/types";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/types";
import { INDUSTRIES } from "@/lib/sample-data";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Attendee | null;
}

const empty: Omit<Attendee, "id"> = {
  name: "",
  kana: "",
  company: "",
  industry: "",
  category: "member",
  referrer: "",
  role: "",
  group: "",
  isFirstTime: false,
  notes: "",
  keepWith: [],
  keepApart: [],
};

export function AttendeeDialog({ open, onOpenChange, editing }: Props) {
  const event = useCurrentEvent();
  const addAttendee = useStore((s) => s.addAttendee);
  const updateAttendee = useStore((s) => s.updateAttendee);
  const removeAttendee = useStore((s) => s.removeAttendee);
  const [form, setForm] = useState<Omit<Attendee, "id">>(empty);

  useEffect(() => {
    if (open) {
      setForm(editing ? { ...empty, ...editing } : empty);
    }
  }, [open, editing]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) {
      toast.error("氏名を入力してください");
      return;
    }
    if (editing) {
      updateAttendee(editing.id, form);
      toast.success("出席者を更新しました");
    } else {
      addAttendee(form);
      toast.success("出席者を追加しました");
    }
    onOpenChange(false);
  };

  const members =
    event?.attendees.filter((a) => a.category !== "guest" && a.id !== editing?.id) ??
    [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "出席者を編集" : "出席者を追加"}</DialogTitle>
          <DialogDescription>
            氏名と会社・業種・区分を入力してください。業種は座席の分散に使われます。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">
                氏名 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="田中 太郎"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kana">ふりがな</Label>
              <Input
                id="kana"
                value={form.kana}
                onChange={(e) => set("kana", e.target.value)}
                placeholder="たなか たろう"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="company">会社名・屋号</Label>
            <Input
              id="company"
              value={form.company}
              onChange={(e) => set("company", e.target.value)}
              placeholder="株式会社◯◯"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="industry">業種</Label>
              <Input
                id="industry"
                list="industry-list"
                value={form.industry}
                onChange={(e) => set("industry", e.target.value)}
                placeholder="建設業 など"
              />
              <datalist id="industry-list">
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>区分</Label>
              <Select
                value={form.category}
                onValueChange={(v) => set("category", v as AttendeeCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_ORDER.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="role">役職・肩書き</Label>
              <Input
                id="role"
                value={form.role}
                onChange={(e) => set("role", e.target.value)}
                placeholder="代表世話人 など"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="group">班・グループ</Label>
              <Input
                id="group"
                value={form.group}
                onChange={(e) => set("group", e.target.value)}
                placeholder="任意"
              />
            </div>
          </div>

          {form.category === "guest" && (
            <div className="space-y-1.5">
              <Label htmlFor="referrer">紹介者</Label>
              <Input
                id="referrer"
                list="member-list"
                value={form.referrer}
                onChange={(e) => set("referrer", e.target.value)}
                placeholder="紹介した会員の氏名"
              />
              <datalist id="member-list">
                {members.map((m) => (
                  <option key={m.id} value={m.name} />
                ))}
              </datalist>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notes">備考</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="アレルギー、車椅子対応など"
              rows={2}
            />
          </div>

          <label className="flex items-center gap-2 rounded-lg border bg-secondary/40 px-3 py-2">
            <Checkbox
              checked={form.isFirstTime}
              onCheckedChange={(v) => set("isFirstTime", Boolean(v))}
            />
            <span className="text-sm font-medium">初参加</span>
            <span className="text-xs text-muted-foreground">
              （座席表で目印が付きます）
            </span>
          </label>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          {editing ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (confirm(`「${editing.name}」を削除しますか？`)) {
                  removeAttendee(editing.id);
                  toast.success("削除しました");
                  onOpenChange(false);
                }
              }}
            >
              <Trash2 className="mr-1.5 size-4" />
              削除
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button onClick={submit}>{editing ? "更新" : "追加"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
