/**
 * 座席表メーカーの API。静的アセット（Next の out/）と同じ Worker に同居する。
 *
 * 役割:
 *   GET  /api/meetings                  例会の一覧（Lark 例会マスタ）
 *   GET  /api/seating?meeting=rec...    参加者＋保存済みの卓割
 *   PUT  /api/seating?meeting=rec...    卓割を保存
 *   GET  /api/duties?meeting=rec...     その例会の TM・受付（当番表）
 *   PUT  /api/duties?meeting=rec...     TM・受付の卓を当番表「テーブル番号」へ保存
 *   POST   /api/attendees?meeting=rec...         参加者を手で足す（出欠記録に入れる）
 *   DELETE /api/attendees?meeting=rec...&id=rec... 参加者を外す
 *
 * 参加者の正は Lark BASE「出欠記録」。**出席の回答がある人だけ**を返す。
 * 「手動出欠」（手で足した／外した印）が入っていれば、本部HPの回答（出欠）より優先する。
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
  CHANNEL_PROXY,
  createRecord,
  deleteRecord,
  DUTY_FIELDS,
  type Bindings,
  fieldDate,
  fieldLinkIds,
  fieldNumber,
  fieldText,
  LarkError,
  MANUAL_ANSWER_FIELD,
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
  /** 当番表で決めた卓（TM・受付）。自動配置はこの卓に固定する。未指定は空 */
  dutyTable: string
  /**
   * 受付名簿・冊子用一覧（元データの紙）に出す値。卓割では使わない。
   * 9月例会で、別に作った名簿と座席表の卓番号が食い違って参加者を戸惑わせたため、
   * 名簿も座席表と同じデータからこのツールで刷る。
   */
  sheet: RosterSheetInfo
}

type RosterSheetInfo = {
  /** 守成の会員種別（代表・副代表・世話人・一般）。ゲストは空 */
  memberType: string
  /** 会員分類＝バッジの色（ゴールド・赤・緑）。ゲストは空 */
  badge: string
  business: string
  /** 二次会（二部会）。'参加予定' / 'しない' / 空 */
  afterParty: string
  booth: boolean
  flyer: boolean
  negotiation: boolean
  /**
   * 名簿の「紹介者」。会員の入会時の紹介者（自会場は会員データ_最新、他会場は出欠記録）と、
   * ゲストを連れてきた会員の両方が入る。Attendee.referrer はゲストの同卓判定に使うので分けて持つ
   */
  referrer: string
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
  const records = await searchAll(env, TABLES.attendance, [...Object.values(ATTENDANCE_FIELDS), MANUAL_ANSWER_FIELD])

  const attendees: Attendee[] = []
  const seats: Record<string, { tableNo: string; seatNo: number | null }> = {}

  for (const r of records) {
    if (!fieldLinkIds(r.fields[ATTENDANCE_FIELDS.meeting]).includes(meetingId)) continue
    if (effectiveAnswer(r.fields) !== ANSWER.present) continue

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
      dutyTable: '',
      sheet: {
        memberType: fieldText(r.fields[ATTENDANCE_FIELDS.memberType]),
        badge: fieldText(r.fields[ATTENDANCE_FIELDS.badge]),
        business: fieldText(r.fields[ATTENDANCE_FIELDS.business]),
        afterParty: fieldText(r.fields[ATTENDANCE_FIELDS.afterParty]),
        booth: duties.includes('booth'),
        flyer: duties.includes('flyer'),
        negotiation: fieldText(r.fields[ATTENDANCE_FIELDS.negotiation]) === 'する',
        referrer: fieldText(r.fields[ATTENDANCE_FIELDS.referrer]),
      },
    })

    seats[r.record_id] = {
      tableNo: fieldText(r.fields[ATTENDANCE_FIELDS.tableNo]),
      seatNo: fieldNumber(r.fields[ATTENDANCE_FIELDS.seatNo]),
    }
  }

  // 本部の出欠では、会員が連れてきたゲストが「自会場」にも重ねて載ることがある
  // （令和8年10月例会の宮持 利和さん）。同名がゲストに居れば自会場の行を落とす。
  // 残すと名簿に2回載り、席も2つ取られる。ポータル（src/routes/api.ts dropGuestShadows）も同じ扱い
  const guestKeys = new Set(attendees.filter((a) => a.category === 'guest').map((a) => nameKey(a.name)))
  const deduped = attendees.filter(
    (a) => !(a.category === 'member' && !a.venue && guestKeys.has(nameKey(a.name))),
  )

  deduped.sort((a, b) => (a.kana || a.name).localeCompare(b.kana || b.name, 'ja'))
  return { attendees: deduped, seats }
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
    '会員種別',
    '会員分類',
    '紹介者',
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
      // 名簿の「守成役職」「バッチ」「事業案内」。自会場は会員データ_最新が正
      a.sheet.memberType ||= fieldText(f['会員種別'])
      a.sheet.badge ||= fieldText(f['会員分類'])
      a.sheet.business ||= fieldText(f['事業案内'])
      a.sheet.referrer ||= fieldText(f['紹介者'])
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
    // 卓の指定は TM と受付だけ。両方を持つ人は TM の卓を優先する（TM は卓の顔なので動かせない）
    const table = fieldText(r.fields[DUTY_FIELDS.tableNo]).trim()
    if (table && (duty === 'tm' || (duty === 'reception' && !a.dutyTable))) a.dutyTable = table
  }
}

