/*
 * build-standalone.js — 把 index.html + styles.css + data.js + api.js + app.js
 * 打包成單一檔案 standalone.html（可雙擊直接開啟、方便單檔分享）。
 *
 * 用法：node planetary-angel/build-standalone.js
 *
 * 多檔版本仍是唯一的原始碼；改完程式後重跑這支腳本即可更新 standalone.html。
 */
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const read = (name) => fs.readFileSync(path.join(dir, name), 'utf8');

let html = read('index.html');

// <link rel="stylesheet" href="x.css"> → <style>…</style>
html = html.replace(/[ \t]*<link rel="stylesheet" href="([^"]+)">\n?/g, (_, href) =>
  '  <style>\n' + read(href).trimEnd() + '\n  </style>\n'
);

// <script src="x.js"></script> → <script>…</script>
html = html.replace(/[ \t]*<script src="([^"]+)"><\/script>\n?/g, (_, src) =>
  '  <script>\n' + read(src).trimEnd() + '\n  </script>\n'
);

const banner = '<!-- 由 build-standalone.js 自動產生，請勿直接編輯；' +
  '請改 index.html / styles.css / data.js / api.js / app.js 後重新執行。 -->\n';
html = html.replace('<!DOCTYPE html>\n', '<!DOCTYPE html>\n' + banner);

const out = path.join(dir, 'standalone.html');
fs.writeFileSync(out, html);
console.log('已產生 ' + out + '（' + Math.round(html.length / 1024) + ' KB）');
