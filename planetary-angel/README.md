# 行星日 · 行星時 · 天使（Planetary Day & Hour Angel）

純 HTML / CSS / JavaScript 的前端，無框架、無建置流程、無外部相依。
輸入出生城市與日期時間後，顯示對應的**行星日**、**行星時**與**守護天使**。

行星時預設取自 `data.js` 內建的 24×7 對照表（`table` 模式，離線可用）；
也可切換成向外部來源查詢（`remote` 模式，見「改由外部網站查詢行星時」）。

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
node planetary-angel/generate-options.js   # 只有改過 data.js 的 FORM_OPTIONS 才需要
node planetary-angel/build-standalone.js
```

驗證行星時對照表：

```bash
node planetary-angel/verify-hour-table.js   # 168 格 + 天使對應全部比對，不符會以結束碼 1 失敗
```

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
| `index.html` | 頁面骨架：標題區、表單區（城市／年／月／日／時／分／上下午）、結果區（行星日卡、行星時卡、細節列表、當日 24 時段對照表、一週行星時輪值表、JSON 檢視）。只有結構，沒有邏輯。所有 `<option>` 都寫死在這裡（見下方「不執行 JavaScript 的環境」）。 |
| `generate-options.js` | 依 `data.js` 的範圍重新產生 `index.html` 裡的 `<option>` 清單，避免手動維護 318 個選項。改了 `FORM_OPTIONS` 才需要跑。 |
| `styles.css` | 全部外觀：深夜藍紫底 + 金色點綴的神秘學風格、CSS 星塵背景、表單與結果卡片樣式、錯誤狀態樣式、RWD（≤420px 改單欄）。 |
| `angels.tsv` | **行星與守護天使的對應**（土星 Cassiel、木星 Zadkiel、火星 Camael、太陽 Michael、金星 Hagiel、水星 Raphael、月亮 Gabriel）。`data.js` 依此填寫，`verify-hour-table.js` 會比對。 |
| `hour-table.tsv` | **原始對照表**（你提供的 24 列時段 × 7 欄星期，週日起）。`data.js` 的 `HOUR_RULERS` 就是它的程式版本，保留原檔以便日後查核。 |
| `verify-hour-table.js` | 把 168 格逐一丟進 `PA.api.query()` 與 `hour-table.tsv` 比對，並檢查 `angels.tsv` 的天使對應，全部相符才會過。改動資料後務必執行。 |
| `data.js` | 靜態知識庫：**24×7 行星時對照表 `HOUR_RULERS`（本專案的權威資料來源）**、七行星資料（符號、中英文名、守護天使、關鍵字、幸運色、金屬、薰香、建議）、星期主星對照、表單選單的預設值與範圍。純資料，不含邏輯。 |
| `api.js` | 資料層／服務層，**唯一要改的接 API 位置**。負責組 request、呼叫 provider、回傳統一格式的 response。內含 `tableProvider`（本機查表 + 模擬延遲）與 `remoteProvider`（`fetch` + timeout + 失敗退回對照表，預設未啟用）。 |
| `app.js` | UI 層：產生下拉選單、監聽事件、表單驗證、loading 狀態、渲染結果。完全不碰行星知識與查表邏輯。 |

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
PA.api.buildRequest()  → request（= 未來的 API body）
      │
      ▼
PA.api.query(request)   ← 這裡切換 table / remote
      │ Promise<response>
      ▼
renderResult(response) → [行星日卡][行星時卡][細節列表][當日 24 時段][一週輪值表][JSON]
```

分層原則：`data.js`（對照表與知識）→ `api.js`（查表／取數）→ `app.js`（畫面）。
換成後端計算時，只有 `api.js` 需要改，`app.js` 一行都不用動。

## 資料結構

### Request（送給 API 的 body）

```json
{
  "city": "台北",
  "birth": {
    "year": 2000, "month": 1, "day": 1,
    "hour12": 12, "minute": 0, "meridiem": "AM",
    "hour24": 0
  },
  "localDateTime": "2000-01-01T00:00:00",
  "options": { "hourSystem": "fixed-table" }
}
```

### Response

```json
{
  "meta": {
    "source": "table",
    "schemaVersion": "1.2",
    "generatedAt": "2026-07-31T15:37:04.377Z",
    "method": "fixed-hour-table",
    "notes": "行星時依固定對照表：00:00 起算，每時段 60 分鐘，欄位為星期。…"
  },
  "request": { "...同上..." },
  "result": {
    "weekday": { "index": 6, "name": "星期六" },
    "planetaryDay": {
      "key": "saturn", "symbol": "♄", "name": "土星", "latin": "Saturnus",
      "angel": { "name": "卡西爾", "latin": "Cassiel", "domain": "界限、時間、秩序" },
      "keywords": ["紀律", "結界", "斷捨離", "長期"],
      "colors": ["深黑", "暗褐"],
      "metal": "鉛", "incense": "沒藥", "advice": "適合立規矩、清理、閉關…"
    },
    "planetaryHour": {
      "index": 1, "isNight": true,
      "startTime": "00:00", "endTime": "01:00",
      "planet": { "...與 planetaryDay 相同結構，此例為木星／薩基爾..." }
    },
    "hourTable": [
      { "index": 1, "isNight": true, "planetKey": "jupiter", "planetName": "木星",
        "symbol": "♃", "angelName": "薩基爾", "start": "00:00", "end": "01:00" }
    ]
  }
}
```

## 改由外部網站查詢行星時

預設是本機查表（`CONFIG.mode = 'table'`），離線可用。要改成向外部來源查詢出生時間的行星時：

