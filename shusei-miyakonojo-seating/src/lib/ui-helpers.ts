import type { AttendeeCategory } from "./types";

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

export const CATEGORY_STYLES: Record<AttendeeCategory, CategoryStyle> = {
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