// --- 当番の卓（TM・受付） ---

/** 卓を割り振る役割。当番表「役割」の値 */
const TABLE_DUTY_ROLES = ['TM', '受付'] as const

type DutySlot = {
  recordId: string
  role: string
  name: string
  tableNo: string
  order: number | null
  status: string
  note: string
}

async function loadDutySlots(env: Bindings, meetingId: string): Promise<(DutySlot & { title: string })[]> {
  const records = await searchAll(env, TABLES.duties, Object.values(DUTY_FIELDS))
  return records
    .filter((r) => fieldLinkIds(r.fields[DUTY_FIELDS.meeting]).includes(meetingId))
    .map((r) => ({
      recordId: r.record_id,
      title: fieldText(r.fields[DUTY_FIELDS.name]),
      role: fieldText(r.fields[DUTY_FIELDS.role]),
      name: fieldText(r.fields[DUTY_FIELDS.personName]),
      tableNo: fieldText(r.fields[DUTY_FIELDS.tableNo]).trim(),
      order: fieldNumber(r.fields[DUTY_FIELDS.order]),
      status: fieldText(r.fields[DUTY_FIELDS.status]),
      note: fieldText(r.fields[DUTY_FIELDS.note]),
    }))
    .filter((d) => (TABLE_DUTY_ROLES as readonly string[]).includes(d.role) && d.status !== '交代')
    .sort((a, b) => a.role.localeCompare(b.role) || (a.order ?? 999) - (b.order ?? 999))
}

async function handleGetDuties(env: Bindings, meetingId: string): Promise<Response> {
  const duties = (await loadDutySlots(env, meetingId)).map(({ title: _, ...d }) => d)
  return json({ duties })
}

/**
 * TM・受付の卓を当番表へ保存する。
 * TM の当番名は 9月例会までの書き方（「令和8年9月 TM 3卓」）に揃えて卓を付け直す。
 * 受付の当番名は卓を含めない（従来どおり）。
 */
