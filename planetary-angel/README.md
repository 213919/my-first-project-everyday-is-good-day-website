# 行星日 · 行星時 · 天使（Planetary Day & Hour Angel）

純 HTML / CSS / JavaScript 的前端，無框架、無建置流程、無外部相依、不需連網。
輸入出生城市與日期時間後，顯示對應的**行星日**、**行星時**與**守護天使**。

行星時預設依**出生地當日的日出日落**計算（傳統定義：日間與夜間各分 12 段），
所有天文計算都在瀏覽器裡完成。

## 執行方式

**單一檔案版（最簡單）**：直接雙擊 `standalone.html`，一個檔案內含全部 CSS/JS，
不需伺服器、不需網路，也方便單獨傳給別人。

**多檔版（開發用）**：直接用瀏覽器開啟 `index.html` 即可（`file://` 可正常運作）。
若要用本機伺服器：

```bash
python3 -m http.server 8000
# 開啟 http://localhost:8000/planetary-angel/
```

`standalone.html` 是產生物，不要直接編輯。改完多檔版後重新打包：

```bash
node planetary-angel/generate-options.js   # 只有改過 data.js 的選項範圍或城市清單才需要
node planetary-angel/build-standalone.js
```

驗證：

```bash
node planetary-angel/verify-astro.js        # 日出日落與行星時的天文正確性
node planetary-angel/verify-hour-table.js   # 固定時鐘對照表 168 格 + 天使對應
```

兩支都是不符即以結束碼 1 失敗，可直接掛進 CI。

### 不執行 JavaScript 的環境

iOS 檔案 App 的 Quick Look、各種 App 的內建檔案預覽器、郵件附件預覽等，
**不會執行 JavaScript**。若下拉選單的選項是用 JS 產生的，在這些地方會全部變成空的
（點下去顯示「沒有選項」）。

因此：

- 所有 `<option>` 都寫死在 `index.html`（由 `generate-options.js` 產生），
  不執行 JS 也看得到完整選單與預設值。
- `app.js` 的 `ensureOptions()` 只在選單為空時才補上，兩邊不會互相覆蓋。
- 查詢結果仍然需要 JavaScript，所以放了 `<noscript>` 提示，告訴使用者改用瀏覽器開啟。

## 檔案說明

| 檔案 | 用途 |
| --- | --- |
| `index.html` | 頁面骨架：標題區、表單區（城市／年／月／日／時／分／上下午）、結果區（行星日卡、行星時卡、細節列表、當日 24 個行星時、一週輪值表、JSON 檢視）。只有結構，沒有邏輯。所有 `<option>` 都寫死在這裡。 |
| `styles.css` | 全部外觀：深夜藍紫底 + 金色點綴的神秘學風格、CSS 星塵背景、表單與結果卡片樣式、錯誤狀態樣式、RWD（≤420px 改單欄）。 |
| `data.js` | 靜態資料：七行星與守護天使、24×7 固定時鐘對照表 `HOUR_RULERS`、迦勒底次序、**台灣 22 縣市座標**、**歷年夏令時間區間**、行星與天使的別名對照、表單選單範圍。純資料，不含邏輯。 |
| `astro.js` | 天文計算：NOAA 日出日落公式、某時刻落在第幾個行星時、某日完整 24 個行星時。只吃經緯度與日期，不碰 DOM 也不碰行星知識。 |
| `api.js` | 資料層／服務層。組 request、選演算法、回傳統一格式的 response。含兩種行星時算法與外部來源 provider。 |
| `app.js` | UI 層：產生下拉選單、監聽事件、表單驗證、loading 狀態、渲染結果。完全不碰天文與行星知識。 |
| `generate-options.js` | 依 `data.js` 重新產生 `index.html` 裡的 `<option>` 清單（城市 22 個 + 年月日時分共 340 個），避免手動維護。 |
| `build-standalone.js` | 把多檔版打包成單一檔案 `standalone.html`。 |
| `verify-astro.js` | 驗證天文計算：分至日晝長、正午置中、日夜時段互補為 120 分、24 時段首尾相接、行星日主星、夏令時間換算。 |
| `verify-hour-table.js` | 驗證固定時鐘模式的 168 格與 `hour-table.tsv` 一致，並檢查 `angels.tsv` 的天使對應。 |
| `hour-table.tsv` | 固定時鐘版的原始對照表（24 列時段 × 7 欄星期，週日起）。 |
| `angels.tsv` | 行星與守護天使的對應（土星 Cassiel、木星 Zadkiel、火星 Camael、太陽 Michael、金星 Hagiel、水星 Raphael、月亮 Gabriel）。 |
| `standalone.html` | **產生物**，勿直接編輯。 |

## 元件拆分與資料流

