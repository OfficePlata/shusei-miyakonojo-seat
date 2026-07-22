import type {
  Assignment,
  Attendee,
  AutoAssignRules,
  Duty,
  SeatingTable,
} from "./types";

interface AutoAssignResult {
  assignments: Assignment[];
  unassigned: Attendee[];
}

/**
 * 出席者をテーブルに自動割り当てする（交流最大化の貪欲法）。
 * ルールに応じてスコアを計算し、最良のテーブルへ順に配置する。
 */
export function autoAssign(
  attendees: Attendee[],
  tables: SeatingTable[],
  rules: AutoAssignRules,
  opts?: { lockedAssignments?: Assignment[]; seed?: number },
): AutoAssignResult {
  const rng = mulberry32(opts?.seed ?? Math.floor(Math.random() * 1e9));

  const byId = new Map(attendees.map((a) => [a.id, a]));
  const occupants = new Map<string, Attendee[]>();
  for (const t of tables) occupants.set(t.id, []);

  const assignments: Assignment[] = [];
  const lockedIds = new Set<string>();

  // ロックされた席（手動で固定した席）は維持する
  if (opts?.lockedAssignments?.length) {
    for (const la of opts.lockedAssignments) {
      const att = byId.get(la.attendeeId);
      const table = tables.find((t) => t.id === la.tableId);
      if (!att || !table) continue;
      const occ = occupants.get(table.id)!;
      if (occ.length >= table.capacity) continue;
      occ.push(att);
      assignments.push({ ...la });
      lockedIds.add(att.id);
    }
  }

  const headTables = tables.filter((t) => t.kind === "head");
  const remaining = attendees.filter((a) => !lockedIds.has(a.id));

  // 配置順：来賓 → ゲスト → 会員 → 事務局（各グループ内はシャッフルで多様性）
  const priority: Record<string, number> = {
    vip: 0,
    guest: 1,
    member: 2,
    staff: 3,
  };
  const order = [...remaining].sort((a, b) => {
    const pa = priority[a.category] ?? 2;
    const pb = priority[b.category] ?? 2;
    if (pa !== pb) return pa - pb;
    return rng() - 0.5;
  });

  const place = (att: Attendee, candidateTables: SeatingTable[]) => {
    let best: SeatingTable | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const t of candidateTables) {
      const occ = occupants.get(t.id)!;
      if (occ.length >= t.capacity) continue;
      const s = scoreTable(att, t, occ, rules) + rng() * 3; // わずかな揺らぎ
      if (s > bestScore) {
        bestScore = s;
        best = t;
      }
    }
    if (!best) return false;
    occupants.get(best.id)!.push(att);
    return true;
  };

  const unassigned: Attendee[] = [];

  for (const att of order) {
    let placed = false;

    if (att.category === "vip" && rules.seatVipAtHead && headTables.length) {
      placed = place(att, headTables);
    }

    if (!placed) {
      // 来賓卓は来賓優先。通常は normal 卓へ。空きが無ければ来賓卓も候補に。
      const normal = tables.filter((t) => t.kind === "normal");
      placed = place(att, normal.length ? normal : tables);
      if (!placed) placed = place(att, tables);
    }

    if (!placed) unassigned.push(att);
  }

  // テーブルごとに席番号を割り当て
  // orderByStage: ステージに近い席（番号が小さい席）から TM → ゲスト＋紹介者 → その他
  for (const t of tables) {
    const occ = occupants.get(t.id)!;
    const lockedForTable = assignments.filter((a) => a.tableId === t.id);
    const lockedSeatSet = new Set(lockedForTable.map((a) => a.seatIndex));
    const lockedAttSet = new Set(lockedForTable.map((a) => a.attendeeId));

    const toSeat = occ.filter((a) => !lockedAttSet.has(a.id));
    const arranged = rules.orderByStage
      ? orderSeatsByStage(toSeat)
      : interleaveByCategory(toSeat);

    let seat = 0;
    for (const att of arranged) {
      while (lockedSeatSet.has(seat)) seat++;
      assignments.push({ attendeeId: att.id, tableId: t.id, seatIndex: seat });
      seat++;
    }
  }

  return { assignments, unassigned };
}

/**
 * 席順をステージ近い順に整える。
 * ①TM → ②ゲスト（直後に同卓の紹介者） → ③残り（来賓・会員・事務局）
 */
function orderSeatsByStage(list: Attendee[]): Attendee[] {
  const used = new Set<string>();
  const result: Attendee[] = [];
  const take = (a: Attendee) => {
    if (used.has(a.id)) return;
    used.add(a.id);
    result.push(a);
  };

  // ① TM（司会も前方寄りに）
  for (const a of list) if (a.duties?.includes("tm")) take(a);
  for (const a of list) if (a.duties?.includes("mc")) take(a);

  // ② ゲスト（続けて同卓にいる紹介者を隣に）
  for (const g of list) {
    if (used.has(g.id) || g.category !== "guest") continue;
    take(g);
    if (g.referrer) {
      const ref = list.find(
        (x) => !used.has(x.id) && normalize(x.name) === normalize(g.referrer!),
      );
      if (ref) take(ref);
    }
  }

  // ③ 残り
  for (const a of list) take(a);
  return result;
}