```js
// api.js 最上方
var CONFIG = {
  mode: 'remote',
  remote: {
    endpoint: 'https://你的網域/api/planetary-hour',  // 見下方「為什麼要自己的端點」
    method: 'POST',            // 或 'GET'，GET 會帶 ?date=&time=&city=
    timeoutMs: 8000,
    fallbackToTable: true      // 查詢失敗時退回本機對照表
  },
  ...
};
```

### 端點要回傳什麼

`adaptRemoteResponse()` 只認以下最小內容，其餘欄位一律忽略：

```json
{ "hourPlanet": "Venus", "dayPlanet": "Saturn", "start": "00:00", "end": "01:00" }
```

- `hourPlanet` 必填，其餘可省略：沒給 `dayPlanet` 就用星期主星，沒給 `start`/`end` 就用整點時段。
- 行星名稱走 `data.js` 的 `PLANET_ALIASES` 正規化，英文（`Venus`）、拉丁文（`Iuppiter`、`Sol`）、
  中文（`金星`、`金星時`）都認得；認不出來會當作查詢失敗。
- **天使一律由本專案的 `angels.tsv` 對應**，不吃外部來源的天使名 —— 多數行星時網站只給行星。
- 欄位名稱要換，只改 `adaptRemoteResponse()` 一個函式，其他檔案不受影響。

### 為什麼要自己的端點

瀏覽器的同源政策會擋掉前端直接呼叫第三方網站，除非對方回應 `Access-Control-Allow-Origin`。
`planetaryhours.net` 這類網站通常不會，所以純前端無法直接抓它的結果，需要一個自己的
後端或 serverless function 代為請求（Cloudflare Workers、Netlify Functions、Vercel Function 皆可），
在那裡把對方的回應轉成上面的格式。這一層也順便解決了對方改版時只需要改一個地方的問題。

### 失敗時的行為

`fallbackToTable: true`（預設）時，外部查詢失敗會自動退回本機對照表，結果區會以紅字標示
「⚠ 資料來源：本機對照表　※ …外部來源查詢失敗（原因）」，頁面不會整個不能用。
設成 `false` 則錯誤會往外丟，由表單下方的錯誤區顯示。

## 表單驗證

驗證集中在 `app.js` 的 `validate(values)`，回傳 `{ 欄位id: 錯誤訊息 }`，空物件代表通過：

- **必填**：出生城市不可空白；年、月、日、時、分、上下午皆須有值（`null` 會被擋下）。
- **範圍**：年 1900–2100、月 1–12、時 1–12（12 小時制）、分 0–59、上下午僅接受 `AM` / `PM`。
- **月／日合理性**：以 `new Date(year, month, 0).getDate()` 取當月天數，自動處理大小月與閏年（2000/2 有 29 天、2001/2 只有 28 天）。
- **UX 輔助**：切換年或月時會重建「日」的選項並自動夾住超出的值（2/29 → 改成 2001 年後變 2/28）；欄位一被修改就清掉該欄的紅字。
- **上下午換算**：`toHour24()` 處理 12AM = 00、12PM = 12 的特例；表單下方即時顯示 24 小時制預覽，方便使用者確認。

即使下拉選單理論上不會產生非法值，`validate()` 仍完整檢查，以防日後改成手動輸入或被外部程式竄改（可在 console 用 `PA.app.validate({...})` 直接測試）。

## 行星時對照表

行星時**不是推算出來的，而是直接查表**：`data.js` 的 `HOUR_RULERS` 是一張 24×7 的對照表。

- 列：`0`–`23`，第 0 列代表 `00:00–01:00`，每時段固定 60 分鐘
- 欄：`0`–`6`，依序為 週日、週一、週二、週三、週四、週五、週六
- 值：行星 key（`sun` / `moon` / `mars` / `mercury` / `jupiter` / `venus` / `saturn`）

結果區的「一週行星時輪值表」就是這張表的完整呈現（列依時間 00:00→24:00 排序、
欄為星期日→星期六），並會標出查詢到的那一格；資料由 `PA.api.getWeekTable()` 提供，
不塞進每次查詢的 response，以免 168 格灌爆 payload。

`api.js` 的 `compute()` 只做兩件事：用出生日期取得星期（欄），用 24 小時制的整點取得時段（列），
然後查表。不做任何日出、時區或迦勒底次序的計算。

**行星日**取該日星期的主星：日→太陽、一→月亮、二→火星、三→水星、四→木星、五→金星、六→土星
（也就是對照表 `06:00` 那一列）。

**為什麼 06:00 前的時段不等於當日主星？** 因為行星時序從前一天延續下來，
例如週六 `00:00–01:00` 是木星時（屬週五的序列），到 `06:00` 才輪回土星（週六主星）。
遇到 06:00 前的查詢，結果區會多一句說明，避免被誤認為算錯。

**已知取捨**：傳統行星時應把日出到日落等分為 12 個「日間時」、日落到隔日日出等分為 12 個「夜間時」，
長度隨季節與緯度變動。本表採固定時鐘時段（00:00 起算、每段 60 分鐘），全年與各地一致。
日後若要改成依經緯度計算，改 `api.js` 即可，`CONFIG.hourSystem` 就是為此保留的旗標。

## 除錯

- `PA.app.last()`：取得最近一次的完整 response。
- `PA.api.CONFIG`：檢視／即時修改 mode、remote.endpoint、hourSystem。
- `PA.api.resolvePlanetKey('Venus')`：測試外部來源的行星名稱能不能被辨識。
- 結果區的「檢視資料結構（JSON）」可直接看到當次的完整 payload。
