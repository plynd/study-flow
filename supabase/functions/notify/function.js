// src/domain/debts.ts
function debtStatus(debt) {
  if (debt.closedManually) return "closed";
  if (debt.works.length === 0) return "clarify";
  return debt.works.every((w) => w.done) ? "closed" : "in_progress";
}
function debtProgress(debt) {
  if (debt.works.length === 0) {
    return debt.closedManually ? { done: 1, total: 1 } : { done: 0, total: 0 };
  }
  return { done: debt.works.filter((w) => w.done).length, total: debt.works.length };
}

// src/domain/schedule.ts
var WEEKDAYS = ["\u041F\u043D", "\u0412\u0442", "\u0421\u0440", "\u0427\u0442", "\u041F\u0442", "\u0421\u0431", "\u0412\u0441"];
function weekday(date) {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
var weekdayName = (date) => WEEKDAYS[weekday(date)];
var fmtDate = (date) => `${date.slice(8, 10)}.${date.slice(5, 7)}`;
var fmtTime = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
var emptyHidden = () => ({ subjects: [], keys: [], uids: [] });
var lessonKey = (l) => `${l.subject}|${l.teacher}|${weekday(l.date)}|${l.start}`;
var isHidden = (l, h) => h.subjects.includes(l.subject) || h.keys.includes(lessonKey(l)) || h.uids.includes(l.uid);
var pad = (n) => String(n).padStart(2, "0");
function addDays(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

// src/domain/insights.ts
function surnameKey(name) {
  return name.trim().toLowerCase().replace(/ё/g, "\u0435").split(/[\s.,(]+/)[0] ?? "";
}

// src/domain/notify.ts
var defaultNotify = () => ({
  morning: false,
  morningAt: 8 * 60,
  evening: false,
  eveningAt: 20 * 60,
  before: 0,
  tz: "Asia/Barnaul"
});
var inDay = (n) => typeof n === "number" && n >= 0 && n < 24 * 60;
var isNotifySettings = (v) => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const s = v;
  return typeof s.morning === "boolean" && typeof s.evening === "boolean" && inDay(s.morningAt) && inDay(s.eveningAt) && typeof s.before === "number" && s.before >= 0 && s.before <= 24 * 60 && typeof s.tz === "string" && s.tz.length > 0 && s.tz.length < 64;
};
var notifyEnabled = (s) => s.morning || s.evening || s.before > 0;
function validTz(tz) {
  try {
    new Intl.DateTimeFormat("ru-RU", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
function localNow(ms, tz) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "0";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, min: +get("hour") * 60 + +get("minute") };
}
var norm = (s) => s.toLowerCase().replace(/ё/g, "\u0435");
function teacherMatches(debtTeacher, cal) {
  const key = surnameKey(debtTeacher);
  return !!key && key === surnameKey(cal.name);
}
function debtTeachers(debts, teachers) {
  const groups = /* @__PURE__ */ new Map();
  for (const d of debts) {
    if (debtStatus(d) === "closed" || !d.teacher?.trim()) continue;
    const cal = teachers.find((t) => teacherMatches(d.teacher, t));
    const key = cal ? `cal:${cal.id}` : `raw:${norm(d.teacher).trim()}`;
    const g = groups.get(key) ?? { label: cal?.name ?? d.teacher.trim(), cal, debts: [] };
    g.debts.push(d);
    groups.set(key, g);
  }
  return [...groups.values()];
}
var debtText = (d) => {
  if (debtStatus(d) === "clarify") return `${d.subject} (\u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F)`;
  const p = debtProgress(d);
  return `${d.subject} (\u0441\u0434\u0430\u043D\u043E ${p.done} \u0438\u0437 ${p.total})`;
};
var place = (l) => l.remote ? "\u0434\u0438\u0441\u0442\u0430\u043D\u0446\u0438\u043E\u043D\u043D\u043E" : l.room ? `\u0430\u0443\u0434. ${l.room}` : "";
function relation(l, own) {
  const ownIn = own.filter((o) => !o.remote);
  if (ownIn.length === 0) return "\u0443 \u0442\u0435\u0431\u044F \u0432 \u044D\u0442\u043E\u0442 \u0434\u0435\u043D\u044C \u043D\u0435\u0442 \u043E\u0447\u043D\u044B\u0445 \u043F\u0430\u0440";
  const same = ownIn.find((o) => o.start === l.start && o.subject === l.subject && o.teacher === l.teacher);
  if (same) return "\u044D\u0442\u043E \u0438 \u0442\u0432\u043E\u044F \u043F\u0430\u0440\u0430";
  const busy = ownIn.find((o) => o.start < l.end && l.start < o.end);
  if (busy) return `\u0432 \u044D\u0442\u043E \u0432\u0440\u0435\u043C\u044F \u0443 \u0442\u0435\u0431\u044F \xAB${busy.subject}\xBB`;
  const first = Math.min(...ownIn.map((o) => o.start));
  const last = Math.max(...ownIn.map((o) => o.end));
  if (l.end <= first) return "\u0434\u043E \u0442\u0432\u043E\u0438\u0445 \u043F\u0430\u0440";
  if (l.start >= last) return "\u043F\u043E\u0441\u043B\u0435 \u0442\u0432\u043E\u0438\u0445 \u043F\u0430\u0440";
  return "\u0443 \u0442\u0435\u0431\u044F \u043E\u043A\u043D\u043E";
}
var ownOn = (lessons, hidden, date) => lessons.filter((l) => l.date === date && !isHidden(l, hidden)).sort((a, b) => a.start - b.start);
var inPerson = (cal, date) => cal.lessons.filter((l) => l.date === date && !l.remote).sort((a, b) => a.start - b.start);
var plural = (n, one, few, many) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many}`;
var hm = (min) => min >= 60 ? `${Math.floor(min / 60)} \u0447${min % 60 ? ` ${min % 60} \u043C\u0438\u043D` : ""}` : `${min} \u043C\u0438\u043D`;
var span = (l) => `${fmtTime(l.start)}\u2013${fmtTime(l.end)}`;
function dayText(date, label, ctx) {
  const own = ownOn(ctx.lessons, ctx.hidden, date);
  const person = own.filter((l) => !l.remote);
  const groups = debtTeachers(ctx.debts, ctx.teachers);
  const notAdded = groups.filter((g) => !g.cal).map((g) => g.label);
  const items = own.map((l) => {
    const owner = groups.find((g) => g.cal && g.label && l.teacher && teacherMatches(l.teacher, g.cal));
    return {
      start: l.start,
      text: `${span(l)} \xB7 ${l.subject}${l.kind ? ` (${l.kind})` : ""}${place(l) ? ` \xB7 ${place(l)}` : ""}${l.teacher ? `
      ${l.teacher}${owner ? " \u{1F538} \u0434\u043E\u043B\u0433" : ""}` : ""}`
    };
  });
  let debtLessons = 0;
  for (const g of groups) {
    if (!g.cal) continue;
    for (const l of inPerson(g.cal, date)) {
      const rel = relation(l, own);
      if (rel === "\u044D\u0442\u043E \u0438 \u0442\u0432\u043E\u044F \u043F\u0430\u0440\u0430") continue;
      debtLessons++;
      items.push({ start: l.start, text: `\u{1F538} ${span(l)} \xB7 ${g.label}${place(l) ? ` \xB7 ${place(l)}` : ""}
      \u0434\u043E\u043B\u0433: ${g.debts.map(debtText).join("; ")}
      ${rel}` });
    }
  }
  const sorted = [...person].sort((a, b) => a.start - b.start);
  let reach = sorted[0]?.end ?? 0;
  for (const l of sorted.slice(1)) {
    if (l.start - reach >= 30) items.push({ start: reach, text: `\xB7 \xB7 \xB7 \u043E\u043A\u043D\u043E ${fmtTime(reach)}\u2013${fmtTime(l.start)} (${hm(l.start - reach)})` });
    reach = Math.max(reach, l.end);
  }
  items.sort((a, b) => a.start - b.start);
  const parts = [plural(person.length, "\u043F\u0430\u0440\u0430", "\u043F\u0430\u0440\u044B", "\u043F\u0430\u0440")];
  if (sorted.length) parts.push(`${fmtTime(sorted[0].start)}\u2013${fmtTime(reach)}`);
  else if (own.length) parts[0] = "\u0442\u043E\u043B\u044C\u043A\u043E \u0434\u0438\u0441\u0442\u0430\u043D\u0446\u0438\u043E\u043D\u043D\u043E";
  if (debtLessons) parts.push(`\u0441\u0434\u0430\u0442\u044C: ${debtLessons}`);
  const head = `\u{1F4C5} ${label}, ${weekdayName(date)} ${fmtDate(date)}`;
  const body = items.length ? [parts.join(" \xB7 "), items.map((i) => i.text).join("\n\n")] : ["\u041F\u0430\u0440 \u043D\u0435\u0442."];
  const out = [head, ...body];
  if (debtLessons) out.push("\u{1F538} \u2014 \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u0438, \u0443 \u043A\u043E\u0442\u043E\u0440\u044B\u0445 \u0443 \u0442\u0435\u0431\u044F \u0434\u043E\u043B\u0433");
  if (notAdded.length) out.push(`\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F \u043D\u0435\u0442, \u0434\u043E\u0431\u0430\u0432\u044C \u0432 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0438: ${notAdded.join(", ")}`);
  return out.join("\n\n");
}
function summaryDue(kind, s, now, sent) {
  const at = kind === "morning" ? s.morningAt : s.eveningAt;
  if (!(kind === "morning" ? s.morning : s.evening)) return null;
  if (now.min < at || now.min >= at + 180) return null;
  const key = kind === "morning" ? `mor:${now.date}` : `eve:${addDays(now.date, 1)}`;
  return sent.has(key) ? null : key;
}
function dueWindowReminders(ctx, now, before, sent) {
  if (before <= 0) return [];
  const own = ownOn(ctx.lessons, ctx.hidden, now.date);
  if (own.some((o) => !o.remote && o.start <= now.min && now.min < o.end)) return [];
  const out = [];
  for (const g of debtTeachers(ctx.debts, ctx.teachers)) {
    if (!g.cal) continue;
    for (const l of inPerson(g.cal, now.date)) {
      const key = `win:${l.uid}:${l.date}`;
      if (l.start <= now.min || l.start - now.min > before || sent.has(key)) continue;
      out.push({
        key,
        text: `\u23F0 \u0427\u0435\u0440\u0435\u0437 ${l.start - now.min} \u043C\u0438\u043D \u043F\u0430\u0440\u0430 \u0443 ${g.label}: ${fmtTime(l.start)}\u2013${fmtTime(l.end)}${place(l) ? `, ${place(l)}` : ""}
${relation(l, own)}
\u0414\u043E\u043B\u0433: ${g.debts.map(debtText).join("; ")}`
      });
    }
  }
  return out;
}

// supabase/functions/notify/index.ts
var KEYS = ["debts-v1", "schedule-lessons-v1", "schedule-hidden-v1", "schedule-teachers-v1", "notify-v1"];
var arr = (v) => Array.isArray(v) ? v : [];
function planForUser(rows, sent, nowMs) {
  const raw = rows["notify-v1"];
  if (!isNotifySettings(raw)) return [];
  const settings = { ...defaultNotify(), ...raw, tz: validTz(raw.tz) ? raw.tz : defaultNotify().tz };
  if (!notifyEnabled(settings)) return [];
  const hiddenRaw = rows["schedule-hidden-v1"];
  const ctx = {
    lessons: arr(rows["schedule-lessons-v1"]),
    hidden: hiddenRaw && Array.isArray(hiddenRaw.subjects) ? { ...emptyHidden(), ...hiddenRaw } : emptyHidden(),
    teachers: arr(rows["schedule-teachers-v1"]),
    debts: arr(rows["debts-v1"])
  };
  const now = localNow(nowMs, settings.tz);
  const out = dueWindowReminders(ctx, now, settings.before, sent);
  const morning = summaryDue("morning", settings, now, sent);
  if (morning) out.push({ key: morning, text: dayText(now.date, "\u0421\u0435\u0433\u043E\u0434\u043D\u044F", ctx) ?? "" });
  const evening = summaryDue("evening", settings, now, sent);
  if (evening) out.push({ key: evening, text: dayText(addDays(now.date, 1), "\u0417\u0430\u0432\u0442\u0440\u0430", ctx) ?? "" });
  return out;
}
var CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-cron-secret"
};
var json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json; charset=utf-8" } });
var env = (name) => globalThis.Deno?.env.get(name);
var tgIdOf = (email, meta) => {
  if (typeof meta?.tg_id === "number") return meta.tg_id;
  const m = /^tg(\d+)@/.exec(email ?? "");
  return m ? Number(m[1]) : null;
};
async function sendTelegram(token, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } })
  });
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => ({}));
  return { ok: false, error: body.description ?? `Telegram \u043E\u0442\u0432\u0435\u0442\u0438\u043B ${res.status}` };
}
async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "\u0422\u043E\u043B\u044C\u043A\u043E POST." });
  const token = env("TELEGRAM_BOT_TOKEN");
  const url = env("SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY");
  const service = env("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = env("CRON_SECRET");
  if (!token || !url || !anon || !service) return json(500, { error: "\u0424\u0443\u043D\u043A\u0446\u0438\u044F \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u0430: \u043D\u0435\u0442 \u0441\u0435\u043A\u0440\u0435\u0442\u043E\u0432." });
  const admin = { apikey: service, authorization: `Bearer ${service}`, "content-type": "application/json" };
  const rest = (path, init) => fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...admin, ...init?.headers } });
  const bearer = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  const cronHeader = req.headers.get("x-cron-secret");
  const isCron = !!cronSecret && cronHeader === cronSecret;
  if (!isCron) {
    if (!bearer) return json(401, { error: "\u041D\u0435\u0442 \u0432\u0445\u043E\u0434\u0430." });
    const who = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, authorization: `Bearer ${bearer}` } });
    if (!who.ok) return json(401, { error: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435 \u043F\u043E\u0434\u043E\u0448\u043B\u0430. \u041E\u0442\u043A\u0440\u043E\u0439 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0432 Telegram \u0437\u0430\u043D\u043E\u0432\u043E." });
    const u = await who.json();
    const chat = tgIdOf(u.email, u.user_metadata);
    if (!chat) return json(400, { error: "\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D Telegram-\u0430\u043A\u043A\u0430\u0443\u043D\u0442." });
    const r = await sendTelegram(token, chat, "\u2705 \u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F \u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0442. \u042D\u0442\u043E \u043F\u0440\u043E\u0431\u043D\u043E\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435.");
    return r.ok ? json(200, { ok: true }) : json(502, { error: `\u0411\u043E\u0442 \u043D\u0435 \u0441\u043C\u043E\u0433 \u043D\u0430\u043F\u0438\u0441\u0430\u0442\u044C: ${r.error}. \u041E\u0442\u043A\u0440\u043E\u0439 \u0447\u0430\u0442 \u0441 \u0431\u043E\u0442\u043E\u043C \u0438 \u043D\u0430\u0436\u043C\u0438 \xAB\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C\xBB (Start).` });
  }
  const dataRes = await rest(`user_data?select=user_id,key,value&key=in.(${KEYS.join(",")})`);
  if (!dataRes.ok) return json(502, { error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435.", detail: (await dataRes.text()).slice(0, 300) });
  const byUser = /* @__PURE__ */ new Map();
  for (const r of await dataRes.json()) {
    byUser.set(r.user_id, { ...byUser.get(r.user_id), [r.key]: r.value });
  }
  const since = new Date(Date.now() - 3 * 864e5).toISOString();
  const sentRes = await rest(`notify_sent?select=user_id,key&sent_at=gt.${since}`);
  const sentBy = /* @__PURE__ */ new Map();
  if (sentRes.ok) for (const r of await sentRes.json()) {
    sentBy.set(r.user_id, (sentBy.get(r.user_id) ?? /* @__PURE__ */ new Set()).add(r.key));
  }
  const now = Date.now();
  const report = [];
  for (const [userId, rows] of byUser) {
    const messages = planForUser(rows, sentBy.get(userId) ?? /* @__PURE__ */ new Set(), now);
    if (messages.length === 0) continue;
    const ures = await fetch(`${url}/auth/v1/admin/users/${userId}`, { headers: admin });
    const u = ures.ok ? await ures.json() : null;
    const chat = u ? tgIdOf(u.email, u.user_metadata) : null;
    if (!chat) {
      report.push({ user: userId, sent: 0, failed: "\u043D\u0435\u0442 Telegram-\u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430" });
      continue;
    }
    let count = 0;
    for (const m of messages) {
      if (m.text) {
        const r = await sendTelegram(token, chat, m.text);
        if (!r.ok) {
          report.push({ user: userId, sent: count, failed: r.error });
          break;
        }
        count++;
      }
      await rest("notify_sent", { method: "POST", headers: { prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ user_id: userId, key: m.key }) });
    }
    report.push({ user: userId, sent: count });
  }
  await rest(`notify_sent?sent_at=lt.${new Date(now - 7 * 864e5).toISOString()}`, { method: "DELETE" });
  return json(200, { ok: true, report });
}
var deno = globalThis.Deno;
if (deno?.serve) deno.serve(handler);
export {
  handler,
  planForUser
};
