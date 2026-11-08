// 聲讀 DAILY｜iPhone 桌面小工具（Scriptable 用）
// 安裝：App Store 下載 Scriptable → 新增腳本並貼上本檔 → 命名「聲讀」
//       → 主畫面長按 → 加入小工具 → Scriptable（中或大尺寸）→ 編輯小工具 → Script 選「聲讀」
// 點任一則標題：在 Scriptable 裡全螢幕打開聲讀播放器並準備朗讀該則；點右上「五分鐘快訊」：準備播報快訊。
// （iOS 不允許小工具直接打開「加到主畫面」的網頁 App，所以改在 Scriptable 裡全螢幕開啟同一個播放器。）
// 來源與編輯原則與網頁版相同：優先路透社、美聯社；英文翻譯為繁體中文；評論性標題不收；
// 情緒字眼改中性；戰爭、制裁、領土、人權議題標示「未經證實」。
// 若網站網址不同，請修改下一行。

const APP = 'https://ada868.netlify.app/';
const P = args.queryParameters || {};

// 播放器網址（embed=1：告訴網頁現在是在 Scriptable 裡開啟）
function page(params) {
  return APP + '?' + Object.entries(Object.assign({}, params, { embed: '1' })).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
}
// 點小工具 → 執行本腳本 → 在 Scriptable 裡全螢幕打開播放器
function openInScriptable(u) {
  return 'scriptable:///run/' + encodeURIComponent(Script.name()) + '?u=' + encodeURIComponent(u);
}
async function showPlayer(u) {
  if (!String(u).startsWith(APP)) u = page({}); // 只開自己的播放器
  const wv = new WebView();
  await wv.loadURL(u);
  await wv.present(true); // 全螢幕
}

const GN = (q, zh) => 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) +
  (zh ? '&hl=zh-TW&gl=TW&ceid=TW:zh-Hant' : '&hl=en-US&gl=US&ceid=US:en');
