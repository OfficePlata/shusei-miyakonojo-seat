import Papa from "papaparse";
import type { Attendee, AttendeeCategory } from "./types";
import { CATEGORY_LABELS, dutyLabels, parseDuties } from "./types";
import { uid } from "./events";

/* ============================================================
 * 取り込み対象のフィールド定義
 * ========================================================== */

export type FieldKey =
  | "name"
  | "kana"
  | "company"
  | "industry"
  | "category"
  | "venue"
  | "duties"
  | "referrer"
  | "role"
  | "group"
  | "isFirstTime"
  | "attendance"
  | "notes";

export interface FieldDef {
  key: FieldKey;
  label: string;
  required?: boolean;
  hint?: string;
}

export const APP_FIELDS: FieldDef[] = [
  { key: "name", label: "氏名", required: true },
  { key: "kana", label: "ふりがな" },
  { key: "company", label: "会社名・屋号" },
  { key: "industry", label: "業種" },
  { key: "category", label: "区分" },
  { key: "venue", label: "所属会場" },
  { key: "duties", label: "当日の役割", hint: "TM/受付/ブース/司会 など（カンマ区切り可）" },
  { key: "referrer", label: "紹介者" },
  { key: "role", label: "役職・肩書き" },
  { key: "group", label: "班・グループ" },
  { key: "isFirstTime", label: "初参加" },
  { key: "attendance", label: "出欠", hint: "「出席」の行だけ取り込む際に使用" },
  { key: "notes", label: "備考" },
];

/* ============================================================
 * 区分（会員/ゲスト/来賓/事務局）の表記ゆれ変換
 * ========================================================== */

const CATEGORY_KEYWORDS: { cat: AttendeeCategory; words: string[] }[] = [
  { cat: "vip", words: ["来賓", "賓客", "特別", "vip", "guest of honor"] },
  { cat: "staff", words: ["事務局", "スタッフ", "運営", "staff", "受付"] },
  {
    cat: "guest",
    words: [
      "ゲスト",
      "来場",
      "招待",
      "見学",
      "オブザーバー",
      "非会員",
      "guest",
      "visitor",
    ],
  },
  {
    cat: "member",
    words: ["会員", "正会員", "本会員", "一般", "世話人", "役員", "member"],
  },
];

export function categoryFromValue(value: string): AttendeeCategory {
  const v = value.trim().toLowerCase();
  if (!v) return "member";
  for (const { cat, words } of CATEGORY_KEYWORDS) {
    if (words.some((w) => v.includes(w.toLowerCase()))) return cat;
  }
  return "member";
}

/* ============================================================
 * 文字コード判定 / デコード
 * ========================================================== */

export type Encoding = "auto" | "utf-8" | "shift-jis";

// Shift-JIS/CP932 は環境によりラベルが異なるため候補を順に試す
const SJIS_LABELS = [
  "shift_jis",
  "shift-jis",
  "sjis",
  "cp932",
  "windows-31j",
  "ms_kanji",
];

/** 対応ラベルでデコード。デコーダが無い環境では null を返す。 */
function decodeBytes(labels: string[], bytes: Uint8Array): string | null {
  for (const label of labels) {
    try {
      return new TextDecoder(label, { fatal: false }).decode(bytes);
    } catch {
      // 次のラベルを試す
    }
  }
  return null;
}

function countReplacement(s: string): number {
  let n = 0;
  for (const ch of s) if (ch === "\uFFFD") n++;
  return n;
}

export function decodeCSVBuffer(
  buf: ArrayBuffer,
  enc: Encoding = "auto",
): { text: string; encoding: Exclude<Encoding, "auto"> } {
  const bytes = new Uint8Array(buf);

  if (enc === "utf-8") {
    return { text: decodeBytes(["utf-8"], bytes) ?? "", encoding: "utf-8" };
  }
  if (enc === "shift-jis") {
    return {
      text: decodeBytes(SJIS_LABELS, bytes) ?? decodeBytes(["utf-8"], bytes) ?? "",
      encoding: "shift-jis",
    };
  }

  // 自動判定：置換文字（文字化け）が少ない方を採用
  const asUtf8 = decodeBytes(["utf-8"], bytes);
  const asSjis = decodeBytes(SJIS_LABELS, bytes);
  const badUtf8 = asUtf8 == null ? Infinity : countReplacement(asUtf8);
  const badSjis = asSjis == null ? Infinity : countReplacement(asSjis);
  if (badSjis < badUtf8) return { text: asSjis ?? "", encoding: "shift-jis" };
  return { text: asUtf8 ?? "", encoding: "utf-8" };
}

