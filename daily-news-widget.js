// 聲讀 DAILY｜iPhone 桌面小工具（Scriptable 用）
// 安裝：App Store 下載 Scriptable → 新增腳本並貼上本檔 → 命名「聲讀」
//       → 主畫面長按 → 加入小工具 → Scriptable（中或大尺寸）→ 編輯小工具 → Script 選「聲讀」
// 點任一則標題：用 Safari 打開聲讀播放器並準備朗讀該則；點右上「五分鐘快訊」：準備播報快訊。
// 若網站網址不同，請修改下一行。

const APP = 'https://edgd2619.com/daily-news.html';

// [來源, 預設分類, RSS 網址, 是否綜合來源（以關鍵字再分類）]
const SOURCES = [
  ['BBC 中文', '全球政治', 'https://feeds.bbci.co.uk/zhongwen/trad/rss.xml', true],
  ['德國之聲', '全球政治', 'https://rss.dw.com/rdf/rss-chi-all', true],
  ['中央社國際', '全球政治', 'https://www.cna.com.tw/rss/intworld.xml', true],
  ['自由時報國際', '全球政治', 'https://news.ltn.com.tw/rss/world.xml', true],
  ['中央社財經', '財經', 'https://www.cna.com.tw/rss/finance.xml', false],
  ['科技新報', '科技', 'https://technews.tw/feed/', false]
];
const ECON = /經濟|通膨|通脹|物價|利率|升息|降息|央行|聯準會|關稅|貿易|貨幣|匯率|股市|債|油價|能源|供應鏈|財政|赤字|失業|就業|景氣|衰退|GDP|IMF|世界銀行|經貿|出口|進口|投資|銀行|OPEC/i;
const COLORS = { '全球政治': '#ffb4a2', '全球經濟': '#ffd88a', '財經': '#9fe0b4', '科技': '#9cc9ff' };
const ORDER = ['全球政治', '全球經濟', '財經', '科技'];

function decode(s) {
  return (s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}
function tag(xml, name) {
  const m = xml.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i'));
  return m ? m[1] : '';
}
// 第二次 decode：有些來源的摘要是「HTML 轉義後的 HTML」
function text(raw) { return decode(decode(raw)); }

async function fetchFeed([source, def, url, mixed]) {
  try {
    const req = new Request(url);
    req.timeoutInterval = 10;
    const xml = await req.loadString();
    const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
    return items.slice(0, 8).map(it => {
      const title = text(tag(it, 'title'));
      const summary = text(tag(it, 'description')).slice(0, 150);
      const link = decode(tag(it, 'link') || tag(it, 'guid'));
      const time = Date.parse(decode(tag(it, 'pubDate') || tag(it, 'dc:date'))) || 0;
      let category = def;
      if (mixed && def === '全球政治' && ECON.test(title)) category = '全球經濟';
      return { title, summary, link, time, source, category };
    }).filter(a => a.title && /^https?:\/\//i.test(a.link));
  } catch (e) {
    return [];
  }
}

function deepLink(a) {
  const p = { a: a.link, t: a.title, s: a.summary, src: a.source, c: a.category, tm: String(a.time || '') };
  return APP + '?' + Object.entries(p).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
}
function ago(t) {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 6e4);
  if (m < 60) return Math.max(m, 1) + ' 分鐘前';
  if (m < 1440) return Math.round(m / 60) + ' 小時前';
  return Math.round(m / 1440) + ' 天前';
}

// ---------- 取新聞並平均分配各類 ----------
const lists = await Promise.all(SOURCES.map(fetchFeed));
const seen = new Set();
const all = lists.flat()
  .filter(a => !seen.has(a.link) && seen.add(a.link))
  .sort((a, b) => b.time - a.time);
const family = config.widgetFamily || 'large';
const count = { small: 1, medium: 3, large: 6, extraLarge: 8 }[family] || 6;
const pools = ORDER.map(c => all.filter(a => a.category === c));
const picks = [];
for (let r = 0; picks.length < count && r < 10; r++) {
  for (const pool of pools) if (pool[r] && picks.length < count) picks.push(pool[r]);
}

// ---------- 畫小工具 ----------
const w = new ListWidget();
const g = new LinearGradient();
g.colors = [new Color('#363c46'), new Color('#262a31')];
g.locations = [0, 1];
w.backgroundGradient = g;
w.setPadding(14, 16, 14, 16);
w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
w.url = APP;

const head = w.addStack();
head.centerAlignContent();
const brand = head.addText('聲讀 DAILY');
brand.font = Font.boldSystemFont(13);
brand.textColor = Color.white();
head.addSpacer();
if (family !== 'small') {
  const brief = head.addText('▶ 五分鐘快訊');
  brief.font = Font.semiboldSystemFont(12);
  brief.textColor = new Color('#9fd3e6');
  brief.url = APP + '?play=daily';
}
w.addSpacer(8);

if (!picks.length) {
  const t = w.addText('暫時無法取得新聞，點此打開播放器。');
  t.font = Font.systemFont(13);
  t.textColor = new Color('#c5cbd0');
} else {
  picks.forEach((a, i) => {
    const s = w.addStack();
    s.layoutVertically();
    s.url = deepLink(a); // 中、大尺寸：每則可分別點擊
    const meta = s.addText(a.category + ' · ' + a.source + (a.time ? ' · ' + ago(a.time) : ''));
    meta.font = Font.mediumSystemFont(10);
    meta.textColor = new Color(COLORS[a.category] || '#c5cbd0');
    const t = s.addText(a.title);
    t.font = Font.semiboldSystemFont(family === 'small' ? 14 : 13);
    t.textColor = Color.white();
    t.lineLimit = family === 'small' ? 4 : 2;
    if (i < picks.length - 1) w.addSpacer(7);
  });
  if (family === 'small') w.url = deepLink(picks[0]); // 小尺寸只能整塊點擊
}
w.addSpacer();

if (config.runsInWidget) {
  Script.setWidget(w);
} else {
  await w.presentLarge();
}
Script.complete();
