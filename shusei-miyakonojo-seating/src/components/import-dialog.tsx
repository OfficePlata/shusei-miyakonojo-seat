"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { useStore } from "@/lib/store";
import {
  APP_FIELDS,
  CSV_TEMPLATE,
  decodeCSVBuffer,
  downloadCSV,
  guessMapping,
  parseCSV,
  rowsToAttendees,
  type Encoding,
  type Mapping,
} from "@/lib/csv";
import { CATEGORY_STYLES } from "@/lib/ui-helpers";
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  FileUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const NONE = "__none";

export function ImportDialog({ open, onOpenChange }: Props) {
  const importAttendees = useStore((s) => s.importAttendees);

  const bufRef = useRef<ArrayBuffer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [encoding, setEncoding] = useState<Encoding>("auto");
  const [detectedEnc, setDetectedEnc] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [onlyAttending, setOnlyAttending] = useState(true);
  const [mode, setMode] = useState<"replace" | "append">("replace");

  const parsed = useMemo(
    () => (rawText.trim() ? parseCSV(rawText) : null),
    [rawText],
  );
  const headers = parsed?.headers ?? [];
  const headersKey = headers.join("|");

  // ヘッダーが変わったら自動マッピング
  useEffect(() => {
    if (headers.length) setMapping(guessMapping(headers));
    else setMapping({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headersKey]);

  const built = useMemo(
    () =>
      parsed
        ? rowsToAttendees(parsed.rows, mapping, { onlyAttending })
        : null,
    [parsed, mapping, onlyAttending],
  );

  const nameMapped = !!mapping.name;
  const preview = built?.attendees ?? [];

  const reset = () => {
    setRawText("");
    setFileName(null);
    setDetectedEnc(null);
    setMapping({});
    bufRef.current = null;
  };

  const decodeAndSet = (buf: ArrayBuffer, enc: Encoding) => {
    const { text, encoding: used } = decodeCSVBuffer(buf, enc);
    setRawText(text);
    setDetectedEnc(used);
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result as ArrayBuffer;
      bufRef.current = buf;
      setFileName(file.name);
      decodeAndSet(buf, encoding);
    };
    reader.readAsArrayBuffer(file);
  };

  const onEncodingChange = (v: Encoding) => {
    setEncoding(v);
    if (bufRef.current) decodeAndSet(bufRef.current, v);
  };

  const doImport = () => {
    if (!built || built.attendees.length === 0) {
      toast.error("取り込めるデータがありません");
      return;
    }
    if (!nameMapped) {
      toast.error("「氏名」列を割り当ててください");
      return;
    }
    importAttendees(built.attendees, mode);
    const extra: string[] = [];
    if (built.skippedAbsent) extra.push(`欠席等 ${built.skippedAbsent}件を除外`);
    toast.success(
      `${built.attendees.length}名を取り込みました${
        extra.length ? `（${extra.join("・")}）` : ""
      }`,
    );
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-primary" />
            CSVから出席者を取り込み
          </DialogTitle>
          <DialogDescription>
            出席者管理システム等から書き出したCSVを、列を対応付けて取り込めます。
            文字コード（Shift-JIS/UTF-8）は自動判定します。
          </DialogDescription>
        </DialogHeader>

        {/* 1. ファイル選択 */}
        <div className="space-y-2 rounded-lg border bg-secondary/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <Button
              variant="default"
              size="sm"
              className="gap-1.5"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="size-4" />
              CSVファイルを選択
            </Button>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">文字コード</span>
              <Select
                value={encoding}
                onValueChange={(v) => onEncodingChange(v as Encoding)}
              >
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">自動判定</SelectItem>
                  <SelectItem value="shift-jis">Shift-JIS</SelectItem>
                  <SelectItem value="utf-8">UTF-8</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="ml-auto gap-1.5"
              onClick={() =>
                downloadCSV("出席者_テンプレート.csv", CSV_TEMPLATE)
              }
            >
              <FileDown className="size-4" />
              テンプレート
            </Button>
          </div>

          {fileName && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              {fileName}
              {detectedEnc && (
                <span className="rounded bg-secondary px-1.5 py-px">
                  {detectedEnc === "shift-jis" ? "Shift-JIS" : "UTF-8"}
                </span>
              )}
            </div>
          )}

          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              またはCSVを直接貼り付け
            </summary>
            <Textarea
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                bufRef.current = null;
                setFileName(null);
                setDetectedEnc(null);
              }}
              placeholder={CSV_TEMPLATE}
              rows={5}
              className="mt-2 font-mono text-xs"
            />
          </details>
        </div>

        {parsed?.errors && parsed.errors.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div>
              {parsed.errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          </div>
        )}

        {/* 2. 列マッピング */}
        {headers.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <ArrowRightLeft className="size-4 text-primary" />
              列の対応付け
              <span className="text-xs font-normal text-muted-foreground">
                （CSVの{headers.length}列を自動判定しました）
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {APP_FIELDS.map((field) => (
                <div
                  key={field.key}
                  className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
                >
                  <div className="w-24 shrink-0">
                    <span className="text-xs font-medium">
                      {field.label}
                      {field.required && (
                        <span className="text-destructive">*</span>
                      )}
                    </span>
                  </div>
                  <Select
                    value={mapping[field.key] ?? NONE}
                    onValueChange={(v) =>
                      setMapping((m) => ({
                        ...m,
                        [field.key]: v === NONE ? undefined : v,
                      }))
                    }
                  >
                    <SelectTrigger
                      className={cn(
                        "h-8 flex-1 text-xs",
                        field.required &&
                          !mapping[field.key] &&
                          "border-destructive",
                      )}
                    >
                      <SelectValue placeholder="（なし）" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>（なし）</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {/* 出欠フィルタ */}
            {mapping.attendance && (
              <label className="flex items-center gap-2 rounded-lg border bg-secondary/40 px-3 py-2 text-sm">
                <Checkbox
                  checked={onlyAttending}
                  onCheckedChange={(v) => setOnlyAttending(Boolean(v))}
                />
                <span className="font-medium">「出席」の行だけ取り込む</span>
                <span className="text-xs text-muted-foreground">
                  （欠席・未定などを除外）
                </span>
              </label>
            )}
          </div>
        )}

        {/* 3. プレビュー */}
        {headers.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>プレビュー（{preview.length}名）</span>
              {built && (built.skippedAbsent > 0 || built.skippedNoName > 0) && (
                <span className="text-xs font-normal text-muted-foreground">
                  {built.skippedAbsent > 0 &&
                    `欠席等 ${built.skippedAbsent}件除外 `}
                  {built.skippedNoName > 0 &&
                    `氏名なし ${built.skippedNoName}件除外`}
                </span>
              )}
            </div>
            <div className="scroll-slim max-h-40 overflow-y-auto rounded-lg border">
              {preview.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  {nameMapped
                    ? "取り込める行がありません"
                    : "「氏名」列を割り当ててください"}
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-secondary text-left">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">氏名</th>
                      <th className="px-2 py-1.5 font-semibold">会社名</th>
                      <th className="px-2 py-1.5 font-semibold">業種</th>
                      <th className="px-2 py-1.5 font-semibold">区分</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 100).map((a) => (
                      <tr key={a.id} className="border-t">
                        <td className="px-2 py-1 font-medium">{a.name}</td>
                        <td className="px-2 py-1 text-muted-foreground">
                          {a.company}
                        </td>
                        <td className="px-2 py-1 text-muted-foreground">
                          {a.industry}
                        </td>
                        <td className="px-2 py-1">
                          <span
                            className={cn(
                              "rounded px-1.5 py-px text-[10px] font-semibold text-white",
                              CATEGORY_STYLES[a.category].dot,
                            )}
                          >
                            {CATEGORY_STYLES[a.category].label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* 4. 取り込み方法 */}
        {headers.length > 0 && (
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as "replace" | "append")}
            className="grid grid-cols-2 gap-2"
          >
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <RadioGroupItem value="replace" />
              <span>
                <span className="font-medium">置き換え</span>
                <span className="block text-xs text-muted-foreground">
                  既存を削除して入替
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <RadioGroupItem value="append" />
              <span>
                <span className="font-medium">追加</span>
                <span className="block text-xs text-muted-foreground">
                  既存に加える
                </span>
              </span>
            </label>
          </RadioGroup>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button
            onClick={doImport}
            disabled={preview.length === 0 || !nameMapped}
          >
            {preview.length > 0 ? `${preview.length}名を取り込む` : "取り込む"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
