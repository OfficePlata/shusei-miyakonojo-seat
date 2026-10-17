"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Assignment,
  Attendee,
  AutoAssignRules,
  SeatingEvent,
  SeatingTable,
} from "./types";
import { DEFAULT_RULES } from "./types";
import {
  DEFAULT_LAYOUT,
  EVENT_SEEDS,
  columnsOf,
  dropPosition,
  fixOverlaps,
  freeSlot,
  generateTables,
  layoutGrid,
  TableLayoutOptions,
  uid,
} from "./events";
import { createSampleAttendees } from "./sample-data";
import { autoAssign } from "./auto-assign";
import {
  fetchMeetings,
  fetchSeating,
  saveSeating,
  toDateString,
  type SaveResult,
} from "./lark";

function newEventFromSeed(
  seed: (typeof EVENT_SEEDS)[number],
  withSample: boolean,
): SeatingEvent {
  const now = Date.now();
  return {
    id: seed.id,
    title: seed.title,
    date: seed.date,
    venue: seed.venue,
    attendees: withSample ? createSampleAttendees() : [],
    tables: generateTables(DEFAULT_LAYOUT),
    assignments: [],
    lockedAttendeeIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

interface StoreState {
  events: SeatingEvent[];
  currentEventId: string;
  rules: AutoAssignRules;
  selectedAttendeeId: string | null;
  selectedTableId: string | null;

  /** Lark と通信中かどうか。ボタンの二重押しを止めるのに使う */
  sync: "idle" | "loading" | "saving";
  /** 最後に Lark から読み込んだ／保存した時刻 */
  syncedAt: number | null;

  // init
  seedIfEmpty: () => void;

  // Lark 連携
  loadMeetingsFromLark: () => Promise<void>;
  loadAttendeesFromLark: (meetingId?: string) => Promise<number>;
  saveSeatingToLark: () => Promise<SaveResult>;

  // event
  setCurrentEvent: (id: string) => void;
  addEvent: (data: { title: string; date: string; venue: string }) => void;
  updateEvent: (id: string, patch: Partial<SeatingEvent>) => void;
  deleteEvent: (id: string) => void;
  duplicateEvent: (id: string) => void;

  // selection
  selectAttendee: (id: string | null) => void;
  selectTable: (id: string | null) => void;

  // attendees
  addAttendee: (a: Omit<Attendee, "id">) => void;
  updateAttendee: (id: string, patch: Partial<Attendee>) => void;
  removeAttendee: (id: string) => void;
  importAttendees: (list: Attendee[], mode: "replace" | "append") => void;
  loadSampleAttendees: () => void;
  clearAttendees: () => void;

  // tables
  addTable: (t: Omit<SeatingTable, "id">) => void;
  updateTable: (id: string, patch: Partial<SeatingTable>) => void;
  removeTable: (id: string) => void;
  regenerateTables: (opts: TableLayoutOptions) => void;
  moveTable: (id: string, x: number, y: number) => void;

  // assignments
  assignSeat: (attendeeId: string, tableId: string, seatIndex: number) => void;
  unassign: (attendeeId: string) => void;
  clearAssignments: () => void;
  toggleLock: (attendeeId: string) => void;

  // rules + auto
  setRules: (patch: Partial<AutoAssignRules>) => void;
  runAutoAssign: (opts?: { keepLocked?: boolean }) => void;
  /**
   * 当番表で決めた TM・受付の卓を参加者に写す（氏名 → 卓名。空なら指定なし）。
   * 「当番の卓」で保存した直後に、参加者を読み直さずに自動配置へ効かせるため
   */
  setDutyTables: (tableByName: Record<string, string>) => void;
  /**
   * いま画面に出している回転（1 か 2）。
   * 実体は event.assignments が「表示中」、event.assignments2 が「もう一方」で、
   * 切り替えるときに中身を入れ替える。こうすると配置・印刷・評価の側は
   * 回転を意識せず event.assignments だけ見ればよい。
   */
  activeRotation: 1 | 2;
  setRotation: (r: 1 | 2) => void;
  /** 2回転目を作る。TM とゲストは卓を動かさず、残りを組み替える */
  runSecondRotation: () => void;
  /** 2回転目を捨てる */
  clearSecondRotation: () => void;
  /** 卓を横 cols 列のグリッドに並べ直す */
  /** 卓を並べ直すと 1 増える。キャンバスはこれを見て全体表示に合わせ直す */
  layoutNonce: number;
  /** cols を省くと、いまの列数のまま整列する */
  arrangeTables: (cols?: number) => void;
}

/** 氏名の突合キー。当番表と出欠記録でスペースの有無が揺れる */
export const personKey = (s: string): string => s.replace(/[\s　]/g, "");

/**
 * 当番表で卓を決めた人（TM・受付）→ 卓 id。自動配置の1回転目で卓を固定する。
 * 卓名が今のレイアウトに無い指定（卓を減らした等）は無視する
 */
function dutyPins(e: SeatingEvent): Record<string, string> {
  const idByName = new Map(e.tables.map((t) => [t.name.trim(), t.id]));
  const pins: Record<string, string> = {};
  for (const a of e.attendees) {
    const id = a.dutyTable ? idByName.get(a.dutyTable.trim()) : undefined;
    if (id) pins[a.id] = id;
  }
  return pins;
}

function touch(e: SeatingEvent): SeatingEvent {
  return { ...e, updatedAt: Date.now() };
}

/**
 * 都城の例会では来賓席を使わない（2026-10-11 確認）。
 * 既定が来賓席つき・12卓だった頃の下書きが端末に残っているので、どの例会からも来賓席を外す。
 * - 来賓席に座っていた人は未着席に戻す（割当を消す）
 * - 来賓席が残っていて誰も座らせていない下書きは、今の既定（15卓×8名）で作り直す
 * 端末に保存された状態の読み戻し時と、Lark から例会一覧を読んだ時の両方で通す。
 */
function withoutHeadTables(e: SeatingEvent): SeatingEvent {
  const head = new Set(e.tables.filter((t) => t.kind === "head").map((t) => t.id));
  if (head.size === 0) {
    // 卓の間隔が 260px 固定だった頃の配置は、10人掛けにすると重なっている。読み込み時に直す
    const tables = fixOverlaps(e.tables);
    return tables === e.tables ? e : { ...e, tables };
  }
  if (e.assignments.length === 0 && !e.assignments2?.length) {
    return { ...e, tables: generateTables(DEFAULT_LAYOUT) };
  }
  const keep = (a: { tableId: string }) => !head.has(a.tableId);
  return {
    ...e,
    tables: fixOverlaps(e.tables.filter((t) => !head.has(t.id))),
    assignments: e.assignments.filter(keep),
    assignments2: e.assignments2?.filter(keep),
  };
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => {
      const mutateCurrent = (fn: (e: SeatingEvent) => SeatingEvent) => {
        set((state) => ({
          events: state.events.map((e) =>
            e.id === state.currentEventId ? touch(fn(e)) : e,
          ),
        }));
      };

      return {
        events: [],
        currentEventId: "",
        rules: DEFAULT_RULES,
        activeRotation: 1 as 1 | 2,
        layoutNonce: 0,
        selectedAttendeeId: null,
        selectedTableId: null,
        sync: "idle",
        syncedAt: null,

        seedIfEmpty: () => {
          const { events } = get();
          if (events.length > 0) return;
          const seeded = EVENT_SEEDS.map((s, i) =>
            newEventFromSeed(s, i === 0),
          );
          // 初回の例会はデモとして自動配置済みで表示する
          const first = seeded[0];
          const { assignments } = autoAssign(
            first.attendees,
            first.tables,
            DEFAULT_RULES,
          );
          first.assignments = assignments;
          set({ events: seeded, currentEventId: seeded[0].id });
        },

        /**
         * Lark の例会マスタで例会一覧を置き換える。
         *
         * ローカルで組んだ卓のレイアウトと割当は id が一致すれば残す
         * （タイトル・日付・会場だけ Lark に合わせる）。
         * **Lark に無い例会は捨てる。** 例会マスタが唯一の正で、
         * 手元にだけある例会を残すと、どれが本物か分からなくなる。
         */
        loadMeetingsFromLark: async () => {
          const { meetings, upcoming } = await fetchMeetings();
          const now = Date.now();

          set((state) => {
            const byId = new Map(state.events.map((e) => [e.id, e]));
            const merged: SeatingEvent[] = meetings.map((m) => {
              const prev = byId.get(m.recordId);
              if (prev) {
                return {
                  ...withoutHeadTables(prev),
                  title: m.name,
                  date: toDateString(m.startAt),
                  venue: m.venue,
                };
              }
              return {
                id: m.recordId,
                title: m.name,
                date: toDateString(m.startAt),
                venue: m.venue,
                attendees: [],
                tables: generateTables(DEFAULT_LAYOUT),
                assignments: [],
                lockedAttendeeIds: [],
                createdAt: now,
                updatedAt: now,
              };
            });

            // 例会が1つも返ってこなかったときは触らない（通信の一時不調で全部消さない）
            if (merged.length === 0) return {};

            const current =
              merged.find((e) => e.id === state.currentEventId)?.id ??
              upcoming?.recordId ??
              merged[0]?.id ??
              "";
            return { events: merged, currentEventId: current };
          });
        },

        /**
         * 選んでいる例会の参加者を Lark から読み込む。
         *
         * 参加者は **出席の回答がある人だけ**（自会場・他会場・ゲスト）。
         * Lark 側に保存済みの卓割があればそれも復元する。
         * 卓のレイアウトは、Lark に保存が無ければ手元のものを使う。
         */
        loadAttendeesFromLark: async (meetingId) => {
          const id = meetingId ?? get().currentEventId;
          if (!id) throw new Error("例会が選ばれていません");

          set({ sync: "loading", activeRotation: 1 });
          try {
            const data = await fetchSeating(id);
            let count = 0;
            set((state) => ({
              currentEventId: id,
              syncedAt: Date.now(),
              events: state.events.map((e) => {
                if (e.id !== id) return e;
                count = data.attendees.length;
                // Lark に配置が無い例会は手元の下書きを使う。ただし来賓席は使わない運用なので、
                // 既定が来賓席つきだった頃の下書きに残っている来賓席は外す（2026-10-11）
                // まだ誰も座らせていない下書きは、古い既定（12卓・来賓席つき）のまま残っていることがあるので
                // 今の既定で作り直す。割り当て済みの下書きは人の作業なので卓を残す
                const tables = data.layout?.tables?.length
                  ? fixOverlaps(data.layout.tables)
                  : e.assignments.length === 0
                    ? generateTables(DEFAULT_LAYOUT)
                    : e.tables.filter((t) => t.kind !== "head");
                // 割当は Lark 側にあるものだけを残す。
                // 参加者が取り消して居なくなった人の割当が残ると、
                // 存在しない人が卓に座り続ける
                const ids = new Set(data.attendees.map((a) => a.id));
                const tableIds = new Set(tables.map((t) => t.id));
                const keep = (a: { attendeeId: string; tableId: string }) =>
                  ids.has(a.attendeeId) && tableIds.has(a.tableId);
                const assignments = (data.layout?.assignments ?? []).filter(keep);
                const second = (data.layout?.assignments2 ?? []).filter(keep);
                return touch({
                  ...e,
                  title: data.meeting.name,
                  date: toDateString(data.meeting.startAt),
                  venue: data.meeting.venue,
                  attendees: data.attendees,
                  tables,
                  assignments,
                  assignments2: second.length ? second : undefined,
                  lockedAttendeeIds: (data.layout?.lockedAttendeeIds ?? []).filter(
                    (x) => ids.has(x),
                  ),
                });
              }),
            }));
            // 読み込んだ配置で全体表示に合わせ直す（重なりを直して位置が変わることがある）
            set((st) => ({ layoutNonce: st.layoutNonce + 1 }));
            return count;
          } finally {
            set({ sync: "idle" });
          }
        },

        /** いまの卓割を Lark へ保存する。受付名簿がこの結果を読む */
        saveSeatingToLark: async () => {
          const state = get();
          const e = state.events.find((x) => x.id === state.currentEventId);
          if (!e) throw new Error("例会が選ばれていません");

          set({ sync: "saving" });
          try {
            // 受付名簿に出す卓番号は必ず1回転目。2回転目を見ている最中でも入れ替えない
            const first =
              state.activeRotation === 2 ? (e.assignments2 ?? e.assignments) : e.assignments;
            const second =
              state.activeRotation === 2 ? e.assignments : e.assignments2;
            const result = await saveSeating(e.id, {
              tables: e.tables,
              assignments: first,
              assignments2: second,
              lockedAttendeeIds: e.lockedAttendeeIds,
            });
            set({ syncedAt: Date.now() });
            return result;
          } finally {
            set({ sync: "idle" });
          }
        },

        setCurrentEvent: (id) =>
          set({
            currentEventId: id,
            selectedAttendeeId: null,
            selectedTableId: null,
          }),

        addEvent: ({ title, date, venue }) => {
          const now = Date.now();
          const e: SeatingEvent = {
            id: uid("evt"),
            title,
            date,
            venue,
            attendees: [],
            tables: generateTables(DEFAULT_LAYOUT),
            assignments: [],
            lockedAttendeeIds: [],
            createdAt: now,
            updatedAt: now,
          };
          set((s) => ({ events: [...s.events, e], currentEventId: e.id }));
        },

        updateEvent: (id, patch) =>
          set((s) => ({
            events: s.events.map((e) =>
              e.id === id ? touch({ ...e, ...patch }) : e,
            ),
          })),

        deleteEvent: (id) =>
          set((s) => {
            const events = s.events.filter((e) => e.id !== id);
            const currentEventId =
              s.currentEventId === id
                ? events[0]?.id ?? ""
                : s.currentEventId;
            return { events, currentEventId };
          }),

        duplicateEvent: (id) =>
          set((s) => {
            const src = s.events.find((e) => e.id === id);
            if (!src) return {};
            const now = Date.now();
            const copy: SeatingEvent = {
              ...src,
              id: uid("evt"),
              title: `${src.title}（コピー）`,
              attendees: src.attendees.map((a) => ({ ...a })),
              tables: src.tables.map((t) => ({ ...t })),
              assignments: src.assignments.map((a) => ({ ...a })),
              lockedAttendeeIds: [...src.lockedAttendeeIds],
              createdAt: now,
              updatedAt: now,
            };
            return { events: [...s.events, copy], currentEventId: copy.id };
          }),

        selectAttendee: (id) =>
          set({ selectedAttendeeId: id, selectedTableId: null }),
        selectTable: (id) =>
          set({ selectedTableId: id, selectedAttendeeId: null }),

        addAttendee: (a) =>
          mutateCurrent((e) => ({
            ...e,
            attendees: [...e.attendees, { ...a, id: uid("att") }],
          })),

        updateAttendee: (id, patch) =>
          mutateCurrent((e) => ({
            ...e,
            attendees: e.attendees.map((a) =>
              a.id === id ? { ...a, ...patch } : a,
            ),
          })),

        removeAttendee: (id) =>
          mutateCurrent((e) => ({
            ...e,
            attendees: e.attendees.filter((a) => a.id !== id),
            assignments: e.assignments.filter((x) => x.attendeeId !== id),
            lockedAttendeeIds: e.lockedAttendeeIds.filter((x) => x !== id),
          })),

        importAttendees: (list, mode) =>
          mutateCurrent((e) => {
            if (mode === "replace") {
              return {
                ...e,
                attendees: list,
                assignments: [],
                lockedAttendeeIds: [],
              };
            }
            return { ...e, attendees: [...e.attendees, ...list] };
          }),

        loadSampleAttendees: () =>
          mutateCurrent((e) => ({
            ...e,
            attendees: createSampleAttendees(),
            assignments: [],
            lockedAttendeeIds: [],
          })),

        clearAttendees: () =>
          mutateCurrent((e) => ({
            ...e,
            attendees: [],
            assignments: [],
            lockedAttendeeIds: [],
          })),

        addTable: (t) =>
          mutateCurrent((e) => ({
            ...e,
            // 渡された位置ではなく、どの卓とも重ならない最初のマスに置く
            tables: [...e.tables, { ...t, ...freeSlot(e.tables, t), id: uid("tbl") }],
          })),

        updateTable: (id, patch) =>
          mutateCurrent((e) => {
            const tables = e.tables.map((t) => (t.id === id ? { ...t, ...patch } : t));
            // 人数や形を変えると卓が大きくなって隣と重なることがある。そのときだけ並べ直す
            const resized = patch.capacity !== undefined || patch.shape !== undefined;
            return { ...e, tables: resized ? fixOverlaps(tables) : tables };
          }),

        removeTable: (id) =>
          mutateCurrent((e) => ({
            ...e,
            tables: e.tables.filter((t) => t.id !== id),
            assignments: e.assignments.filter((a) => a.tableId !== id),
          })),

        regenerateTables: (opts) => {
          mutateCurrent((e) => ({
            ...e,
            tables: generateTables(opts),
            assignments: [],
            lockedAttendeeIds: [],
          }));
          set((st) => ({ layoutNonce: st.layoutNonce + 1 }));
        },

        moveTable: (id, x, y) =>
          mutateCurrent((e) => {
            const moving = e.tables.find((t) => t.id === id);
            if (!moving) return e;
            // 他の卓に重ねて落としたら、近くの空いているマスへ寄せる
            const pos = dropPosition(e.tables, moving, x, y);
            return { ...e, tables: e.tables.map((t) => (t.id === id ? { ...t, ...pos } : t)) };
          }),

        assignSeat: (attendeeId, tableId, seatIndex) =>
          mutateCurrent((e) => {
            const table = e.tables.find((t) => t.id === tableId);
            if (!table) return e;

            const mine = e.assignments.find(
              (a) => a.attendeeId === attendeeId,
            );
            const occupant = e.assignments.find(
              (a) => a.tableId === tableId && a.seatIndex === seatIndex,
            );

            let assignments = e.assignments.filter(
              (a) => a.attendeeId !== attendeeId,
            );

            if (occupant && occupant.attendeeId !== attendeeId) {
              // 席を入れ替え
              assignments = assignments.filter(
                (a) => a.attendeeId !== occupant.attendeeId,
              );
              if (mine) {
                assignments.push({
                  attendeeId: occupant.attendeeId,
                  tableId: mine.tableId,
                  seatIndex: mine.seatIndex,
                });
              }
              // mine が無い場合、occupant は未着席へ戻る
            }

            assignments.push({ attendeeId, tableId, seatIndex });
            return { ...e, assignments };
          }),

        unassign: (attendeeId) =>
          mutateCurrent((e) => ({
            ...e,
            assignments: e.assignments.filter(
              (a) => a.attendeeId !== attendeeId,
            ),
            lockedAttendeeIds: e.lockedAttendeeIds.filter(
              (x) => x !== attendeeId,
            ),
          })),

        clearAssignments: () =>
          mutateCurrent((e) => ({
            ...e,
            assignments: [],
            lockedAttendeeIds: [],
          })),

        toggleLock: (attendeeId) =>
          mutateCurrent((e) => {
            const has = e.lockedAttendeeIds.includes(attendeeId);
            return {
              ...e,
              lockedAttendeeIds: has
                ? e.lockedAttendeeIds.filter((x) => x !== attendeeId)
                : [...e.lockedAttendeeIds, attendeeId],
            };
          }),

        setDutyTables: (tableByName) =>
          mutateCurrent((e) => ({
            ...e,
            attendees: e.attendees.map((a) => {
              const key = personKey(a.name);
              if (!(key in tableByName)) return a;
              return { ...a, dutyTable: tableByName[key] || undefined };
            }),
          })),

        setRules: (patch) =>
          set((s) => ({ rules: { ...s.rules, ...patch } })),

        runAutoAssign: (opts) => {
          set({ activeRotation: 1 });
          mutateCurrent((e) => {
            const { rules } = get();
            const keepLocked = opts?.keepLocked ?? true;
            const locked = keepLocked
              ? e.assignments.filter((a) =>
                  e.lockedAttendeeIds.includes(a.attendeeId),
                )
              : [];
            const { assignments } = autoAssign(e.attendees, e.tables, rules, {
              lockedAssignments: locked,
              pinnedTables: dutyPins(e),
            });
            // 組み直したら、もう一方の回転は前提が変わるので捨てる
            return { ...e, assignments, assignments2: undefined };
          });
        },

        setRotation: (r) => {
          if (get().activeRotation === r) return;
          const e = get().events.find((x) => x.id === get().currentEventId);
          // 2回転目がまだ無いのに切り替えると空の卓が並ぶだけなので何もしない
          if (!e?.assignments2?.length) return;
          mutateCurrent((ev) => ({
            ...ev,
            assignments: ev.assignments2 ?? [],
            assignments2: ev.assignments,
          }));
          set({ activeRotation: r });
        },

        runSecondRotation: () => {
          // 2回転目を見ている状態から作り直すときは、まず1回転目に戻す
          if (get().activeRotation === 2) {
            mutateCurrent((ev) => ({
              ...ev,
              assignments: ev.assignments2 ?? [],
              assignments2: ev.assignments,
            }));
            set({ activeRotation: 1 });
          }
          mutateCurrent((e) => {
            const { rules } = get();
            // 卓を動かさないのは TM とゲスト。受付で伝えた卓にゲストは留まる。
            // 紹介者は固定しないので、2回転目はゲストの隣が入れ替わる
            const byId = new Map(e.attendees.map((a) => [a.id, a]));
            const pinnedTables: Record<string, string> = {};
            for (const a of e.assignments) {
              const att = byId.get(a.attendeeId);
              if (att?.duties?.includes("tm") || att?.category === "guest") {
                pinnedTables[a.attendeeId] = a.tableId;
              }
            }
            const { assignments } = autoAssign(
              e.attendees,
              e.tables,
              // ゲストと紹介者の同卓は1回転目だけ。2回転目は紹介者も他の人と同じに扱う
              { ...rules, keepGuestNearReferrer: false },
              { pinnedTables, previousAssignments: e.assignments },
            );
            // 作った2回転目をそのまま表示に回し、1回転目を控えへ
            return { ...e, assignments: assignments, assignments2: e.assignments };
          });
          set({ activeRotation: 2 });
        },

        clearSecondRotation: () => {
          // 1回転目を表示に戻してから捨てる
          if (get().activeRotation === 2) {
            mutateCurrent((ev) => ({
              ...ev,
              assignments: ev.assignments2 ?? [],
              assignments2: undefined,
            }));
            set({ activeRotation: 1 });
            return;
          }
          mutateCurrent((e) => ({ ...e, assignments2: undefined }));
        },

        arrangeTables: (cols) => {
          mutateCurrent((e) => ({ ...e, tables: layoutGrid(e.tables, cols ?? columnsOf(e.tables)) }));
          set((st) => ({ layoutNonce: st.layoutNonce + 1 }));
        },
      };
    },
    {
      // v6: 例会の id を Lark 例会マスタの record_id に変えた。
      // 旧バージョンのサンプルデータ（evt-2026-07 など）は読み込まない。
      name: "shusei-miyakonojo-seating:v6",
      // 端末に残った下書きから来賓席を外してから使う（withoutHeadTables）
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<StoreState>;
        return {
          ...current,
          ...p,
          events: (p.events ?? current.events).map(withoutHeadTables),
        };
      },
      partialize: (s) => ({
        events: s.events,
        currentEventId: s.currentEventId,
        rules: s.rules,
        activeRotation: s.activeRotation,
      }),
    },
  ),
);

// 現在の例会を取得するセレクタ
export function useCurrentEvent(): SeatingEvent | undefined {
  return useStore((s) => s.events.find((e) => e.id === s.currentEventId));
}
