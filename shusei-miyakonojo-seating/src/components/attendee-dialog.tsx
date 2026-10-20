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
import type { Attendee, AttendeeCategory, Duty } from "@/lib/types";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  DUTY_LABELS,
  DUTY_ORDER,
} from "@/lib/types";
import { INDUSTRIES, VENUES } from "@/lib/sample-data";
import { isLarkId } from "@/lib/lark";
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
  venue: "",
  duties: [],
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
  const addToLark = useStore((s) => s.addAttendeeToLark);
  const removeFromLark = useStore((s) => s.removeAttendeeFromLark);
  const [form, setForm] = useState<Omit<Attendee, "id">>(empty);
  const [busy, setBusy] = useState(false);
  /**
   * Lark の例会では、追加・削除を Lark の出欠記録へ保存する（受付名簿・ポータルにも効き、翌朝の取り込みでも戻らない）。
   * Lark に区分が無い来賓・事務局は選ばせない
   */
  const larkMode = !!event && isLarkId(event.id);
  const categories = larkMode
    ? CATEGORY_ORDER.filter((c) => c === "member" || c === "guest")
    : CATEGORY_ORDER;

  useEffect(() => {
    if (open) {
      setForm(editing ? { ...empty, ...editing } : empty);
    }
  }, [open, editing]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("氏名を入力してください");
      return;
    }
    if (editing) {
      updateAttendee(editing.id, form);
      toast.success("出席者を更新しました");
    } else if (larkMode) {
      setBusy(true);
      try {
        const added = await addToLark({
          name: form.name.trim(),
          kana: form.kana,
          company: form.company,
          category: form.category === "guest" ? "guest" : "member",
          venue: form.venue,
          referrer: form.category === "guest" ? form.referrer : "",
        });
        // Lark に持たない項目（業種・役割・班・備考・初参加）は、入れた分だけこの端末の下書きに足す
        const local: Partial<Attendee> = {};
        if (form.industry.trim()) local.industry = form.industry.trim();
        if (form.duties?.length) {
          local.duties = [...new Set([...(added.duties ?? []), ...form.duties])];
        }
        if (form.group?.trim()) local.group = form.group.trim();
        if (form.notes?.trim()) local.notes = form.notes.trim();
        if (form.isFirstTime) local.isFirstTime = true;
        if (Object.keys(local).length > 0) updateAttendee(added.id, local);
        toast.success(`「${added.name}」さんを Lark の出欠記録に追加しました`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "追加に失敗しました");
        return;
      } finally {
        setBusy(false);
      }
    } else {
      addAttendee(form);
      toast.success("出席者を追加しました");
    }
    onOpenChange(false);
  };

  const remove = async () => {
    if (!editing) return;
    if (!(larkMode && isLarkId(editing.id))) {
      if (confirm(`「${editing.name}」を削除しますか？`)) {
        removeAttendee(editing.id);
        toast.success("削除しました");
        onOpenChange(false);
      }
      return;
    }
    const ok = confirm(
      `「${editing.name}」さんを参加者から外します。Lark の出欠記録に保存され、受付名簿からも消えます（卓も空きます）。よろしいですか？\n` +
        "（本部HPの回答はそのままです。ポータルの出欠回答一覧から元に戻せます）",
    );
    if (!ok) return;
    setBusy(true);
    try {
      const { deleted } = await removeFromLark(editing.id);
      toast.success(
        deleted
          ? `手で追加した「${editing.name}」さんを出欠記録から消しました`
          : `「${editing.name}」さんを参加者から外しました`,
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "外せませんでした");
    } finally {
      setBusy(false);
    }
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
            {larkMode && !editing && (
              <>
                <br />
                追加すると Lark の出欠記録に入ります（受付名簿にも載り、翌朝の本部HPの取り込みでも消えません）。
                所属会場を入れた会員は他会場として登録します。
              </>
            )}
            {larkMode && editing && (
              <>
                <br />
                ここでの編集はこの端末の下書きだけです。「削除」は Lark の出欠記録にも保存されます。
              </>
            )}
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
                  {categories.map((c) => (
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
              <Label htmlFor="venue">所属会場</Label>
              <Input
                id="venue"
                list="venue-list"
                value={form.venue}
                onChange={(e) => set("venue", e.target.value)}
                placeholder="他会場から来場の場合（例：鹿児島）"
              />
              <datalist id="venue-list">
                {VENUES.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">役職・肩書き</Label>
              <Input
                id="role"
                value={form.role}
                onChange={(e) => set("role", e.target.value)}
                placeholder="代表世話人 など"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>当日の役割</Label>
            <div className="flex flex-wrap gap-1.5">
              {DUTY_ORDER.map((d) => {
                const active = form.duties?.includes(d) ?? false;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      const cur = form.duties ?? [];
                      set(
                        "duties",
                        active
                          ? cur.filter((x) => x !== d)
                          : ([...cur, d] as Duty[]),
                      );
                    }}
                    className={
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                      (active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-accent")
                    }
                  >
                    {DUTY_LABELS[d]}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              TM・受付・ブースは自動配置で各卓に散らします。
            </p>
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
              disabled={busy}
              onClick={() => void remove()}
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
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? "保存中…" : editing ? "更新" : "追加"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
