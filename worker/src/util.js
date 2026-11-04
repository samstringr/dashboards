/* Health DB · util.js */
import { tg } from './bot.js';

export const TZ = 'Europe/London';
export const CONFIG_IDS = ['settings', 'library', 'plan', 'layout', 'supplements', 'away'];
/* ============================================================ helpers */
export const text = (s, status = 200) => new Response(s, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
export const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...headers } });
export const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export const r1 = n => Math.round(n * 10) / 10;
export const fmt = (n, d = 0) => (n == null || !isFinite(n)) ? '–' : Number(n).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
export const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const fmtDate = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
export const today = () => fmtDate.format(new Date());
export const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const addDays = (s, n) => new Date(parseISO(s) + n * 864e5).toISOString().slice(0, 10);
export const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dLong = s => { const d = new Date(parseISO(s)); return WD[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; };
export const validDate = (s, fallback) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && s <= today() ? s : fallback;
export const normName = s => String(s || '').toLowerCase().replace(/[^a-z0-9+]/g, '');
export function localParts(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hour12: false, weekday: 'short' }).formatToParts(d);
  return { hour: Number(p.find(x => x.type === 'hour').value) % 24, wd: p.find(x => x.type === 'weekday').value };
}
export function authorized(req, env) {
  const h = req.headers.get('authorization') || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  return !!env.API_KEY && safeEqual(tok, env.API_KEY);
}
export function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const webhookSecret = async env => (await sha256hex('tg:' + env.TELEGRAM_TOKEN)).slice(0, 48);
export function b64(bytes) {
  let s = ''; const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
export const b64utf8 = str => b64(new TextEncoder().encode(str));
