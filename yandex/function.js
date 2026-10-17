var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// yandex/index.ts
var index_exports = {};
__export(index_exports, {
  handler: () => handler,
  queryOf: () => queryOf,
  routeOf: () => routeOf
});
module.exports = __toCommonJS(index_exports);

// src/domain/directory.ts
var norm = (s) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim();
var stripTags = (s) => s.replace(/<[^>]*>/g, " ");
function validateDirPath(path) {
  const m = /^\/timetable\/(lecturers|students)\/((?:\d+\/){0,3})$/.exec(path);
  if (!m) return { ok: false, reason: "\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 \u0440\u0430\u0437\u0434\u0435\u043B \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F." };
  return { ok: true, kind: m[1], path };
}
function parseDirectory(html, basePath) {
  const m = /^\/timetable\/(lecturers|students)\//.exec(basePath);
  if (!m) return [];
  const seen = /* @__PURE__ */ new Map();
  const re = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (let a = re.exec(html); a; a = re.exec(html)) {
    let href;
    try {
      href = new URL(a[1].replace(/&amp;/g, "&"), "https://www.asu.ru" + basePath).pathname;
    } catch {
      continue;
    }
    if (!href.startsWith(basePath) || !href.endsWith("/")) continue;
    const rest = href.slice(basePath.length).split("/").filter(Boolean);
    if (rest.length !== 1 || !/^\d+$/.test(rest[0])) continue;
    const name = norm(stripTags(a[2]));
    if (!name || seen.has(href)) continue;
    seen.set(href, name);
  }
  return [...seen].map(([path, name]) => ({ name, path })).sort((x, y) => x.name.localeCompare(y.name, "ru"));
}
function validateQuery(q) {
  const t = q.trim().replace(/\s+/g, " ");
  if (t.length < 3) return { ok: false, reason: "\u0412\u0432\u0435\u0434\u0438 \u0445\u043E\u0442\u044F \u0431\u044B 3 \u0431\u0443\u043A\u0432\u044B." };
  if (t.length > 40 || !/^[\p{L}\p{N} .\-]+$/u.test(t)) return { ok: false, reason: "\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0435 \u0441\u0438\u043C\u0432\u043E\u043B\u044B \u0432 \u0437\u0430\u043F\u0440\u043E\u0441\u0435." };
  return { ok: true, q: t };
}
function validatePage(param, n) {
  return /^[A-Za-z][A-Za-z0-9_]{0,24}$/.test(param) && Number.isInteger(n) && n >= 2 && n <= 100 && param !== "query" ? { param, n } : null;
}
var searchUrl = (q, kind, page) => `https://www.asu.ru/timetable/search/${kind}/?query=${encodeURIComponent(q)}` + (page ? `&${page.param}=${page.n}` : "");
function parsePager(html, kind, current = 1) {
  const base = `https://www.asu.ru/timetable/search/${kind}/`;
  const at = html.search(/class="[^"]*\bpagination\b[^"]*"/);
  const zone = at >= 0 ? html.slice(at, at + 6e3) : "";
  const byParam = /* @__PURE__ */ new Map();
  const scan = (chunk, needQuery) => {
    for (const m of chunk.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["']/gi)) {
      let u;
      try {
        u = new URL(m[1].replace(/&amp;/g, "&"), base);
      } catch {
        continue;
      }
      if (u.hostname !== "www.asu.ru" || u.pathname !== `/timetable/search/${kind}/`) continue;
      if (needQuery && !u.searchParams.has("query")) continue;
      for (const [k, v] of u.searchParams) {
        if (k === "query" || !/^\d+$/.test(v)) continue;
        const n = Number(v);
        if (!validatePage(k, n)) continue;
        byParam.set(k, (byParam.get(k) ?? /* @__PURE__ */ new Set()).add(n));
      }
    }
  };
  scan(zone, false);
  if (byParam.size === 0) scan(html, true);
  let best = null;
  for (const e of byParam) if (!best || e[1].size > best[1].size) best = e;
  if (!best) return null;
  return [...best[1]].some((n) => n > current) ? validatePage(best[0], current + 1) : null;
}
function parseTotal(html) {
  const m = /pagination-label-total[^>]*>\s*(\d+)/i.exec(html) ?? /search_statistics-info-item-value[^>]*>\s*(\d+)\s*</i.exec(html.replace(/[\s\S]*?Всего найдено\s*<\/span>/i, ""));
  return m ? Number(m[1]) : null;
}
var LEAF_RE = {
  lecturers: /^\/timetable\/lecturers\/\d+\/\d+\/\d+\/$/,
  students: /^\/timetable\/students\/\d+\/\d+\/$/
};
function parseSearch(html, kind) {
  const out = /* @__PURE__ */ new Map();
  const toPath = (href) => {
    try {
      return new URL(href.replace(/&amp;/g, "&"), "https://www.asu.ru/timetable/search/").pathname;
    } catch {
      return "";
    }
  };
  const anchors = (chunk) => [...chunk.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({ path: toPath(m[1]), text: norm(stripTags(m[2])) }));
  const blocks = html.split(/<li\b[^>]*schedule_search_results-item["' ]/i).slice(1);
  for (const block of blocks) {
    const chunk = block.split(/<\/li>/i)[0];
    const as = anchors(chunk);
    const leaf = as.find((a) => LEAF_RE[kind].test(a.path) && a.text);
    if (!leaf || out.has(leaf.path)) continue;
    const hint = as.filter((a) => a !== leaf && a.text && !LEAF_RE[kind].test(a.path)).map((a) => a.text).join(", ");
    out.set(leaf.path, { name: leaf.text, path: leaf.path, ...hint ? { hint } : {} });
  }
  if (out.size > 0) return [...out.values()];
  const re = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (let a = re.exec(html); a; a = re.exec(html)) {
    const path = toPath(a[1]);
    if (!LEAF_RE[kind].test(path)) continue;
    const name = norm(stripTags(a[2]));
    if (!name || out.has(path)) continue;
    const tail = html.slice(re.lastIndex, re.lastIndex + 400).split(/<a\b|<\/li>|<\/tr>|<\/p>|<br/i)[0];
    const hint = norm(stripTags(tail)).replace(/^[\s,;:–—-]+/, "");
    out.set(path, { name, path, ...hint && hint.length <= 100 ? { hint } : {} });
  }
  return [...out.values()];
}

// src/server/site.ts
var UA = "debts-app/0.1 (personal student project)";
var fail = (status, error, stop = false) => ({ ok: false, status, error, stop });
async function get(url, extra = {}) {
  return fetch(url, {
    redirect: "manual",
    headers: { "User-Agent": UA, Accept: "text/html", ...extra },
    signal: AbortSignal.timeout(2e4)
  });
}
function blocked(res) {
  if (res.status === 403 || res.status === 429) {
    return fail(429, "\u0421\u0430\u0439\u0442 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0438\u043B \u0437\u0430\u043F\u0440\u043E\u0441\u044B. \u041E\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u0435\u043C\u0441\u044F: \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439 \u043F\u043E\u0437\u0436\u0435.", true);
  }
  if (!res.ok) return fail(502, `\u0421\u0430\u0439\u0442 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F \u043E\u0442\u0432\u0435\u0442\u0438\u043B \u043E\u0448\u0438\u0431\u043A\u043E\u0439 ${res.status}.`);
  return null;
}
async function fetchTimetablePage(url) {
  let shell;
  try {
    shell = await get(url);
  } catch (e) {
    return fail(502, `\u0421\u0430\u0439\u0442 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F \u043D\u0435 \u043E\u0442\u0432\u0435\u0442\u0438\u043B (${reason(e)}).`);
  }
  const bad = blocked(shell);
  if (bad) return bad;
  const html = await shell.text();
  const token = /setRequestHeader\(\s*'X-CS-ID'\s*,\s*'([0-9a-f]+)'\s*\)/i.exec(html)?.[1];
  const cookies = (shell.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]);
  const t1 = `\u0448\u0430\u0433 1: ${shell.status}, ${html.length} \u0441\u0438\u043C\u0432., \u0442\u043E\u043A\u0435\u043D: ${token ? "\u0435\u0441\u0442\u044C" : "\u043D\u0435\u0442"}, cookie: ${cookies.length}`;
  if (!token) return { ok: true, html, trace: t1 };
  try {
    const res = await get(url, {
      "X-CS-ID": token,
      Accept: "*/*",
      Referer: url,
      "Accept-Language": "ru",
      ...cookies.length ? { Cookie: cookies.join("; ") } : {}
    });
    const bad2 = blocked(res);
    if (bad2) return bad2;
    const body = await res.text();
    return { ok: true, html: body, trace: `${t1}; \u0448\u0430\u0433 2: ${res.status}, ${body.length} \u0441\u0438\u043C\u0432.` };
  } catch (e) {
    return fail(502, `\u0421\u0430\u0439\u0442 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F \u043D\u0435 \u043E\u0442\u0432\u0435\u0442\u0438\u043B (${reason(e)}).`);
  }
}
function reason(e) {
  const err = e;
  return err.cause?.code ?? err.cause?.errors?.[0]?.code ?? err.cause?.message ?? ([err.name, err.message].filter(Boolean).join(": ") || "\u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E");
}

// api/search.ts
var json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
});
async function handle(request) {
  const params = new URL(request.url).searchParams;
  const kind = params.get("in");
  if (kind !== "lecturers" && kind !== "students") return json({ error: "\u0423\u043A\u0430\u0436\u0438, \u0447\u0442\u043E \u0438\u0441\u043A\u0430\u0442\u044C." }, 400);
  const v = validateQuery(params.get("q") ?? "");
  if (!v.ok) return json({ error: v.reason }, 400);
  const pp = params.get("pp"), pn = params.get("pn");
  const ref = pp && pn ? validatePage(pp, Number(pn)) : null;
  if (pp && pn && !ref) return json({ error: "\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 \u043D\u043E\u043C\u0435\u0440 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B." }, 400);
  const page = await fetchTimetablePage(searchUrl(v.q, kind, ref ?? void 0));
  if (!page.ok) return json({ error: page.error }, page.status, page.stop ? { "Retry-After": "1800" } : {});
  if (process.env.NODE_ENV !== "production" && params.get("raw") === "1") {
    return new Response(page.trace + "\n\n" + page.html.slice(0, 3e4), { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const items = parseSearch(page.html, kind);
  const hrefs = [...page.html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const sample = [...new Set(hrefs.filter((h) => h.includes("timetable")))].slice(0, 6).map((h) => h.slice(0, 80));
  const text = page.html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
  const debug = `${page.trace}; \u0441\u0441\u044B\u043B\u043E\u043A: ${hrefs.length}; \u043F\u0440\u0438\u043C\u0435\u0440\u044B: ${sample.join(" , ") || "\u043D\u0435\u0442"}; \u0442\u0435\u043A\u0441\u0442: \xAB${text}\xBB`;
  return json({ items, more: parsePager(page.html, kind, ref?.n ?? 1), total: parseTotal(page.html), debug });
}
async function GET(request) {
  try {
    return await handle(request);
  } catch (e) {
    return json({ error: `\u0421\u0431\u043E\u0439 \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435: ${e?.message ?? String(e)}` }, 500);
  }
}

// api/directory.ts
var json2 = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
});
async function handle2(request) {
  const v = validateDirPath(new URL(request.url).searchParams.get("path") ?? "");
  if (!v.ok) return json2({ error: v.reason }, 400);
  const page = await fetchTimetablePage("https://www.asu.ru" + v.path);
  if (!page.ok) return json2({ error: page.error }, page.status, page.stop ? { "Retry-After": "1800" } : {});
  if (process.env.NODE_ENV !== "production" && new URL(request.url).searchParams.get("raw") === "1") {
    return new Response(page.trace + "\n\n" + page.html.slice(0, 3e4), { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const items = parseDirectory(page.html, v.path);
  if (items.length === 0) {
    const links = (page.html.match(/<a\b/gi) ?? []).length;
    return json2({
      error: `\u041D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435 \u043D\u0435 \u043D\u0430\u0448\u043B\u043E\u0441\u044C \u0441\u043F\u0438\u0441\u043A\u0430 (${page.trace}; \u0441\u0441\u044B\u043B\u043E\u043A \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435: ${links}).`
    }, 502);
  }
  return json2({ items });
}
async function GET2(request) {
  try {
    return await handle2(request);
  } catch (e) {
    return json2({ error: `\u0421\u0431\u043E\u0439 \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435: ${e?.message ?? String(e)}` }, 500);
  }
}

// src/domain/sources.ts
var COOLDOWN_MS = 30 * 60 * 1e3;
function validateIcsUrl(input) {
  let u;
  try {
    u = new URL(input.trim());
  } catch {
    return { ok: false, reason: "\u042D\u0442\u043E \u043D\u0435 \u0441\u0441\u044B\u043B\u043A\u0430." };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "\u041D\u0443\u0436\u043D\u0430 \u0441\u0441\u044B\u043B\u043A\u0430 https://." };
  if (u.hostname !== "www.asu.ru" && u.hostname !== "asu.ru") return { ok: false, reason: "\u0421\u0441\u044B\u043B\u043A\u0430 \u0434\u043E\u043B\u0436\u043D\u0430 \u0432\u0435\u0441\u0442\u0438 \u043D\u0430 asu.ru." };
  if (u.port || u.username || u.password) return { ok: false, reason: "\u0421\u0441\u044B\u043B\u043A\u0430 \u0432\u044B\u0433\u043B\u044F\u0434\u0438\u0442 \u043F\u043E\u0434\u043E\u0437\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u043E." };
  if (!u.pathname.startsWith("/timetable/")) return { ok: false, reason: "\u0421\u0441\u044B\u043B\u043A\u0430 \u0434\u043E\u043B\u0436\u043D\u0430 \u0432\u0435\u0441\u0442\u0438 \u0432 \u0440\u0430\u0437\u0434\u0435\u043B /timetable/." };
  const q = [...u.searchParams.entries()];
  if (q.length !== 1 || q[0][0] !== "file" || !/^\d+\.ics$/.test(q[0][1])) {
    return { ok: false, reason: "\u041D\u0443\u0436\u043D\u0430 \u0441\u0441\u044B\u043B\u043A\u0430 \u043D\u0430 \u0444\u0430\u0439\u043B \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F: \u2026/?file=\u0427\u0418\u0421\u041B\u041E.ics." };
  }
  return { ok: true, url: `https://${u.hostname}${u.pathname}?file=${q[0][1]}` };
}

// api/ics.ts
var json3 = (body, status, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
});
async function handle3(request) {
  const target = new URL(request.url).searchParams.get("url") ?? "";
  const v = validateIcsUrl(target);
  if (!v.ok) return json3({ error: v.reason }, 400);
  let res;
  try {
    res = await fetch(v.url, {
      redirect: "manual",
      headers: { "User-Agent": "debts-app/0.1 (personal student project)", Accept: "text/calendar" },
      signal: AbortSignal.timeout(2e4)
    });
  } catch (e) {
    const err = e;
    const detail = err.cause?.code ?? err.cause?.errors?.[0]?.code ?? err.cause?.message ?? [err.name, err.message].filter(Boolean).join(": ") ?? "\u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E";
    return json3({ error: `\u0421\u0430\u0439\u0442 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F \u043D\u0435 \u043E\u0442\u0432\u0435\u0442\u0438\u043B (${detail}).`, detail }, 502);
  }
  if (res.status === 403 || res.status === 429) {
    return json3({
      error: "\u0421\u0430\u0439\u0442 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0438\u043B \u0437\u0430\u043F\u0440\u043E\u0441\u044B. \u041E\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u0435\u043C\u0441\u044F: \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439 \u043F\u043E\u0437\u0436\u0435 \u0438\u043B\u0438 \u0437\u0430\u0433\u0440\u0443\u0437\u0438 \u0444\u0430\u0439\u043B \u0432\u0440\u0443\u0447\u043D\u0443\u044E.",
      siteStatus: res.status
    }, 429, { "Retry-After": "1800" });
  }
  if (!res.ok) return json3({ error: `\u0421\u0430\u0439\u0442 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F \u043E\u0442\u0432\u0435\u0442\u0438\u043B \u043E\u0448\u0438\u0431\u043A\u043E\u0439 ${res.status}.` }, 502);
  const text = await res.text();
  if (!text.trimStart().startsWith("BEGIN:VCALENDAR")) {
    return json3({ error: "\u0421\u0430\u0439\u0442 \u0432\u0435\u0440\u043D\u0443\u043B \u043D\u0435 .ics (\u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E, \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443-\u0437\u0430\u0433\u043B\u0443\u0448\u043A\u0443)." }, 502);
  }
  return new Response(text, {
    headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store" }
  });
}
async function GET3(request) {
  try {
    return await handle3(request);
  } catch (e) {
    return json3({ error: `\u0421\u0431\u043E\u0439 \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435: ${e?.message ?? String(e)}` }, 500);
  }
}

// yandex/index.ts
var ROUTES = { search: GET, directory: GET2, ics: GET3 };
var CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-expose-headers": "Retry-After" };
function queryOf(event) {
  const out = {};
  const fromUrl = event.rawQueryString ?? (event.url ?? "").split("?")[1] ?? "";
  for (const [k, v] of new URLSearchParams(fromUrl)) out[k] = v;
  for (const [k, v] of Object.entries(event.multiValueQueryStringParameters ?? {})) if (v?.length) out[k] = String(v[0]);
  for (const src of [event.params, event.queryStringParameters]) {
    for (const [k, v] of Object.entries(src ?? {})) if (v != null) out[k] = String(v);
  }
  return out;
}
function routeOf(event) {
  const q = queryOf(event);
  if (q.route) return q.route;
  const path = (event.path ?? event.url ?? "").split("?")[0];
  return path.split("/").filter(Boolean).pop() ?? "";
}
async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod && event.httpMethod !== "GET") return { statusCode: 405, headers: CORS, body: "" };
  const name = routeOf(event);
  const fn = Object.hasOwn(ROUTES, name) ? ROUTES[name] : void 0;
  if (!fn) {
    return { statusCode: 404, headers: { ...CORS, "content-type": "application/json; charset=utf-8" }, body: JSON.stringify({ error: "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0430\u0434\u0440\u0435\u0441.", debug: { keys: Object.keys(event), url: event.url, path: event.path, payload: JSON.stringify(event.payload ?? null).slice(0, 1500), query: queryOf(event) } }) };
  }
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(queryOf(event))) {
    if (k !== "route" && k !== "integration") params.set(k, String(v));
  }
  const res = await fn(new Request(`https://localhost/api/${name}?${params}`));
  const headers = { ...CORS };
  res.headers.forEach((v, k) => {
    headers[k] = v;
  });
  return { statusCode: res.status, headers, body: await res.text() };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler,
  queryOf,
  routeOf
});
