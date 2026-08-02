/*
 * generate-options.js — 依 data.js 的範圍，把 <select> 的 <option> 直接寫進 index.html。
 *
 * 用法：node planetary-angel/generate-options.js
 *
 * 為什麼要寫死在 HTML？
 * 不執行 JavaScript 的環境（iOS 檔案 App 的 Quick Look 預覽、App 內建預覽器、
 * 郵件附件預覽…）看到的會是空白下拉選單。選項寫在 HTML 裡，這些環境至少能
 * 看到完整內容；app.js 只在選單是空的時候才補上，兩邊不會打架。
 *
 * 改了 data.js 的 FORM_OPTIONS 範圍後重跑這支，再跑 build-standalone.js。
 */
const fs = require('fs');
const path = require('path');

const dir = __dirname;

// 讀 data.js 取得 FORM_OPTIONS（在假的 window 上執行，避免複製一份常數）
const fakeWindow = {};
new Function('window', fs.readFileSync(path.join(dir, 'data.js'), 'utf8'))(fakeWindow);
const OPT = fakeWindow.PA.data.FORM_OPTIONS;
OPT.cities = fakeWindow.PA.data.CITIES.map((c) => c.name);

const pad2 = (n) => (n < 10 ? '0' : '') + n;

function options(values, labelFn, selected, indent) {
  return values.map((v) =>
    indent + '<option value="' + v + '"' + (v === selected ? ' selected' : '') + '>' +
    labelFn(v) + '</option>'
  ).join('\n');
}

function range(from, to, step) {
  step = step || (to >= from ? 1 : -1);
  const out = [];
  for (let v = from; step > 0 ? v <= to : v >= to; v += step) out.push(v);
  return out;
}

const IND = '              ';

const lists = {
  city: OPT.cities.map((c, i) =>
    IND + '<option value="' + c + '"' + (c === OPT.defaultCity ? ' selected' : '') + '>' + c + '</option>'
  ).join('\n'),
  year: options(range(OPT.yearRange.max, OPT.yearRange.min, -1), (v) => v + ' 年', OPT.yearRange.defaultValue, IND),
  month: options(range(1, 12), (v) => v + '月', OPT.monthRange.defaultValue, IND),
  day: options(range(1, 31), (v) => v + ' 日', OPT.dayDefault, IND),
  hour: options(range(OPT.hourRange.min, OPT.hourRange.max), (v) => String(v), OPT.hourRange.defaultValue, IND),
  minute: options(range(0, 59), (v) => pad2(v), OPT.minuteRange.defaultValue, IND),
  meridiem: OPT.meridiems.map((m, i) =>
    IND + '<option value="' + m.value + '"' + (i === 0 ? ' selected' : '') + '>' + m.label + '</option>'
  ).join('\n')
};

const file = path.join(dir, 'index.html');
let html = fs.readFileSync(file, 'utf8');

Object.keys(lists).forEach((id) => {
  const re = new RegExp('(<select[^>]*id="' + id + '"[^>]*>)[\\s\\S]*?(</select>)');
  if (!re.test(html)) throw new Error('找不到 select#' + id);
  html = html.replace(re, (_, open, close) =>
    open + '\n' + lists[id] + '\n' + IND.slice(2) + close
  );
});

fs.writeFileSync(file, html);
console.log('已更新 ' + file + ' 的 select 選項');
