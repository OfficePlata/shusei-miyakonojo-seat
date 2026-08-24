/**
 * Lark BASE への最小クライアント。
 *
 * 座席表ツールが使うのは「例会マスタを読む」「出欠記録を読む」「卓割を書き戻す」の3つだけ。
 * sewaninja-portal 側の src/lark/* から必要な部分だけを持ってきている。
 * フィールド名は sewaninja-portal/docs/base-schema.md が正。片方だけ直さない。
 */

export type Bindings = {
  /** Next の static export（out/）。/api/* 以外はここへ流す */
  ASSETS: Fetcher
  KV: KVNamespace
  LARK_DOMAIN: string
  LARK_APP_ID: string
  LARK_BASE_APP_TOKEN: string
  LARK_APP_SECRET: string
}

export const TABLES = {
  meetings: 'tblX6OGZ97Bv8Yig',
  attendance: 'tblt95tfb4lGvF8R',
  /** 当番表。例会ごとの TM・受付などの割当 */
  duties: 'tblK6nSuzF1nHKMP',
  /** 世話人マスタ。役職（代表・副代表・事務局・会計・世話人・実行委員） */
  sewanin: 'tblUU3sh3fdM7p5G',
  /** 会員データ_最新。フリガナ・会社名・事業案内の正 */
  members: 'tblLubHT4kasU3ch',
} as const

export const DUTY_FIELDS = {
  meeting: '例会',
  role: '役割',
  personName: '担当者名',
  tableNo: 'テーブル番号',
  status: '引受状況',
} as const

export const MEETING_FIELDS = {
  name: '例会名',
  startAt: '開催日時',
  venue: '会場',
  status: 'ステータス',
  layout: '座席レイアウト',
} as const

export const ATTENDANCE_FIELDS = {
  name: '氏名',
  meeting: '例会',
  answer: '出欠',
  kind: '区分',
  venueName: '所属会場',
  referrer: '紹介者',
  company: '会社名',
  kana: 'フリガナ',
  booth: 'ブース',
  flyer: 'チラシPR',
  tableNo: 'テーブル番号',
  seatNo: '席番号',
} as const

// ポータルと同じ KV namespace を共有しているのでキーを分ける
const TOKEN_KEY = 'seat:lark:tenant_access_token'
const TOKEN_TTL_SEC = 6000

export class LarkError extends Error {}

async function getToken(env: Bindings): Promise<string> {
  const cached = await env.KV.get(TOKEN_KEY)
  if (cached) return cached

  const res = await fetch(
    `https://${env.LARK_DOMAIN}/open-apis/auth/v3/tenant_access_token/internal`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: env.LARK_APP_ID, app_secret: env.LARK_APP_SECRET }),
    },
  )
  const data = (await res.json()) as { code: number; msg: string; tenant_access_token?: string }
  if (data.code !== 0 || !data.tenant_access_token) {
    // app_secret はここに出さない
    throw new LarkError(`トークン取得に失敗しました（code=${data.code} ${data.msg}）`)
  }
  await env.KV.put(TOKEN_KEY, data.tenant_access_token, { expirationTtl: TOKEN_TTL_SEC })
  return data.tenant_access_token
}

async function larkFetch<T>(
  env: Bindings,
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | number> } = {},
): Promise<T> {
  const token = await getToken(env)
  const url = new URL(`https://${env.LARK_DOMAIN}${path}`)
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, String(v))

  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=utf-8',
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })

  const data = (await res.json()) as { code: number; msg: string; data?: T }
  if (data.code !== 0) throw new LarkError(`Lark API エラー（code=${data.code} ${data.msg}）`)
  return data.data as T
}

export type LarkRecord = { record_id: string; fields: Record<string, unknown> }

export async function searchAll(
  env: Bindings,
  table: string,
  fieldNames: readonly string[],
  maxPages = 10,
): Promise<LarkRecord[]> {
  const all: LarkRecord[] = []
  let pageToken: string | undefined

  for (let page = 0; page < maxPages; page++) {
    const data = await larkFetch<{ items?: LarkRecord[]; has_more?: boolean; page_token?: string }>(
      env,
      `/open-apis/bitable/v1/apps/${env.LARK_BASE_APP_TOKEN}/tables/${table}/records/search`,
      {
        method: 'POST',
        query: { page_size: 200, ...(pageToken ? { page_token: pageToken } : {}) },
        body: { field_names: fieldNames },
      },
    )
    all.push(...(data.items ?? []))
    if (!data.has_more || !data.page_token) break
    pageToken = data.page_token
  }
  return all
}

export async function updateRecord(
  env: Bindings,
  table: string,
  recordId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  await larkFetch(
    env,
    `/open-apis/bitable/v1/apps/${env.LARK_BASE_APP_TOKEN}/tables/${table}/records/${recordId}`,
    { method: 'PUT', body: { fields } },
  )
}

/**
 * 出欠記録の卓割をまとめて書き戻す。
 * 1件ずつ PUT すると 89人で 89 リクエストになるので batch_update を使う。
 * 上限は 1,000 件/回。
 */
export async function updateRecords(
  env: Bindings,
  table: string,
  records: { record_id: string; fields: Record<string, unknown> }[],
): Promise<void> {
  for (let i = 0; i < records.length; i += 500) {
    await larkFetch(
      env,
      `/open-apis/bitable/v1/apps/${env.LARK_BASE_APP_TOKEN}/tables/${table}/records/batch_update`,
      { method: 'POST', body: { records: records.slice(i, i + 500) } },
    )
  }
}

// --- フィールド値の取り出し ---
// search API は型ごとに違う形で返す。呼び出し側で毎回分岐しないようここで吸収する。

export function fieldText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? v : ((v as { text?: string })?.text ?? '')))
      .join('')
  }
  const o = value as { text?: string; value?: unknown }
  if (typeof o.text === 'string') return o.text
  if (o.value !== undefined) return fieldText(o.value)
  return ''
}

export function fieldNumber(value: unknown): number | null {
  if (typeof value === 'number') return value
  const t = fieldText(value)
  if (t === '') return null
  const n = Number(t)
  return Number.isNaN(n) ? null : n
}

export function fieldDate(value: unknown): number | null {
  if (typeof value === 'number') return value
  return null
}

export function fieldLinkIds(value: unknown): string[] {
  if (value == null) return []
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'string' ? v : ((v as { id?: string })?.id ?? ''))).filter(Boolean)
  }
  const o = value as { link_record_ids?: string[] }
  return o.link_record_ids ?? []
}
