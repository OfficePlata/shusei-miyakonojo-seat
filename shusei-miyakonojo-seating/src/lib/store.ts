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
  CELL_H,
  CELL_W,
  compareTableName,
  DEFAULT_LAYOUT,
  EVENT_SEEDS,
  generateTables,
  MARGIN_X,
  MARGIN_Y,
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
  arrangeTables: (cols: number) => void;
}

function touch(e: SeatingEvent): SeatingEvent {
  return { ...e, updatedAt: Date.now() };
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
                  ...prev,
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
                const tables = data.layout?.tables?.length
                  ? data.layout.tables
                  : e.tables;
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
            tables: [...e.tables, { ...t, id: uid("tbl") }],
          })),

        updateTable: (id, patch) =>
          mutateCurrent((e) => ({
            ...e,
            tables: e.tables.map((t) => (t.id === id ? { ...t, ...patch } : t)),
          })),

        removeTable: (id) =>
          mutateCurrent((e) => ({
            ...e,
            tables: e.tables.filter((t) => t.id !== id),
            assignments: e.assignments.filter((a) => a.tableId !== id),
          })),

        regenerateTables: (opts) =>
          mutateCurrent((e) => ({
            ...e,
            tables: generateTables(opts),
            assignments: [],
            lockedAttendeeIds: [],
          })),

        moveTable: (id, x, y) =>
          mutateCurrent((e) => ({
            ...e,
            tables: e.tables.map((t) => (t.id === id ? { ...t, x, y } : t)),
          })),

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
            // TM とゲストは卓を動かさない。席順だけ組み直す。
            // ゲストの紹介者も一緒に残す（2回転目もゲストの隣にいてもらう）
            const byId = new Map(e.attendees.map((a) => [a.id, a]));
            const key = (v: string) => v.trim().toLowerCase();
            const byName = new Map(e.attendees.map((a) => [key(a.name), a]));
            const stay = new Set<string>();
            for (const att of e.attendees) {
              if (att.duties?.includes("tm")) stay.add(att.id);
              if (att.category !== "guest") continue;
              stay.add(att.id);
              const ref = att.referrer ? byName.get(key(att.referrer)) : undefined;
              if (ref) stay.add(ref.id);
            }
            const pinnedTables: Record<string, string> = {};
            for (const a of e.assignments) {
              if (stay.has(a.attendeeId) && byId.has(a.attendeeId)) {
                pinnedTables[a.attendeeId] = a.tableId;
              }
            }
            const { assignments } = autoAssign(e.attendees, e.tables, rules, {
              pinnedTables,
              previousAssignments: e.assignments,
            });
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

        arrangeTables: (cols) =>
          mutateCurrent((e) => {
            const c = Math.max(1, Math.floor(cols));
            const head = e.tables.filter((t) => t.kind === "head");
            const normal = e.tables
              .filter((t) => t.kind !== "head")
              .sort((a, b) => compareTableName(a.name, b.name));
            const startY = head.length ? MARGIN_Y + CELL_H : MARGIN_Y;
            const placed = [
              ...head.map((t) => ({
                ...t,
                x: MARGIN_X + ((c - 1) * CELL_W) / 2,
                y: MARGIN_Y,
              })),
              ...normal.map((t, i) => ({
                ...t,
                x: MARGIN_X + (i % c) * CELL_W,
                y: startY + Math.floor(i / c) * CELL_H,
              })),
            ];
            return { ...e, tables: placed };
          }),
      };
    },
    {
      // v6: 例会の id を Lark 例会マスタの record_id に変えた。
      // 旧バージョンのサンプルデータ（evt-2026-07 など）は読み込まない。
      name: "shusei-miyakonojo-seating:v6",
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
