/**
 * 座席表メーカーの API。静的アセット（Next の out/）と同じ Worker に同居する。
 *
 * 役割は3つだけ:
 *   GET  /api/meetings                  例会の一覧（Lark 例会マスタ）
 *   GET  /api/seating?meeting=rec...    参加者＋保存済みの卓割
 *   PUT  /api/seating?meeting=rec...    卓割を保存
 *
 * 参加者の正は Lark BASE「出欠記録」。**出席の回答がある人だけ**を返す。
 * 自会場・他会場・ゲストの3区分すべてが受付を通るので、3つとも返す。
 *
 * 卓割の保存先:
 *   - 卓の定義と配置、席の割当 → 例会マスタ「座席レイアウト」に JSON
 *   - 1人ずつの卓名・席番号     → 出欠記録「テーブル番号」「席番号」
 *     （ポータルの受付名簿がここを読む。受付でこの番号を伝える）
 *
 * **認証は付けていない。** 会員の氏名・会社名・ゲストの紹介者が
 * URL を知っている人には見え、卓割も書き換えられる状態であることを承知のうえの構成。
 * 認証は後から足す（そのとき、この Worker の先頭でセッションを見るだけで済むようにしてある）。
 */
import {
  ATTENDANCE_FIELDS,
  DUTY_FIELDS,
  type Bindings,
  fieldDate,
  fieldLinkIds,
  fieldNumber,
  fieldText,
  LarkError,
  MEETING_FIELDS,
  searchAll,
  TABLES,
  updateRecord,
  updateRecords,
} from './lark'

const KIND = { own: '自会場', other: '他会場', guest: 'ゲスト' } as const

/** 座席表ツール側の区分。来賓・事務局は Lark に持たないので member/guest だけ使う */
type Category = 'member' | 'guest' | 'vip' | 'staff'