async function handlePutDuties(env: Bindings, meetingId: string, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { updates?: { recordId?: string; tableNo?: string }[] } | null
  if (!body || !Array.isArray(body.updates)) {
    return json({ error: 'updates を含む JSON を送ってください' }, 400)
  }

  // この例会の TM・受付の行だけ書き換える。他の例会・他の役割の行は record_id を渡されても触らない
  const slots = new Map((await loadDutySlots(env, meetingId)).map((d) => [d.recordId, d]))
  const updates: { record_id: string; fields: Record<string, unknown> }[] = []
  for (const u of body.updates) {
    const slot = u.recordId ? slots.get(u.recordId) : undefined
    if (!slot) continue
    const tableNo = String(u.tableNo ?? '').trim()
    if (tableNo === slot.tableNo) continue
    const fields: Record<string, unknown> = { [DUTY_FIELDS.tableNo]: tableNo }
    if (slot.role === 'TM' && slot.title) {
      const base = slot.title.replace(/\s*\S+卓$/, '')
      fields[DUTY_FIELDS.name] = tableNo ? `${base} ${tableNo}卓` : base
    }
    updates.push({ record_id: slot.recordId, fields })
  }
  if (updates.length > 0) await updateRecords(env, TABLES.duties, updates)
  return json({ saved: true, updated: updates.length })
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

// --- 参加者を手で足す・外す ---
// ポータルの受付名簿（sewaninja-portal/src/routes/attendanceManage.ts）と同じ書き方。片方を直したらもう片方も直す。
// 行を足す・「出欠」を書き換える・行を消す、のどれも本部HPの回答と食い違えば翌朝の取り込みで戻るので、
// 取り込みが触れない「手動出欠」に出席／欠席を入れる。

const ANSWER = { present: '出席', absent: '欠席' } as const

/** 本部HPの回答より手動の出欠を優先する */
function effectiveAnswer(fields: Record<string, unknown>): string {
  return fieldText(fields[MANUAL_ANSWER_FIELD]) || fieldText(fields[ATTENDANCE_FIELDS.answer])
}

/** 外すときは卓も空ける。組み直す前に受付名簿へ古い卓が残らないように */
const CLEAR_SEAT = { [ATTENDANCE_FIELDS.tableNo]: '', [ATTENDANCE_FIELDS.seatNo]: null }

const isRecordId = (s: unknown): s is string => typeof s === 'string' && /^rec[A-Za-z0-9]{6,30}$/.test(s)

/** 書き込みは同じ画面からだけ受ける。認証が無いので、他のサイトから叩かせない最低限の歯止め */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  return !origin || origin === new URL(req.url).origin
}

type AddInput = {
  category?: unknown
  venue?: unknown
  name?: unknown
  kana?: unknown
  company?: unknown
  referrer?: unknown
}

function text(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return ''
  if (typeof v !== 'string' || v.trim().length > max) return null
  return v.trim()
}

/** 1人ぶんの参加者を、参加者を取得したときと同じ形で組み立てる（名簿・当番・世話人を付けて） */
async function attendeeById(env: Bindings, meetingId: string, recordId: string): Promise<Attendee | null> {
  const { attendees } = await loadAttendees(env, meetingId)
  await fillFromRoster(env, attendees)
  await Promise.all([applyDuties(env, meetingId, attendees), applySewanin(env, attendees)])
  return attendees.find((a) => a.id === recordId) ?? null
}

/**
 * 参加者を1人足す。区分はツールの区分（会員 / ゲスト）と所属会場から決める（所属会場があれば他会場）。
 * 同じ例会・区分・氏名の行が既にあれば（本部で欠席と答えた人・一度外した人）、その行を出席にするだけ。
 * 自会場は会員データ_最新に居れば会員リンクを張り、氏名の表記を名簿にそろえる。
 */
