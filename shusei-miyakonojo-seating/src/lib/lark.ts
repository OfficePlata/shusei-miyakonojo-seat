/**
 * 同じ Worker に同居している API（worker/index.ts）との通信。
 *
 * 参加者と卓割の正は Lark BASE。このツールはその編集画面という位置づけで、
 * ローカル（localStorage）はあくまで作業中の下書き。
 */
import type { Attendee, Assignment, SeatingTable } from "./types";

export interface LarkMeeting {
  recordId: string;
  name: string;
  startAt: number | null;
  venue: string;
  status: string;
}

export interface LarkSeating {
  meeting: LarkMeeting;
  attendees: Attendee[];
  /** 出欠記録に保存済みの卓名・席番号（recordId → 値） */
  seats: Record<string, { tableNo: string; seatNo: number | null }>;
  layout: {
    tables?: SeatingTable[];
    assignments?: Assignment[];
    lockedAttendeeIds?: string[];
    savedAt?: string;
  } | null;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const data = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!res.ok || !data) {
    throw new Error(data?.error ?? `通信に失敗しました（HTTP ${res.status}）`);
  }
  return data;
}

export async function fetchMeetings(): Promise<{
  meetings: LarkMeeting[];
  upcoming: LarkMeeting | null;
}> {
  return get("/api/meetings");
}

/** YYYY-MM-DD。SeatingEvent.date はこの形式 */
export function toDateString(ms: number | null): string {
  if (ms === null) return "";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function fetchSeating(meetingId: string): Promise<LarkSeating> {
  return get(`/api/seating?meeting=${encodeURIComponent(meetingId)}`);
}

export interface SaveResult {
  saved: true;
  /** 出欠記録を書き換えた人数 */
  updated: number;
  /** そのうち卓を外した人数 */
  cleared: number;
  /** Lark に行が無く卓割を保存できなかった人数（ツール上で手で足した人） */
  unknownAttendees: number;
}

export async function saveSeating(
  meetingId: string,
  payload: {
    tables: SeatingTable[];
    assignments: Assignment[];
    lockedAttendeeIds: string[];
  },
): Promise<SaveResult> {
  const res = await fetch(`/api/seating?meeting=${encodeURIComponent(meetingId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => null)) as
    | (SaveResult & { error?: string })
    | null;
  if (!res.ok || !data) {
    throw new Error(data?.error ?? `保存に失敗しました（HTTP ${res.status}）`);
  }
  return data;
}
