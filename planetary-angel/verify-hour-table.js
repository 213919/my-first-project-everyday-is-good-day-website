/*
 * verify-hour-table.js — 驗證程式輸出與原始對照表 hour-table.tsv 完全一致
 *
 * 用法：node planetary-angel/verify-hour-table.js
 * 全部相符時結束碼 0，有任何一格不同則印出差異並以 1 結束。
 *
 * hour-table.tsv 是這份工具的原始依據（24 列時段 × 7 欄星期，週日起）。
 * data.js 的 HOUR_RULERS 是它的程式版本，這支腳本確保兩者不會走鐘。
 */
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const win = { setTimeout, clearTimeout, Promise, Date, Math, AbortController, fetch: function () {}, JSON: JSON };
['data.js', 'astro.js', 'api.js'].forEach(function (f) {
  new Function('window', fs.readFileSync(path.join(dir, f), 'utf8'))(win);
});
const PA = win.PA;
PA.api.CONFIG.mockLatencyMs = 0;
PA.api.CONFIG.hourSystem = 'fixed-table';   // 這支驗的是固定時鐘對照表，不是日出日落版

const LABEL_TO_NAME = {
  '太陽時': '太陽', '月亮時': '月亮', '火星時': '火星', '水星時': '水星',
  '木星時': '木星', '金星時': '金星', '土星時': '土星'
};

const rows = fs.readFileSync(path.join(dir, 'hour-table.tsv'), 'utf8')
  .trim().split('\n').map((line) => line.split('\t'));

// 2024/01/01–07 剛好涵蓋七個星期，用來當測試日期
const datesByWeekday = {};
for (let d = 1; d <= 7; d++) {
  datesByWeekday[new Date(2024, 0, d).getDay()] = { year: 2024, month: 1, day: d };
}

(async function () {
  const problems = [];
  let checked = 0;

  for (let hour = 0; hour < 24; hour++) {
    const expectedSlot = rows[hour][0].trim();

    for (let weekday = 0; weekday < 7; weekday++) {
      const expectedPlanet = LABEL_TO_NAME[rows[hour][weekday + 1].trim()];
      const date = datesByWeekday[weekday];

      const request = PA.api.buildRequest({
        city: '台北市',
        year: date.year, month: date.month, day: date.day,
        hour12: hour % 12 === 0 ? 12 : hour % 12,
        minute: 30,
        meridiem: hour < 12 ? 'AM' : 'PM'
      });
      const res = await PA.api.query(request);
      const got = res.result.planetaryHour;
      const where = rows[hour][0].trim() + ' / ' + res.result.weekday.name;

      if (res.result.weekday.index !== weekday) problems.push(where + '：星期對不上');
      if (got.planet.name !== expectedPlanet) {
        problems.push(where + '：行星時為 ' + got.planet.name + '，應為 ' + expectedPlanet);
      }
      if (got.startTime + '-' + got.endTime !== expectedSlot) {
        problems.push(where + '：時段為 ' + got.startTime + '-' + got.endTime + '，應為 ' + expectedSlot);
      }
      checked++;
    }
  }

  // 結果區的 24 列對照表也要逐列相符
  for (let weekday = 0; weekday < 7; weekday++) {
    const date = datesByWeekday[weekday];
    const res = await PA.api.query(PA.api.buildRequest({
      city: '台北市', year: date.year, month: date.month, day: date.day,
      hour12: 12, minute: 0, meridiem: 'PM'
    }));
    res.result.hourTable.forEach((row, hour) => {
      const expected = LABEL_TO_NAME[rows[hour][weekday + 1].trim()];
      if (row.planetName !== expected) {
        problems.push('對照表 ' + res.result.weekday.name + ' ' + row.start + '：' +
          row.planetName + '，應為 ' + expected);
      }
    });
  }

  // 行星 → 守護天使 也要與 angels.tsv 相符
  fs.readFileSync(path.join(dir, 'angels.tsv'), 'utf8').trim().split('\n').forEach(function (line) {
    var parts = line.split('\t');
    var planetName = parts[0].trim();
    var angelLatin = parts[1].trim();
    var planet = Object.keys(PA.data.PLANETS).map(function (k) { return PA.data.PLANETS[k]; })
      .filter(function (p) { return p.name === planetName; })[0];

    if (!planet) problems.push('angels.tsv：找不到行星 ' + planetName);
    else if (planet.angel.latin !== angelLatin) {
      problems.push(planetName + ' 的天使為 ' + planet.angel.latin + '，應為 ' + angelLatin);
    }
  });

  console.log('比對 ' + checked + ' 格 + 7 組完整對照表 + 7 組天使對應');
  if (problems.length) {
    console.error('不一致 ' + problems.length + ' 處：\n' + problems.slice(0, 20).join('\n'));
    process.exit(1);
  }
  console.log('全部一致 ✓');
})();