```
[表單區 BirthForm]
      │ submit
      ▼
readForm()  → 原始值 { city, year, month, day, hour12, minute, meridiem }
      │
      ▼
validate() ──有錯──▶ renderErrors() 顯示各欄位錯誤，中止
      │ 通過
      ▼
PA.api.buildRequest()  → request（含城市座標，= 未來的 API body）
      │
      ▼
PA.api.query(request)
      │   ├─ hourSystem 'sunrise'     → PA.astro 計算日出日落
      │   ├─ hourSystem 'fixed-table' → 查 data.js 的 HOUR_RULERS
      │   └─ mode 'remote'            → 外部來源，失敗則退回上述本機算法
      ▼ Promise<response>
renderResult(response) → [行星日卡][行星時卡][細節列表][當日 24 時][一週輪值表][JSON]
```

分層原則：`data.js`（資料）→ `astro.js`（天文）→ `api.js`（組裝）→ `app.js`（畫面）。

## 行星時的兩種算法

`api.js` 的 `CONFIG.hourSystem` 決定用哪一種，兩者結果**不一樣**。

### `'sunrise'`（預設）— 依日出日落的真實行星時

傳統定義：日出到日落等分為 12 個「日間時」，日落到隔日日出等分為 12 個「夜間時」。
因此時段長度隨季節與緯度變動 —— 台北冬至的日間時約 53 分鐘，夏至約 68 分鐘，
且日間時 + 夜間時恆為 120 分鐘。一天從**日出**開始，所以日出前仍屬前一天的行星日。

日出日落用 NOAA 的太陽位置公式（sunrise equation）算，太陽高度取 -0.833°
（含大氣折射與日輪半徑），只需要經緯度與日期，不連網。準確度可由 `verify-astro.js`
檢驗：分至日晝長與理論值相差在數分鐘內。

**夏令時間**：台灣 1945–1979 間多個年份實施過日光節約時間，鐘面時間比標準時快 1 小時。
出生時間落在這些區間時會自動 −1 小時換算，否則行星時會整整差一格。
區間定義在 `data.js` 的 `TW_DST`，可用 `CONFIG.applyDst = false` 關閉。
⚠ 該表依歷年公告整理，年代久遠且各方轉錄略有出入，若有更權威的版本請直接改 `TW_DST`。

### `'fixed-table'` — 固定時鐘對照表

24 列時段 × 7 欄星期的查表，00:00 起算、每段固定 60 分鐘、全年與各地一致。
資料在 `data.js` 的 `HOUR_RULERS`，原始檔為 `hour-table.tsv`。
結果區的「一週行星時輪值表」就是這張表的完整呈現（由 `PA.api.getWeekTable()` 提供，
不塞進每次查詢的 response，以免 168 格灌爆 payload）。

兩種算法在春分秋分附近最接近，其餘時候會落在不同的行星時上。

## 資料結構

### Request

```json
{
  "city": "高雄市",
  "place": { "name": "高雄市", "lat": 22.6273, "lon": 120.3014, "tz": 8 },
  "birth": {
    "year": 1975, "month": 7, "day": 15,
    "hour12": 9, "minute": 0, "meridiem": "AM",
    "hour24": 9
  },
  "localDateTime": "1975-07-15T09:00:00",
  "options": { "hourSystem": "sunrise", "applyDst": true }
}
```

### Response（`sunrise` 模式）

```json
{
  "meta": {
    "source": "table",
    "schemaVersion": "2.0",
    "generatedAt": "2026-08-02T13:40:00.000Z",
    "method": "sunrise-sunset",
    "dstApplied": true,
    "notes": "行星時依高雄市（22.63°N, 120.30°E）當日的日出日落計算…"
  },
  "request": { "...同上..." },
  "result": {
    "weekday": { "index": 2, "name": "星期二" },
    "planetaryDay": {
      "key": "mars", "symbol": "♂", "name": "火星", "latin": "Mars",
      "angel": { "name": "卡麥爾", "latin": "Camael", "domain": "力量、勇氣、公正" },
      "keywords": ["行動", "競爭", "斬斷", "護身"],
      "colors": ["正紅", "鐵鏽色"],
      "metal": "鐵", "incense": "龍血", "advice": "適合訓練、談判施壓…"
    },
    "planetaryHour": {
      "index": 3, "ordinal": 3, "isNight": false,
      "startTime": "07:37", "endTime": "08:44", "lengthMinutes": 67,
      "planet": { "...與 planetaryDay 相同結構，此例為金星／Hagiel..." }
    },
    "sun": {
      "date": "1975-07-15",
      "sunrise": "05:23", "sunset": "18:46", "nextSunrise": "05:24",
      "dayHourMinutes": 67, "nightHourMinutes": 53
    },
    "hourTable": [
      { "index": 1, "ordinal": 1, "isNight": false, "planetKey": "mars",
        "planetName": "火星", "symbol": "♂", "angelName": "卡麥爾",
        "start": "05:23", "end": "06:30", "nextDay": false }
    ]
  }
}
```