async function handleAddAttendee(env: Bindings, meetingId: string, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as AddInput | null
  if (!body) return json({ error: 'JSON を送ってください' }, 400)
  const name = text(body.name, 50)
  const kana = text(body.kana, 50)
  const company = text(body.company, 100)
  const venue = text(body.venue, 30)
  const referrer = text(body.referrer, 50)
  if (!name) return json({ error: '氏名を入れてください' }, 400)
  if ([kana, company, venue, referrer].includes(null)) return json({ error: '入力が長すぎます' }, 400)
  const kind = body.category === 'guest' ? KIND.guest : venue ? KIND.other : KIND.own

  let member: { recordId: string; name: string; lineUserId: string } | null = null
  if (kind === KIND.own) {
    const members = await searchAll(env, TABLES.members, ['氏名', 'line_user_id', 'ステータス'])
    const hits = members.filter(
      (m) => fieldText(m.fields['ステータス']) === '有効' && nameKey(fieldText(m.fields['氏名'])) === nameKey(name),
    )
    if (hits.length > 1) return json({ error: `会員名簿に「${name}」が複数います。Lark で直接登録してください` }, 409)
    if (hits[0]) {
      member = {
        recordId: hits[0].record_id,
        name: fieldText(hits[0].fields['氏名']),
        lineUserId: fieldText(hits[0].fields['line_user_id']),
      }
    }
  }
  const displayName = member?.name ?? name

  const records = await searchAll(env, TABLES.attendance, [
    ATTENDANCE_FIELDS.name,
    ATTENDANCE_FIELDS.meeting,
    ATTENDANCE_FIELDS.kind,
    ATTENDANCE_FIELDS.answer,
    MANUAL_ANSWER_FIELD,
  ])
  const prev = records.find(
    (r) =>
      fieldLinkIds(r.fields[ATTENDANCE_FIELDS.meeting]).includes(meetingId) &&
      (fieldText(r.fields[ATTENDANCE_FIELDS.kind]) || KIND.own) === kind &&
      nameKey(fieldText(r.fields[ATTENDANCE_FIELDS.name])) === nameKey(displayName),
  )

  let recordId: string
  if (prev) {
    if (effectiveAnswer(prev.fields) === ANSWER.present) {
      return json({ error: `「${displayName}」さんはすでに参加者に入っています（参加者を取得し直してください）` }, 409)
    }
    recordId = prev.record_id
    await updateRecord(env, TABLES.attendance, recordId, { [MANUAL_ANSWER_FIELD]: ANSWER.present })
  } else {
    const fields: Record<string, unknown> = {
      [ATTENDANCE_FIELDS.name]: displayName,
      [ATTENDANCE_FIELDS.meeting]: [meetingId],
      [ATTENDANCE_FIELDS.kind]: kind,
      [ATTENDANCE_FIELDS.answer]: ANSWER.present,
      [ATTENDANCE_FIELDS.channel]: CHANNEL_PROXY,
      [ATTENDANCE_FIELDS.answeredAt]: Date.now(),
      [MANUAL_ANSWER_FIELD]: ANSWER.present,
    }
    if (member) {
      fields[ATTENDANCE_FIELDS.member] = [member.recordId]
      if (/^U[0-9a-f]{32}$/i.test(member.lineUserId)) fields[ATTENDANCE_FIELDS.lineUserId] = member.lineUserId
    } else {
      // 他会場・ゲスト（と名簿に居ない自会場）は、名簿に出す値をこの行が持つ
      if (company) fields[ATTENDANCE_FIELDS.company] = company
      if (kana) fields[ATTENDANCE_FIELDS.kana] = kana
    }
    if (kind === KIND.other) fields[ATTENDANCE_FIELDS.venueName] = venue
    if (kind === KIND.guest && referrer) fields[ATTENDANCE_FIELDS.referrer] = referrer
    recordId = await createRecord(env, TABLES.attendance, fields)
  }
  console.info('attendees: 追加', { recordId, kind, name: displayName, created: !prev })

  const attendee = await attendeeById(env, meetingId, recordId)
  if (!attendee) return json({ error: '追加した参加者を読み直せませんでした。参加者を取得し直してください' }, 500)
  return json({ attendee, created: !prev })
}

/**
 * 参加者を外す。「手動出欠」を欠席にし、卓を空ける（本部HPの回答はそのまま。ポータルの出欠回答一覧から戻せる）。
 * 手で足しただけの行（回答経路=世話人代行で手動出欠=出席。本部HPに居ない人）は行ごと消す
 */
