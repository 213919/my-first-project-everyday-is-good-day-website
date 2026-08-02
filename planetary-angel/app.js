/*
 * app.js — UI 層
 * 職責：產生選單 → 讀表單 → 驗證 → 呼叫 PA.api.query() → 渲染結果。
 * 不含任何行星/天使的知識或推算邏輯（那些在 data.js / api.js）。
 */
(function (global) {
  'use strict';

  var PA = global.PA;
  var OPT = PA.data.FORM_OPTIONS;

  var el = {};
  var lastResponse = null;   // 方便在 console 用 PA.app.last() 檢視

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheDom();
    buildSelects();
    bindEvents();
    updateHour24Preview();
  }

  function cacheDom() {
    ['birth-form', 'city', 'year', 'month', 'day', 'hour', 'minute', 'meridiem',
     'form-error', 'submit-btn', 'hour24-preview', 'result', 'result-subject',
     'day-symbol', 'day-planet', 'day-angel', 'day-angel-domain',
     'hour-symbol', 'hour-planet', 'hour-angel', 'hour-range',
     'detail-weekday', 'detail-keywords', 'detail-colors', 'detail-material',
     'detail-sun', 'detail-hourlen', 'detail-advice', 'hour-table-body', 'week-table', 'week-table-head', 'week-table-body',
     'json-output', 'result-note'
    ].forEach(function (id) {
      el[camel(id)] = document.getElementById(id);
    });
  }

  /* ---------- 選單生成 ---------- */

  /*
   * 選項本身是寫在 index.html 裡的（由 generate-options.js 產生），
   * 這樣在不執行 JavaScript 的預覽器裡也看得到完整選單。
   * 這裡只在選單是空的時候才補上，避免兩邊互相覆蓋。
   */
  function buildSelects() {
    ensureOptions(el.city, PA.data.CITIES.map(function (c) { return c.name; }), function (v) {
      return v;
    }, OPT.defaultCity);

    ensureOptions(el.year, range(OPT.yearRange.max, OPT.yearRange.min, -1), function (v) {
      return v + ' 年';
    }, OPT.yearRange.defaultValue);

    ensureOptions(el.month, range(OPT.monthRange.min, OPT.monthRange.max), function (v) {
      return v + '月';
    }, OPT.monthRange.defaultValue);

    ensureOptions(el.day, range(1, 31), function (v) {
      return v + ' 日';
    }, OPT.dayDefault);

    ensureOptions(el.hour, range(OPT.hourRange.min, OPT.hourRange.max), function (v) {
      return String(v);
    }, OPT.hourRange.defaultValue);

    ensureOptions(el.minute, range(OPT.minuteRange.min, OPT.minuteRange.max), function (v) {
      return pad2(v);
    }, OPT.minuteRange.defaultValue);

    ensureOptions(el.meridiem, OPT.meridiems.map(function (m) { return m.value; }), function (v) {
      return OPT.meridiems.filter(function (m) { return m.value === v; })[0].label;
    }, OPT.meridiems[0].value);

    // 依實際年月修正「日」的天數（例如 2 月），保留目前選到的值
    rebuildDays();
  }

  function ensureOptions(select, values, labelFn, fallbackValue) {
    if (select.options.length) return;      // HTML 已經有選項，交給 HTML
    fillSelect(select, values, labelFn, fallbackValue);
  }

  /** 依年月重建「日」選單，並盡量保留原本選到的日期 */
  function rebuildDays(preferred) {
    var year = parseInt(el.year.value, 10);
    var month = parseInt(el.month.value, 10);
    var max = daysInMonth(year, month);
    var keep = preferred || parseInt(el.day.value, 10) || 1;

    fillSelect(el.day, range(1, max), function (v) { return v + ' 日'; }, Math.min(keep, max));
  }

  function fillSelect(select, values, labelFn, selected) {
    select.innerHTML = '';
    values.forEach(function (v) {
      select.appendChild(new Option(labelFn(v), String(v)));
    });
    select.value = String(selected);
  }

  /* ---------- 事件 ---------- */

  function bindEvents() {
    el.year.addEventListener('change', function () { rebuildDays(); });
    el.month.addEventListener('change', function () { rebuildDays(); });

    [el.hour, el.minute, el.meridiem].forEach(function (node) {
      node.addEventListener('change', updateHour24Preview);
    });

    // 使用者一修改就清掉該欄位的錯誤提示
    [el.city, el.year, el.month, el.day, el.hour, el.minute, el.meridiem].forEach(function (node) {
      node.addEventListener('input', function () { clearFieldError(node.id); });
      node.addEventListener('change', function () { clearFieldError(node.id); });
    });

    el.weekTable.addEventListener('toggle', revealCurrentCell);
    el.birthForm.addEventListener('submit', onSubmit);
  }

  function updateHour24Preview() {
    var h = parseInt(el.hour.value, 10);
    var m = parseInt(el.minute.value, 10);
    if (isNaN(h) || isNaN(m)) { el.hour24Preview.textContent = '—'; return; }
    el.hour24Preview.textContent = pad2(PA.api.toHour24(h, el.meridiem.value)) + ':' + pad2(m);
  }

  function onSubmit(e) {
    e.preventDefault();

    var raw = readForm();
    var errors = validate(raw);

    renderErrors(errors);
    if (Object.keys(errors).length) {
      focusFirstError(errors);
      return;
    }

    var request = PA.api.buildRequest(raw);
    setLoading(true);

    PA.api.query(request)
      .then(function (response) {
        lastResponse = response;
        renderResult(response);
      })
      .catch(function (err) {
        el.formError.textContent = '查詢失敗：' + (err && err.message ? err.message : '未知錯誤');
      })
      .finally(function () {
        setLoading(false);
      });
  }

  /* ---------- 讀取與驗證 ---------- */

  function readForm() {
    return {
      city: el.city.value,
      year: toInt(el.year.value),
      month: toInt(el.month.value),
      day: toInt(el.day.value),
      hour12: toInt(el.hour.value),
      minute: toInt(el.minute.value),
      meridiem: el.meridiem.value
    };
  }

  /**
   * 回傳 { 欄位id: 錯誤訊息 }；空物件代表通過。
   * 即使下拉選單「理論上」不會產生非法值，仍完整驗證，
   * 以防日後改成手動輸入或被外部程式竄改。
   */
  function validate(v) {
    var errors = {};

    if (!v.city) errors.city = '請選擇出生城市';
    else if (!PA.api.findCity(v.city)) errors.city = '沒有「' + v.city + '」的座標資料，請從清單選擇';

    if (v.year === null) errors.year = '請選擇年份';
    else if (v.year < OPT.yearRange.min || v.year > OPT.yearRange.max) {
      errors.year = '年份需介於 ' + OPT.yearRange.min + '–' + OPT.yearRange.max;
    }

    if (v.month === null) errors.month = '請選擇月份';
    else if (v.month < 1 || v.month > 12) errors.month = '月份需介於 1–12';

    if (v.day === null) {
      errors.day = '請選擇日期';
    } else if (v.day < 1) {
      errors.day = '日期需大於 0';
    } else if (!errors.year && !errors.month) {
      var max = daysInMonth(v.year, v.month);
      if (v.day > max) errors.day = v.year + ' 年 ' + v.month + ' 月只有 ' + max + ' 天';
    } else if (v.day > 31) {
      errors.day = '日期需介於 1–31';
    }

    if (v.hour12 === null) errors.hour = '請選擇小時';
    else if (v.hour12 < 1 || v.hour12 > 12) errors.hour = '小時需介於 1–12（12 小時制）';

    if (v.minute === null) errors.minute = '請選擇分鐘';
    else if (v.minute < 0 || v.minute > 59) errors.minute = '分鐘需介於 0–59';

    if (v.meridiem !== 'AM' && v.meridiem !== 'PM') errors.meridiem = '請選擇上午或下午';

    return errors;
  }

  function renderErrors(errors) {
    ['city', 'year', 'month', 'day', 'hour', 'minute', 'meridiem'].forEach(function (id) {
      var msg = errors[id] || '';
      var slot = document.querySelector('[data-error-for="' + id + '"]');
      if (slot) slot.textContent = msg;
      var control = document.getElementById(id);
      if (control) {
        control.classList.toggle('is-invalid', Boolean(msg));
        control.setAttribute('aria-invalid', msg ? 'true' : 'false');
      }
    });

    var count = Object.keys(errors).length;
    el.formError.textContent = count ? '尚有 ' + count + ' 個欄位需要修正' : '';
  }

  function clearFieldError(id) {
    var slot = document.querySelector('[data-error-for="' + id + '"]');
    if (slot) slot.textContent = '';
    var control = document.getElementById(id);
    if (control) {
      control.classList.remove('is-invalid');
      control.setAttribute('aria-invalid', 'false');
    }
  }

  function focusFirstError(errors) {
    var first = ['city', 'year', 'month', 'day', 'hour', 'minute', 'meridiem']
      .filter(function (id) { return errors[id]; })[0];
    if (first) document.getElementById(first).focus();
  }

  function setLoading(on) {
    el.submitBtn.disabled = on;
    el.submitBtn.textContent = on ? '✦ 推算中… ✦' : '✦ 查詢行星日與天使 ✦';
  }

  /* ---------- 渲染結果 ---------- */

  function renderResult(res) {
    var r = res.result;
    var b = res.request.birth;
    var dayP = r.planetaryDay;
    var hourP = r.planetaryHour.planet;

    el.resultSubject.textContent = res.request.city + '｜' +
      b.year + '/' + pad2(b.month) + '/' + pad2(b.day) + ' ' +
      pad2(b.hour24) + ':' + pad2(b.minute);

    el.daySymbol.textContent = dayP.symbol;
    el.dayPlanet.textContent = dayP.name + '（' + dayP.latin + '）';
    el.dayAngel.textContent = dayP.angel.name + ' · ' + dayP.angel.latin;
    el.dayAngelDomain.textContent = dayP.angel.domain;

    el.hourSymbol.textContent = hourP.symbol;
    el.hourPlanet.textContent = hourP.name + '（' + hourP.latin + '）';
    el.hourAngel.textContent = hourP.angel.name + ' · ' + hourP.angel.latin;
    el.hourRange.textContent = hourLabel(r.planetaryHour) + ' · ' +
      r.planetaryHour.startTime + '–' + r.planetaryHour.endTime;

    el.detailWeekday.textContent = r.weekday.name + '（行星日主星：' + dayP.name + '）';

    if (r.sun) {
      el.detailSun.textContent = '日出 ' + r.sun.sunrise + '　日落 ' + r.sun.sunset;
      el.detailHourlen.textContent = '日間每時 ' + r.sun.dayHourMinutes + ' 分　' +
        '夜間每時 ' + r.sun.nightHourMinutes + ' 分';
      el.detailSun.parentNode.hidden = false;
      el.detailHourlen.parentNode.hidden = false;
    } else {
      // 固定時鐘模式沒有日出日落可言，整列收起來
      el.detailSun.parentNode.hidden = true;
      el.detailHourlen.parentNode.hidden = true;
    }
    el.detailKeywords.textContent = hourP.keywords.join('、');
    el.detailColors.textContent = hourP.colors.join('、');
    el.detailMaterial.textContent = hourP.metal + '／' + hourP.incense;
    el.detailAdvice.textContent = hourP.advice;

    renderHourTable(r.hourTable, r.planetaryHour.index);
    renderWeekTable(b.hour24, r.weekday.index);

    el.jsonOutput.textContent = JSON.stringify(res, null, 2);
    el.resultNote.textContent = (res.meta.fallback ? '⚠ ' : '') +
      '資料來源：' + sourceLabel(res.meta) + '　※ ' + res.meta.notes;
    el.resultNote.classList.toggle('is-warning', Boolean(res.meta.fallback));

    el.result.hidden = false;
    el.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function sourceLabel(meta) {
    if (meta.source === 'remote') return '外部來源';
    return meta.method === 'sunrise-sunset' ? '本機日出日落計算' : '本機固定對照表';
  }

  /** 「日間第 3 時」／「夜間第 8 時」；固定時鐘模式則只有序號 */
  function hourLabel(hour) {
    if (typeof hour.ordinal !== 'number') return '第 ' + hour.index + ' 時段';
    return (hour.isNight ? '夜間' : '日間') + '第 ' + hour.ordinal + ' 時';
  }

  function renderHourTable(rows, currentIndex) {
    var frag = document.createDocumentFragment();
    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      if (row.index === currentIndex) tr.className = 'is-current';
      [hourLabel(row), row.start + '–' + row.end + (row.nextDay ? '⁺' : ''),
       row.symbol + ' ' + row.planetName, row.angelName]
        .forEach(function (text) {
          var td = document.createElement('td');
          td.textContent = text;
          tr.appendChild(td);
        });
      frag.appendChild(tr);
    });
    el.hourTableBody.innerHTML = '';
    el.hourTableBody.appendChild(frag);
  }

  /** 整週輪值表：列＝時段（00:00 起依序），欄＝星期日～星期六，標出查到的那一格 */
  function renderWeekTable(hour24, weekdayIndex) {
    var table = PA.api.getWeekTable();

    el.weekTableHead.innerHTML = '<th>時間</th>';
    table.weekdays.forEach(function (name, i) {
      var th = document.createElement('th');
      th.textContent = name;
      if (i === weekdayIndex) th.className = 'is-current-col';
      el.weekTableHead.appendChild(th);
    });

    var frag = document.createDocumentFragment();
    table.rows.forEach(function (row) {
      var tr = document.createElement('tr');

      var slot = document.createElement('th');
      slot.scope = 'row';
      slot.textContent = row.slot;
      tr.appendChild(slot);

      row.cells.forEach(function (cell, i) {
        var td = document.createElement('td');
        td.textContent = cell.symbol + ' ' + cell.planetName;
        if (i === weekdayIndex) td.className = 'is-current-col';
        if (i === weekdayIndex && row.hour === hour24) {
          td.className = 'is-current';
          td.title = cell.planetName + '時 · 天使 ' + cell.angelName;
        }
        tr.appendChild(td);
      });

      frag.appendChild(tr);
    });

    el.weekTableBody.innerHTML = '';
    el.weekTableBody.appendChild(frag);
  }

  /* 表格有 8 欄，窄螢幕要水平捲動；展開時把標出的那一格捲進畫面 */
  function revealCurrentCell() {
    if (!el.weekTable.open) return;
    var cell = el.weekTableBody.querySelector('td.is-current');
    if (cell && cell.scrollIntoView) {
      cell.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  }

  /* ---------- 工具 ---------- */

  function range(from, to, step) {
    step = step || (to >= from ? 1 : -1);
    var out = [];
    for (var v = from; step > 0 ? v <= to : v >= to; v += step) out.push(v);
    return out;
  }

  function daysInMonth(year, month) {
    if (!year || !month || month < 1 || month > 12) return 31;
    return new Date(year, month, 0).getDate();   // 自動處理閏年
  }

  function toInt(value) {
    var n = parseInt(value, 10);
    return isNaN(n) ? null : n;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function camel(id) {
    return id.replace(/-([a-z0-9])/g, function (_, c) { return c.toUpperCase(); });
  }

  PA.app = {
    validate: validate,
    last: function () { return lastResponse; }
  };
})(window);
