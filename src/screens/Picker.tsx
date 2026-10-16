// Путь: src/screens/Picker.tsx
import { useEffect, useState } from 'react'
import { IconChevronRight } from '../ui/icons'
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
}

/** Содержимое листа выбора: поиск сверху, ниже — результаты или список по уровням */
export default function Picker({ kind, onPick }: Props) {
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
    <>
      <div className="pick-top">
        <div className="search-field">
          <input className="input" type="search" autoComplete="off" enterKeyHint="search"
            aria-label="Поиск"
            placeholder={kind === 'lecturers' ? 'Фамилия преподавателя (от 3 букв)' : 'Номер группы (от 3 символов)'}
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!ready && stack.length > 1 && (
          <div>
            <button className="back-btn" onClick={() => setStack((s) => s.slice(0, -1))}>
              <span style={{ transform: 'scaleX(-1)', display: 'grid' }}><IconChevronRight size={18} /></span>
              {stack[stack.length - 2].title}
            </button>
          </div>
        )}
        {!ready && <p className="crumbs">{cur.title}</p>}
      </div>

      {ready ? (
        <>
          {searching && <p className="status-line">Ищу на сайте…</p>}
          {searchErr && <p className="status-line err-text">{searchErr}</p>}
          {hits.length > 0 && (
            <ul className="group">
              {hits.map((it) => (
                <li key={it.path}>
                  <button className="row" onClick={() => onPick(it, icsUrlFor(it.path))}>
                    <span className="row-main">
                      <span className="row-title">{it.name}</span>
                      {it.hint && <span className="row-sub">{it.hint}</span>}
                    </span>
                    <span className="chev"><IconChevronRight /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!searching && !searchErr && hits.length === 0 && (
            <>
              <p className="status-line">По запросу ничего не найдено.</p>
              {debug && (
                <details className="footnote">
                  <summary>Подробности для отладки</summary>
                  <p className="dbg">{debug}</p>
                </details>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {loading && <p className="status-line">Загружаю список…</p>}
          {error && <p className="status-line err-text">{error}</p>}
          {shown.length > 0 && (
            <ul className="group">
              {shown.map((it) => (
                <li key={it.path}>
                  <button className="row" onClick={() => {
                    if (depthOf(it.path, kind) >= LEAF_DEPTH[kind]) onPick(it, icsUrlFor(it.path))
                    else setStack((s) => [...s, { path: it.path, title: it.name }])
                  }}>
                    <span className="row-main"><span className="row-title">{it.name}</span></span>
                    <span className="chev"><IconChevronRight /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && !error && shown.length === 0 && <p className="status-line">Ничего не найдено.</p>}
        </>
      )}
    </>
  )
}
