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

export interface Attendee {
  id: string;
  name: string; // 氏名
  kana?: string; // ふりがな
  company: string; // 会社名
  industry: string; // 業種
  category: AttendeeCategory; // 区分
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
  name: string; // テーブル名（A, B, 1, 2, 来賓席 など）
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
  mixGuests: boolean; // 会員とゲストを混在
  keepGuestNearReferrer: boolean; // ゲストを紹介者と同卓に
  balanceTables: boolean; // 各卓の人数を均等化
  seatVipAtHead: boolean; // 来賓を来賓卓へ
  respectConstraints: boolean; // 個別の同席/分離設定を尊重
}

export const DEFAULT_RULES: AutoAssignRules = {
  spreadIndustry: true,
  separateCompany: true,
  mixGuests: true,
  keepGuestNearReferrer: false,
  balanceTables: true,
  seatVipAtHead: true,
  respectConstraints: true,
};