/* ============================================================
 * 汎用 CSV パース
 * ========================================================== */

export interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
  errors: string[];
}

export function parseCSV(text: string): ParsedCSV {
  const res = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const headers = (res.meta.fields ?? []).filter((h): h is string => !!h);
  const rows = (res.data ?? []).filter(
    (r) => r && Object.values(r).some((v) => (v ?? "").toString().trim()),
  );
  const errors = res.errors
    .slice(0, 3)
    .map((e) => `${e.row != null ? `${e.row + 1}行目: ` : ""}${e.message}`);
  return { headers, rows, errors };
}

/* ============================================================
 * 列の自動マッピング推測
 * ========================================================== */

const FIELD_ALIASES: Record<FieldKey, string[]> = {
  name: [
    "氏名",
    "名前",
    "お名前",
    "参加者名",
    "出席者名",
    "代表者名",
    "会員氏名",
    "フルネーム",
    "name",
  ],
  kana: ["ふりがな", "フリガナ", "かな", "カナ", "氏名カナ", "氏名かな", "kana"],
  company: [
    "会社名",
    "会社",
    "企業名",
    "屋号",
    "事業所名",
    "法人名",
    "勤務先",
    "団体名",
    "社名",
    "company",
  ],
  industry: ["業種", "業種名", "事業内容", "業界", "カテゴリー", "カテゴリ", "industry"],
  category: [
    "区分",
    "会員区分",
    "種別",
    "会員種別",
    "資格",
    "参加区分",
    "属性",
    "会員種別区分",
    "category",
    "type",
  ],
  venue: ["所属会場", "会場", "所属", "支部", "チャプター", "ホーム会場", "venue"],
  duties: [
    "当日の役割",
    "当日役割",
    "役割",
    "係",
    "担当",
    "会場ロール",
    "ロール",
    "duty",
    "duties",
  ],
  referrer: ["紹介者", "紹介", "招待者", "紹介会員", "referrer"],
  role: ["役職", "肩書き", "肩書", "役職名", "title", "role"],
  group: ["班", "グループ", "組", "チーム", "班名", "group"],
  isFirstTime: ["初参加", "初回", "初", "新規", "first", "new"],
  attendance: [
    "出欠",
    "出席",
    "出欠確認",
    "出席状況",
    "参加状況",
    "参加",
    "ステータス",
    "状態",
    "attendance",
    "status",
  ],
  notes: ["備考", "メモ", "特記事項", "コメント", "remarks", "note", "notes"],
};

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s　_\-()（）]/g, "");
}

export type Mapping = Partial<Record<FieldKey, string>>;

export function guessMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set<string>();
  const normHeaders = headers.map((h) => ({ raw: h, n: norm(h) }));

  for (const field of APP_FIELDS) {
    const aliases = FIELD_ALIASES[field.key].map(norm);
    // 完全一致を優先
    let hit = normHeaders.find(
      (h) => !used.has(h.raw) && aliases.includes(h.n),
    );
    // 部分一致
    if (!hit) {
      hit = normHeaders.find(
        (h) =>
          !used.has(h.raw) &&
          aliases.some((a) => h.n.includes(a) || a.includes(h.n)),
      );
    }
    if (hit) {
      mapping[field.key] = hit.raw;
      used.add(hit.raw);
    }
  }
  return mapping;
}

/* ============================================================
 * 出欠判定
 * ========================================================== */

