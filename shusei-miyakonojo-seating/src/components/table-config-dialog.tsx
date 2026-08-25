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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useStore, useCurrentEvent } from "@/lib/store";
import { DEFAULT_LAYOUT, TableLayoutOptions } from "@/lib/events";
import { AlertTriangle, LayoutGrid, Rows4 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function TableConfigDialog({ open, onOpenChange }: Props) {
  const event = useCurrentEvent();
  const regenerate = useStore((s) => s.regenerateTables);
  const arrangeTables = useStore((s) => s.arrangeTables);
  const [opts, setOpts] = useState<TableLayoutOptions>(DEFAULT_LAYOUT);

  useEffect(() => {
    if (open && event) {
      const normal = event.tables.filter((t) => t.kind === "normal");
      const head = event.tables.find((t) => t.kind === "head");
      setOpts({
        tableCount: normal.length || DEFAULT_LAYOUT.tableCount,
        seatsPerTable: normal[0]?.capacity ?? DEFAULT_LAYOUT.seatsPerTable,
        includeHeadTable: !!head,
        headTableSeats: head?.capacity ?? DEFAULT_LAYOUT.headTableSeats,
        columns:
          new Set(normal.map((t) => t.x)).size || DEFAULT_LAYOUT.columns,
      });
    }
  }, [open, event]);

  const totalSeats =
    opts.tableCount * opts.seatsPerTable +
    (opts.includeHeadTable ? opts.headTableSeats : 0);
  const attendeeCount = event?.attendees.length ?? 0;
  const hasAssignments = (event?.assignments.length ?? 0) > 0;

  const set = <K extends keyof TableLayoutOptions>(
    k: K,
    v: TableLayoutOptions[K],
  ) => setOpts((o) => ({ ...o, [k]: v }));

  const num = (v: string, min: number, max: number, fallback: number) => {
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };

  const apply = () => {
    regenerate(opts);
    toast.success("会場レイアウトを作成しました");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="size-5 text-primary" />
            会場レイアウト設定
          </DialogTitle>
          <DialogDescription>
            テーブル数と席数を設定して会場を作成します。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tc">テーブル数（通常卓）</Label>
              <Input
                id="tc"
                type="number"
                min={1}
                max={40}
                value={opts.tableCount}
                onChange={(e) =>
                  set("tableCount", num(e.target.value, 1, 40, 1))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp">1卓あたりの席数</Label>
              <Input
                id="sp"
                type="number"
                min={2}
                max={14}
                value={opts.seatsPerTable}
                onChange={(e) =>
                  set("seatsPerTable", num(e.target.value, 2, 14, 8))
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cols">横に並べる列数</Label>
            <Input
              id="cols"
              type="number"
              min={1}
              max={8}
              value={opts.columns}
              onChange={(e) => set("columns", num(e.target.value, 1, 8, 4))}
            />
            <p className="text-xs text-muted-foreground">
              作成後もテーブルは自由に移動できます。
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => {
                arrangeTables(opts.columns);
                toast.success(`卓を横${opts.columns}列に並べ直しました`);
                onOpenChange(false);
              }}
            >
              <Rows4 className="size-4" />
              いまの卓をこの列数で並べ直す（席はそのまま）
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-secondary/40 px-3 py-2.5">
            <div>
              <Label className="text-sm">来賓席（ヘッドテーブル）</Label>
              <p className="text-xs text-muted-foreground">
                来賓・役員用の卓を最前列に配置
              </p>
            </div>
            <Switch
              checked={opts.includeHeadTable}
              onCheckedChange={(v) => set("includeHeadTable", v)}
            />
          </div>

          {opts.includeHeadTable && (
            <div className="space-y-1.5">
              <Label htmlFor="hs">来賓席の席数</Label>
              <Input
                id="hs"
                type="number"
                min={2}
                max={20}
                value={opts.headTableSeats}
                onChange={(e) =>
                  set("headTableSeats", num(e.target.value, 2, 20, 6))
                }
              />
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg bg-primary/5 px-3 py-2.5 text-sm">
            <span className="text-muted-foreground">合計席数</span>
            <span className="font-bold">
              <span
                className={
                  totalSeats < attendeeCount ? "text-destructive" : "text-primary"
                }
              >
                {totalSeats}
              </span>
              <span className="text-muted-foreground"> / 出席 {attendeeCount}名</span>
            </span>
          </div>

          {totalSeats < attendeeCount && (
            <p className="text-xs text-destructive">
              席数が出席者より少なくなっています。
            </p>
          )}

          {hasAssignments && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              レイアウトを作り直すと、現在の座席配置はリセットされます。
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button onClick={apply}>レイアウトを作成</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
