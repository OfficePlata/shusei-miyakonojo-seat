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
  generateTables,
  TableLayoutOptions,
  uid,
} from "./events";
import { createSampleAttendees } from "./sample-data";
import { autoAssign } from "./auto-assign";

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

  // init
  seedIfEmpty: () => void;

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
        selectedAttendeeId: null,
        selectedTableId: null,

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

        runAutoAssign: (opts) =>
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
            return { ...e, assignments };
          }),
      };
    },
    {
      name: "shusei-miyakonojo-seating:v3",
      partialize: (s) => ({
        events: s.events,
        currentEventId: s.currentEventId,
        rules: s.rules,
      }),
    },
  ),
);

// 現在の例会を取得するセレクタ
export function useCurrentEvent(): SeatingEvent | undefined {
  return useStore((s) => s.events.find((e) => e.id === s.currentEventId));
}