const ABSENT = /(欠席|不参加|辞退|キャンセル|未定|未回答|absent|no|×|✕|✖)/i;
const PRESENT = /(出席|参加|申込|受付|○|◯|●|out|present|yes|attend|1|有)/i;

export function isAttending(value: string): boolean {
  const s = value.trim();
  if (!s) return false;
  if (ABSENT.test(s)) return false;
  return PRESENT.test(s);
}

const TRUTHY = ["○", "◯", "●", "はい", "yes", "true", "1", "初", "有", "あり", "new"];
function isTruthy(v: string): boolean {
  return TRUTHY.includes(v.trim().toLowerCase()) || TRUTHY.includes(v.trim());
}

/* ============================================================
 * 行 → 出席者への変換
 * ========================================================== */

export interface BuildOptions {
  onlyAttending: boolean;
}

export interface BuildResult {
  attendees: Attendee[];
  skippedAbsent: number;
  skippedNoName: number;
}

export function rowsToAttendees(
  rows: Record<string, string>[],
  mapping: Mapping,
  opts: BuildOptions,
): BuildResult {
  const attendees: Attendee[] = [];
  let skippedAbsent = 0;
  let skippedNoName = 0;

  const get = (row: Record<string, string>, field: FieldKey): string => {
    const col = mapping[field];
    if (!col) return "";
    return (row[col] ?? "").toString().trim();
  };

  for (const row of rows) {
    if (opts.onlyAttending && mapping.attendance) {
      if (!isAttending(get(row, "attendance"))) {
        skippedAbsent++;
        continue;
      }
    }

    const name = get(row, "name");
    if (!name) {
      skippedNoName++;
      continue;
    }

    const categoryRaw = get(row, "category");
    const firstRaw = get(row, "isFirstTime");

    // 当日の役割は専用列 + 備考の両方から推定してまとめる
    const dutiesRaw = `${get(row, "duties")} ${get(row, "notes")}`;
    const duties = parseDuties(dutiesRaw);

    attendees.push({
      id: uid("att"),
      name,
      kana: get(row, "kana"),
      company: get(row, "company"),
      industry: get(row, "industry"),
      category: categoryRaw ? categoryFromValue(categoryRaw) : "member",
      venue: get(row, "venue"),
      duties,
      referrer: get(row, "referrer"),
      role: get(row, "role"),
      group: get(row, "group"),
      isFirstTime:
        (!!firstRaw && isTruthy(firstRaw)) || /初/.test(categoryRaw),
      notes: get(row, "notes"),
      keepWith: [],
      keepApart: [],
    });
  }

  return { attendees, skippedAbsent, skippedNoName };
}

/* ============================================================
 * 書き出し（従来通り）
 * ========================================================== */

export function attendeesToCSV(attendees: Attendee[]): string {
  const rows = attendees.map((a) => ({
    氏名: a.name,
    ふりがな: a.kana ?? "",
    会社名: a.company,
    業種: a.industry,
    区分: CATEGORY_LABELS[a.category],
    所属会場: a.venue ?? "",
    当日の役割: dutyLabels(a.duties).join("・"),
    紹介者: a.referrer ?? "",
    役職: a.role ?? "",
    班: a.group ?? "",
    初参加: a.isFirstTime ? "○" : "",
    備考: a.notes ?? "",
  }));
  return Papa.unparse(rows, {
    columns: [
      "氏名",
      "ふりがな",
      "会社名",
      "業種",
      "区分",
      "所属会場",
      "当日の役割",
      "紹介者",
      "役職",
      "班",
      "初参加",
      "備考",
    ],
  });
}

export const CSV_TEMPLATE = `氏名,ふりがな,会社名,業種,区分,所属会場,当日の役割,紹介者,役職,班,初参加,備考
田中 太郎,たなか たろう,田中商事,卸売業,会員,都城,TM,,世話人,,,
山田 花子,やまだ はなこ,山田デザイン,広告・印刷,ゲスト,鹿児島,,田中 太郎,,,○,初めての参加です
`;

export function downloadCSV(filename: string, csv: string) {
  // Excel 対応のため BOM を付与
  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
