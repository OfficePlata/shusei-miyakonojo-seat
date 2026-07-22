// 区分（会員 / ゲスト / 来賓 / 事務局）
export type AttendeeCategory = "member" | "guest" | "vip" | "staff";

export const CATEGORY_LABELS: Record<AttendeeCategory, string> = {
  member: "会員",
  guest: "ゲスト",
  vip: "来賓",
  staff: "事務局",
};

export const CATEGORY_ORDER: AttendeeCategory[] = [
  "vip",
  "member",
  "guest",
  "staff",
];

// 当日の役割（1人が複数持てる）。TM・受付・ブース・司会をシステムで管理する。
export type Duty =
  | "tm"
  | "mc"
  | "reception"
  | "booth"
  | "negotiation"
  | "flyer";

export const DUTY_LABELS: Record<Duty, string> = {
  tm: "TM",
  mc: "司会",
  reception: "受付",
  booth: "ブース",
  negotiation: "商談",
  flyer: "チラシ",
};

// 印刷・表示・席順で使う役割の並び順
export const DUTY_ORDER: Duty[] = [
  "tm",
  "mc",
  "reception",
  "booth",
  "negotiation",
  "flyer",
];

/** 備考・自由入力から Duty 配列を推定する */
export function parseDuties(value: string): Duty[] {
  const v = (value ?? "").toLowerCase();
  const out: Duty[] = [];
  const has = (...words: string[]) =>
    words.some((w) => v.includes(w.toLowerCase()));
  if (has("tm", "ｔｍ")) out.push("tm");
  if (has("司会", "mc")) out.push("mc");
  if (has("受付", "reception")) out.push("reception");
  if (has("ブース", "booth", "出展")) out.push("booth");
  if (has("商談")) out.push("negotiation");
  if (has("チラシ", "flyer")) out.push("flyer");
  return out;
}

/** Duty 配列を印刷順に整えたラベル配列にする */
export function dutyLabels(duties?: Duty[]): string[] {
  if (!duties?.length) return [];
  return DUTY_ORDER.filter((d) => duties.includes(d)).map((d) => DUTY_LABELS[d]);
}

export interface Attendee {
  id: string;
  name: string; // 氏名
  kana?: string; // ふりがな
  company: string; // 会社名
  industry: string; // 業種
  category: AttendeeCategory; // 区分
  venue?: string; // 所属会場（鹿児島 / 宮崎 / 大分中央 / 延岡 / ヒルノ沖縄 など）
  duties?: Duty[]; // 当日の役割（TM / 受付 / ブース / 司会 など）
  referrer?: string; // 紹介者（ゲストの場合）
  role?: string; // 役職・肩書き（代表世話人 など）
  group?: string; // 班・グループ
  isFirstTime?: boolean; // 初参加
  notes?: string; // 備考
  /** 一緒に座らせたい相手 / 離したい相手（attendee id の配列） */
  keepWith?: string[];
  keepApart?: string[];
}

export type TableShape = "round" | "rect";
export type TableKind = "normal" | "head";

export interface SeatingTable {
  id: string;
  name: string; // テーブル名（1, 2, 3, 来賓席 など）
  capacity: number; // 席数
  shape: TableShape;
  kind: TableKind; // normal=通常卓 / head=来賓・役員卓
  x: number; // レイアウト座標（キャンバス内）
  y: number;
}

/** attendeeId -> { tableId, seatIndex } */
export interface Assignment {
  attendeeId: string;
  tableId: string;
  seatIndex: number;
}

export interface SeatingEvent {
  id: string;
  title: string; // 令和8年7月例会
  date: string; // 2026-07-23
  venue: string; // グランドパティオ都城
  note?: string;
  attendees: Attendee[];
  tables: SeatingTable[];
  assignments: Assignment[];
  /** 自動配置でも動かさない固定席（attendee id） */
  lockedAttendeeIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface AutoAssignRules {
  spreadIndustry: boolean; // 同業種を分散
  separateCompany: boolean; // 同一会社を分離
  spreadVenue: boolean; // 他会場を各卓へ分散（同じ会場を固めない）
  spreadDuties: boolean; // ブース・受付など役割保持者を各卓へ分散
  mixGuests: boolean; // 会員とゲストを混在
  keepGuestNearReferrer: boolean; // ゲストを紹介者と同卓に
  orderByStage: boolean; // 席順をステージ近い順（TM→ゲスト→紹介者）に整える
  balanceTables: boolean; // 各卓の人数を均等化
  seatVipAtHead: boolean; // 来賓を来賓卓へ
  respectConstraints: boolean; // 個別の同席/分離設定を尊重
}

export const DEFAULT_RULES: AutoAssignRules = {
  spreadIndustry: true,
  separateCompany: true,
  spreadVenue: true,
  spreadDuties: true,
  mixGuests: true,
  keepGuestNearReferrer: true,
  orderByStage: true,
  balanceTables: true,
  seatVipAtHead: true,
  respectConstraints: true,
};