/** 会員とゲストがなるべく隣り合うよう交互に並べ替える */
function interleaveByCategory(list: Attendee[]): Attendee[] {
  const guests = list.filter((a) => a.category === "guest");
  const others = list.filter((a) => a.category !== "guest");
  const result: Attendee[] = [];
  const max = Math.max(guests.length, others.length);
  for (let i = 0; i < max; i++) {
    if (others[i]) result.push(others[i]);
    if (guests[i]) result.push(guests[i]);
  }
  return result;
}

function scoreTable(
  att: Attendee,
  table: SeatingTable,
  occ: Attendee[],
  rules: AutoAssignRules,
): number {
  let score = 0;

  if (rules.balanceTables) {
    score += (table.capacity - occ.length) * 2.5;
  }

  if (table.kind === "head") {
    score += att.category === "vip" ? 60 : -40;
  } else if (att.category === "vip" && rules.seatVipAtHead) {
    score -= 20;
  }

  const guestCount = occ.filter((o) => o.category === "guest").length;

  for (const o of occ) {
    if (rules.respectConstraints) {
      if (att.keepApart?.includes(o.id) || o.keepApart?.includes(att.id)) {
        score -= 1000;
      }
      if (att.keepWith?.includes(o.id) || o.keepWith?.includes(att.id)) {
        score += 200;
      }
    }
    if (
      rules.separateCompany &&
      att.company &&
      o.company &&
      normalize(att.company) === normalize(o.company)
    ) {
      score -= 45;
    }
    if (
      rules.spreadIndustry &&
      att.industry &&
      o.industry &&
      att.industry === o.industry
    ) {
      score -= 14;
    }
    if (
      rules.spreadVenue &&
      att.venue &&
      o.venue &&
      normalize(att.venue) === normalize(o.venue)
    ) {
      // 同じ他会場を固めない（各卓へ散らす）
      score -= 18;
    }
    if (rules.spreadDuties) {
      // ブース出展者・受付など同じ役割が同卓に固まらないようにする
      score -= dutyOverlap(att.duties, o.duties) * 30;
    }
    if (rules.keepGuestNearReferrer && att.category === "guest" && att.referrer) {
      if (normalize(o.name) === normalize(att.referrer)) score += 30;
    }
  }

  if (rules.mixGuests) {
    if (att.category === "guest") {
      // ゲスト同士の固まりを避け、会員のいる卓を優先
      score -= guestCount * 6;
      const memberCount = occ.length - guestCount;
      score += Math.min(memberCount, 4) * 3;
    }
  }

  return score;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/** 2人が共通して持つ役割（ブース・受付など）の数 */
function dutyOverlap(a?: Duty[], b?: Duty[]): number {
  if (!a?.length || !b?.length) return 0;
  const set = new Set(a);
  let n = 0;
  for (const d of b) if (set.has(d)) n++;
  return n;
}

// 決定的な擬似乱数（seed 指定で再現可能）
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- 配置品質の評価（統計表示用） ----

export interface SeatingStats {
  seated: number;
  total: number;
  companyClashes: number; // 同一会社が同卓のペア数
  industryClashes: number; // 同業種が同卓のペア数
  guestOnlyTables: number; // ゲストのみの卓
  tablesUsed: number;
  emptySeats: number;
  score: number; // 総合スコア（高いほど良い）
}

export function evaluateSeating(
  attendees: Attendee[],
  tables: SeatingTable[],
  assignments: Assignment[],
): SeatingStats {
  const byId = new Map(attendees.map((a) => [a.id, a]));
  const perTable = new Map<string, Attendee[]>();
  for (const t of tables) perTable.set(t.id, []);
  for (const a of assignments) {
    const att = byId.get(a.attendeeId);
    const arr = perTable.get(a.tableId);
    if (att && arr) arr.push(att);
  }

  let companyClashes = 0;
  let industryClashes = 0;
  let guestOnlyTables = 0;
  let tablesUsed = 0;
  let emptySeats = 0;

  for (const t of tables) {
    const occ = perTable.get(t.id)!;
    if (occ.length > 0) tablesUsed++;
    emptySeats += Math.max(0, t.capacity - occ.length);

    if (occ.length > 1 && occ.every((o) => o.category === "guest")) {
      guestOnlyTables++;
    }
    for (let i = 0; i < occ.length; i++) {
      for (let j = i + 1; j < occ.length; j++) {
        if (
          occ[i].company &&
          normalize(occ[i].company) === normalize(occ[j].company)
        )
          companyClashes++;
        if (occ[i].industry && occ[i].industry === occ[j].industry)
          industryClashes++;
      }
    }
  }

  const seated = assignments.length;
  const score = Math.max(
    0,
    100 -
      companyClashes * 8 -
      industryClashes * 3 -
      guestOnlyTables * 10 -
      (attendees.length - seated) * 5,
  );

  return {
    seated,
    total: attendees.length,
    companyClashes,
    industryClashes,
    guestOnlyTables,
    tablesUsed,
    emptySeats,
    score,
  };
}
