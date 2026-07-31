# 行星日 · 行星時 · 天使（Planetary Day & Hour Angel）

純 HTML / CSS / JavaScript 的前端，無框架、無建置流程、無外部相依。
輸入出生城市與日期時間後，顯示對應的**行星日**、**行星時**與**守護天使**。

目前結果由本機的簡化推算產生（`mock` 假資料），資料結構已按「日後直接接 API」的形式設計。

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
| `index.html` | 頁面骨架：標題區、表單區（城市／年／月／日／時／分／上下午）、結果區（行星日卡、行星時卡、細節列表、24 行星時對照表、JSON 檢視）。只有結構，沒有邏輯。所有 `<option>` 都寫死在這裡（見下方「不執行 JavaScript 的環境」）。 |
| `generate-options.js` | 依 `data.js` 的範圍重新產生 `index.html` 裡的 `<option>` 清單，避免手動維護 318 個選項。改了 `FORM_OPTIONS` 才需要跑。 |
| `styles.css` | 全部外觀：深夜藍紫底 + 金色點綴的神秘學風格、CSS 星塵背景、表單與結果卡片樣式、錯誤狀態樣式、RWD（≤420px 改單欄）。 |
| `data.js` | 靜態知識庫：七行星資料（符號、中英文名、守護天使、關鍵字、幸運色、金屬、薰香、建議）、迦勒底次序、星期主星對照、表單選單的預設值與範圍。純資料，不含邏輯。 |
| `api.js` | 資料層／服務層，**唯一要改的接 API 位置**。負責組 request、呼叫 provider、回傳統一格式的 response。內含 `mockProvider`（本機推算 + 模擬延遲）與 `remoteProvider`（`fetch` + timeout，已寫好但未啟用）。 |
| `app.js` | UI 層：產生下拉選單、監聽事件、表單驗證、loading 狀態、渲染結果。完全不碰行星知識與推算。 |

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
PA.api.query(request)   ← 這裡切換 mock / remote
      │ Promise<response>
      ▼
renderResult(response) → [行星日卡][行星時卡][細節列表][24 時對照表][JSON]
```

分層原則：`data.js`（知識）→ `api.js`（推算／取數）→ `app.js`（畫面）。
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
  "options": { "sunriseMinutes": 360, "hourSystem": "equal" }
}
```

### Response

```json
{
  "meta": {
    "source": "mock",
    "schemaVersion": "1.0",
    "generatedAt": "2026-07-31T15:37:04.377Z",
    "approximate": true,
    "notes": "日出固定以 06:00 估算，未依台北實際經緯度計算。"
  },
  "request": { "...同上..." },
  "result": {
    "weekday": { "index": 5, "name": "星期五" },
    "planetaryDay": {
      "key": "venus", "symbol": "♀", "name": "金星", "latin": "Venus",
      "angel": { "name": "安納爾", "latin": "Anael", "domain": "愛、和諧、美感" },
      "keywords": ["戀愛", "藝術", "和解", "享樂"],
      "colors": ["翡翠綠", "粉紅"],
      "metal": "銅", "incense": "玫瑰", "advice": "適合告白、和解、社交…"
    },
    "planetaryHour": {
      "index": 19, "isNight": true,
      "startTime": "00:00", "endTime": "01:00",
      "planet": { "...與 planetaryDay 相同結構..." }
    },
    "hourTable": [
      { "index": 1, "isNight": false, "planetKey": "venus", "planetName": "金星",
        "symbol": "♀", "angelName": "安納爾", "start": "06:00", "end": "07:00" }
    ]
  }
}
```

## 之後要接真 API 時

1. 後端實作一個 `POST` 端點，接收上面的 request，回傳上面的 response。
2. 修改 `api.js` 最上方的 `CONFIG`：

```js
var CONFIG = {
  mode: 'remote',                         // 'mock' → 'remote'
  endpoint: 'https://api.example.com/planetary-angel',
  timeoutMs: 8000,
  ...
};
```

`remoteProvider()` 已寫好（`fetch` + `AbortController` timeout + 非 2xx 丟錯），`app.js` 的 `.catch()` 會把錯誤顯示在表單下方。不需要改任何其他檔案。

## 表單驗證

驗證集中在 `app.js` 的 `validate(values)`，回傳 `{ 欄位id: 錯誤訊息 }`，空物件代表通過：

- **必填**：出生城市不可空白；年、月、日、時、分、上下午皆須有值（`null` 會被擋下）。
- **範圍**：年 1900–2100、月 1–12、時 1–12（12 小時制）、分 0–59、上下午僅接受 `AM` / `PM`。
- **月／日合理性**：以 `new Date(year, month, 0).getDate()` 取當月天數，自動處理大小月與閏年（2000/2 有 29 天、2001/2 只有 28 天）。
- **UX 輔助**：切換年或月時會重建「日」的選項並自動夾住超出的值（2/29 → 改成 2001 年後變 2/28）；欄位一被修改就清掉該欄的紅字。
- **上下午換算**：`toHour24()` 處理 12AM = 00、12PM = 12 的特例；表單下方即時顯示 24 小時制預覽，方便使用者確認。

即使下拉選單理論上不會產生非法值，`validate()` 仍完整檢查，以防日後改成手動輸入或被外部程式竄改（可在 console 用 `PA.app.validate({...})` 直接測試）。

## 推算邏輯（目前的假資料規則）

- **行星日**：以日出換日（預設 06:00），日出前算前一天；星期對應主星為 日→太陽、一→月亮、二→火星、三→水星、四→木星、五→金星、六→土星。
- **行星時**：日出後第 1 個行星時由當日主星起算，之後依迦勒底次序（土、木、火、日、金、水、月）循環，每時固定 60 分鐘，一天 24 時。
- **已知簡化**：真實行星時應把日出到日落等分為 12 個「日間時」、日落到隔日日出等分為 12 個「夜間時」，長度隨季節與緯度變動。目前用固定 06:00 日出與 60 分鐘等分，`meta.approximate` 為 `true` 並在結果區標註 — 這正是之後要交給後端（需要城市經緯度與時區）的部分。

## 除錯

- `PA.app.last()`：取得最近一次的完整 response。
- `PA.api.CONFIG`：檢視／即時修改 mode、endpoint、日出時間。
- 結果區的「檢視資料結構（JSON）」可直接看到當次的完整 payload。
