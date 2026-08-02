/*
 * astro.js — 日出日落與「真實行星時」計算
 *
 * 傳統行星時的定義：
 *   日出到日落等分為 12 個「日間時」，日落到隔日日出等分為 12 個「夜間時」。
 *   因此每個行星時的長度隨季節與緯度變動，冬天的日間時可能只有 45 分鐘。
 *   一天從「日出」開始，所以日出前的時間仍屬前一天的行星日。
 *
 * 日出日落採 NOAA 的太陽位置公式（sunrise equation），只用經緯度與日期，
 * 不需要連網。太陽高度取 -0.833°（含大氣折射與日輪半徑），與一般日出時刻定義相同。
 */
(function (global) {
  'use strict';

  var PA = (global.PA = global.PA || {});
  var RAD = Math.PI / 180;
  var J2000 = 2451545.0;

  /** 公曆日期 → 儒略日（該日 00:00 UT） */
  function julianDay(year, month, day) {
    var y = year, m = month;
    if (m <= 2) { y -= 1; m += 12; }
    var a = Math.floor(y / 100);
    var b = 2 - a + Math.floor(a / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
  }

  /**
   * 某日的日出、日落、正午（回傳儒略日）。
   * @param {number} lon 東經為正
   * @returns {{rise:number,set:number,transit:number}|null} 極晝／極夜時回傳 null
   */
  function solarEvents(year, month, day, lat, lon) {
    var n = Math.round(julianDay(year, month, day) - J2000 + 0.0008);
    var jStar = n - lon / 360;                       // 平太陽時（公式以西經為正，東經要取負）

    var M = mod360(357.5291 + 0.98560028 * jStar);   // 太陽平近點角
    var C = 1.9148 * Math.sin(M * RAD) +             // 中心差
            0.0200 * Math.sin(2 * M * RAD) +
            0.0003 * Math.sin(3 * M * RAD);
    var lambda = mod360(M + C + 282.9372);           // 黃經（180 + 102.9372）

    var transit = J2000 + jStar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);

    var sinDec = Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD);
    var cosDec = Math.cos(Math.asin(sinDec));
    var cosOmega = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinDec) /
                   (Math.cos(lat * RAD) * cosDec);

    if (cosOmega > 1 || cosOmega < -1) return null;  // 太陽整日不升或不落

    var omega = Math.acos(cosOmega) / RAD;           // 時角（度）
    return {
      rise: transit - omega / 360,
      set: transit + omega / 360,
      transit: transit
    };
  }

  /** 儒略日 → 指定日期當地午夜起算的分鐘數（可為負數或超過 1440） */
  function toLocalMinutes(jd, year, month, day, tzHours) {
    var localMidnight = julianDay(year, month, day) - tzHours / 24;
    return (jd - localMidnight) * 1440;
  }

  /** 日期加減天數，回傳 {year, month, day} */
  function shiftDate(year, month, day, delta) {
    var d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() + delta);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }

  /**
   * 出生時刻落在第幾個行星時。
   *
   * @param {{year,month,day,minutes}} at 當地時間（minutes = 當日 00:00 起算的分鐘）
   * @param {{lat,lon,tz}} place
   * @returns {{
   *   index:number,          // 1–24，1–12 為日間時、13–24 為夜間時
   *   isNight:boolean,
   *   ordinal:number,        // 日間或夜間中的第幾時（1–12）
   *   startMinutes:number,   // 相對於「出生當日 00:00」的分鐘，可能為負或 >1440
   *   endMinutes:number,
   *   lengthMinutes:number,  // 這個行星時有多長
   *   dayDate:{year,month,day},   // 這個行星日對應的日期（日出前算前一天）
   *   sunrise:number, sunset:number  // 出生當日的日出日落（分鐘，同上基準）
   * }|null}
   */
  function planetaryHourAt(at, place) {
    var today = solarEvents(at.year, at.month, at.day, place.lat, place.lon);
    if (!today) return null;

    var base = { year: at.year, month: at.month, day: at.day };
    var sunrise = toLocalMinutes(today.rise, base.year, base.month, base.day, place.tz);
    var sunset = toLocalMinutes(today.set, base.year, base.month, base.day, place.tz);
    var t = at.minutes;

    var segStart, segEnd, isNight, dayDate;

    if (t >= sunrise && t < sunset) {
      // 日間：日出 → 日落
      segStart = sunrise;
      segEnd = sunset;
      isNight = false;
      dayDate = base;

    } else if (t >= sunset) {
      // 夜間（前半夜）：今日日落 → 明日日出
      var next = shiftDate(base.year, base.month, base.day, 1);
      var tomorrow = solarEvents(next.year, next.month, next.day, place.lat, place.lon);
      if (!tomorrow) return null;
      segStart = sunset;
      segEnd = toLocalMinutes(tomorrow.rise, base.year, base.month, base.day, place.tz);
      isNight = true;
      dayDate = base;

    } else {
      // 夜間（後半夜）：昨日日落 → 今日日出，行星日仍算前一天
      var prev = shiftDate(base.year, base.month, base.day, -1);
      var yesterday = solarEvents(prev.year, prev.month, prev.day, place.lat, place.lon);
      if (!yesterday) return null;
      segStart = toLocalMinutes(yesterday.set, base.year, base.month, base.day, place.tz);
      segEnd = sunrise;
      isNight = true;
      dayDate = prev;
    }

    var length = (segEnd - segStart) / 12;
    var ordinal = Math.min(12, Math.floor((t - segStart) / length) + 1);

    return {
      index: isNight ? ordinal + 12 : ordinal,
      isNight: isNight,
      ordinal: ordinal,
      startMinutes: segStart + (ordinal - 1) * length,
      endMinutes: segStart + ordinal * length,
      lengthMinutes: length,
      dayDate: dayDate,
      sunrise: sunrise,
      sunset: sunset
    };
  }

  /**
   * 某一天完整的 24 個行星時（日間 12 + 夜間 12），時間基準為該日 00:00。
   */
  function dayHours(year, month, day, place) {
    var today = solarEvents(year, month, day, place.lat, place.lon);
    var next = shiftDate(year, month, day, 1);
    var tomorrow = solarEvents(next.year, next.month, next.day, place.lat, place.lon);
    if (!today || !tomorrow) return null;

    var sunrise = toLocalMinutes(today.rise, year, month, day, place.tz);
    var sunset = toLocalMinutes(today.set, year, month, day, place.tz);
    var nextRise = toLocalMinutes(tomorrow.rise, year, month, day, place.tz);

    var dayLen = (sunset - sunrise) / 12;
    var nightLen = (nextRise - sunset) / 12;
    var hours = [];
    var i;

    for (i = 0; i < 12; i++) {
      hours.push({
        index: i + 1, ordinal: i + 1, isNight: false,
        startMinutes: sunrise + i * dayLen,
        endMinutes: sunrise + (i + 1) * dayLen,
        lengthMinutes: dayLen
      });
    }
    for (i = 0; i < 12; i++) {
      hours.push({
        index: i + 13, ordinal: i + 1, isNight: true,
        startMinutes: sunset + i * nightLen,
        endMinutes: sunset + (i + 1) * nightLen,
        lengthMinutes: nightLen
      });
    }

    return { sunrise: sunrise, sunset: sunset, nextSunrise: nextRise, hours: hours };
  }

  function mod360(v) {
    return ((v % 360) + 360) % 360;
  }

  PA.astro = {
    julianDay: julianDay,
    solarEvents: solarEvents,
    toLocalMinutes: toLocalMinutes,
    shiftDate: shiftDate,
    planetaryHourAt: planetaryHourAt,
    dayHours: dayHours
  };
})(window);
