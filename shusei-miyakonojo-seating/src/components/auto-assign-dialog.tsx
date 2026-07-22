"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useStore, useCurrentEvent } from "@/lib/store";
import type { AutoAssignRules } from "@/lib/types";
import { evaluateSeating } from "@/lib/auto-assign";
import { cn } from "@/lib/utils";
import {
  Building2,
  Layers,
  Lock,
  Scale,
  Shuffle,
  Sparkles,
  UserCheck,
  Crown,
} from "lucide-react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const RULE_META: {
  key: keyof AutoAssignRules;
  label: string;
  desc: string;
  icon: LucideIcon;
}[] = [
  {
    key: "spreadIndustry",
    label: "同業種を分散",
    desc: "同じ業種が同じ卓に集まらないようにする",
    icon: Layers,
  },
  {
    key: "separateCompany",
    label: "同一会社を分ける",
    desc: "同じ会社の人を別々の卓に配置",
    icon: Building2,
  },
  {
    key: "mixGuests",
    label: "会員とゲストを混在",
    desc: "ゲストが会員と交流できるよう配置",
    icon: Shuffle,
  },
  {
    key: "keepGuestNearReferrer",
    label: "ゲストを紹介者と同卓",
    desc: "ゲストを紹介した会員と同じ卓にする",
    icon: UserCheck,
  },
  {
    key: "seatVipAtHead",
    label: "来賓を来賓席へ",
    desc: "来賓・役員をヘッドテーブルに優先配置",
    icon: Crown,
  },
  {
    key: "balanceTables",
    label: "各卓の人数を均等化",
    desc: "テーブルごとの人数をなるべく揃える",
    icon: Scale,
  },
  {
    key: "respectConstraints",
    label: "個別の同席／分離設定を尊重",
    desc: "手動で指定した同席・分離を優先",
    icon: Sparkles,
  },
];

export function AutoAssignDialog({ open, onOpenChange }: Props) {
  const event = useCurrentEvent();
  const rules = useStore((s) => s.rules);
  const setRules = useStore((s) => s.setRules);
  const runAutoAssign = useStore((s) => s.runAutoAssign);

  const lockedCount = event?.lockedAttendeeIds.length ?? 0;
  const stats = event
    ? evaluateSeating(event.attendees, event.tables, event.assignments)
    : null;

  const run = () => {
    runAutoAssign({ keepLocked: true });
    const e = useStore.getState().events.find((x) => x.id === event?.id);
    if (e) {
      const s = evaluateSeating(e.attendees, e.tables, e.assignments);
      toast.success(
        `自動配置しました（${s.seated}/${s.total}名・スコア ${s.score}）`,
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            自動で座席を配置
          </DialogTitle>
          <DialogDescription>
            交流が最大になるよう、ルールに沿って出席者を各卓へ割り当てます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-1">
          {RULE_META.map(({ key, label, desc, icon: Icon }) => (
            <label
              key={key}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                rules[key]
                  ? "border-primary/40 bg-primary/5"
                  : "border-border hover:bg-secondary/50",
              )}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-md",
                  rules[key]
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-muted-foreground">
                  {desc}
                </span>
              </span>
              <Switch
                checked={rules[key]}
                onCheckedChange={(v) => setRules({ [key]: v })}
              />
            </label>
          ))}
        </div>

        {lockedCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <Lock className="size-4 shrink-0" />
            固定席 {lockedCount}名 は動かさずに配置します。
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-secondary/50 p-2 text-center">
            <Stat label="着席" value={`${stats.seated}/${stats.total}`} />
            <Stat label="同業種の同卓" value={stats.industryClashes} />
            <Stat label="同社の同卓" value={stats.companyClashes} />
          </div>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button variant="ghost" onClick={run} className="gap-1.5">
            <Shuffle className="size-4" />
            シャッフルして再配置
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              閉じる
            </Button>
            <Button onClick={run} className="gap-1.5">
              <Sparkles className="size-4" />
              実行する
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
