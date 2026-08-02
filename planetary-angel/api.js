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
    schemaVersion: '1.2',
    /* 行星時的取法。'fixed-table' = 00:00 起算、每時段 60 分鐘、以星期分欄。 */
    hourSystem: 'fixed-table'
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
        hourSystem: CONFIG.hourSystem
      }
    };
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
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(compute(request));
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
   * 行星名稱經 PLANET_ALIASES 正規化，**天使一律由本專案的 angels.tsv 對應**，
   * 因為外部來源通常只給行星，不給天使名。
   */
  function adaptRemoteResponse(raw, request) {
    var hourKey = resolvePlanetKey(raw.hourPlanet || raw.planet || raw.hour);
    var dayKey = resolvePlanetKey(raw.dayPlanet || raw.day);

    if (!hourKey) throw new Error('外部來源沒有可辨識的行星名稱');

    var weekdayIndex = new Date(request.birth.year, request.birth.month - 1, request.birth.day).getDay();
    if (!dayKey) dayKey = D.WEEKDAY_RULERS[weekdayIndex];

    var hour = request.birth.hour24;

    return {
      meta: {
        source: 'remote',
        schemaVersion: CONFIG.schemaVersion,
        generatedAt: new Date().toISOString(),
        method: 'remote-lookup',
        endpoint: CONFIG.remote.endpoint,
        notes: '行星時由外部來源提供，守護天使仍依本專案的行星→天使對應表。',
        raw: raw                       // 保留原始回應，方便比對與除錯
      },
      request: request,
      result: {
        weekday: { index: weekdayIndex, name: D.WEEKDAY_NAMES[weekdayIndex] },
        planetaryDay: describe(dayKey),
        planetaryHour: {
          index: hour + 1,
          isNight: hour < 6 || hour >= 18,
          startTime: raw.start || formatMinutes(hour * 60),
          endTime: raw.end || formatMinutes((hour + 1) * 60),
          planet: describe(hourKey)
        },
        hourTable: buildHourTable(weekdayIndex)
      }
    };
  }

  /** 'Venus' / 'venus' / '金星' / 'Sol' … → 內部 key，無法辨識則回 null */
  function resolvePlanetKey(name) {
    if (!name) return null;
    var normalized = String(name).trim().toLowerCase().replace(/[\s時的]/g, '');
    return D.PLANET_ALIASES[normalized] || null;
  }

  /* ---------- 推算核心 ---------- */

  function compute(request) {
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

  PA.api = {
    CONFIG: CONFIG,
    buildRequest: buildRequest,
    toHour24: toHour24,
    query: query,
    getWeekTable: getWeekTable,
    resolvePlanetKey: resolvePlanetKey,
    adaptRemoteResponse: adaptRemoteResponse
  };
})(window);
