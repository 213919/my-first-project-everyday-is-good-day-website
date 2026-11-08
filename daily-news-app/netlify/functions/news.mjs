// 聲讀 DAILY：伺服器端整理新聞（Netlify Function，網址 /api/news）
// 抓取 rules.js 裡的各來源 RSS → 英文翻譯為繁體中文 → 套用編輯原則 → 回傳 JSON。
// Netlify CDN 快取 5 分鐘；過期後一小時內先給舊資料、背景更新，使用者不用等。
// 按播放器右上角「重新整理」時會加上 ?fresh=，直接抓最新資料（不使用快取）。
// 注意：只有網站「連結 GitHub」部署時才會啟用；手動拖拉上傳的網站不會執行這個檔案。
import R from '../../rules.js';

const FEED_BUDGET = 5000; // 抓 RSS 最多 5 秒
const DEADLINE = 8500;    // 整體最多 8.5 秒（免費方案函式上限 10 秒）
const UA = 'Mozilla/5.0 (compatible; ShengDuNews/1.0; +https://ada868.netlify.app)';
const memo = globalThis.__shengduTr || (globalThis.__shengduTr = new Map()); // 同一台伺服器再次執行時沿用譯文

async function get(url, ms) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), Math.max(200, ms));
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': UA, accept: '*/*' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r;
  } finally {
    clearTimeout(timer);
  }
}

/* 主要網址失敗時改用備援網址 */
async function fetchSource(src, end) {
  const routes = [[src.url, !!src.gn, src.gn ? 'Google 新聞' : 'RSS']];
  if (src.alt) routes.push([src.alt, true, 'Google 新聞（備援）']);
  for (const [u, gn, via] of routes) {
    const left = end - Date.now();
    if (left < 500) break;
    try {
      const items = R.parseFeed(await (await get(u, Math.min(left, 3500))).text());
      if (items.length) return { src, items, gn, via };
    } catch (e) { /* 換下一個網址 */ }
  }
  return { src, items: null };
}

/* Google 翻譯：一次送多行；行數對不上時拆半再翻 */
async function translate(sl, list, end) {
  const left = end - Date.now();
  if (left < 600) return null;
  let out = null;
  try {
    out = R.gtxLines(await (await get(R.gtxURL(sl, list), Math.min(left, 4000))).json(), list.length);
  } catch (e) {
    return null;
  }
  if (out || list.length === 1) return out;
  const h = Math.ceil(list.length / 2);
  const [a, b] = await Promise.all([translate(sl, list.slice(0, h), end), translate(sl, list.slice(h), end)]);
  return a && b ? a.concat(b) : null;
}

export default async (req) => {
  const fresh = new URL(req.url).searchParams.has('fresh');
  const start = Date.now(), end = start + DEADLINE;
  const fetched = await Promise.all(R.SOURCES.map(s => fetchSource(s, start + FEED_BUDGET)));
  const seen = new Set(), raw = [];
  const sources = fetched.map(({ src, items, gn, via }) => {
    if (!items) return { id: src.id, ok: false };
    const l = R.normalize(src, items, gn).filter(x => !seen.has(x.link) && seen.add(x.link));
    raw.push(...l);
    return { id: src.id, ok: true, n: l.length, via };
  });

  const chunks = R.chunkJobs(R.translationJobs(raw), (sl, t) => memo.has(R.trKey(sl, t)), 1500);
  let total = 0, failed = 0;
  await Promise.all(chunks.map(async ([sl, list]) => {
    total += list.length;
    const out = await translate(sl, list, end);
    if (out) list.forEach((t, i) => memo.set(R.trKey(sl, t), out[i]));
    else failed += list.length;
  }));
  if (memo.size > 3000) [...memo.keys()].slice(0, memo.size - 2000).forEach(k => memo.delete(k));

  const { list, untranslated, judged, headlineOnly } = R.finalize(raw, (sl, t) => memo.get(R.trKey(sl, t)));
  const body = { updated: Date.now(), articles: list, sources, untranslated, judged, headlineOnly, translate: { total, failed }, ms: Date.now() - start };
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': fresh ? 'no-store' : 'public, max-age=60',
      'netlify-cdn-cache-control': fresh || !list.length ? 'no-store' : 'public, durable, s-maxage=300, stale-while-revalidate=3600'
    }
  });
};

export const config = { path: '/api/news' };