type Attendee = {
  /** Lark の record_id。保存した割当を復元するときのキー */
  id: string
  name: string
  kana: string
  company: string
  industry: string
  category: Category
  /** 他会場の所属（宮崎会場など）。自会場は空 */
  venue: string
  referrer: string
  duties: string[]
  /** 世話人マスタの役職（代表・副代表・事務局・会計・世話人・実行委員）。一般会員は空 */
  role: string
  /** 事業案内の原文。卓割では使わないが画面で参考になる */
  notes: string
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

// --- 例会 ---

type Meeting = { recordId: string; name: string; startAt: number | null; venue: string; status: string }

async function loadMeetings(env: Bindings): Promise<Meeting[]> {
  const records = await searchAll(env, TABLES.meetings, [
    MEETING_FIELDS.name,
    MEETING_FIELDS.startAt,
    MEETING_FIELDS.venue,
    MEETING_FIELDS.status,
  ])
  return records
    .map((r) => ({
      recordId: r.record_id,
      name: fieldText(r.fields[MEETING_FIELDS.name]),
      startAt: fieldDate(r.fields[MEETING_FIELDS.startAt]),
      venue: fieldText(r.fields[MEETING_FIELDS.venue]),
      status: fieldText(r.fields[MEETING_FIELDS.status]),
    }))
    .sort((a, b) => (a.startAt ?? 0) - (b.startAt ?? 0))
}

/** 次に開催される例会。全部過去なら直近に終わったもの */
function pickUpcoming(meetings: Meeting[]): Meeting | null {
  const now = Date.now()
  return (
    meetings.find((m) => m.startAt !== null && m.startAt >= now && m.status !== '中止') ??
    [...meetings].reverse().find((m) => m.startAt !== null) ??
    meetings[0] ??
    null
  )
}

// --- 参加者 ---

async function loadAttendees(
  env: Bindings,
  meetingId: string,
): Promise<{ attendees: Attendee[]; seats: Record<string, { tableNo: string; seatNo: number | null }> }> {
  const records = await searchAll(env, TABLES.attendance, Object.values(ATTENDANCE_FIELDS))

  const attendees: Attendee[] = []
  const seats: Record<string, { tableNo: string; seatNo: number | null }> = {}

  for (const r of records) {
    if (!fieldLinkIds(r.fields[ATTENDANCE_FIELDS.meeting]).includes(meetingId)) continue
    if (fieldText(r.fields[ATTENDANCE_FIELDS.answer]) !== '出席') continue

    // 区分が空の行は 2026-08-18 以前に取り込んだ自会場ぶん
    const kind = fieldText(r.fields[ATTENDANCE_FIELDS.kind]) || KIND.own

    // 当日の役割。ブースとチラシPRは出欠フォームの回答から分かる
    const duties: string[] = []
    if (fieldText(r.fields[ATTENDANCE_FIELDS.booth]) === 'する') duties.push('booth')
    if (fieldText(r.fields[ATTENDANCE_FIELDS.flyer]) === 'する') duties.push('flyer')

    attendees.push({
      id: r.record_id,
      name: fieldText(r.fields[ATTENDANCE_FIELDS.name]),
      kana: fieldText(r.fields[ATTENDANCE_FIELDS.kana]),
      company: fieldText(r.fields[ATTENDANCE_FIELDS.company]),
      industry: '',
      category: kind === KIND.guest ? 'guest' : 'member',
      venue: kind === KIND.other ? fieldText(r.fields[ATTENDANCE_FIELDS.venueName]) || KIND.other : '',
      referrer: fieldText(r.fields[ATTENDANCE_FIELDS.referrer]),
      duties,
      role: '',
      notes: '',
    })

    seats[r.record_id] = {
      tableNo: fieldText(r.fields[ATTENDANCE_FIELDS.tableNo]),
      seatNo: fieldNumber(r.fields[ATTENDANCE_FIELDS.seatNo]),
    }
  }

  attendees.sort((a, b) => (a.kana || a.name).localeCompare(b.kana || b.name, 'ja'))
  return { attendees, seats }
}

/**
 * 自会場の会員は、フリガナと会社名を出欠記録が持っていない
 * （会員データ_最新が正なので二重に持たない方針）。名簿を引いて埋める。
 */
async function fillFromRoster(env: Bindings, attendees: Attendee[]): Promise<void> {
  const members = await searchAll(env, TABLES.members, [
    '氏名',
    'フリガナ',
    '会社名 (団体名)',
    '事業案内',
    '業種',
  ])
  const roster = new Map(members.map((m) => [nameKey(fieldText(m.fields['氏名'])), m.fields]))

  for (const a of attendees) {
    const f = roster.get(nameKey(a.name))
    if (f) {
      a.kana ||= fieldText(f['フリガナ'])
      a.company ||= fieldText(f['会社名 (団体名)'])
      a.notes ||= fieldText(f['事業案内'])
      // 人が入れた業種が最優先。「椿」のように屋号からは夜の店と分からない会員はここで直す
      a.industry ||= fieldText(f['業種'])
    }
    // 業種が空なら事業案内と会社名から起こす。
    // 他会場・ゲストは会員データに行が無いので、会社名だけが手がかりになる
    a.industry ||= industryOf(`${a.notes} ${a.company}`)
  }
}

const nameKey = (s: string) => s.replace(/[\s　]/g, '')

/**
 * 事業案内・会社名から業種タグを起こす。
 * 卓割で散らしたいのはスナック・バーだけなので、今はそれだけを見分ける。
 * 「クローバー」「スポーツクラブ」のような紛らわしい語は除外する。
 */
const NIGHT_BIZ = /(スナック|snack|ラウンジ|lounge|ナイトスポット|キャバ|パブ|BAR|ＢＡＲ|バーの経営|クラブ、)/i
const NIGHT_NG = /(スポーツクラブ|クローバー|フィットネス|ハーバー|バーガー)/
function industryOf(text: string): string {
  if (!text.trim()) return ''
  return NIGHT_BIZ.test(text) && !NIGHT_NG.test(text) ? 'ナイト' : ''
}

/** 当番表の「役割」→ ツール側の Duty */
const DUTY_BY_ROLE: Record<string, string> = {
  TM: 'tm',
  受付: 'reception',
  司会: 'mc',
}

/**
 * 当番表から TM・受付・司会を割り当てる。
 * 座席表ツールはこれを見て「TM を各卓の一番うえ」「受付を各卓へ散らす」を効かせる。
 * 引受状況が「交代」の行は、代わりの人が別行で入る前提なので読まない。
 */
async function applyDuties(env: Bindings, meetingId: string, attendees: Attendee[]): Promise<void> {
  const records = await searchAll(env, TABLES.duties, Object.values(DUTY_FIELDS))
  const byName = new Map(attendees.map((a) => [nameKey(a.name), a]))

  for (const r of records) {
    if (!fieldLinkIds(r.fields[DUTY_FIELDS.meeting]).includes(meetingId)) continue
    if (fieldText(r.fields[DUTY_FIELDS.status]) === '交代') continue
    const duty = DUTY_BY_ROLE[fieldText(r.fields[DUTY_FIELDS.role])]
    if (!duty) continue
    const a = byName.get(nameKey(fieldText(r.fields[DUTY_FIELDS.personName])))
    if (!a) continue
    if (!a.duties.includes(duty)) a.duties.push(duty)
  }
}

/**
 * 世話人マスタの役職を付ける。
 * 会員データの「会員種別」では8名が一般のままで世話人を取りこぼすため、マスタ側を正とする。
 */
async function applySewanin(env: Bindings, attendees: Attendee[]): Promise<void> {
  const records = await searchAll(env, TABLES.sewanin, ['名前', '役職'])
  const byName = new Map(attendees.map((a) => [nameKey(a.name), a]))

  for (const r of records) {
    const a = byName.get(nameKey(fieldText(r.fields['名前'])))
    if (!a) continue
    a.role = fieldText(r.fields['役職'])
  }
}

// --- 卓割の保存 ---

type SavedLayout = {
  tables?: unknown[]
  assignments?: { attendeeId: string; tableId: string; seatIndex: number }[]
  lockedAttendeeIds?: string[]
  savedAt?: string
}

function parseLayout(raw: string): SavedLayout | null {
  if (!raw.trim()) return null
  try {
    return JSON.parse(raw) as SavedLayout
  } catch {
    // 人が手で編集して壊した場合。落とさずに「未保存」として扱う
    return null
  }
}

async function handleGet(env: Bindings, meetingId: string): Promise<Response> {
  const meetings = await loadMeetings(env)
  const meeting = meetings.find((m) => m.recordId === meetingId) ?? null
  if (!meeting) return json({ error: '例会が見つかりません' }, 404)

  const [{ attendees, seats }, layoutRecords] = await Promise.all([
    loadAttendees(env, meetingId),
    searchAll(env, TABLES.meetings, [MEETING_FIELDS.name, MEETING_FIELDS.layout]),
  ])
  await fillFromRoster(env, attendees)
  // 当番表と世話人マスタは互いに独立なので並行で読む
  await Promise.all([applyDuties(env, meetingId, attendees), applySewanin(env, attendees)])

  const raw = layoutRecords.find((r) => r.record_id === meetingId)
  const layout = parseLayout(fieldText(raw?.fields[MEETING_FIELDS.layout]))

  return json({ meeting, attendees, seats, layout })
}

async function handlePut(env: Bindings, meetingId: string, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as SavedLayout | null
  if (!body || !Array.isArray(body.tables)) {
    return json({ error: 'tables を含む JSON を送ってください' }, 400)
  }

  const assignments = Array.isArray(body.assignments) ? body.assignments : []

  // 卓の定義と配置は例会マスタへ丸ごと。ツールの状態をそのまま復元するため
  const layout: SavedLayout = {
    tables: body.tables,
    assignments,
    lockedAttendeeIds: Array.isArray(body.lockedAttendeeIds) ? body.lockedAttendeeIds : [],
    savedAt: new Date().toISOString(),
  }
  await updateRecord(env, TABLES.meetings, meetingId, {
    [MEETING_FIELDS.layout]: JSON.stringify(layout),
  })

  // 1人ずつの卓名・席番号は出欠記録へ。受付名簿はこちらを読む
  const tableName = new Map<string, string>()
  for (const t of body.tables as { id?: string; name?: string }[]) {
    if (t?.id) tableName.set(t.id, String(t.name ?? ''))
  }

  const { attendees, seats } = await loadAttendees(env, meetingId)
  const assigned = new Map<string, { tableNo: string; seatNo: number }>()
  for (const a of assignments) {
    const name = tableName.get(a.tableId)
    if (!name) continue
    assigned.set(a.attendeeId, { tableNo: name, seatNo: a.seatIndex + 1 })
  }

  // 変わった行だけ送る。全件書くと BASE の更新日時が毎回動いて差分を追えなくなる
  const updates: { record_id: string; fields: Record<string, unknown> }[] = []
  let cleared = 0
  for (const a of attendees) {
    const next = assigned.get(a.id) ?? { tableNo: '', seatNo: null }
    const prev = seats[a.id] ?? { tableNo: '', seatNo: null }
    if (next.tableNo === prev.tableNo && next.seatNo === prev.seatNo) continue
    if (next.tableNo === '') cleared++
    updates.push({
      record_id: a.id,
      fields: {
        [ATTENDANCE_FIELDS.tableNo]: next.tableNo,
        [ATTENDANCE_FIELDS.seatNo]: next.seatNo,
      },
    })
  }
  if (updates.length > 0) await updateRecords(env, TABLES.attendance, updates)

  // ツール側で手で足した人は Lark に行が無いので卓割を書けない。黙って落とさず件数を返す
  const known = new Set(attendees.map((a) => a.id))
  const unknown = assignments.filter((a) => !known.has(a.attendeeId)).length

  return json({
    saved: true,
    updated: updates.length,
    cleared,
    unknownAttendees: unknown,
  })
}

export default {
  async fetch(req: Request, env: Bindings): Promise<Response> {
    const url = new URL(req.url)

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(req)
    }

    try {
      if (url.pathname === '/api/meetings' && req.method === 'GET') {
        const meetings = await loadMeetings(env)
        return json({ meetings, upcoming: pickUpcoming(meetings) })
      }

      if (url.pathname === '/api/seating') {
        const meetingId = url.searchParams.get('meeting')
        if (!meetingId) return json({ error: 'meeting を指定してください' }, 400)
        if (req.method === 'GET') return await handleGet(env, meetingId)
        if (req.method === 'PUT') return await handlePut(env, meetingId, req)
        return json({ error: 'GET か PUT を使ってください' }, 405)
      }

      return json({ error: 'not found' }, 404)
    } catch (e) {
      if (e instanceof LarkError) return json({ error: e.message }, 502)
      return json({ error: e instanceof Error ? e.message : String(e) }, 500)
    }
  },
} satisfies ExportedHandler<Bindings>
