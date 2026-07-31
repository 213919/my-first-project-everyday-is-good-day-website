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
    mode: 'mock',                       // 'mock' | 'remote'
    endpoint: '/api/planetary-angel',   // remote 模式使用
    timeoutMs: 8000,
    mockLatencyMs: 420,                 // 模擬網路延遲，讓 loading 狀態看得出來
    schemaVersion: '1.1',
    /* 行星時的取法。'fixed-table' = 直接查 data.js 的 HOUR_RULERS 對照表
       （00:00 起算、每時段 60 分鐘、以星期分欄）。
       日後若後端改用日出日落分割不等長的行星時，這裡會換成別的值。 */
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
    return CONFIG.mode === 'remote' ? remoteProvider(request) : mockProvider(request);
  }

  /* ---------- provider：假資料（本機簡化推算） ---------- */

  function mockProvider(request) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(compute(request));
      }, CONFIG.mockLatencyMs);
    });
  }

  /* ---------- provider：真 API（預留，尚未啟用） ---------- */

  function remoteProvider(request) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, CONFIG.timeoutMs);

    return fetch(CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal
    }).then(function (res) {
      if (!res.ok) throw new Error('API 回應狀態 ' + res.status);
      return res.json();
    }).finally(function () {
      clearTimeout(timer);
    });
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
        source: CONFIG.mode,           // 'mock' — 之後接 API 會變成 'remote'
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
    query: query
  };
})(window);
