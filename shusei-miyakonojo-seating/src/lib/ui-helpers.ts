import type { Attendee, AttendeeCategory } from "./types";
import { isHomeVenue } from "./types";

/**
 * 画面上の色分け。区分（会員/ゲスト/来賓/事務局）に「他会場」を足したもの。
 * 他会場からの参加者は Lark 上ただの会員だが、卓の顔ぶれを見るときは
 * 自会場と見分けられたほうがいい。
 */
export type VisualCategory = AttendeeCategory | "away";

/** 凡例・絞り込みの並び順 */
export const VISUAL_ORDER: VisualCategory[] = [
  "vip",
  "member",
  "away",
  "guest",
  "staff",
];

export function visualCategory(a: Attendee): VisualCategory {
  if (a.category === "member" && !isHomeVenue(a)) return "away";
  return a.category;
}

export interface CategoryStyle {
  label: string;
  /** ソリッド背景（席・バッジ） */
  solid: string;
  /** 淡い背景（チップ） */
  soft: string;
  /** ドット色 */
  dot: string;
  /** 枠線（席の縁） */
  border: string;
  /** 選択リング */
  ring: string;
  hex: string;
}

export const CATEGORY_STYLES: Record<VisualCategory, CategoryStyle> = {
  vip: {
    label: "来賓",
    solid: "bg-amber-500 text-white",
    soft: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
    border: "border-amber-400",
    ring: "ring-amber-400",
    hex: "#d99a2b",
  },
  member: {
    label: "会員",
    solid: "bg-primary text-primary-foreground",
    soft: "bg-accent text-accent-foreground border-primary/20",
    dot: "bg-primary",
    border: "border-primary",
    ring: "ring-primary",
    hex: "#ba1d24",
  },
  guest: {
    label: "ゲスト",
    solid: "bg-sky-600 text-white",
    soft: "bg-sky-50 text-sky-700 border-sky-200",
    dot: "bg-sky-600",
    border: "border-sky-500",
    ring: "ring-sky-500",
    hex: "#2f7cc4",
  },
  away: {
    label: "他会場",
    solid: "bg-violet-600 text-white",
    soft: "bg-violet-50 text-violet-700 border-violet-200",
    dot: "bg-violet-600",
    border: "border-violet-500",
    ring: "ring-violet-500",
    hex: "#6d4bc4",
  },
  staff: {
    label: "事務局",
    solid: "bg-emerald-600 text-white",
    soft: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-600",
    border: "border-emerald-500",
    ring: "ring-emerald-500",
    hex: "#2f9668",
  },
};

export function formatEventDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${
    days[d.getDay()]
  }）`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return parts[0].slice(0, 1) + parts[1].slice(0, 1);
  return name.slice(0, 2);
}
