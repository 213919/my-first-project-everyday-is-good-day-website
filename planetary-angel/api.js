/*
 * api.js — 資料層 / 服務層
 *
 * 這一層是「之後要接真 API」的唯一接點：
 *   PA.api.query(request) -> Promise<response>
 *
 * 目前 PA.api.CONFIG.mode = 'mock'，由本機的簡化推算產生假資料；
 * 要改接後端時，只要把 mode 換成 'remote' 並填 endpoint，
 * UI 層（app.js）完全不需要改動，因為 request / response 結構固定。
 */
(function (global) {
  'use strict';

  var PA = (global.PA = global.PA || {});
  var D = PA.data;

  var CONFIG = {
    /*
     * 'table'  = 用 data.js 的 HOUR_RULERS 對照表（目前預設，離線可用）
     * 'remote' = 出生時間的行星時改由外部來源查詢（見下方 remote 設定與 README）
     */
    mode: 'table',

    remote: {
      /* 你自己的端點或 proxy。留空時 query() 會直接退回對照表。
         注意：瀏覽器的同源政策會擋掉直接呼叫第三方網站，
         除非對方回應 Access-Control-Allow-Origin，否則這裡要填自己的 proxy。 */
      endpoint: '',
      method: 'POST',
      timeoutMs: 8000,
      /* 外部查詢失敗時是否退回本機對照表（建議 true，頁面才不會整個不能用） */
      fallbackToTable: true
    },

    mockLatencyMs: 420,                 // 模擬網路延遲，讓 loading 狀態看得出來
    schemaVersion: '2.0',

    /*
     * 行星時的取法：
     *   'sunrise'     = 依出生地經緯度計算日出日落，日間／夜間各分 12 段（傳統定義，預設）
     *   'fixed-table' = data.js 的 HOUR_RULERS 固定時鐘對照表（00:00 起算、每段 60 分鐘）
     * 兩者結果會不同：固定表全年每段都是 60 分鐘，日出日落版則隨季節與緯度變動。
     */
    hourSystem: 'sunrise',

    /* 出生時間若落在台灣歷年夏令時間，自動 −1 小時換算為標準時 */
    applyDst: true
  };

  /* ---------- request 建構 ---------- */

  /**
   * 把表單的原始值整理成標準 request（同時也是未來送給 API 的 body）。
   * @param {{city:string,year:number,month:number,day:number,hour12:number,minute:number,meridiem:'AM'|'PM'}} raw
   */
  function buildRequest(raw) {
    var hour24 = toHour24(raw.hour12, raw.meridiem);
    return {
      city: raw.city,
      place: findCity(raw.city),        // 經緯度與時區，日出日落計算用
      birth: {
        year: raw.year,
        month: raw.month,
        day: raw.day,
        hour12: raw.hour12,
        minute: raw.minute,
        meridiem: raw.meridiem,
        hour24: hour24
      },
      // 不帶時區的本地時間字串，後端可搭配 city 自行決定時區
      localDateTime: pad(raw.year, 4) + '-' + pad(raw.month, 2) + '-' + pad(raw.day, 2) +
        'T' + pad(hour24, 2) + ':' + pad(raw.minute, 2) + ':00',
      options: {
        hourSystem: CONFIG.hourSystem,
        applyDst: CONFIG.applyDst
      }
    };
  }

  /** 由縣市名稱取得座標；找不到回 null（validate() 會先擋下） */
  function findCity(name) {
    var found = D.CITIES.filter(function (c) { return c.name === name; })[0];
    return found ? { name: found.name, lat: found.lat, lon: found.lon, tz: found.tz } : null;
  }

  /** 12 小時制 + 上下午 → 24 小時制（12AM=0、12PM=12） */
  function toHour24(hour12, meridiem) {
    var h = hour12 % 12;              // 12 → 0
    return meridiem === 'PM' ? h + 12 : h;
  }

  /* ---------- 對外入口 ---------- */

  function query(request) {
    if (CONFIG.mode !== 'remote' || !CONFIG.remote.endpoint) return tableProvider(request);

    return remoteProvider(request).catch(function (err) {
      if (!CONFIG.remote.fallbackToTable) throw err;

      // 外部查詢失敗就退回對照表，並把失敗原因標在結果上，不讓頁面整個不能用
      return tableProvider(request).then(function (res) {
        res.meta.fallback = true;
        res.meta.error = (err && err.message) || String(err);
        res.meta.notes += '　外部來源查詢失敗（' + res.meta.error + '），已改用本機對照表。';
        return res;
      });
    });
  }

  /* ---------- provider：本機對照表 ---------- */

  function tableProvider(request) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        // compute() 會丟錯（缺座標、極區無日出…），要轉成 reject，
        // 否則錯誤會逸出 Promise 變成未捕捉例外
        try {
          resolve(compute(request));
        } catch (err) {
          reject(err);
        }
      }, CONFIG.mockLatencyMs);
    });
  }

  /* ---------- provider：外部來源 ---------- */

  function remoteProvider(request) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, CONFIG.remote.timeoutMs);
    var url = CONFIG.remote.endpoint;
    var init = { signal: controller.signal, headers: { Accept: 'application/json' } };

    if (CONFIG.remote.method === 'GET') {
      url += (url.indexOf('?') === -1 ? '?' : '&') + toQueryString(request);
    } else {
      init.method = 'POST';
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(request);
    }

    return fetch(url, init).then(function (res) {
      if (!res.ok) throw new Error('外部來源回應狀態 ' + res.status);
      return res.json();
    }).then(function (raw) {
      return adaptRemoteResponse(raw, request);
    }).finally(function () {
      clearTimeout(timer);
    });
  }

  function toQueryString(request) {
    var b = request.birth;
    return 'date=' + pad(b.year, 4) + '-' + pad(b.month, 2) + '-' + pad(b.day, 2) +
      '&time=' + pad(b.hour24, 2) + ':' + pad(b.minute, 2) +
      '&city=' + encodeURIComponent(request.city);
  }

  /**
   * 把外部來源的回應轉成本專案的 response 格式。
   *
   * 預期的最小內容（欄位名稱可在此調整，其餘程式不受影響）：
   *   { hourPlanet: 'Venus', dayPlanet: 'Saturn', start: '00:00', end: '01:00' }
   *
   * 行星名稱經 PLANET_ALIASES 正規化。
   * **天使以外部來源為準**（`hourAngel` / `dayAngel`）；沒給時才用本專案的 angels.tsv。
   */
  function adaptRemoteResponse(raw, request) {
    var hourKey = resolvePlanetKey(raw.hourPlanet || raw.planet || raw.hour);
    var dayKey = resolvePlanetKey(raw.dayPlanet || raw.day);

    if (!hourKey) throw new Error('外部來源沒有可辨識的行星名稱');

    var weekdayIndex = new Date(request.birth.year, request.birth.month - 1, request.birth.day).getDay();
    if (!dayKey) dayKey = D.WEEKDAY_RULERS[weekdayIndex];

    var hour = request.birth.hour24;
    var hourPlanet = applyRemoteAngel(describe(hourKey), raw.hourAngel || raw.angel);
    var dayPlanet = applyRemoteAngel(describe(dayKey), raw.dayAngel);

    return {
      meta: {
        source: 'remote',
        schemaVersion: CONFIG.schemaVersion,
        generatedAt: new Date().toISOString(),
        method: 'remote-lookup',
        endpoint: CONFIG.remote.endpoint,
        angelSource: hourPlanet.angel.source || 'local',
        notes: '行星時由外部來源提供，天使' +
          (hourPlanet.angel.source === 'remote' ? '同樣採用該來源的名稱。' : '沿用本專案的行星→天使對應表。'),
        raw: raw                       // 保留原始回應，方便比對與除錯
      },
      request: request,
      result: {
        weekday: { index: weekdayIndex, name: D.WEEKDAY_NAMES[weekdayIndex] },
        planetaryDay: dayPlanet,
        planetaryHour: {
          index: hour + 1,
          isNight: hour < 6 || hour >= 18,
          startTime: raw.start || formatMinutes(hour * 60),
          endTime: raw.end || formatMinutes((hour + 1) * 60),
          planet: hourPlanet
        },
        hourTable: buildHourTable(weekdayIndex)
      }
    };
  }

  /**
   * 外部來源若有給天使名，就以它為準（本專案的對應只當備援）。
   * 中文譯名查 ANGEL_NAMES_ZH；查不到就直接顯示原文，不自行編譯名。
   */
  function applyRemoteAngel(planet, angelName) {
    if (!angelName) return planet;

    var given = String(angelName).trim();
    if (!given) return planet;
    if (given.toLowerCase() === planet.angel.latin.toLowerCase()) return planet;  // 與本地相同就不動

    var zh = D.ANGEL_NAMES_ZH[given.toLowerCase()];
    planet.angel = {
      name: zh || given,
      latin: given,
      domain: planet.angel.domain,
      source: 'remote',
      localName: planet.angel.latin        // 保留本地版本，方便比對差異
    };
    return planet;
  }

  /** 'Venus' / 'venus' / '金星' / 'Sol' … → 內部 key，無法辨識則回 null */
  function resolvePlanetKey(name) {
    if (!name) return null;
    var normalized = String(name).trim().toLowerCase().replace(/[\s時的]/g, '');
    return D.PLANET_ALIASES[normalized] || null;
  }

  /* ---------- 推算核心 ---------- */

  function compute(request) {
    return CONFIG.hourSystem === 'fixed-table' ? computeFromTable(request) : computeFromSun(request);
  }

  /* ---------- 演算法 A：依日出日落的真實行星時（預設） ---------- */

  function computeFromSun(request) {
    var b = request.birth;
    var place = request.place;
    if (!place) throw new Error('缺少出生地座標，無法計算日出日落');

    // 夏令時間的鐘面時間比標準時快 1 小時，先還原
    var dst = CONFIG.applyDst && request.options.applyDst !== false && isTaiwanDst(b.year, b.month, b.day);
    var minutes = b.hour24 * 60 + b.minute - (dst ? 60 : 0);

    var at = { year: b.year, month: b.month, day: b.day, minutes: minutes };
    var hit = PA.astro.planetaryHourAt(at, place);
    if (!hit) throw new Error('該地點該日無日出或日落（極區），無法計算行星時');

    // 行星日以日出換日：日出前仍屬前一天
    var dayDate = hit.dayDate;
    var weekdayIndex = new Date(dayDate.year, dayDate.month - 1, dayDate.day).getDay();
    var dayRulerKey = D.WEEKDAY_RULERS[weekdayIndex];
    var hourKey = rulerOfHour(dayRulerKey, hit.index);

    var table = PA.astro.dayHours(dayDate.year, dayDate.month, dayDate.day, place);

    return {
      meta: {
        source: 'table',
        schemaVersion: CONFIG.schemaVersion,
        generatedAt: new Date().toISOString(),
        method: 'sunrise-sunset',
        dstApplied: Boolean(dst),
        notes: '行星時依' + request.city + '（' + place.lat.toFixed(2) + '°N, ' +
          place.lon.toFixed(2) + '°E）當日的日出日落計算，日間與夜間各分 12 段。' +
          (dst ? '　出生時間落在該年夏令時間，已自動 −1 小時換算為標準時。' : '') +
          (hit.isNight && minutes < hit.sunrise ? '　日出前仍屬前一日的行星日。' : '')
      },
      request: request,
      result: {
        weekday: { index: weekdayIndex, name: D.WEEKDAY_NAMES[weekdayIndex] },
        planetaryDay: describe(dayRulerKey),
        planetaryHour: {
          index: hit.index,
          ordinal: hit.ordinal,
          isNight: hit.isNight,
          startTime: formatClock(hit.startMinutes),
          endTime: formatClock(hit.endMinutes),
          lengthMinutes: Math.round(hit.lengthMinutes),
          planet: describe(hourKey)
        },
        sun: {
          date: pad(dayDate.year, 4) + '-' + pad(dayDate.month, 2) + '-' + pad(dayDate.day, 2),
          sunrise: formatClock(table.sunrise),
          sunset: formatClock(table.sunset),
          nextSunrise: formatClock(table.nextSunrise),
          dayHourMinutes: Math.round((table.sunset - table.sunrise) / 12),
          nightHourMinutes: Math.round((table.nextSunrise - table.sunset) / 12)
        },
        hourTable: table.hours.map(function (h) {
          var key = rulerOfHour(dayRulerKey, h.index);
          return {
            index: h.index,
            ordinal: h.ordinal,
            isNight: h.isNight,
            planetKey: key,
            planetName: D.PLANETS[key].name,
            symbol: D.PLANETS[key].symbol,
            angelName: D.PLANETS[key].angel.name,
            start: formatClock(h.startMinutes),
            end: formatClock(h.endMinutes),
            nextDay: h.startMinutes >= 1440          // 已跨過午夜，屬隔日的鐘面時間
          };
        })
      }
    };
  }

  /** 第 n 個行星時（1–24）的主星：自當日主星起，依迦勒底次序循環 */
  function rulerOfHour(dayRulerKey, index) {
    var start = D.CHALDEAN_ORDER.indexOf(dayRulerKey);
    return D.CHALDEAN_ORDER[(start + index - 1) % 7];
  }

  /** 該日期是否落在台灣歷年夏令時間 */
  function isTaiwanDst(year, month, day) {
    var value = month * 100 + day;
    for (var i = 0; i < D.TW_DST.length; i++) {
      var r = D.TW_DST[i];
      if (year < r.fromYear || year > r.toYear) continue;
      if (value >= r.start[0] * 100 + r.start[1] && value <= r.end[0] * 100 + r.end[1]) return true;
    }
    return false;
  }

  /* ---------- 演算法 B：固定時鐘對照表 ---------- */

  function computeFromTable(request) {
    var b = request.birth;
    var weekdayIndex = new Date(b.year, b.month - 1, b.day).getDay();
    var dayRulerKey = D.WEEKDAY_RULERS[weekdayIndex];

    // 直接查對照表：列 = 出生時的整點，欄 = 出生日的星期
    var hours = buildHourTable(weekdayIndex);
    var current = hours[b.hour24];

    return {
      meta: {
        source: 'table',               // 本機對照表；外部來源查詢成功時會是 'remote'
        schemaVersion: CONFIG.schemaVersion,
        generatedAt: new Date().toISOString(),
        method: 'fixed-hour-table',
        notes: '行星時依固定對照表：00:00 起算，每時段 60 分鐘，欄位為星期。' +
          (b.hour24 < 6 ? '　06:00 前的時段延續前一日的行星時序，因此不會等於當日主星。' : '')
      },
      request: request,
      result: {
        weekday: { index: weekdayIndex, name: D.WEEKDAY_NAMES[weekdayIndex] },
        planetaryDay: describe(dayRulerKey),
        planetaryHour: {
          index: current.index,        // 1–24，第 1 時段為 00:00–01:00
          isNight: current.isNight,
          startTime: current.start,
          endTime: current.end,
          planet: describe(current.planetKey)
        },
        hourTable: hours
      }
    };
  }

  /**
   * 整週輪值表（24 列時段 × 7 欄星期），供畫面顯示用。
   * 與單次查詢無關，所以不放進 response，避免每次都回傳 168 格。
   */
  function getWeekTable() {
    return {
      weekdays: D.WEEKDAY_NAMES.slice(),
      rows: D.HOUR_RULERS.map(function (row, hour) {
        return {
          hour: hour,
          slot: formatMinutes(hour * 60) + '–' + formatMinutes((hour + 1) * 60),
          cells: row.map(function (planetKey) {
            return {
              planetKey: planetKey,
              planetName: D.PLANETS[planetKey].name,
              symbol: D.PLANETS[planetKey].symbol,
              angelName: D.PLANETS[planetKey].angel.name
            };
          })
        };
      })
    };
  }

  /** 取出某個星期的 24 個時段（直接來自 D.HOUR_RULERS，不做推算） */
  function buildHourTable(weekdayIndex) {
    return D.HOUR_RULERS.map(function (row, hour) {
      var planetKey = row[weekdayIndex];
      return {
        index: hour + 1,
        isNight: hour < 6 || hour >= 18,
        planetKey: planetKey,
        planetName: D.PLANETS[planetKey].name,
        symbol: D.PLANETS[planetKey].symbol,
        angelName: D.PLANETS[planetKey].angel.name,
        start: formatMinutes(hour * 60),
        end: formatMinutes((hour + 1) * 60)
      };
    });
  }

  /** 由 planetKey 取出行星 + 天使的完整描述（複製一份，避免外部改到知識庫） */
  function describe(planetKey) {
    var p = D.PLANETS[planetKey];
    return {
      key: p.key,
      symbol: p.symbol,
      name: p.name,
      latin: p.latin,
      angel: { name: p.angel.name, latin: p.angel.latin, domain: p.angel.domain },
      keywords: p.keywords.slice(),
      colors: p.colors.slice(),
      metal: p.metal,
      incense: p.incense,
      advice: p.advice
    };
  }

  /* ---------- 小工具 ---------- */

  function pad(n, len) {
    var s = String(Math.abs(n));
    while (s.length < len) s = '0' + s;
    return (n < 0 ? '-' : '') + s;
  }

  function formatMinutes(total) {
    return pad(Math.floor(total / 60), 2) + ':' + pad(total % 60, 2);
  }

  /** 分鐘 → HH:MM，會繞回 24 小時內（夜間時段常跨過午夜，四捨五入到分鐘） */
  function formatClock(total) {
    var m = Math.round(total) % 1440;
    if (m < 0) m += 1440;
    return pad(Math.floor(m / 60), 2) + ':' + pad(m % 60, 2);
  }

  PA.api = {
    CONFIG: CONFIG,
    buildRequest: buildRequest,
    toHour24: toHour24,
    query: query,
    findCity: findCity,
    isTaiwanDst: isTaiwanDst,
    getWeekTable: getWeekTable,
    resolvePlanetKey: resolvePlanetKey,
    adaptRemoteResponse: adaptRemoteResponse
  };
})(window);
