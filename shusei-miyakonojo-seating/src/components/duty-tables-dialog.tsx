"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { personKey, useCurrentEvent, useStore } from "@/lib/store";
import { type DutySlot, fetchDuties, saveDuties } from "@/lib/lark";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/** 卓名の並び。数字は数値として比べる（"10" が "2" より後ろに来るように） */
const byTableName = (a: string, b: string) => {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.localeCompare(b, "ja");
};

/**
 * 当番の卓。当番表（Lark）の TM・受付に、座る卓を割り振る。
 *
 * 保存先は当番表「テーブル番号」。自動配置の1回転目はこの卓に固定する
 * （TM は卓の顔なので必ずその卓。受付は各卓へ散らしておくと受付後の案内が早い）。
 * 2回転目は TM だけが卓に残り、受付は他の人と同じく入れ替わる。
 */
export function DutyTablesDialog({ open, onOpenChange }: Props) {
  const event = useCurrentEvent();
  const setDutyTables = useStore((s) => s.setDutyTables);

  const [slots, setSlots] = useState<DutySlot[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const meetingId = event?.id ?? "";

  useEffect(() => {
    if (!open || !meetingId) return;
    setSlots(null);
    setError("");
    fetchDuties(meetingId)
      .then((d) => {
        setSlots(d);
        setDraft(Object.fromEntries(d.map((x) => [x.recordId, x.tableNo])));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [open, meetingId]);

  const tableNames = useMemo(
    () =>
      (event?.tables ?? [])
        .filter((t) => t.kind === "normal")
        .map((t) => t.name.trim())
        .sort(byTableName),
    [event?.tables],
  );

  const attending = useMemo(
    () => new Set((event?.attendees ?? []).map((a) => personKey(a.name))),
    [event?.attendees],
  );

  const tm = (slots ?? []).filter((d) => d.role === "TM");
  const reception = (slots ?? []).filter((d) => d.role === "受付");
  const isHere = (d: DutySlot) => attending.has(personKey(d.name));

  /** 同じ卓に TM が2人以上 */
  const tmClash = useMemo(() => {
    const count = new Map<string, number>();
    for (const d of tm) {
      const t = draft[d.recordId];
      if (t) count.set(t, (count.get(t) ?? 0) + 1);
    }
    return new Set([...count].filter(([, n]) => n > 1).map(([t]) => t));
  }, [tm, draft]);

  const set = (recordId: string, tableNo: string) =>
    setDraft((cur) => ({ ...cur, [recordId]: tableNo }));

  /** 出席する TM を表示順に 1卓 から順に。卓より TM が多いぶんは空のまま */
  const fillTm = () => {
    const next = { ...draft };
    const here = tm.filter(isHere);
    here.forEach((d, i) => {
      next[d.recordId] = tableNames[i] ?? "";
    });
    for (const d of tm) if (!isHere(d)) next[d.recordId] = "";
    setDraft(next);
    if (here.length > tableNames.length) {
      toast.warning(`TM ${here.length}名に対して卓が ${tableNames.length} しかありません。残りは未指定です`);
    }
  };

  /** 出席する受付を、卓の端から端まで等間隔に散らす */
  const spreadReception = () => {
    const next = { ...draft };
    const here = reception.filter(isHere);
    const n = here.length;
    const t = tableNames.length;
    here.forEach((d, i) => {
      next[d.recordId] = t ? tableNames[Math.min(t - 1, Math.floor(((i + 0.5) * t) / n))] : "";
    });
    for (const d of reception) if (!isHere(d)) next[d.recordId] = "";
    setDraft(next);
  };

  const clearAll = () =>
    setDraft(Object.fromEntries((slots ?? []).map((d) => [d.recordId, ""])));

  const handleSave = async () => {
    if (!slots || !meetingId) return;
    if (tmClash.size > 0 && !confirm(`同じ卓に TM が2人います（${[...tmClash].join("・")}卓）。このまま保存しますか？`)) {
      return;
    }
    setSaving(true);
    try {
      const updates = slots.map((d) => ({ recordId: d.recordId, tableNo: draft[d.recordId] ?? "" }));
      const r = await saveDuties(meetingId, updates);
      // 参加者を読み直さなくても自動配置に効くよう、手元の参加者にも写す。
      // TM と受付を兼ねる人は TM の卓を優先する（取り込み時と同じ）
      const byName: Record<string, string> = {};
      for (const d of [...reception, ...tm]) byName[personKey(d.name)] = draft[d.recordId] ?? "";
      setDutyTables(byName);
      toast.success(`当番の卓を保存しました（${r.updated}件）。自動配置で反映されます`);
      onOpenChange(false);
    } catch (e) {
      toast.error(`保存できませんでした: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const section = (title: string, list: DutySlot[], fill: { label: string; run: () => void }) => (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-sm font-bold">
          {title}
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">{list.length}名</span>
        </h3>
        <Button variant="outline" size="sm" onClick={fill.run} disabled={list.length === 0}>
          {fill.label}
        </Button>
      </div>
      {list.length === 0 ? (
        <p className="rounded border px-3 py-2 text-xs text-muted-foreground">
          当番表にこの例会の{title}が登録されていません。
        </p>
      ) : (
        <ul className="divide-y rounded border">
          {list.map((d) => {
            const value = draft[d.recordId] ?? "";
            const here = isHere(d);
            const clash = d.role === "TM" && value && tmClash.has(value);
            return (
              <li key={d.recordId} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">{d.order ?? ""}</span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {d.name}
                  {d.note && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{d.note}</span>}
                </span>
                {!here && (
                  <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                    出席の回答なし
                  </span>
                )}
                <select
                  value={value}
                  onChange={(e) => set(d.recordId, e.target.value)}
                  className={cn(
                    "h-8 w-24 shrink-0 rounded border bg-background px-1.5 text-sm",
                    clash && "border-destructive text-destructive",
                  )}
                  aria-label={`${d.name}さんの卓`}
                >
                  <option value="">未指定</option>
                  {tableNames.map((n) => (
                    <option key={n} value={n}>
                      {n}卓
                    </option>
                  ))}
                  {value && !tableNames.includes(value) && <option value={value}>{value}（今の卓に無い）</option>}
                </select>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>当番の卓（TM・受付）</DialogTitle>
          <DialogDescription>
            当番表（Lark）の TM・受付に座る卓を割り振ります。保存すると当番表の「テーブル番号」に入り、
            自動配置の1回転目はこの卓に固定されます。2回転目は TM だけが卓に残ります。
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-destructive">読み込めませんでした: {error}</p>
        ) : !slots ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            当番表を読み込んでいます…
          </p>
        ) : (
          <div className="space-y-4">
            {section("TM", tm, { label: "1卓から順に割り振る", run: fillTm })}
            {section("受付", reception, { label: "各卓へ散らす", run: spreadReception })}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={clearAll} disabled={!slots || saving}>
            すべて未指定に戻す
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              閉じる
            </Button>
            <Button onClick={handleSave} disabled={!slots || saving}>
              {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              当番表に保存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
