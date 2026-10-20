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
    /** 2回転目。TM とゲストは1回転目と同じ卓のまま */
    assignments2?: Assignment[];
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
    assignments2?: Assignment[];
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

/** 当番表の TM・受付1枠。卓を割り振る対象 */
export interface DutySlot {
  recordId: string;
  /** 'TM' / '受付' */
  role: string;
  name: string;
  /** 割り振った卓名。未指定は空 */
  tableNo: string;
  order: number | null;
  status: string;
  note: string;
}

export async function fetchDuties(meetingId: string): Promise<DutySlot[]> {
  const data = await get<{ duties: DutySlot[] }>(
    `/api/duties?meeting=${encodeURIComponent(meetingId)}`,
  );
  return data.duties;
}

/** TM・受付の卓を当番表へ保存する。変わった行だけ書かれる */
export async function saveDuties(
  meetingId: string,
  updates: { recordId: string; tableNo: string }[],
): Promise<{ updated: number }> {
  const res = await fetch(`/api/duties?meeting=${encodeURIComponent(meetingId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ updates }),
  });
  const data = (await res.json().catch(() => null)) as
    | { updated: number; error?: string }
    | null;
  if (!res.ok || !data) {
    throw new Error(data?.error ?? `保存に失敗しました（HTTP ${res.status}）`);
  }
  return data;
}

/** 参加者を手で足すときに Lark へ送る値。区分は category と venue（あれば他会場）で決まる */
export interface AttendeeInput {
  name: string;
  kana?: string;
  company?: string;
  category: "member" | "guest";
  venue?: string;
  referrer?: string;
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) {
    throw new Error(data?.error ?? `保存に失敗しました（HTTP ${res.status}）`);
  }
  return data;
}

/**
 * 参加者を Lark の出欠記録へ足す（手動出欠=出席）。翌朝の本部HPの取り込みでも消えない。
 * 返り値は参加者を取得したときと同じ形の1人（id は出欠記録の record_id）
 */
export async function addAttendeeToLark(
  meetingId: string,
  input: AttendeeInput,
): Promise<{ attendee: Attendee; created: boolean }> {
  return send("POST", `/api/attendees?meeting=${encodeURIComponent(meetingId)}`, input);
}

/**
 * 参加者を外す（手動出欠=欠席・卓を空ける）。手で足しただけの人は出欠記録の行ごと消える（deleted）。
 * 元に戻すのはポータルの出欠回答一覧「手で変えた出欠」から
 */
export async function removeAttendeeFromLark(
  meetingId: string,
  attendeeId: string,
): Promise<{ removed: true; deleted: boolean }> {
  return send(
    "DELETE",
    `/api/attendees?meeting=${encodeURIComponent(meetingId)}&id=${encodeURIComponent(attendeeId)}`,
  );
}

/** Lark の例会・参加者か（record_id）。手元だけの例会やツールで足した人は uid（evt-・att-） */
export const isLarkId = (id: string): boolean => /^rec[A-Za-z0-9]+$/.test(id);