async function handleRemoveAttendee(env: Bindings, meetingId: string, recordId: string): Promise<Response> {
  const records = await searchAll(env, TABLES.attendance, [
    ATTENDANCE_FIELDS.name,
    ATTENDANCE_FIELDS.meeting,
    ATTENDANCE_FIELDS.channel,
    MANUAL_ANSWER_FIELD,
  ])
  const target = records.find((r) => r.record_id === recordId)
  // 別の例会の行は id を渡されても触らない
  if (!target || !fieldLinkIds(target.fields[ATTENDANCE_FIELDS.meeting]).includes(meetingId)) {
    return json({ error: '出欠記録に見つかりません。参加者を取得し直してください' }, 404)
  }
  const name = fieldText(target.fields[ATTENDANCE_FIELDS.name])
  const proxyOnly =
    fieldText(target.fields[ATTENDANCE_FIELDS.channel]) === CHANNEL_PROXY &&
    fieldText(target.fields[MANUAL_ANSWER_FIELD]) === ANSWER.present
  if (proxyOnly) {
    await deleteRecord(env, TABLES.attendance, recordId)
  } else {
    await updateRecord(env, TABLES.attendance, recordId, { [MANUAL_ANSWER_FIELD]: ANSWER.absent, ...CLEAR_SEAT })
  }
  console.info('attendees: 外す', { recordId, name, deleted: proxyOnly })
  return json({ removed: true, deleted: proxyOnly })
}

// --- 卓割の保存 ---

type Assignment = { attendeeId: string; tableId: string; seatIndex: number }

type SavedLayout = {
  tables?: unknown[]
  assignments?: Assignment[]
  /** 2回転目。TM とゲストは1回転目と同じ卓のまま。出欠記録には書かない */
  assignments2?: Assignment[]
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
    ...(Array.isArray(body.assignments2) && body.assignments2.length
      ? { assignments2: body.assignments2 }
      : {}),
    lockedAttendeeIds: Array.isArray(body.lockedAttendeeIds) ? body.lockedAttendeeIds : [],
    savedAt: new Date().toISOString(),
  }
  await updateRecord(env, TABLES.meetings, meetingId, {
    [MEETING_FIELDS.layout]: JSON.stringify(layout),
  })

  // 1人ずつの卓名・席番号は出欠記録へ。受付名簿はこちらを読む。
  // 席替え後の卓は書かない（受付で伝えるのは最初に座る卓）
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

      if (url.pathname === '/api/attendees') {
        const meetingId = url.searchParams.get('meeting')
        if (!isRecordId(meetingId)) return json({ error: 'meeting を指定してください' }, 400)
        if (!sameOrigin(req)) return json({ error: 'この画面以外からは変更できません' }, 403)
        if (req.method === 'POST') return await handleAddAttendee(env, meetingId, req)
        if (req.method === 'DELETE') {
          const id = url.searchParams.get('id')
          if (!isRecordId(id)) return json({ error: 'id を指定してください' }, 400)
          return await handleRemoveAttendee(env, meetingId, id)
        }
        return json({ error: 'POST か DELETE を使ってください' }, 405)
      }

      if (url.pathname === '/api/duties') {
        const meetingId = url.searchParams.get('meeting')
        if (!meetingId) return json({ error: 'meeting を指定してください' }, 400)
        if (req.method === 'GET') return await handleGetDuties(env, meetingId)
        if (req.method === 'PUT') return await handlePutDuties(env, meetingId, req)
        return json({ error: 'GET か PUT を使ってください' }, 405)
      }

      return json({ error: 'not found' }, 404)
    } catch (e) {
      if (e instanceof LarkError) return json({ error: e.message }, 502)
      return json({ error: e instanceof Error ? e.message : String(e) }, 500)
    }
  },
} satisfies ExportedHandler<Bindings>
