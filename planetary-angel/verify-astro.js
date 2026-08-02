/*
 * verify-astro.js — 驗證日出日落與真實行星時的計算
 *
 * 用法：node planetary-angel/verify-astro.js
 * 全部通過結束碼 0，任何一項不符則印出並以 1 結束。
 *
 * 這裡不跟外部網站對答案（也連不上），而是檢查天文上必然成立的性質：
 * 分至日的晝長、正午置中、日夜時段互補、時段首尾相接、夏令時間換算等。
 */
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const win = { Math, Date, setTimeout, clearTimeout, Promise, JSON, AbortController, fetch: function () {} };
['data.js', 'astro.js', 'api.js'].forEach(function (f) {
  new Function('window', fs.readFileSync(path.join(dir, f), 'utf8'))(win);
});
const PA = win.PA;
PA.api.CONFIG.mockLatencyMs = 0;

const problems = [];
const TAIPEI = { lat: 25.0330, lon: 121.5654, tz: 8 };

function check(label, actual, expected, tolerance) {
  const ok = Math.abs(actual - expected) <= tolerance;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + '：' + round(actual) + '（預期 ' + expected + ' ±' + tolerance + '）');
  if (!ok) problems.push(label);
}

function round(v) { return Math.round(v * 100) / 100; }

function dayLengthMinutes(y, m, d, place) {
  const e = PA.astro.solarEvents(y, m, d, place.lat, place.lon);
  return (e.set - e.rise) * 1440;
}

console.log('晝長（分鐘，含大氣折射 -0.833°）');
// 分至日的晝長是緯度決定的定值，可當作模型正確性的獨立檢查
check('台北 春分', dayLengthMinutes(2024, 3, 20, TAIPEI), 727, 4);      // ≈12h07m
check('台北 夏至', dayLengthMinutes(2024, 6, 21, TAIPEI), 822, 5);      // ≈13h42m
check('台北 冬至', dayLengthMinutes(2024, 12, 21, TAIPEI), 635, 5);     // ≈10h35m
check('赤道 春分', dayLengthMinutes(2024, 3, 20, { lat: 0, lon: 121, tz: 8 }), 727, 4);

console.log('太陽正午應位於日出日落正中');
[[2024, 1, 15], [2024, 7, 15]].forEach(function (d) {
  const e = PA.astro.solarEvents(d[0], d[1], d[2], TAIPEI.lat, TAIPEI.lon);
  check(d.join('/'), ((e.rise + e.set) / 2 - e.transit) * 86400, 0, 1);   // 秒
});

console.log('日間時 + 夜間時 應恆為 120 分鐘（兩者合計 24 小時 ÷ 12）');
[['台北市', 2024, 1, 15], ['台北市', 2024, 7, 15], ['連江縣', 2024, 12, 21]].forEach(function (c) {
  const place = PA.api.findCity(c[0]);
  const t = PA.astro.dayHours(c[1], c[2], c[3], place);
  const dayLen = (t.sunset - t.sunrise) / 12;
  const nightLen = (t.nextSunrise - t.sunset) / 12;
  check(c.join('/'), dayLen + nightLen, 120, 1.5);   // 因日長逐日變化，容許些微偏差
});

console.log('24 個時段應首尾相接、無缺口');
(function () {
  const place = PA.api.findCity('台中市');
  const t = PA.astro.dayHours(2024, 5, 5, place);
  let gaps = 0;
  for (let i = 1; i < t.hours.length; i++) {
    if (Math.abs(t.hours[i].startMinutes - t.hours[i - 1].endMinutes) > 1e-6) gaps++;
  }
  check('接縫數', gaps, 0, 0);
  check('第 1 時起於日出', t.hours[0].startMinutes, t.sunrise, 1e-6);
  check('第 12 時止於日落', t.hours[11].endMinutes, t.sunset, 1e-6);
  check('第 24 時止於隔日日出', t.hours[23].endMinutes, t.nextSunrise, 1e-6);
})();

console.log('行星時歸屬');
(async function () {
  const place = PA.api.findCity('台北市');
  const t = PA.astro.dayHours(2024, 5, 5, place);

  // 每個時段的正中間，應落在該時段
  let wrong = 0;
  t.hours.forEach(function (h) {
    const mid = (h.startMinutes + h.endMinutes) / 2;
    const at = { year: 2024, month: 5, day: 5, minutes: mid };
    const hit = PA.astro.planetaryHourAt(at, place);
    if (!hit || hit.index !== h.index) wrong++;
  });
  check('24 個時段中點歸屬正確', wrong, 0, 0);

  // 日出後第 1 個行星時的主星，必須等於當日主星
  const rulers = { 0: '太陽', 1: '月亮', 2: '火星', 3: '水星', 4: '木星', 5: '金星', 6: '土星' };
  let bad = 0;
  for (let d = 1; d <= 7; d++) {
    const date = new Date(2024, 0, d);
    const res = await PA.api.query(PA.api.buildRequest({
      city: '台北市', year: 2024, month: 1, day: d,
      hour12: 8, minute: 0, meridiem: 'AM'      // 日出後不久，必為日間第 1–2 時
    }));
    if (res.result.planetaryHour.ordinal === 1 &&
        res.result.planetaryHour.planet.name !== rulers[date.getDay()]) bad++;
    if (res.result.planetaryDay.name !== rulers[date.getDay()]) bad++;
  }
  check('七天的行星日主星', bad, 0, 0);

  // 夏令時間：1975/7/15 在區間內，1976 同日不在
  check('1975/7/15 為夏令時間', PA.api.isTaiwanDst(1975, 7, 15) ? 1 : 0, 1, 0);
  check('1976/7/15 非夏令時間', PA.api.isTaiwanDst(1976, 7, 15) ? 1 : 0, 0, 0);
  check('1979/7/15 為夏令時間', PA.api.isTaiwanDst(1979, 7, 15) ? 1 : 0, 1, 0);
  check('2000/7/15 非夏令時間', PA.api.isTaiwanDst(2000, 7, 15) ? 1 : 0, 0, 0);

  // 夏令時間應讓結果等同「時鐘往回撥一小時」
  const dstOn = await PA.api.query(PA.api.buildRequest({
    city: '高雄市', year: 1975, month: 7, day: 15, hour12: 9, minute: 0, meridiem: 'AM'
  }));
  PA.api.CONFIG.applyDst = false;
  const dstOff = await PA.api.query(PA.api.buildRequest({
    city: '高雄市', year: 1975, month: 7, day: 15, hour12: 8, minute: 0, meridiem: 'AM'
  }));
  PA.api.CONFIG.applyDst = true;
  check('夏令 09:00 等同標準 08:00',
    dstOn.result.planetaryHour.index === dstOff.result.planetaryHour.index ? 1 : 0, 1, 0);

  console.log(problems.length ? '\n不通過：' + problems.join('、') : '\n全部通過 ✓');
  process.exit(problems.length ? 1 : 0);
})();
