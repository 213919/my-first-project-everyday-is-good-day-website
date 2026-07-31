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
    schemaVersion: '1.0',
    /* 簡化假設：日出固定 06:00、行星時等分為 60 分鐘。
       真實計算需依城市經緯度求日出日落，屆時由後端負責。 */
    sunriseMinutes: 6 * 60,
    hourSystem: 'equal'
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
        sunriseMinutes: CONFIG.sunriseMinutes,
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
    var minutesOfDay = b.hour24 * 60 + b.minute;
    var sunrise = request.options.sunriseMinutes;

    // 行星日以「日出」換日：日出前仍屬前一天的行星日
    var beforeSunrise = minutesOfDay < sunrise;
    var base = new Date(b.year, b.month - 1, b.day);
    if (beforeSunrise) base.setDate(base.getDate() - 1);

    var weekdayIndex = base.getDay();
    var dayRulerKey = D.WEEKDAY_RULERS[weekdayIndex];

    // 第幾個行星時（1–24），第 1 時由日出開始、主星即為當日主星
    var elapsed = beforeSunrise ? minutesOfDay + 1440 - sunrise : minutesOfDay - sunrise;
    var hourIndex = Math.floor(elapsed / 60) + 1;

    var hours = buildHourTable(dayRulerKey, sunrise);
    var current = hours[hourIndex - 1];

    return {
      meta: {
        source: CONFIG.mode,           // 'mock' — 之後接 API 會變成 'remote'
        schemaVersion: CONFIG.schemaVersion,
        generatedAt: new Date().toISOString(),
        approximate: true,             // 使用固定日出的簡化結果
        notes: '日出固定以 06:00 估算，未依' + request.city + '實際經緯度計算。'
      },
      request: request,
      result: {
        weekday: { index: weekdayIndex, name: D.WEEKDAY_NAMES[weekdayIndex] },
        planetaryDay: describe(dayRulerKey),
        planetaryHour: {
          index: hourIndex,
          isNight: hourIndex > 12,
          startTime: current.start,
          endTime: current.end,
          planet: describe(current.planetKey)
        },
        hourTable: hours
      }
    };
  }

  /** 產生當日 24 個行星時（迦勒底次序循環） */
  function buildHourTable(dayRulerKey, sunrise) {
    var startIdx = D.CHALDEAN_ORDER.indexOf(dayRulerKey);
    var table = [];
    for (var i = 0; i < 24; i++) {
      var planetKey = D.CHALDEAN_ORDER[(startIdx + i) % 7];
      var startMin = (sunrise + i * 60) % 1440;
      table.push({
        index: i + 1,
        isNight: i >= 12,
        planetKey: planetKey,
        planetName: D.PLANETS[planetKey].name,
        symbol: D.PLANETS[planetKey].symbol,
        angelName: D.PLANETS[planetKey].angel.name,
        start: formatMinutes(startMin),
        end: formatMinutes((startMin + 60) % 1440)
      });
    }
    return table;
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