// 名稱、分級、分類、是否依內容分政治／經濟、網址、是否為 Google 新聞（只有標題）
const SOURCES = [
  ['路透社', 'main', '全球政治', true, GN('site:reuters.com/world when:2d'), true],
  ['美聯社', 'main', '全球政治', true, GN('site:apnews.com/article when:2d'), true],
  ['BBC', 'bg', '全球政治', true, 'https://feeds.bbci.co.uk/zhongwen/trad/rss.xml', false],
  ['聯合國', 'origin', '官方原始資料', false, 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', false],
  ['中央社', 'local', '台灣財經', false, 'https://feeds.feedburner.com/rsscna/finance', false]
];
const COLORS = { '全球政治': '#ffb4a2', '全球經濟': '#ffd88a', '官方原始資料': '#c9b6ff', '台灣財經': '#9fe0b4' };

// ---------- 編輯規則（與網頁版 rules.js 相同的精簡版） ----------
const OPINION = /^(opinion|analysis|commentary|editorial|column|op-ed|breakingviews)\s*[:\-|]|^【?(評論|社論|觀點|專欄|社評|投書)/i;
const JUDGE = /羞辱|徹底失敗|無法挽回|毀滅|應立刻|應立即|可恥|荒謬|活該|完蛋|\b(humiliat\w*|disgrace\w*|shameful|pathetic|outrageous)\b/i;
const SOFTEN = [
  [/(震驚|撼動)(全球|世界|國際|各界|全國|各國)/g, '引發$2關注'], [/令人震驚|大感震驚|深感震驚|感到震驚/g, '引發關注'], [/震驚/g, '關注'],
  [/大獲全勝|壓倒性勝利|大勝|完勝|狂勝/g, '獲勝'], [/慘敗|大敗|完敗|潰敗/g, '落敗'],
  [/痛批|怒批|狠批|猛批|狂批|嚴批|砲轟|炮轟|怒轟|抨擊|痛斥|怒斥|嗆聲|開嗆|怒嗆/g, '批評'],
  [/驚爆|驚傳/g, '傳出'], [/暴跌|崩跌|狂跌|血崩|崩盤/g, '大跌'], [/暴漲|狂飆|飆漲|噴漲/g, '大漲'], [/打臉/g, '反駁'], [/暴怒|震怒/g, '不滿']
];
const SENS = /戰爭|交火|空襲|轟炸|砲擊|飛彈|導彈|入侵|停火|人質|制裁|禁運|領土|主權|併吞|佔領|占領|人權|種族滅絕|酷刑|迫害|難民|\b(war|air ?strikes?|shelling|missiles?|invasion|troops|ceasefire|hostages?|sanctions?|embargo|territor\w+|sovereignty|annex\w*|occupied|human rights|genocide|torture|refugees?)\b/i;
const ECON = /經濟|通膨|利率|升息|降息|央行|聯準會|關稅|貿易|匯率|股市|油價|財政|衰退|國際貨幣基金|世界銀行|\b(econom\w*|inflation|tariffs?|gdp|interest rates?|central bank|imf|world bank|wto|stocks|oil prices?|recession)\b/i;
const soften = s => SOFTEN.reduce((t, [r, v]) => t.replace(r, v), String(s || ''));
const hasZh = s => /[\u4e00-\u9fff]/.test(s);

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
const text = raw => decode(decode(raw)); // 有些來源的摘要是「轉義過的 HTML」

async function fetchFeed([name, tier, cat, mixed, url, gn]) {
  try {
    const req = new Request(url);
    req.timeoutInterval = 10;
    const xml = await req.loadString();
    const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
    return items.slice(0, 6).map(it => {
      let title = text(tag(it, 'title'));
      if (gn) title = title.replace(/\s+[-–—|]\s+[^-–—|]{1,40}$/, '').trim(); // 去掉「 - Reuters」
      const summary = gn ? '' : text(tag(it, 'description')).slice(0, 200);
      const link = decode(tag(it, 'link') || tag(it, 'guid'));
      const time = Date.parse(decode(tag(it, 'pubDate') || tag(it, 'dc:date'))) || 0;
      return { title, summary, link, time, source: name, tier, cat, mixed };
    }).filter(a => a.title && /^https?:\/\//i.test(a.link) && !OPINION.test(a.title) && !JUDGE.test(a.title));
  } catch (e) {
    return [];
  }
}

// 英文 → 繁體中文（Google 翻譯免費介面；一次送多行，以換行對應）
async function translate(lines) {
  if (!lines.length) return [];
  try {
    const req = new Request('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=' +
      encodeURIComponent(lines.map(s => s.replace(/\n/g, ' ')).join('\n')));
    req.timeoutInterval = 12;
    const j = await req.loadJSON();
    const out = (j[0] || []).map(seg => (seg && seg[0]) || '').join('').split('\n').map(s => s.trim());
    return out.length === lines.length ? out : [];
  } catch (e) {
    return [];
  }
}

function deepLink(a) {
  const p = { a: a.link, t: a.title, s: a.summary, src: a.source, c: a.category, tier: a.tier, tm: String(a.time || '') };
  if (a.translated) { p.tr = '1'; p.o = a.titleOrig; }
  return openInScriptable(page(p));
}
function ago(t) {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 6e4);
  if (m < 60) return Math.max(m, 1) + ' 分鐘前';
  if (m < 1440) return Math.round(m / 60) + ' 小時前';
  return Math.round(m / 1440) + ' 天前';
}

// ---------- 取新聞、翻譯、套用規則，畫出小工具 ----------
async function buildWidget() {
const family = config.widgetFamily || 'large';
const count = { small: 1, medium: 3, large: 6, extraLarge: 8 }[family] || 6;
const lists = await Promise.all(SOURCES.map(fetchFeed));
// 依來源順序輪流取（路透社、美聯社優先），每家先取 2 則備用
const cand = [];
for (let r = 0; r < 4 && cand.length < count * 2; r++) for (const l of lists) if (l[r]) cand.push(l[r]);
const en = cand.filter(a => !hasZh(a.title));
const enLines = en.flatMap(a => a.summary ? [a.title, a.summary] : [a.title]);
const zh = await translate(enLines);
let k = 0;
for (const a of en) {
  a.titleOrig = a.title;
  a.title = zh[k++] || '';
  if (a.summary) a.summary = zh[k++] || '';
  a.translated = true;
}
const picks = cand.filter(a => a.title && !JUDGE.test(a.title)).slice(0, count).map(a => {
  a.title = soften(a.title);
  a.summary = soften(a.summary);
  a.category = a.mixed && ECON.test(a.title + ' ' + (a.titleOrig || '')) ? '全球經濟' : a.cat;
  a.sensitive = SENS.test(a.title + ' ' + a.summary + ' ' + (a.titleOrig || ''));
  return a;
});

// ---------- 畫小工具 ----------
const w = new ListWidget();
const g = new LinearGradient();
g.colors = [new Color('#363c46'), new Color('#262a31')];
g.locations = [0, 1];
w.backgroundGradient = g;
w.setPadding(14, 16, 14, 16);
w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
w.url = openInScriptable(page({}));

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
  brief.url = openInScriptable(page({ play: 'daily' }));
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
    const meta = s.addText(a.category + ' · ' + a.source + (a.sensitive ? ' · ⚠ 未經證實' : '') + (a.time ? ' · ' + ago(a.time) : ''));
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
return w;
}

// ---------- 執行 ----------
if (config.runsInApp && P.u) {
  await showPlayer(P.u); // 從小工具點進來：全螢幕播放器
} else {
  const w = await buildWidget();
  if (config.runsInWidget) Script.setWidget(w);
  else await w.presentLarge(); // 在 Scriptable 裡手動執行：預覽小工具
}
Script.complete();
