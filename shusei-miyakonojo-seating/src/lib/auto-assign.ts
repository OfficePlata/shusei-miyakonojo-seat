import type {
  Assignment,
  Attendee,
  AutoAssignRules,
  Duty,
  SeatingTable,
} from "./types";
import { DEFAULT_RULES, isHomeVenue, isNightBiz, isSewanin } from "./types";

/* ------------------------------------------------------------
 * 同卓に固めたくない属性グループ
 *
 * TM は「卓の顔」なので各卓 1 人が原則（重複ペナルティを桁違いに重くする）。
 * 受付・ブース・スナックバー・世話人は、同卓に偏らなければよい。
 * ---------------------------------------------------------- */

type SpreadGroup = "tm" | "reception" | "booth" | "night" | "sewanin";

const GROUP_PENALTY: Record<SpreadGroup, number> = {
  tm: 400,
  reception: 70,
  booth: 60,
  night: 55,
  sewanin: 35,
};

function spreadGroups(a: Attendee, rules: AutoAssignRules): SpreadGroup[] {
  const g: SpreadGroup[] = [];
  if (rules.oneTmPerTable && a.duties?.includes("tm")) g.push("tm");
  if (rules.spreadReception && a.duties?.includes("reception")) g.push("reception");
  if (rules.spreadBooth && a.duties?.includes("booth")) g.push("booth");
  if (rules.spreadNightBiz && isNightBiz(a)) g.push("night");
  if (rules.spreadSewanin && isSewanin(a)) g.push("sewanin");
  return g;
}

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
  opts?: {
    /** 席番号まで固定する（手で置いた席） */
    lockedAssignments?: Assignment[];
    /** 卓だけ固定する人。席順は組み直す。2回転目で TM とゲストを動かさないために使う */
    pinnedTables?: Record<string, string>;
    /** 前の回転の割当。ここで同卓だった相手とはなるべく離す */
    previousAssignments?: Assignment[];
    seed?: number;
  },
): AutoAssignResult {
  const rng = mulberry32(opts?.seed ?? Math.floor(Math.random() * 1e9));

  const byId = new Map(attendees.map((a) => [a.id, a]));
  const occupants = new Map<string, Attendee[]>();
  for (const t of tables) occupants.set(t.id, []);

  const assignments: Assignment[] = [];
  const lockedIds = new Set<string>();
  /** attendeeId -> いま座っている卓。ゲストを紹介者に合流させるのに使う */
  const placedAt = new Map<string, string>();

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
      placedAt.set(att.id, table.id);
    }
  }

  const headTables = tables.filter((t) => t.kind === "head");
  const remaining = attendees.filter((a) => !lockedIds.has(a.id));

  // ステージに近い卓ほど小さい順位。キャンバス上の並び（上ほど前）をそのまま使う
  const frontOrder = [...tables].sort((a, b) => a.y - b.y || a.x - b.x);
  const frontRank = new Map(frontOrder.map((t, i) => [t.id, i]));
  const lastRank = Math.max(1, frontOrder.length - 1);

  // 前の回転で同卓だった組み合わせ。2回転目で同じ顔ぶれにしないために使う
  const metBefore = new Set<string>();
  if (opts?.previousAssignments?.length) {
    const byTable = new Map<string, string[]>();
    for (const a of opts.previousAssignments) {
      const arr = byTable.get(a.tableId);
      if (arr) arr.push(a.attendeeId);
      else byTable.set(a.tableId, [a.attendeeId]);
    }
    for (const ids of byTable.values()) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) metBefore.add(pairKey(ids[i], ids[j]));
      }
    }
  }

  // ゲストとその紹介者。この2人は必ず同じ卓にする
  const byName = new Map(attendees.map((a) => [normalize(a.name), a]));
  /** ゲスト id -> 紹介者（出席していれば） */
  const referrerOf = new Map<string, Attendee>();
  for (const g of attendees) {
    if (g.category !== "guest" || !g.referrer) continue;
    const ref = byName.get(normalize(g.referrer));
    if (ref && ref.id !== g.id) referrerOf.set(g.id, ref);
  }
  /** 紹介者 id -> 連れてきたゲストたち */
  const guestsOf = new Map<string, Attendee[]>();
  for (const [guestId, ref] of referrerOf) {
    const g = attendees.find((a) => a.id === guestId);
    if (!g) continue;
    const arr = guestsOf.get(ref.id);
    if (arr) arr.push(g);
    else guestsOf.set(ref.id, [g]);
  }
  const isReferrer = (a: Attendee) => guestsOf.has(a.id);

  // 配置順：来賓 → TM → ゲストの紹介者 → ゲスト → 分散対象 → 他会場 → 残り
  // 制約のきつい人から先に置くほど、後段の自由度が残って偏りが減る
  const rank = (a: Attendee): number => {
    if (a.category === "vip") return 0;
    if (a.duties?.includes("tm")) return 1;
    if (isReferrer(a)) return 2;
    if (a.category === "guest") return 3;
    if (spreadGroups(a, rules).length) return 4;
    if (!isHomeVenue(a)) return 5;
    return 6;
  };
  const order = [...remaining].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return rng() - 0.5;
  });

  const place = (att: Attendee, candidateTables: SeatingTable[]) => {
    let best: SeatingTable | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const t of candidateTables) {
      const occ = occupants.get(t.id)!;
      if (occ.length >= t.capacity) continue;
      const ctx = {
        frontRank: frontRank.get(t.id) ?? 0,
        lastRank,
        metBefore,
      };
      const s = scoreTable(att, t, occ, rules, ctx) + rng() * 3; // わずかな揺らぎ
      if (s > bestScore) {
        bestScore = s;
        best = t;
      }
    }
    if (!best) return false;
    occupants.get(best.id)!.push(att);
    placedAt.set(att.id, best.id);
    return true;
  };

  /**
   * ゲストとその紹介者を、必ず同じ卓に入れる。
   * どちらかが先に座っていれば（紹介者が TM のときなど）その卓へ合流させ、
   * まだ誰も座っていなければ全員が入る卓を選ぶ。
   */
  const placeTogether = (group: Attendee[], candidateTables: SeatingTable[]) => {
    const need = group.filter((g) => !placedAt.has(g.id));
    if (need.length === 0) return true;

    const anchor = group.find((g) => placedAt.has(g.id));
    if (anchor) {
      const t = tables.find((x) => x.id === placedAt.get(anchor.id));
      const occ = t ? occupants.get(t.id) : undefined;
      if (t && occ && occ.length + need.length <= t.capacity) {
        for (const g of need) {
          occ.push(g);
          placedAt.set(g.id, t.id);
        }
        return true;
      }
      // 席が足りない卓なら、入れられるぶんだけ入れて残りは通常配置に回す
      if (t && occ) {
        while (need.length && occ.length < t.capacity) {
          const g = need.shift()!;
          occ.push(g);
          placedAt.set(g.id, t.id);
        }
        if (need.length === 0) return true;
      }
    }

    let best: SeatingTable | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const t of candidateTables) {
      const occ = occupants.get(t.id)!;
      if (occ.length + need.length > t.capacity) continue;
      const ctx = { frontRank: frontRank.get(t.id) ?? 0, lastRank, metBefore };
      // グループ全員のスコアの平均で卓を選ぶ
      const s =
        need.reduce((acc, g) => acc + scoreTable(g, t, occ, rules, ctx), 0) /
          need.length +
        rng() * 3;
      if (s > bestScore) {
        bestScore = s;
        best = t;
      }
    }
    if (!best) return false;
    for (const g of need) {
      occupants.get(best.id)!.push(g);
      placedAt.set(g.id, best.id);
    }
    return true;
  };

  const unassigned: Attendee[] = [];

  const normalTables = tables.filter((t) => t.kind === "normal");

  for (const att of order) {
    // グループ配置で既に座った人は飛ばす
    if (placedAt.has(att.id)) continue;

    let placed = false;

    // 卓を指定されている人は、その卓が埋まっていない限り必ずそこへ
    const pinned = opts?.pinnedTables?.[att.id];
    if (pinned) {
      const t = tables.find((x) => x.id === pinned);
      const occ = t ? occupants.get(t.id) : undefined;
      if (t && occ && occ.length < t.capacity) {
        occ.push(att);
        placedAt.set(att.id, t.id);
        placed = true;
      }
    }

    // ゲストと紹介者は必ず同卓。どちらに先に当たっても2人まとめて置く
    if (!placed) {
      const ref = referrerOf.get(att.id);
      const host = ref ?? att;
      const guests = guestsOf.get(host.id);
      if (guests?.length) {
        const group = [host, ...guests];
        if (placeTogether(group, normalTables.length ? normalTables : tables)) {
          continue;
        }
      }
    }

    if (!placed && att.category === "vip" && rules.seatVipAtHead && headTables.length) {
      placed = place(att, headTables);
    }

    // TM はまだ TM のいない卓へ。卓数より TM が多い場合だけ通常フローへ落ちる
    if (!placed && rules.oneTmPerTable && att.duties?.includes("tm")) {
      const free = tables.filter(
        (t) =>
          t.kind === "normal" &&
          !occupants.get(t.id)!.some((o) => o.duties?.includes("tm")),
      );
      if (free.length) placed = place(att, free);
    }

    if (!placed) {
      // 来賓卓は来賓優先。通常は normal 卓へ。空きが無ければ来賓卓も候補に。
      placed = place(att, normalTables.length ? normalTables : tables);
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
 * 席順をステージ近い順（席番号の小さい順）に整える。
 *
 *   ① TM（その卓の一番うえ）
 *   ② ゲストの紹介者
 *   ③ ゲスト
 *   ④ 自会場メンバー
 *   ⑤ 他会場からの参加者
 *
 * ②と③を続けて置くので、紹介者とゲストは必ず隣り合う。
 */
function orderSeatsByStage(list: Attendee[]): Attendee[] {
  const used = new Set<string>();
  const result: Attendee[] = [];
  const take = (a: Attendee) => {
    if (used.has(a.id)) return;
    used.add(a.id);
    result.push(a);
  };

  // ① TM（TM が不在の卓は司会を前に）
  for (const a of list) if (a.duties?.includes("tm")) take(a);
  for (const a of list) if (a.duties?.includes("mc")) take(a);

  // ②③ 同卓のゲストごとに「紹介者 → ゲスト」の順で並べる
  const guests = list.filter((a) => a.category === "guest");
  for (const g of guests) {
    if (g.referrer) {
      const ref = list.find(
        (x) => !used.has(x.id) && normalize(x.name) === normalize(g.referrer!),
      );
      if (ref) take(ref);
    }
    take(g);
  }

  // ④ 自会場（来賓・事務局もここに含める）
  for (const a of list) if (isHomeVenue(a)) take(a);

  // ⑤ 他会場
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

interface ScoreContext {
  /** ステージからの近さ。0 が最前 */
  frontRank: number;
  lastRank: number;
  /** 前の回転で同卓だった組み合わせ */
  metBefore: Set<string>;
}

function scoreTable(
  att: Attendee,
  table: SeatingTable,
  occ: Attendee[],
  rules: AutoAssignRules,
  ctx: ScoreContext,
): number {
  let score = 0;

  // ゲストは前の卓へ。ステージが見えて紹介もしやすい
  if (rules.seatGuestsFront && att.category === "guest") {
    score += (1 - ctx.frontRank / ctx.lastRank) * 45;
  }

  if (rules.balanceTables) {
    score += (table.capacity - occ.length) * 2.5;
  }

  if (table.kind === "head") {
    score += att.category === "vip" ? 60 : -40;
  } else if (att.category === "vip" && rules.seatVipAtHead) {
    score -= 20;
  }

  const guestCount = occ.filter((o) => o.category === "guest").length;

  // 受付・ブース・スナックバー・世話人・TM が同卓に固まらないようにする。
  // 同じ属性が既に n 人いる卓ほど重く減点し、空いている卓へ押し出す
  for (const g of spreadGroups(att, rules)) {
    const n = occ.filter((o) => spreadGroups(o, rules).includes(g)).length;
    if (n) score -= GROUP_PENALTY[g] * n;
  }

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
    // 2回転目。前の回転で同じ卓だった人とは、なるべく違う卓にする
    if (ctx.metBefore.has(pairKey(att.id, o.id))) score -= 28;
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

/** 2人組のキー。順序に依らず同じ文字列になる */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
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
  /** 受付・世話人・スナックバー・ブースが同卓に重なったペア数 */
  groupClashes: Record<SpreadGroup, number>;
  /** TM が座っていない卓（使用中の卓のうち） */
  tablesWithoutTm: number;
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
  let tablesWithoutTm = 0;
  const groupClashes: Record<SpreadGroup, number> = {
    tm: 0,
    reception: 0,
    booth: 0,
    night: 0,
    sewanin: 0,
  };
  // 重なりの計測はルールの ON/OFF に依らず全項目を数える
  const ALL_ON: AutoAssignRules = {
    ...DEFAULT_RULES,
    seatGuestsFront: true,
    oneTmPerTable: true,
    spreadReception: true,
    spreadSewanin: true,
    spreadNightBiz: true,
    spreadBooth: true,
  };

  for (const t of tables) {
    const occ = perTable.get(t.id)!;
    if (occ.length > 0) tablesUsed++;
    emptySeats += Math.max(0, t.capacity - occ.length);

    if (occ.length > 1 && occ.every((o) => o.category === "guest")) {
      guestOnlyTables++;
    }
    if (occ.length > 0 && !occ.some((o) => o.duties?.includes("tm"))) {
      tablesWithoutTm++;
    }
    for (const g of Object.keys(groupClashes) as SpreadGroup[]) {
      const n = occ.filter((o) => spreadGroups(o, ALL_ON).includes(g)).length;
      if (n > 1) groupClashes[g] += (n * (n - 1)) / 2;
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
    groupClashes,
    tablesWithoutTm,
    score,
  };
}
