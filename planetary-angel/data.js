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

  /*
   * 行星別名 → 內部 key。
   * 外部資料來源（例如 planetaryhours.net）回傳的名稱可能是英文、拉丁文或中文，
   * 一律先在這裡正規化，再去 PLANETS 取對應的守護天使。
   */
  var PLANET_ALIASES = {
    sun: 'sun', sol: 'sun', 太陽: 'sun', 日: 'sun',
    moon: 'moon', luna: 'moon', 月亮: 'moon', 月: 'moon',
    mars: 'mars', 火星: 'mars', 火: 'mars',
    mercury: 'mercury', mercurius: 'mercury', 水星: 'mercury', 水: 'mercury',
    jupiter: 'jupiter', iuppiter: 'jupiter', jove: 'jupiter', 木星: 'jupiter', 木: 'jupiter',
    venus: 'venus', 金星: 'venus', 金: 'venus',
    saturn: 'saturn', saturnus: 'saturn', 土星: 'saturn', 土: 'saturn'
  };

  /*
   * 天使英文名 → 中文譯名。
   * 外部來源若自己有列天使名，會以它為準；這裡只負責補上中文顯示，
   * 查不到的名字就直接顯示原文（涵蓋各家常見的異名寫法）。
   */
  var ANGEL_NAMES_ZH = {
    michael: '米迦勒',
    gabriel: '加百列',
    raphael: '拉斐爾',
    cassiel: '卡西爾', castiel: '卡西爾', kafziel: '卡西爾',
    zadkiel: '薩基爾', tzadkiel: '薩基爾', sachiel: '薩基爾',
    camael: '卡麥爾', kamael: '卡麥爾', chamuel: '卡麥爾', samael: '薩邁爾',
    hagiel: '哈吉爾', haniel: '哈尼爾', anael: '安納爾',
    uriel: '烏列爾'
  };

  /* 星期 0=週日 … 6=週六，對應的行星日主星（即上表 06:00 那一列） */
  var WEEKDAY_RULERS = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'];

  /* 迦勒底次序：行星時依此循環，日出後第 1 時即當日主星 */
  var CHALDEAN_ORDER = ['saturn', 'jupiter', 'mars', 'sun', 'venus', 'mercury', 'moon'];

  /*
   * 台灣各縣市座標（縣治所在地），時區固定 UTC+8。
   * 用於計算日出日落 —— 真實行星時的長度取決於地點與日期。
   */
  var CITIES = [
    { name: '台北市', lat: 25.0330, lon: 121.5654, tz: 8 },
    { name: '新北市', lat: 25.0169, lon: 121.4628, tz: 8 },
    { name: '基隆市', lat: 25.1276, lon: 121.7392, tz: 8 },
    { name: '桃園市', lat: 24.9937, lon: 121.3009, tz: 8 },
    { name: '新竹市', lat: 24.8138, lon: 120.9675, tz: 8 },
    { name: '新竹縣', lat: 24.8387, lon: 121.0177, tz: 8 },
    { name: '苗栗縣', lat: 24.5602, lon: 120.8214, tz: 8 },
    { name: '台中市', lat: 24.1477, lon: 120.6736, tz: 8 },
    { name: '彰化縣', lat: 24.0518, lon: 120.5161, tz: 8 },
    { name: '南投縣', lat: 23.9609, lon: 120.9719, tz: 8 },
    { name: '雲林縣', lat: 23.7092, lon: 120.4313, tz: 8 },
    { name: '嘉義市', lat: 23.4801, lon: 120.4491, tz: 8 },
    { name: '嘉義縣', lat: 23.4518, lon: 120.2555, tz: 8 },
    { name: '台南市', lat: 22.9999, lon: 120.2269, tz: 8 },
    { name: '高雄市', lat: 22.6273, lon: 120.3014, tz: 8 },
    { name: '屏東縣', lat: 22.6813, lon: 120.4879, tz: 8 },
    { name: '宜蘭縣', lat: 24.7021, lon: 121.7378, tz: 8 },
    { name: '花蓮縣', lat: 23.9871, lon: 121.6015, tz: 8 },
    { name: '台東縣', lat: 22.7583, lon: 121.1444, tz: 8 },
    { name: '澎湖縣', lat: 23.5711, lon: 119.5793, tz: 8 },
    { name: '金門縣', lat: 24.4321, lon: 118.3171, tz: 8 },
    { name: '連江縣', lat: 26.1608, lon: 119.9494, tz: 8 }
  ];

  /*
   * 台灣歷年夏令時間（日光節約時間）。
   * 出生時間若落在這些區間，鐘面時間比標準時快 1 小時，換算日出日落前要先扣掉，
   * 否則行星時會整整差一格。使用者可在表單關閉此換算。
   *
   * ⚠ 這份區間依交通部歷年公告整理，年代久遠且各方轉錄略有出入；
   *   若你手上有更權威的版本，改這裡即可，其餘程式不受影響。
   */
  var TW_DST = [
    { fromYear: 1945, toYear: 1951, start: [5, 1], end: [9, 30] },
    { fromYear: 1952, toYear: 1952, start: [3, 1], end: [10, 31] },
    { fromYear: 1953, toYear: 1954, start: [4, 1], end: [10, 31] },
    { fromYear: 1955, toYear: 1959, start: [4, 1], end: [9, 30] },
    { fromYear: 1960, toYear: 1961, start: [6, 1], end: [9, 30] },
    { fromYear: 1974, toYear: 1975, start: [4, 1], end: [9, 30] },
    { fromYear: 1979, toYear: 1979, start: [7, 1], end: [9, 30] }
  ];

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
    defaultCity: '台北市'
  };

  PA.data = {
    PLANETS: PLANETS,
    HOUR_RULERS: HOUR_RULERS,
    CHALDEAN_ORDER: CHALDEAN_ORDER,
    CITIES: CITIES,
    TW_DST: TW_DST,
    PLANET_ALIASES: PLANET_ALIASES,
    ANGEL_NAMES_ZH: ANGEL_NAMES_ZH,
    WEEKDAY_RULERS: WEEKDAY_RULERS,
    WEEKDAY_NAMES: WEEKDAY_NAMES,
    FORM_OPTIONS: FORM_OPTIONS
  };
})(window);
