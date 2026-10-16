// Путь: src/screens/Picker.tsx
import { useEffect, useState } from 'react'
import { LEAF_DEPTH, depthOf, icsUrlFor, rootPath, type DirItem, type DirKind, type SearchItem } from '../domain/directory'

const K_CACHE = 'dir-cache-v1'
const TTL = 24 * 3600 * 1000 // списки меняются редко — не дёргаем сайт чаще раза в сутки

type Cache = Record<string, { at: number; items: DirItem[] }>
const readCache = (): Cache => {
  try { return JSON.parse(localStorage.getItem(K_CACHE) ?? '{}') as Cache } catch { return {} }
}
const writeCache = (path: string, items: DirItem[]) => {
  try { localStorage.setItem(K_CACHE, JSON.stringify({ ...readCache(), [path]: { at: Date.now(), items } })) } catch { /* ignore */ }
}

// Один запрос на адрес, даже если эффект сработал дважды (StrictMode в разработке) или кликнули быстро
const inflight = new Map<string, Promise<DirItem[]>>()
function loadDir(path: string): Promise<DirItem[]> {
  const hit = readCache()[path]
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.items)
  let p = inflight.get(path)
  if (!p) {
    p = (async () => {
      const r = await fetch('/api/directory?path=' + encodeURIComponent(path)).catch(() => null)
      if (!r) throw new Error('Нет связи с сервером приложения.')
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.error ?? `Ошибка ${r.status}.`)
      writeCache(path, body.items)
      return body.items as DirItem[]
    })().finally(() => inflight.delete(path))
    inflight.set(path, p)
  }
  return p
}

// Поиск по сайту: не короче 3 символов, пауза после набора, одинаковые запросы не повторяем
interface SearchResult { items: SearchItem[]; debug?: string }
const searchCache = new Map<string, SearchResult>()
async function searchSite(q: string, kind: DirKind): Promise<SearchResult> {
  const key = kind + '|' + q.toLowerCase()
  const hit = searchCache.get(key)
  if (hit) return hit
  const r = await fetch(`/api/search?in=${kind}&q=${encodeURIComponent(q)}`).catch(() => null)
  if (!r) throw new Error('Нет связи с сервером приложения.')
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body.error ?? `Ошибка ${r.status}.`)
  const res: SearchResult = { items: body.items, debug: body.debug }
  searchCache.set(key, res)
  return res
}

interface Props {
  kind: DirKind
  onPick: (item: DirItem, icsUrl: string) => void
  onClose: () => void
}

export default function Picker({ kind, onPick, onClose }: Props) {
  // стек шагов: [корень, институт, кафедра…]
  const [stack, setStack] = useState<{ path: string; title: string }[]>([
    { path: rootPath(kind), title: kind === 'lecturers' ? 'Институты' : 'Институты и факультеты' },
  ])
  const [items, setItems] = useState<DirItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const cur = stack[stack.length - 1]
  const [hits, setHits] = useState<SearchItem[]>([])
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState('')
  const [debug, setDebug] = useState('')
  const ready = q.trim().length >= 3

  useEffect(() => {
    if (!ready) { setHits([]); setSearchErr(''); setSearching(false); return }
    let dead = false
    setSearching(true); setSearchErr('')
    const t = setTimeout(() => {
      searchSite(q.trim(), kind)
        .then((r) => { if (!dead) { setHits(r.items); setDebug(r.items.length ? '' : (r.debug ?? '')) } })
        .catch((e: Error) => { if (!dead) { setHits([]); setSearchErr(e.message) } })
        .finally(() => { if (!dead) setSearching(false) })
    }, 800)
    return () => { dead = true; clearTimeout(t) }
  }, [q, kind, ready])

  useEffect(() => {
    let dead = false
    setQ(''); setError(''); setItems([]); setLoading(true)
    loadDir(cur.path)
      .then((it) => { if (!dead) setItems(it) })
      .catch((e: Error) => { if (!dead) setError(e.message) })
      .finally(() => { if (!dead) setLoading(false) })
    return () => { dead = true }
  }, [cur.path])

  const shown = items.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <section className="summary picker">
      <div className="pickhead">
        <strong>{stack.map((s) => s.title).join(' › ')}</strong>
        <button onClick={onClose}>Закрыть</button>
      </div>
      {stack.length > 1 && <button onClick={() => setStack((s) => s.slice(0, -1))}>← Назад</button>}
      <input
        placeholder={kind === 'lecturers' ? 'Поиск: введи фамилию (от 3 букв)' : 'Поиск: введи номер группы (от 3 символов)'}
        value={q} onChange={(e) => setQ(e.target.value)} />
      {ready ? (
        <>
          {searching && <p className="muted">Ищу на сайте…</p>}
          {searchErr && <p className="muted err">{searchErr}</p>}
          <ul className="list">
            {hits.map((it) => (
              <li key={it.path}>
                <button className="pickitem" onClick={() => onPick(it, icsUrlFor(it.path))}>
                  {it.name}{it.hint && <span className="muted"> · {it.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
          {!searching && !searchErr && hits.length === 0 && (
            <>
              <p className="muted">По запросу ничего не найдено.</p>
              {debug && <p className="muted dbg">Диагностика: {debug}</p>}
            </>
          )}
        </>
      ) : (
        <>
          {loading && <p className="muted">Загружаю список…</p>}
          {error && <p className="muted err">{error}</p>}
          <ul className="list">
            {shown.map((it) => (
              <li key={it.path}>
                <button className="pickitem" onClick={() => {
                  if (depthOf(it.path, kind) >= LEAF_DEPTH[kind]) onPick(it, icsUrlFor(it.path))
                  else setStack((s) => [...s, { path: it.path, title: it.name }])
                }}>{it.name}</button>
              </li>
            ))}
          </ul>
          {!loading && !error && shown.length === 0 && <p className="muted">Ничего не найдено.</p>}
        </>
      )}
    </section>
  )
}
