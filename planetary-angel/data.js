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
      angel: { name: '薩邁爾', latin: 'Samael', domain: '勇氣、切割、防衛' },
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
      angel: { name: '薩基爾', latin: 'Sachiel', domain: '恩慈、財富、擴張' },
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
      angel: { name: '安納爾', latin: 'Anael', domain: '愛、和諧、美感' },
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

  /* 迦勒底次序（Chaldean order）：行星時依此循環 */
  var CHALDEAN_ORDER = ['saturn', 'jupiter', 'mars', 'sun', 'venus', 'mercury', 'moon'];

  /* 星期 0=週日 … 6=週六，對應的行星日主星 */
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
    CHALDEAN_ORDER: CHALDEAN_ORDER,
    WEEKDAY_RULERS: WEEKDAY_RULERS,
    WEEKDAY_NAMES: WEEKDAY_NAMES,
    FORM_OPTIONS: FORM_OPTIONS
  };
})(window);
