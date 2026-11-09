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

  const CATS = ['全球政治', '全球經濟', '全球科技', '對台灣的影響'];
  const PER_CAT = 5; /* 每個板塊只取最重要的 5 則 */
  const TIER = {
    main:   { label: '主要來源', w: 3, maxAgeH: 72 },
    bg:     { label: '補充背景', w: 2, maxAgeH: 72 },
    local:  { label: '中文來源', w: 1.5, maxAgeH: 72 },
    origin: { label: '原始資料', w: 2, maxAgeH: 24 * 7 },
    check:  { label: '事實查核', w: 1, maxAgeH: 24 * 21 }
  };
  const NEWS_TIERS = ['main', 'bg', 'local'];
  /* Google 新聞搜尋 RSS（Reuters、AP 已無公開 RSS，只能取得標題與連結） */
  const GN = (q, zh) => 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) +
    (zh ? '&hl=zh-TW&gl=TW&ceid=TW:zh-Hant' : '&hl=en-US&gl=US&ceid=US:en');

  /* 天氣、意外等與國際情勢無關的新聞不收 */
  const WEATHER = /颱風|地震|豪雨|大雨|天氣|氣溫|寒流|冷氣團|鋒面|車禍|火警|火災|停水|停電|登革熱|流感/;
  /* url：主要網址；alt：失敗時的備援；gn：Google 新聞（只有標題，只用來交叉查證）；mixed：依內容再分板塊；exclude：不收的標題 */
  const SOURCES = [
    /* 有內文的來源：逐字稿的內容來自這些 */
    { id: 'bbc',          name: 'BBC',          tier: 'bg',     cat: '全球政治', mixed: true, url: 'https://feeds.bbci.co.uk/zhongwen/trad/rss.xml' },
    { id: 'cna-world',    name: '中央社',       tier: 'local',  cat: '全球政治', mixed: true, url: 'https://feeds.feedburner.com/rsscna/intworld', exclude: WEATHER },
    { id: 'cna-fin',      name: '中央社',       tier: 'local',  cat: '全球經濟', mixed: true, url: 'https://feeds.feedburner.com/rsscna/finance', exclude: WEATHER },
    { id: 'npr-world',    name: 'NPR',          tier: 'bg',     cat: '全球政治', mixed: true, url: 'https://feeds.npr.org/1004/rss.xml' },
    { id: 'npr-biz',      name: 'NPR',          tier: 'bg',     cat: '全球經濟', mixed: true, url: 'https://feeds.npr.org/1006/rss.xml' },
    { id: 'npr-tech',     name: 'NPR',          tier: 'bg',     cat: '全球科技', mixed: true, url: 'https://feeds.npr.org/1019/rss.xml' },
    { id: 'aje',          name: '半島電視台',   tier: 'bg',     cat: '全球政治', mixed: true, url: 'https://www.aljazeera.com/xml/rss/all.xml' },
    { id: 'france24',     name: '法國24',       tier: 'bg',     cat: '全球政治', mixed: true, url: 'https://www.france24.com/en/rss' },
    { id: 'dw',           name: '德國之聲',     tier: 'bg',     cat: '全球政治', mixed: true, url: 'https://rss.dw.com/rdf/rss-chi-all' },
    { id: 'un',           name: '聯合國',       tier: 'origin', cat: '全球政治', mixed: true, url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' },
    { id: 'un-econ',      name: '聯合國',       tier: 'origin', cat: '全球經濟', mixed: true, url: 'https://news.un.org/feed/subscribe/en/news/topic/economic-development/feed/rss.xml' },
    { id: 'technews',     name: '科技新報',     tier: 'local',  cat: '全球科技', mixed: true, url: 'https://technews.tw/feed/' },
    { id: 'pts',          name: '公視新聞',     tier: 'local',  cat: '對台灣的影響', url: 'https://news.pts.org.tw/xml/newsfeed.xml', exclude: WEATHER },
    /* 只有標題：不單獨播報，用來交叉查證，並讓多家都報導的新聞排得更前面 */
    { id: 'reuters',      name: '路透社',       tier: 'main',   cat: '全球政治', mixed: true, gn: true, url: GN('site:reuters.com/world when:2d') },
    { id: 'reuters-biz',  name: '路透社',       tier: 'main',   cat: '全球經濟', mixed: true, gn: true, url: GN('site:reuters.com/business when:2d') },
    { id: 'reuters-tech', name: '路透社',       tier: 'main',   cat: '全球科技', mixed: true, gn: true, url: GN('site:reuters.com/technology when:2d') },
    { id: 'reuters-tw',   name: '路透社',       tier: 'main',   cat: '對台灣的影響', gn: true, url: GN('site:reuters.com Taiwan when:3d') },
    { id: 'ap',           name: '美聯社',       tier: 'main',   cat: '全球政治', mixed: true, gn: true, url: GN('site:apnews.com/article when:2d') },
    { id: 'cna-tw',       name: '中央社',       tier: 'local',  cat: '對台灣的影響', gn: true, url: GN('site:cna.com.tw (影響 OR 衝擊) when:2d', true), exclude: WEATHER }
  ];

  /* ---------- 小工具 ---------- */
  function hash(s) { let h = 5381; s = String(s || ''); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'h' + (h >>> 0).toString(36); }
  /* Google 新聞標題結尾固定加「 - 來源名稱」，去掉它 */
  function stripGnSuffix(t) { return String(t || '').replace(/\s+[-–—|]\s+[^-–—|]{1,40}$/, '').trim(); }
  const HAS_ZH = /[\u4e00-\u9fff]/;
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

  /* ---------- 分類（四大板塊） ----------
     標題提到台灣 → 對台灣的影響；其他依內容分全球科技、全球經濟、全球政治 */
  const TW_ZH = /台灣|臺灣|台海|兩岸|對台|台美|美台|台日|台歐|國台辦|台積電|台股|新台幣|行政院|立法院|經濟部|金管會|主計總處|國發會|國防部|陸委會/;
  /* 在地來源歸到「對台灣的影響」時，需與國際情勢有關（排除純國內新聞） */
  const GLOBAL = /美國|美方|中國|大陸|中共|北京|日本|韓國|歐盟|歐洲|俄羅斯|烏克蘭|中東|關稅|出口|進口|外銷|國際|全球|世界|聯準會|美股|美元|半導體|晶片|供應鏈|兩岸|外交|美中|川普|國防|軍演|制裁|地緣|戰爭|台積電/;
  const TW_EN = /\b(Taiwan|Taiwanese|Taipei|TSMC)\b/i;
  const TECH_ZH = /科技|晶片|半導體|人工智慧|輝達|蘋果|谷歌|微軟|特斯拉|手機|電動車|太空|衛星|資安|網路攻擊|駭客|演算法|機器人|量子|雲端|軟體|社群媒體|抖音|AI|OpenAI|Google|Meta|TikTok/;
  const TECH_EN = /\b(tech|technology|chips?|chipmakers?|semiconductors?|AI|artificial intelligence|Nvidia|Apple|Google|Alphabet|Microsoft|Meta|OpenAI|Tesla|smartphones?|electric vehicles?|EVs?|satellites?|space|cyber\w*|hack\w*|robot\w*|quantum|cloud|software|TikTok|social media)\b/i;
  const ECON_ZH = /經濟|通膨|通脹|物價|利率|升息|降息|央行|聯準會|關稅|貿易|貨幣|匯率|股市|債券|國債|油價|能源價格|供應鏈|財政|赤字|失業|就業|景氣|衰退|成長率|國內生產毛額|國際貨幣基金|世界銀行|世界貿易組織|經貿|出口|進口|投資|石油輸出國組織/;
  const ECON_EN = /\b(econom\w*|inflation|tariffs?|trade (deal|war|talks|deficit|surplus)|gdp|interest rates?|central bank|federal reserve|imf|world bank|wto|stock markets?|stocks|bond yields?|oil prices?|debt|budget|deficit|unemployment|recession|exports?|imports?|currency|opec)\b/i;
  function classify(it) {
    const en = it.sl === 'en' ? it.titleOrig || '' : '';
    if (it.defCat === '對台灣的影響' || TW_ZH.test(it.title || '') || TW_EN.test(en)) return '對台灣的影響';
    if (!it.mixed) return it.defCat;
    if (TECH_ZH.test(it.title || '') || TECH_EN.test(en)) return '全球科技';
    if (ECON_ZH.test(it.title || '') || ECON_EN.test(en)) return '全球經濟';
    return it.defCat;
  }

  /* ---------- 原則 3：比對不同來源的相關報導 ---------- */
  function norm(s) { return String(s || '').replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, ''); }
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
      .sort((a, b) => (b.summary ? 1 : 0) - (a.summary ? 1 : 0) || TIER[b.tier].w - TIER[a.tier].w || b.time - a.time);
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
  const IMPACT = /影響|衝擊|波及|受惠|關稅|出口|供應鏈|半導體|晶片|美中|制裁|軍演|國防|外交|安全/;
  function score(a, now) {
    const ageH = a.time ? (now - a.time) / 3600e3 : 48, rel = a.related || [];
    const others = new Set(rel.map(r => r.source)).size, wire = rel.some(r => r.tier === 'main');
    return TIER[a.tier].w + Math.min(3, others * 1.5) + (wire ? 1.5 : 0) + 2 * Math.max(0, 1 - ageH / 36) + (a.category === '對台灣的影響' && IMPACT.test(a.title || '') ? 1 : 0);
  }
  function rank(items, now) { now = now || Date.now(); return items.slice().sort((a, b) => score(b, now) - score(a, now) || b.time - a.time); }
  /* 依四大板塊順序，各取前 n 則 */
  function topPerCat(list, n) { const out = []; CATS.forEach(c => out.push(...list.filter(a => a.category === c).slice(0, n || PER_CAT))); return out; }

  /* ---------- 原則 4：逐字稿結構 ----------
     段落：發生了什麼 → 各方說法 → 下一步 → 消息來源。段落標題只顯示、不朗讀，讀起來才連貫。
     只在句號、問號、驚嘆號處斷句（超過 120 字的長句才在逗號處分開）。 */
  function splitSentences(t) {
    const out = [];
    (String(t || '').match(/[^。！？!?；;]+(?:[。！？!?；;]+[」』”’）)]*)?/g) || []).forEach(s => {
      s = s.trim(); if (!s) return;
      if (s.length <= 120) { out.push(s); return; }
      let buf = ''; (s.match(/[^，,]+[，,]?/g) || [s]).forEach(p => { if ((buf + p).length > 100 && buf) { out.push(buf); buf = p; } else buf += p; }); if (buf) out.push(buf);
    });
    return out;
  }
  const NEXT_RE = /預計|預期|計畫|計劃|下一步|後續|即將|將於|將在|將會|將舉行|將召開|將進行|將討論|將表決|可能會|有望|擬於|下週|下周|下個月|明年/;
  const SAID_RE = /表示|指出|說|稱|聲明|強調|呼籲|批評|回應|否認|認為|警告|透露|證實|發言人/;
  const end = s => String(s || '').replace(/[。．.！!？?\s]+$/, '');
  function joinNames(list) { return list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join('、') + '及' + list[list.length - 1]; }
  /* 回傳 { paras: [{kind, label, sents}], notes: [只顯示不朗讀的說明] } */
  function buildScript(a) {
    const sens = a.sensitive || [], paras = [], notes = [];
    if (a.intro) paras.push({ kind: 'intro', label: '', sents: [a.intro] });
    if (sens.length) paras.push({ kind: 'notice', label: '', sents: [`提醒：本則涉及${sens.join('、')}，部分說法未經獨立證實。`] });
    const what = [], said = [], next = [];
    splitSentences(a.summary).forEach(s => (NEXT_RE.test(s) ? next : SAID_RE.test(s) ? said : what).push(s));
    const t = end(a.title);
    paras.push({ kind: 'what', label: '發生了什麼', sents: [a.tier === 'check' && !/^事實查核/.test(t) ? `事實查核：${t}。` : `${t}。`].concat(what) });
    if (said.length) paras.push({ kind: 'said', label: '各方說法', sents: said });
    if (next.length) paras.push({ kind: 'next', label: '下一步', sents: next });
    /* 來源只顯示在畫面上（來源名稱與原文連結），不朗讀 */
    if (a.translated) notes.push('英文報導經機器翻譯，用詞以原文為準');
    if (a.converted) notes.push('簡體中文已轉為繁體');
    if (a.titleOrig && a.titleOrig !== a.title) notes.push((a.translated ? '原文標題：' : '原標題：') + a.titleOrig);
    if (!a.summary) notes.push('此來源只提供標題，詳細內容請點原文');
    return { paras, notes };
  }

  /* ---------- 翻譯服務回應解析 ---------- */
  /* translate_a/single?client=gtx：[[["譯文","原文",...],...],...]，換行會保留在譯文中 */
  function parseGtx(j) { return Array.isArray(j) && Array.isArray(j[0]) ? j[0].map(seg => (seg && seg[0]) || '').join('') : ''; }

  /* ---------- RSS 解析與整理（瀏覽器、伺服器共用，不依賴 DOM） ---------- */
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  function decodeEntities(s) {
    return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n ? String.fromCodePoint(n) : m; }
      const v = ENT[e.toLowerCase()]; return v === undefined ? m : v;
    });
  }
  const unCdata = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  /* HTML → 純文字（有些來源的摘要是「轉義過的 HTML」，所以解碼兩次） */
  function cleanText(s) {
    s = decodeEntities(unCdata(s)).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
    return decodeEntities(s).replace(/\s+/g, ' ').trim();
  }
  function xmlTag(b, name) { const m = b.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i')); return m ? unCdata(m[1]) : ''; }
  function xmlAttr(b, name, attr) { const m = b.match(new RegExp('<' + name + '\\s[^>]*?' + attr + '=["\']([^"\']+)["\']', 'i')); return m ? m[1] : ''; }
  function parseFeed(xml) {
    return (String(xml || '').match(/<item[\s>][\s\S]*?<\/item>/gi) || []).map(b => {
      let img = xmlAttr(b, 'media:thumbnail', 'url') || xmlAttr(b, 'media:content', 'url');
      const enc = b.match(/<enclosure\s[^>]*>/i);
      if (!img && enc && /type=["']image\//i.test(enc[0])) img = (enc[0].match(/url=["']([^"']+)["']/i) || [])[1] || '';
      return { title: xmlTag(b, 'title'), description: xmlTag(b, 'description') || xmlTag(b, 'content:encoded'), content: xmlTag(b, 'content:encoded'),
        link: decodeEntities(xmlTag(b, 'link') || xmlTag(b, 'guid')).trim(), pubDate: xmlTag(b, 'pubDate') || xmlTag(b, 'dc:date'), thumbnail: decodeEntities(img) };
    });
  }
  function parseDate(s) {
    s = String(s || '').trim(); if (!s) return 0;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) s = s.replace(' ', 'T') + 'Z'; /* rss2json 格式（UTC）；Safari 無法直接解析 */
    const t = Date.parse(s); return isNaN(t) ? 0 : t;
  }
  function pickImg(i) {
    const enc = i.enclosure || {};
    let u = i.thumbnail || ((/^image\//i.test(enc.type || '') || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(enc.link || '')) ? enc.link : '') || '';
    if (!u) { const m = /<img[^>]+src=["']([^"']+)["']/i.exec(decodeEntities((i.description || '') + (i.content || ''))); if (m) u = m[1]; }
    u = String(u || '').replace(/&amp;/g, '&').trim();
    if (/^\/\//.test(u)) u = 'https:' + u;
    if (/^http:\/\//i.test(u)) u = 'https://' + u.slice(7); /* 避免 http 圖片被擋 */
    return /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : '';
  }
  const bare = x => String(x || '').replace(/[^\p{L}\p{N}]/gu, '');
  const BOILER = [/The post .*? appeared first on .*$/i, /Continue reading.*$/i, /Read more.*$/i, /閱讀全文.*$/, /\[(…|\.\.\.)\]/g, /^（中央社[^）]{0,40}）/, /^\(?(AP|Reuters|AFP)\)?\s*[—–-]\s*/];
  function trimSummary(t, max) {
    t = BOILER.reduce((s, r) => s.replace(r, ''), String(t || '')).replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const parts = t.match(/[^。！？!?.]+(?:[。！？!?.]+["」』”’）)]*)?\s*/g) || [t];
    let out = '';
    for (const p of parts) { if ((out + p).length > max) break; out += p; }
    return (out || t.slice(0, max)).trim();
  }
  /* 描述與全文擇一：全文明顯較長時用全文的前段 */
  function pickSummary(desc, full, zh) {
    const max = zh ? 900 : 1500;
    const d = trimSummary(desc, max), f = trimSummary(full, max);
    return f.length > d.length + 40 ? f : d;
  }
  /* 單一來源的 RSS 項目 → 待翻譯的新聞資料（太舊、評論文章不收） */
  function normalize(src, items, gn, now) {
    now = now || Date.now();
    const maxAge = TIER[src.tier].maxAgeH * 3600e3, out = [];
    for (const i of (items || []).slice(0, 10)) {
      let title = cleanText(i.title), summary = '';
      if (!gn) { const desc = cleanText(i.description), full = cleanText(i.content); summary = pickSummary(desc || full, full, HAS_ZH.test(title)); }
      const link = String(i.link || i.guid || '').trim();
      if (gn) title = stripGnSuffix(title);
      if (!title || !/^https?:\/\//i.test(link)) continue;
      if (summary && bare(title) && bare(summary).startsWith(bare(title))) summary = ''; /* 摘要只是重複標題 */
      const time = parseDate(i.pubDate);
      if (time && now - time > maxAge) continue;
      const it = { titleOrig: title, summaryOrig: summary, link, img: gn ? '' : pickImg(i), time, source: src.name, sourceId: src.id, tier: src.tier, defCat: src.cat, mixed: !!src.mixed };
      if (isOpinion(it) || (src.exclude && src.exclude.test(title))) continue; /* 評論、社論、分析不收；天氣災害等不收 */
      it.sl = langOf(title + ' ' + summary);
      out.push(it);
    }
    return out;
  }

  /* ---------- 從文章網頁擷取內文段落（伺服器用；RSS 摘要太短時補足） ---------- */
  const JUNK = /(copyright|all rights reserved|subscribe|sign up|newsletter|cookie|advertisement|follow us|read more|privacy policy|terms of use|版權所有|訂閱|廣告|延伸閱讀|相關新聞|責任編輯|加入.*好友|點擊|下載.*App)/i;
  function extractArticleText(html, zh) {
    html = String(html || '').replace(/<(script|style|noscript|nav|header|footer|aside|form|figure|figcaption)[\s\S]*?<\/\1>/gi, ' ');
    const art = html.match(/<article[\s\S]*?<\/article>/i);
    const scope = art ? art[0] : (html.match(/<main[\s\S]*?<\/main>/i) || [html])[0];
    const minLen = zh ? 22 : 55, out = [];
    for (const m of scope.matchAll(/<p[\s>][\s\S]*?<\/p>/gi)) {
      const t = cleanText(m[0]);
      if (t.length >= minLen && !JUNK.test(t) && !out.includes(t)) out.push(t);
    }
    let text = out.join(' ');
    if (text.length < 120) { /* 找不到段落時退而用網頁摘要 */
      const og = html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:description|description)["']/i);
      if (og) text = cleanText(og[1]);
    }
    return trimSummary(text, zh ? 900 : 1500);
  }

  /* ---------- 翻譯工作 ---------- */
  const trKey = (sl, t) => hash(sl + '|' + t);
  function translationJobs(raw) {
    const jobs = [];
    raw.forEach(x => { if (x.sl !== 'zh') { jobs.push({ sl: x.sl, text: x.titleOrig }); if (x.summaryOrig) jobs.push({ sl: x.sl, text: x.summaryOrig }); } });
    return jobs;
  }
  /* 依語言分組、每組約 maxLen 字一批；have(sl, text) 為真者略過 */
  function chunkJobs(jobs, have, maxLen) {
    const groups = {};
    jobs.forEach(j => { if (j.text && !have(j.sl, j.text)) (groups[j.sl] = groups[j.sl] || new Set()).add(j.text); });
    const chunks = [];
    for (const sl in groups) {
      let cur = [], len = 0;
      for (const t of groups[sl]) { if (len + t.length > maxLen && cur.length) { chunks.push([sl, cur]); cur = []; len = 0; } cur.push(t); len += t.length + 1; }
      if (cur.length) chunks.push([sl, cur]);
    }
    return chunks;
  }
  const gtxURL = (sl, lines) => 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' + sl + '&tl=zh-TW&dt=t&q=' +
    encodeURIComponent(lines.map(s => String(s).replace(/\s*\n\s*/g, ' ')).join('\n'));
  function gtxLines(json, n) { const out = parseGtx(json).split('\n').map(s => s.trim()); return out.length === n && out.every(Boolean) ? out : null; }

  /* 套用編輯規則：翻譯 → 排除評論性強內容 → 中性化 → 敏感議題 → 分類 → 相關報導 → 排序
     lookup(sl, text) 回傳譯文；沒有譯文的英文新聞不列出 */
  function finalize(raw, lookup) {
    const list = []; let untranslated = 0, judged = 0;
    for (const it of raw) {
      const tr = it.sl !== 'zh', tz = tr ? lookup(it.sl, it.titleOrig) : it.titleOrig;
      if (!tz) { untranslated++; continue; }
      const sz = it.summaryOrig ? (tr ? lookup(it.sl, it.summaryOrig) || '' : it.summaryOrig) : '';
      if (isJudgmental(tz + ' ' + it.titleOrig)) { judged++; continue; }
      const a = Object.assign({}, it, { title: soften(tz), summary: soften(sz), translated: it.sl === 'en', converted: it.sl === 'zh-CN' });
      a.softened = a.title !== tz;
      a.category = classify(a);
      a.sensitive = sensitiveOf(a.title + ' ' + a.summary, it.sl === 'en' ? it.titleOrig + ' ' + it.summaryOrig : '');
      list.push(a);
    }
    const full = cluster(list).filter(a => {
      if (!a.summary || bare(a.summary).length < 20) return false; /* 只有標題、沒有內文的不播報 */
      if (a.category === '對台灣的影響' && a.tier === 'local' && !GLOBAL.test(a.title + ' ' + a.summary)) return false;
      return true;
    });
    return { list: topPerCat(rank(full)), untranslated, judged, headlineOnly: list.length - full.length };
  }

  const api = { CATS, PER_CAT, topPerCat, trimSummary, pickSummary, extractArticleText, TIER, SOURCES, NEWS_TIERS, GN, hash, stripGnSuffix, langOf, isOpinion, isJudgmental, soften, sensitiveOf, classify,
    bigrams, sameStory, cluster, rank, splitSentences, buildScript, parseGtx,
    decodeEntities, cleanText, parseFeed, parseDate, pickImg, normalize, trKey, translationJobs, chunkJobs, gtxURL, gtxLines, finalize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NewsRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
