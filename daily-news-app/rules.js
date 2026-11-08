/* 聲讀 DAILY：新聞來源與編輯規則
   瀏覽器載入後成為 window.NewsRules；Node 測試可用 require('./rules.js')。
   這個檔案只做文字處理，不連網。

   編輯原則（自動套用）：
   1. 主要內文優先 Reuters、AP；BBC、NPR、半島電視台補充背景；
      聯合國、WHO、IMF、世界銀行、WTO、各國外交部為原始資料；路透社、法新社事實查核。
   2. 標題避免情緒字眼：「大勝、震驚、痛批」等改為中性用詞；「羞辱、徹底失敗」等評論性強的直接不收。
   3. 每則都標明消息來源，並自動比對其他來源的相關報導，方便交叉查證。
   4. 逐字稿依「發生了什麼、各方說法、下一步」整理，評論、社論、分析文章不收。
   5. 涉及戰爭、制裁、領土、人權者，朗讀前先提醒「未經獨立證實」。 */
(function (root) {
  'use strict';

  const CATS = ['全球政治', '全球經濟', '官方原始資料', '事實查核', '台灣財經', '科技'];
  const TIER = {
    main:   { label: '主要來源', w: 3, maxAgeH: 72 },
    bg:     { label: '補充背景', w: 2, maxAgeH: 72 },
    local:  { label: '中文來源', w: 1, maxAgeH: 72 },
    origin: { label: '原始資料', w: 2, maxAgeH: 24 * 7 },
    check:  { label: '事實查核', w: 1, maxAgeH: 24 * 21 }
  };
  const NEWS_TIERS = ['main', 'bg', 'local'];
  /* Google 新聞搜尋 RSS（Reuters、AP 已無公開 RSS，只能取得標題與連結） */
  const GN = (q, zh) => 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) +
    (zh ? '&hl=zh-TW&gl=TW&ceid=TW:zh-Hant' : '&hl=en-US&gl=US&ceid=US:en');

  /* url：主要網址；alt：主要網址失敗時的備援；gn：Google 新聞（只有標題）；mixed：依內容再分政治／經濟 */
  const SOURCES = [
    { id: 'reuters',     name: '路透社',         tier: 'main',   cat: '全球政治', mixed: true, gn: true, url: GN('site:reuters.com/world when:2d') },
    { id: 'reuters-biz', name: '路透社',         tier: 'main',   cat: '全球經濟', gn: true, url: GN('site:reuters.com/business when:2d') },
    { id: 'ap',          name: '美聯社',         tier: 'main',   cat: '全球政治', mixed: true, gn: true, url: GN('site:apnews.com/article when:2d') },
    { id: 'bbc',         name: 'BBC',            tier: 'bg',     cat: '全球政治', mixed: true, url: 'https://feeds.bbci.co.uk/zhongwen/trad/rss.xml' },
    { id: 'npr',         name: 'NPR',            tier: 'bg',     cat: '全球政治', mixed: true, url: 'https://feeds.npr.org/1004/rss.xml' },
    { id: 'aje',         name: '半島電視台',     tier: 'bg',     cat: '全球政治', mixed: true, url: 'https://www.aljazeera.com/xml/rss/all.xml' },
    { id: 'un',          name: '聯合國',         tier: 'origin', cat: '官方原始資料', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', alt: GN('site:news.un.org when:3d') },
    { id: 'who',         name: '世界衛生組織',   tier: 'origin', cat: '官方原始資料', url: 'https://www.who.int/rss-feeds/news-english.xml', alt: GN('site:who.int/news when:7d') },
    { id: 'imf',         name: '國際貨幣基金',   tier: 'origin', cat: '官方原始資料', gn: true, url: GN('site:imf.org/en/News when:7d') },
    { id: 'worldbank',   name: '世界銀行',       tier: 'origin', cat: '官方原始資料', gn: true, url: GN('site:worldbank.org/en/news when:7d') },
    { id: 'wto',         name: '世界貿易組織',   tier: 'origin', cat: '官方原始資料', url: 'https://www.wto.org/library/rss/latest_news_e.xml', alt: GN('site:wto.org when:7d') },
    { id: 'mofa-tw',     name: '我國外交部',     tier: 'origin', cat: '官方原始資料', gn: true, url: GN('site:mofa.gov.tw when:7d', true) },
    { id: 'state',       name: '美國國務院',     tier: 'origin', cat: '官方原始資料', gn: true, url: GN('site:state.gov when:7d') },
    { id: 'reuters-fc',  name: '路透社事實查核', tier: 'check',  cat: '事實查核', gn: true, url: GN('site:reuters.com/fact-check when:21d') },
    { id: 'afp-fc',      name: '法新社事實查核', tier: 'check',  cat: '事實查核', gn: true, url: GN('site:factcheck.afp.com when:21d') },
    { id: 'cna-fin',     name: '中央社',         tier: 'local',  cat: '台灣財經', url: 'https://feeds.feedburner.com/rsscna/finance', alt: GN('site:cna.com.tw/news/afe when:2d', true) },
    { id: 'technews',    name: '科技新報',       tier: 'local',  cat: '科技', url: 'https://technews.tw/feed/' }
  ];

  /* ---------- 小工具 ---------- */
  function hash(s) { let h = 5381; s = String(s || ''); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'h' + (h >>> 0).toString(36); }
  /* Google 新聞標題結尾固定加「 - 來源名稱」，去掉它 */
  function stripGnSuffix(t) { return String(t || '').replace(/\s+[-–—|]\s+[^-–—|]{1,40}$/, '').trim(); }
  const HAS_ZH = /[一-鿿]/;
  const SIMP = /[这们说时会发经过对为与动实现开关进应东门问间见长电车书业产学乐习报纸价钱银战军统总选举]/g;
  /* 'en' 英文、'zh-CN' 簡體（需轉繁體）、'zh' 繁體 */
  function langOf(s) { s = String(s || ''); if (!HAS_ZH.test(s)) return 'en'; const m = s.match(SIMP); return m && m.length >= 2 ? 'zh-CN' : 'zh'; }

  /* ---------- 原則 2、4：不收評論、情緒化內容 ---------- */
  const OPINION_URL = /\/(opinion|opinions|commentary|commentaries|editorial|editorials|analysis|breakingviews|blogs?|perspectives?|columns?|op-ed|letters)\//i;
  const OPINION_EN = /^(opinion|analysis|commentary|editorial|column|op-ed|breakingviews|view|letters?)\s*[:\-|]|\b(opinion|commentary|op-ed)\s*[:|]/i;
  const OPINION_ZH = /^【?(評論|社論|觀點|專欄|社評|投書|評析|專文|論壇)|[｜|【](評論|社論|觀點|專欄|社評|投書)/;
  const JUDGE_ZH = /羞辱|徹底失敗|無法挽回|毀滅|應立刻|應立即|必須立即|可恥|荒謬|活該|完蛋|滅亡|走狗|賣國|笑話|丟臉|無恥/;
  const JUDGE_EN = /\b(humiliat\w*|disgrace\w*|shameful|pathetic|outrageous|idiotic|must be stopped|should immediately)\b/i;
  function isOpinion(it) { const t = it.titleOrig || it.title || ''; return OPINION_URL.test(it.link || '') || OPINION_EN.test(t) || OPINION_ZH.test(t); }
  function isJudgmental(text) { return JUDGE_ZH.test(text || '') || JUDGE_EN.test(text || ''); }

  /* 溫和的情緒字眼改為中性用詞（長詞在前） */
  const SOFTEN = [
    [/(震驚|撼動)(全球|世界|國際|各界|全國|各國)/g, '引發$2關注'],
    [/令人震驚|讓人震驚|大感震驚|深感震驚|感到震驚/g, '引發關注'],
    [/震驚/g, '關注'],
    [/大獲全勝|壓倒性勝利|大勝|完勝|狂勝/g, '獲勝'],
    [/慘敗|大敗|完敗|潰敗/g, '落敗'],
    [/痛批|怒批|狠批|猛批|狂批|嚴批|砲轟|炮轟|怒轟|抨擊|痛斥|怒斥|嗆聲|開嗆|怒嗆/g, '批評'],
    [/驚爆|驚傳/g, '傳出'],
    [/暴跌|崩跌|狂跌|血崩|崩盤/g, '大跌'],
    [/暴漲|狂飆|飆漲|噴漲/g, '大漲'],
    [/打臉/g, '反駁'],
    [/暴怒|震怒/g, '不滿']
  ];
  function soften(s) { s = String(s || ''); for (const [r, t] of SOFTEN) s = s.replace(r, t); return s; }

  /* ---------- 原則 5：敏感議題 ---------- */
  const SENS = [
    ['戰爭', /戰爭|戰事|交火|空襲|轟炸|砲擊|炮擊|飛彈|導彈|入侵|軍事行動|陣亡|停火|武裝分子|武裝衝突|軍事衝突|人質|戰火|開戰|兵力|地面攻勢|無人機襲擊|無人機攻擊/,
      /\b(war|wars|warfare|air ?strikes?|shelling|missiles?|invasion|invad(e|es|ed|ing)|troops|ceasefire|truce|hostages?|militants?|armed conflict|military offensive|drone (strike|attack)s?|front ?line)\b/i],
    ['制裁', /制裁|禁運|出口管制|凍結資產/, /\b(sanction(s|ed|ing)?|embargo(es)?|export controls?|asset freeze)\b/i],
    ['領土', /領土|主權|併吞|兼併|邊界爭議|邊境爭端|爭議地區|佔領|占領|南海|台海|克里米亞/,
      /\b(territor(y|ial|ies)|sovereignty|annex(ation|ed|es|ing)?|border dispute|disputed (area|region|territory|islands?)|occupied|occupation)\b/i],
    ['人權', /人權|種族滅絕|種族清洗|酷刑|拘押|迫害|難民|強迫勞動|政治犯|處決|鎮壓/,
      /\b(human rights|genocide|ethnic cleansing|tortur(e|ed|ing)|detainees?|persecut\w*|refugees?|forced labou?r|political prisoners?|executions?|crackdown)\b/i]
  ];
  function sensitiveOf(zh, en) { zh = zh || ''; en = en || ''; return SENS.filter(([, rz, re]) => rz.test(zh) || re.test(en)).map(([k]) => k); }

  /* ---------- 分類 ---------- */
  const ECON_ZH = /經濟|通膨|通脹|物價|利率|升息|降息|央行|聯準會|關稅|貿易|貨幣|匯率|股市|債券|國債|油價|能源價格|供應鏈|財政|赤字|失業|就業|景氣|衰退|成長率|國內生產毛額|國際貨幣基金|世界銀行|世界貿易組織|經貿|出口|進口|投資|石油輸出國組織/;
  const ECON_EN = /\b(econom\w*|inflation|tariffs?|trade (deal|war|talks|deficit|surplus)|gdp|interest rates?|central bank|federal reserve|imf|world bank|wto|stock markets?|stocks|bond yields?|oil prices?|debt|budget|deficit|unemployment|recession|exports?|imports?|currency|opec)\b/i;
  function classify(it) {
    if (!it.mixed) return it.defCat;
    return ECON_ZH.test(it.title || '') || ECON_EN.test(it.lang === 'en' || it.sl === 'en' ? it.titleOrig || '' : '') ? '全球經濟' : it.defCat;
  }

  /* ---------- 原則 3：比對不同來源的相關報導 ---------- */
  function norm(s) { return String(s || '').replace(/[^一-鿿A-Za-z0-9]/g, ''); }
  function bigrams(s) { const t = norm(s), out = new Set(); for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2)); return out; }
  /* 共同詞的先後順序要一致，避免「甲攻擊乙」和「乙攻擊甲」被當成同一件事 */
  function orderAgree(a, b, shared) {
    const sa = norm(a), sb = norm(b), pa = shared.map(x => sa.indexOf(x)), pb = shared.map(x => sb.indexOf(x));
    let c = 0, d = 0;
    for (let i = 0; i < shared.length; i++) for (let j = i + 1; j < shared.length; j++) {
      const s = Math.sign(pa[i] - pa[j]) * Math.sign(pb[i] - pb[j]);
      if (s > 0) c++; else if (s < 0) d++;
    }
    return c + d ? (c - d) / (c + d) : 1;
  }
  /* 0：不同事件；1：相關報導；2：高度相同（可引用對方摘要） */
  function sameStory(a, b) {
    if (a.time && b.time && Math.abs(a.time - b.time) > 48 * 3600e3) return 0;
    const A = bigrams(a.title), B = bigrams(b.title), shared = [...A].filter(x => B.has(x));
    if (shared.length < 5) return 0;
    const jac = shared.length / (A.size + B.size - shared.length);
    if (jac < 0.4 || orderAgree(a.title, b.title, shared) < 0.3) return 0;
    return jac >= 0.55 ? 2 : 1;
  }
  const ref = (m, lvl) => ({ source: m.source, link: m.link, title: m.title, tier: m.tier, match: lvl });
  /* 新聞來源之間合併成同一則；官方發布與事實查核保持獨立，只互相列為相關報導 */
  function cluster(items) {
    const news = items.filter(x => NEWS_TIERS.includes(x.tier))
      .sort((a, b) => TIER[b.tier].w - TIER[a.tier].w || (b.summary ? 1 : 0) - (a.summary ? 1 : 0) || b.time - a.time);
    const groups = [];
    for (const it of news) {
      let best = null, lvl = 0;
      for (const g of groups) { const l = sameStory(g.rep, it); if (l > lvl) { lvl = l; best = g; } }
      if (best) { if (best.rep.source !== it.source && !best.members.some(m => m.source === it.source)) best.members.push(Object.assign({ match: lvl }, it)); }
      else groups.push({ rep: it, members: [] });
    }
    const reps = groups.map(g => {
      const rep = Object.assign({}, g.rep, { related: g.members.map(m => ref(m, m.match)) });
      if (!rep.summary) { const m = g.members.find(x => x.match === 2 && x.summary); if (m) { rep.summary = m.summary; rep.summaryFrom = m.source; } }
      return rep;
    });
    const others = items.filter(x => !NEWS_TIERS.includes(x.tier)).map(o => Object.assign({}, o, { related: [] }));
    for (const o of others) for (const r of reps) {
      const l = sameStory(r, o);
      if (l) { o.related.push(ref(r, l)); r.related.push(ref(o, l)); }
    }
    return reps.concat(others);
  }

  /* 排序：主要來源、多家來源、較新者優先 */
  function score(a, now) { const ageH = a.time ? (now - a.time) / 3600e3 : 48; return TIER[a.tier].w + (a.related && a.related.length ? 2 : 0) + 2 * Math.max(0, 1 - ageH / 48); }
  function rank(items, now) { now = now || Date.now(); return items.slice().sort((a, b) => score(b, now) - score(a, now) || b.time - a.time); }

  /* ---------- 原則 4：逐字稿結構 ---------- */
  function splitSentences(t) {
    const out = [];
    (String(t || '').match(/[^。！？!?；;]+[。！？!?；;]?/g) || []).forEach(s => {
      s = s.trim(); if (!s) return;
      if (s.length <= 70) { out.push(s); return; }
      let buf = ''; (s.match(/[^，、,]+[，、,]?/g) || [s]).forEach(p => { if ((buf + p).length > 60 && buf) { out.push(buf); buf = p; } else buf += p; }); if (buf) out.push(buf);
    });
    return out;
  }
  const NEXT_RE = /預計|預期|計畫|計劃|下一步|後續|即將|將於|將在|將會|將舉行|將召開|將進行|將討論|將表決|可能會|有望|擬於|下週|下周|下個月|明年/;
  const SAID_RE = /表示|指出|說|稱|聲明|強調|呼籲|批評|回應|否認|認為|警告|透露|證實|發言人/;
  const end = s => String(s || '').replace(/[。．.！!？?\s]+$/, '');
  function joinNames(list) { return list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join('、') + '及' + list[list.length - 1]; }
  function buildScript(a) {
    const L = [], sens = a.sensitive || [];
    if (sens.length) L.push(`提醒：本則涉及${sens.join('、')}議題，部分內容來自當事方說法，未經獨立證實。`);
    if (a.tier === 'check') L.push('以下是事實查核報導。');
    L.push(`發生了什麼：${end(a.title)}。`);
    const what = [], said = [], next = [];
    splitSentences(a.summary).forEach(s => (NEXT_RE.test(s) ? next : SAID_RE.test(s) ? said : what).push(s));
    const from = a.summaryFrom || a.source;
    const official = a.tier === 'origin' && !a.summaryFrom;
    if (what.length) what.forEach((s, i) => L.push(i ? s : (official ? `${from}指出：` : `據${from}報導：`) + s));
    else if (said.length || next.length) L.push(official ? `以下為${from}發布的內容。` : `以下據${from}報導。`);
    said.forEach((s, i) => L.push(i ? s : '各方說法：' + s));
    next.forEach((s, i) => L.push(i ? s : '下一步：' + s));
    const others = [...new Set((a.related || []).map(r => r.source))].filter(n => n !== a.source);
    const how = a.translated ? '（英文報導，機器翻譯）' : a.converted ? '（簡體中文，已轉為繁體）' : '';
    let src;
    if (a.tier === 'origin') src = `以上為${a.source}的官方發布${how}，代表該機構立場。`;
    else if (a.tier === 'check') src = `以上為${a.source}的查核報導${how}。`;
    else src = `消息來源：${a.source}${how}。`;
    if (others.length) src += `另有${joinNames(others)}的相關報導，可交叉查證。`;
    else if (NEWS_TIERS.includes(a.tier)) src += '目前僅見單一來源，以上為該媒體的報導內容。';
    if (!a.summary) src += '此來源僅提供標題，詳細內容請見原文。';
    L.push(src);
    return L;
  }

  /* ---------- 翻譯服務回應解析 ---------- */
  /* translate_a/single?client=gtx：[[["譯文","原文",...],...],...]，換行會保留在譯文中 */
  function parseGtx(j) { return Array.isArray(j) && Array.isArray(j[0]) ? j[0].map(seg => (seg && seg[0]) || '').join('') : ''; }

  const api = { CATS, TIER, SOURCES, NEWS_TIERS, GN, hash, stripGnSuffix, langOf, isOpinion, isJudgmental, soften, sensitiveOf, classify,
    bigrams, sameStory, cluster, rank, splitSentences, buildScript, parseGtx };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NewsRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
