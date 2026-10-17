// Путь: src/data/teachersStore.ts
// Общий список расписаний преподавателей: им пользуются и «Расписание», и «Долги».
// Хранится в localStorage; все экраны подписаны и видят изменения сразу.
import { useSyncExternalStore } from 'react'
import type { TeacherCal } from '../domain/teachers'

const KEY = 'schedule-teachers-v1'

function load(): TeacherCal[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as TeacherCal[]
  } catch { /* без хранилища работаем из памяти */ }
  return []
}

let state: TeacherCal[] = load()
const listeners = new Set<() => void>()

export const getTeachers = () => state

export function setTeachers(next: TeacherCal[] | ((prev: TeacherCal[]) => TeacherCal[])) {
  state = typeof next === 'function' ? next(state) : next
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export function useTeachers(): [TeacherCal[], typeof setTeachers] {
  return [useSyncExternalStore(subscribe, getTeachers), setTeachers]
}
