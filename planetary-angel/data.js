/*
 * data.js — 靜態知識庫（行星 / 天使 / 迦勒底次序）
 * 只放資料，不做任何 DOM 或計算，方便日後整包改成後端回傳。
 */
(function (global) {
  'use strict';

  var PA = (global.PA = global.PA || {});

  /* 七行星基本資料：符號、中英文名、守護天使與象徵物 */
  var PLANETS = {
    sun: {
      key: 'sun',
      symbol: '☉',
      name: '太陽',
      latin: 'Sol',
      angel: { name: '米迦勒', latin: 'Michael', domain: '守護、勝利、光明' },
      keywords: ['生命力', '權威', '名聲', '療癒'],
      colors: ['金色', '橙黃'],
      metal: '金',
      incense: '乳香',
      advice: '適合展現自我、面見上位者、處理與名譽相關之事。'
    },
    moon: {
      key: 'moon',
      symbol: '☽',
      name: '月亮',
      latin: 'Luna',
      angel: { name: '加百列', latin: 'Gabriel', domain: '傳訊、夢境、情感' },
      keywords: ['直覺', '夢境', '家宅', '孕育'],
      colors: ['銀白', '珍珠色'],
      metal: '銀',
      incense: '茉莉',
      advice: '適合占卜、靜心、處理家務與情感、與母性相關之事。'
    },
    mars: {
      key: 'mars',
      symbol: '♂',
      name: '火星',
      latin: 'Mars',
      angel: { name: '卡麥爾', latin: 'Camael', domain: '力量、勇氣、公正' },
      keywords: ['行動', '競爭', '斬斷', '護身'],
      colors: ['正紅', '鐵鏽色'],
      metal: '鐵',
      incense: '龍血',
      advice: '適合訓練、談判施壓、切斷孽緣；不宜衝動爭執。'
    },
    mercury: {
      key: 'mercury',
      symbol: '☿',
      name: '水星',
      latin: 'Mercurius',
      angel: { name: '拉斐爾', latin: 'Raphael', domain: '智慧、言語、療癒' },
      keywords: ['溝通', '學習', '契約', '商貿'],
      colors: ['淺藍', '雜色'],
      metal: '水銀',
      incense: '薰衣草',
      advice: '適合考試、寫作、簽約、談生意與短程移動。'
    },
    jupiter: {
      key: 'jupiter',
      symbol: '♃',
      name: '木星',
      latin: 'Iuppiter',
      angel: { name: '薩基爾', latin: 'Zadkiel', domain: '恩慈、寬恕、豐盛' },
      keywords: ['貴人', '財富', '法律', '信仰'],
      colors: ['royal blue', '紫'],
      metal: '錫',
      incense: '雪松',
      advice: '適合求財、求貴人、開展計畫、與師長或法律事務往來。'
    },
    venus: {
      key: 'venus',
      symbol: '♀',
      name: '金星',
      latin: 'Venus',
      angel: { name: '哈吉爾', latin: 'Hagiel', domain: '愛、美感、吸引' },
      keywords: ['戀愛', '藝術', '和解', '享樂'],
      colors: ['翡翠綠', '粉紅'],
      metal: '銅',
      incense: '玫瑰',
      advice: '適合告白、和解、社交、美容與一切美的創作。'
    },
    saturn: {
      key: 'saturn',
      symbol: '♄',
      name: '土星',
      latin: 'Saturnus',
      angel: { name: '卡西爾', latin: 'Cassiel', domain: '界限、時間、秩序' },
      keywords: ['紀律', '結界', '斷捨離', '長期'],
      colors: ['深黑', '暗褐'],
      metal: '鉛',
      incense: '沒藥',
      advice: '適合立規矩、清理、閉關、處理長期與土地相關之事；不宜開張。'
    }
  };

  /*
   * 行星時對照表（本專案的權威資料來源）
   *
   *   HOUR_RULERS[時][星期] = 行星 key
   *   時   = 0–23，第 0 列代表 00:00–01:00，每時段 60 分鐘
   *   星期 = 0–6，依序為 週日、週一、週二、週三、週四、週五、週六
   *
   * 內容依迦勒底次序（土、木、火、日、金、水、月）循環，06:00 那一列
   * 正好是各星期的主星（日→太陽、一→月亮…六→土星）；06:00 之前的時段
   * 延續前一天的順序，所以例如週日 00:00 是金星時（屬週六土星日的序列）。
   */
  var HOUR_RULERS = [
    /* 00:00–01:00 */ ['venus', 'saturn', 'sun', 'moon', 'mars', 'mercury', 'jupiter'],
    /* 01:00–02:00 */ ['mercury', 'jupiter', 'venus', 'saturn', 'sun', 'moon', 'mars'],
    /* 02:00–03:00 */ ['moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'sun'],
    /* 03:00–04:00 */ ['saturn', 'sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus'],
    /* 04:00–05:00 */ ['jupiter', 'venus', 'saturn', 'sun', 'moon', 'mars', 'mercury'],
    /* 05:00–06:00 */ ['mars', 'mercury', 'jupiter', 'venus', 'saturn', 'sun', 'moon'],
    /* 06:00–07:00 */ ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'],
    /* 07:00–08:00 */ ['venus', 'saturn', 'sun', 'moon', 'mars', 'mercury', 'jupiter'],
    /* 08:00–09:00 */ ['mercury', 'jupiter', 'venus', 'saturn', 'sun', 'moon', 'mars'],
    /* 09:00–10:00 */ ['moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'sun'],
    /* 10:00–11:00 */ ['saturn', 'sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus'],
    /* 11:00–12:00 */ ['jupiter', 'venus', 'saturn', 'sun', 'moon', 'mars', 'mercury'],
    /* 12:00–13:00 */ ['mars', 'mercury', 'jupiter', 'venus', 'saturn', 'sun', 'moon'],
    /* 13:00–14:00 */ ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'],
    /* 14:00–15:00 */ ['venus', 'saturn', 'sun', 'moon', 'mars', 'mercury', 'jupiter'],
    /* 15:00–16:00 */ ['mercury', 'jupiter', 'venus', 'saturn', 'sun', 'moon', 'mars'],
    /* 16:00–17:00 */ ['moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'sun'],
    /* 17:00–18:00 */ ['saturn', 'sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus'],
    /* 18:00–19:00 */ ['jupiter', 'venus', 'saturn', 'sun', 'moon', 'mars', 'mercury'],
    /* 19:00–20:00 */ ['mars', 'mercury', 'jupiter', 'venus', 'saturn', 'sun', 'moon'],
    /* 20:00–21:00 */ ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'],
    /* 21:00–22:00 */ ['venus', 'saturn', 'sun', 'moon', 'mars', 'mercury', 'jupiter'],
    /* 22:00–23:00 */ ['mercury', 'jupiter', 'venus', 'saturn', 'sun', 'moon', 'mars'],
    /* 23:00–24:00 */ ['moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'sun']
  ];

  /* 星期 0=週日 … 6=週六，對應的行星日主星（即上表 06:00 那一列） */
  var WEEKDAY_RULERS = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'];

  var WEEKDAY_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  /* 表單下拉選單用的靜態選項來源 */
  var FORM_OPTIONS = {
    yearRange: { min: 1900, max: 2100, defaultValue: 2000 },
    monthRange: { min: 1, max: 12, defaultValue: 1 },
    dayDefault: 1,
    hourRange: { min: 1, max: 12, defaultValue: 12 },   // 12 小時制
    minuteRange: { min: 0, max: 59, defaultValue: 0 },
    meridiems: [
      { value: 'AM', label: 'AM 上午' },
      { value: 'PM', label: 'PM 下午' }
    ],
    defaultCity: '台北'
  };

  PA.data = {
    PLANETS: PLANETS,
    HOUR_RULERS: HOUR_RULERS,
    WEEKDAY_RULERS: WEEKDAY_RULERS,
    WEEKDAY_NAMES: WEEKDAY_NAMES,
    FORM_OPTIONS: FORM_OPTIONS
  };
})(window);