`index` 為 1–24（1–12 日間、13–24 夜間），`ordinal` 為日間或夜間中的第幾時（1–12）。
`nextDay` 標示該時段的鐘面時間已跨過午夜。
`fixed-table` 模式沒有 `sun` 與 `ordinal`、`lengthMinutes`。

## 改由外部網站查詢行星時

預設是本機計算（不需連網）。要改成向外部來源查詢：

```js
// api.js 最上方
var CONFIG = {
  mode: 'remote',
  remote: {
    endpoint: 'https://你的網域/api/planetary-hour',  // 見下方「為什麼要自己的端點」
    method: 'POST',            // 或 'GET'，GET 會帶 ?date=&time=&city=
    timeoutMs: 8000,
    fallbackToTable: true      // 查詢失敗時退回本機計算
  },
  ...
};
```

### 端點要回傳什麼

`adaptRemoteResponse()` 只認以下最小內容，其餘欄位一律忽略：

```json
{
  "hourPlanet": "Venus", "dayPlanet": "Saturn",
  "hourAngel": "Anael", "dayAngel": "Cassiel",
  "start": "00:00", "end": "01:00"
}
```

- `hourPlanet` 必填，其餘可省略：沒給 `dayPlanet` 就用星期主星，沒給 `start`/`end` 就用整點時段。
- 行星名稱走 `PLANET_ALIASES` 正規化，英文（`Venus`）、拉丁文（`Iuppiter`、`Sol`）、
  中文（`金星`、`金星時`）都認得；認不出來會當作查詢失敗。
- **天使以外部來源為準**：有給 `hourAngel` / `dayAngel` 就用它的名字，中文譯名查 `ANGEL_NAMES_ZH`，
  查不到就直接顯示原文（不自行編譯名）。外部沒給時才退回 `angels.tsv`。
  `meta.angelSource` 標明這次是 `remote` 還是 `local`，`angel.localName` 保留本地版本方便比對。
- 欄位名稱要換，只改 `adaptRemoteResponse()` 一個函式，其他檔案不受影響。

### 為什麼要自己的端點

瀏覽器的同源政策會擋掉前端直接呼叫第三方網站，除非對方回應 `Access-Control-Allow-Origin`。
行星時類的工具網站通常不會，而且多半是純前端 SPA（自己在瀏覽器算完就顯示，背後沒有可呼叫的 API）。
因此需要一個自己的後端或 serverless function 代為請求（Cloudflare Workers、Netlify Functions、
Vercel Function 皆可），在那裡把對方的回應轉成上面的格式。

### 失敗時的行為

`fallbackToTable: true`（預設）時，外部查詢失敗會自動退回本機計算，結果區以紅字標示
「⚠ 資料來源：本機日出日落計算　※ …外部來源查詢失敗（原因）」，頁面不會整個不能用。
設成 `false` 則錯誤會往外丟，由表單下方的錯誤區顯示。

## 表單驗證

驗證集中在 `app.js` 的 `validate(values)`，回傳 `{ 欄位id: 錯誤訊息 }`，空物件代表通過：

- **必填**：出生城市須有值；年、月、日、時、分、上下午皆須有值（`null` 會被擋下）。
- **城市**：必須是 `data.js` 的 `CITIES` 之一，否則沒有座標可算日出日落。
- **範圍**：年 1900–2100、月 1–12、時 1–12（12 小時制）、分 0–59、上下午僅接受 `AM` / `PM`。
- **月／日合理性**：以 `new Date(year, month, 0).getDate()` 取當月天數，自動處理大小月與閏年
  （2000/2 有 29 天、2001/2 只有 28 天）。
- **UX 輔助**：切換年或月時會重建「日」的選項並自動夾住超出的值（2/29 → 改成 2001 年後變 2/28）；
  欄位一被修改就清掉該欄的紅字。
- **上下午換算**：`toHour24()` 處理 12AM = 00、12PM = 12 的特例；表單下方即時顯示 24 小時制預覽。

即使下拉選單理論上不會產生非法值，`validate()` 仍完整檢查，以防日後改成手動輸入或被外部程式竄改
（可在 console 用 `PA.app.validate({...})` 直接測試）。

## 除錯

- `PA.app.last()`：取得最近一次的完整 response。
- `PA.api.CONFIG`：檢視／即時修改 hourSystem、applyDst、mode、remote.endpoint。
- `PA.astro.solarEvents(2024, 5, 5, 25.033, 121.565)`：直接看某地某日的日出日落（儒略日）。
- `PA.api.resolvePlanetKey('Venus')`：測試外部來源的行星名稱能不能被辨識。
- 結果區的「檢視資料結構（JSON）」可直接看到當次的完整 payload。
