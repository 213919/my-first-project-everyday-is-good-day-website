'use strict';

// ===== 固定廠商資訊 =====
const COMPANY = {
  name: '日富一日科技有限公司',
  address: '桃園市中壢區延平路261號9樓',
  contact: 'Jimmy Pong',
  phone: '0938-260-565',
};

const STORAGE_KEY = 'grt_docs_v1';
const FOLDER_KEY  = 'grt_folder_handle';

// ===== State =====
let docs = load();
let folderHandle = null;
let currentId = null;

// ===== Persistence =====
function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(docs)); }

// ===== Utilities =====
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function today() { return new Date().toISOString().slice(0, 10); }

function rocDate(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const roc = d.getFullYear() - 1911;
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return ` 中 華 民 國 ${roc}年 ${m} 月${day}日`;
}

function fmtNum(n, currency) {
  if (n == null || n === '') return '';
  const v = Number(n);
  if (isNaN(v)) return '';
  return currency === 'USD'
    ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : v.toLocaleString('zh-TW', { minimumFractionDigits: 0 });
}

function autoNumber(type) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `GRT${type}${yy}${mm}`;
  const existing = docs
    .filter(d => (d.number || '').startsWith(prefix))
    .map(d => parseInt((d.number || '').slice(prefix.length)) || 0);
  const next = existing.length ? Math.max(...existing) + 1 : 1;
  return prefix + String(next).padStart(2, '0');
}

function getRemarks(type, currency, payDays) {
  if (type === 'QU') {
    return `1.本報價單經買方簽字或蓋章後，即表示同意接受本報價單一切條款。
2.出貨日(工作天數)視產品實際庫存狀況可能會有變動，下訂時將與您確認最終交期。
3.本報價單簽名回傳後視同正式下單，請貴司同時一併提供正式訂購單。
4.除產品功能明顯疏失外，買方不得退貨。若產品未經使用，買方仍不得要求退貨。
5.付款條件: T/T IN ADVANCE`;
  }
  // CU
  const taxNote = currency === 'USD'
    ? '2.營業稅產生之稅率由行政院定之，目前稅率為5%。'
    : '2.營業稅稅率由行政院定之，目前稅率為5%。';
  return `1.除產品功能明顯疏失外，買方不得退貨。若產品未經使用，買方仍不得要求退貨。
${taxNote}
3.付款條件: T/T IN ADVANCE ，請於  ${payDays}  日內完成匯款，我司帳戶資訊 詳如附件。`;
}

// ===== Toast =====
let _toastT;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastT);
  _toastT = setTimeout(() => el.classList.remove('show'), 3000);
}

// ===== View =====
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (name === 'list') { document.getElementById('nav-list').classList.add('active'); renderList(); }
  window.scrollTo(0, 0);
}

// ===== List =====
function renderList() {
  const q = (document.getElementById('search-input').value || '').toLowerCase();
  const ft = document.getElementById('filter-type').value;
  const filtered = docs.filter(d => {
    const ms = !q || (d.number||'').toLowerCase().includes(q) || (d.clientName||'').toLowerCase().includes(q);
    const mt = !ft || d.type === ft;
    return ms && mt;
  }).sort((a, b) => (b.createdAt||0) - (a.createdAt||0));

  const tbody = document.getElementById('list-tbody');
  const empty = document.getElementById('list-empty');
  const wrap  = document.getElementById('list-table-wrap');

  if (!filtered.length) { empty.style.display='block'; wrap.style.display='none'; return; }
  empty.style.display = 'none'; wrap.style.display = 'block';

  tbody.innerHTML = filtered.map(d => `
    <tr>
      <td><span class="badge-${d.type.toLowerCase()}">${d.type === 'QU' ? '報價單' : '訂單確認'}</span></td>
      <td><strong>${d.number||'—'}</strong></td>
      <td>${d.clientName||'—'}</td>
      <td>${d.date||'—'}</td>
      <td>${d.currency||'—'}</td>
      <td style="font-variant-numeric:tabular-nums">${fmtNum(d.total, d.currency)}</td>
      <td>
        <div class="action-btns">
          <button class="action-btn" onclick="previewDoc('${d.id}')">預覽</button>
          <button class="action-btn" onclick="editDoc('${d.id}')">編輯</button>
          <button class="action-btn red" onclick="deleteDoc('${d.id}')">刪除</button>
        </div>
      </td>
    </tr>`).join('');
}

function deleteDoc(id) {
  const d = docs.find(x => x.id === id);
  if (!d || !confirm(`確定要刪除「${d.number}」嗎？`)) return;
  docs = docs.filter(x => x.id !== id);
  persist();
  renderList();
}

// ===== Form Mode Switch =====
function setDocMode(type) {
  document.querySelectorAll('.qu-only').forEach(el => el.style.display = type === 'QU' ? '' : 'none');
  document.querySelectorAll('.cu-only').forEach(el => el.style.display = type === 'CU' ? '' : 'none');
  document.getElementById('f-type').value = type;
}

function onCurrencyChange() {
  const currency = document.getElementById('f-currency').value;
  const type = document.getElementById('f-type').value;
  // NTD 預設含稅, USD 預設不含稅
  document.getElementById('f-apply-tax').checked = (currency === 'NTD');
  recalc();
  updateNotesPreview();
}

function updateNotesPreview() {
  const type = document.getElementById('f-type').value;
  const currency = document.getElementById('f-currency').value;
  const payDays = document.getElementById('f-payment-days').value || '7';
  document.getElementById('f-notes').value = getRemarks(type, currency, payDays);
}

// ===== New Doc =====
function newDoc(type) {
  document.getElementById('form-title').textContent = type === 'QU' ? '新增報價單' : '新增訂單確認單';
  document.getElementById('f-id').value = '';
  document.getElementById('f-type').value = type;
  document.getElementById('f-number').value = autoNumber(type);
  document.getElementById('f-currency').value = 'NTD';
  document.getElementById('f-date').value = today();
  document.getElementById('f-validity').value = '10';
  document.getElementById('f-payment-days').value = '7';
  document.getElementById('f-apply-tax').checked = true;
  document.getElementById('f-client-name').value = '';
  document.getElementById('f-client-code').value = '';
  document.getElementById('f-client-contact').value = '';
  document.getElementById('f-client-phone').value = '';
  document.getElementById('f-client-address').value = '';
  setDocMode(type);
  renderItemsTable([{ name: '', qty: '', price: '', extra: '' }]);
  recalc();
  updateNotesPreview();
  showView('form');
}

// ===== Edit Doc =====
function editDoc(id) {
  const d = docs.find(x => x.id === id);
  if (!d) return;
  currentId = id;
  document.getElementById('form-title').textContent = d.type === 'QU' ? '編輯報價單' : '編輯訂單確認單';
  document.getElementById('f-id').value = d.id;
  document.getElementById('f-type').value = d.type;
  document.getElementById('f-number').value = d.number || '';
  document.getElementById('f-currency').value = d.currency || 'NTD';
  document.getElementById('f-date').value = d.date || '';
  document.getElementById('f-validity').value = d.validity || '10';
  document.getElementById('f-payment-days').value = d.paymentDays || '7';
  document.getElementById('f-apply-tax').checked = !!d.applyTax;
  document.getElementById('f-client-name').value = d.clientName || '';
  document.getElementById('f-client-code').value = d.clientCode || '';
  document.getElementById('f-client-contact').value = d.clientContact || '';
  document.getElementById('f-client-phone').value = d.clientPhone || '';
  document.getElementById('f-client-address').value = d.clientAddress || '';
  setDocMode(d.type);
  renderItemsTable(d.items && d.items.length ? d.items : [{ name: '', qty: '', price: '', extra: '' }]);
  recalc();
  updateNotesPreview();
  showView('form');
}

function editCurrent() { if (currentId) editDoc(currentId); }

// ===== Items =====
function renderItemsTable(items) {
  const type = document.getElementById('f-type').value;
  document.getElementById('items-tbody').innerHTML = items.map((item, i) => itemRow(item, i, type)).join('');
}

function itemRow(item, i, type) {
  const extraLabel = type === 'QU' ? 'Lead time' : '出貨日期';
  const extraInput = type === 'CU'
    ? `<input type="date" value="${item.extra||''}">`
    : `<input type="text" value="${esc(item.extra||'')}" placeholder="e.g. 2 weeks">`;
  return `
    <tr>
      <td class="item-no">${i + 1}</td>
      <td><input type="text" value="${esc(item.name||'')}" placeholder="品名 / 料號" oninput="recalc()"></td>
      <td><input type="number" value="${item.qty||''}" min="0" oninput="recalc()" style="width:64px"></td>
      <td><input type="number" value="${item.price||''}" min="0" oninput="recalc()" style="width:90px"></td>
      <td id="subtotal-${i}" style="text-align:right;padding-right:10px;font-size:12px;font-variant-numeric:tabular-nums"></td>
      <td>${extraInput}</td>
      <td><button type="button" class="del-btn" onclick="removeItem(${i})">✕</button></td>
    </tr>`;
}

function esc(s) { return String(s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

function addItem() {
  const items = collectItems();
  items.push({ name: '', qty: '', price: '', extra: '' });
  renderItemsTable(items);
  recalc();
  document.querySelectorAll('#items-tbody tr input[type="text"]').forEach((el, i, arr) => { if (i === arr.length - 1) el.focus(); });
}

function removeItem(i) {
  let items = collectItems();
  if (items.length <= 1) { toast('至少保留一個品項'); return; }
  items.splice(i, 1);
  renderItemsTable(items);
  recalc();
}

function collectItems() {
  return Array.from(document.querySelectorAll('#items-tbody tr')).map(row => {
    const inputs = row.querySelectorAll('input');
    return {
      name:  inputs[0].value,
      qty:   parseFloat(inputs[1].value) || 0,
      price: parseFloat(inputs[2].value) || 0,
      extra: inputs[3].value,
    };
  });
}

// ===== Recalc =====
function recalc() {
  const items = collectItems();
  const applyTax = document.getElementById('f-apply-tax').checked;
  const currency = document.getElementById('f-currency').value;
  let subtotal = 0;
  items.forEach((item, i) => {
    const s = (item.qty || 0) * (item.price || 0);
    subtotal += s;
    const cell = document.getElementById(`subtotal-${i}`);
    if (cell) cell.textContent = s ? fmtNum(s, currency) : '';
  });
  const tax   = applyTax ? Math.round(subtotal * 0.05 * 100) / 100 : 0;
  const total = subtotal + tax;
  document.getElementById('t-subtotal').textContent = fmtNum(subtotal, currency);
  document.getElementById('t-tax').textContent      = fmtNum(tax, currency);
  document.getElementById('t-total').textContent    = fmtNum(total, currency);
  document.getElementById('tax-row').style.opacity  = applyTax ? '1' : '.35';
}

// ===== Save =====
function saveAndPreview() {
  const number = document.getElementById('f-number').value.trim();
  const clientName = document.getElementById('f-client-name').value.trim();
  const date = document.getElementById('f-date').value;
  if (!number)     { toast('請填寫單號'); document.getElementById('f-number').focus(); return; }
  if (!clientName) { toast('請填寫客戶名稱'); document.getElementById('f-client-name').focus(); return; }
  if (!date)       { toast('請選擇日期'); document.getElementById('f-date').focus(); return; }

  const type = document.getElementById('f-type').value;
  const currency = document.getElementById('f-currency').value;
  const applyTax = document.getElementById('f-apply-tax').checked;
  const items = collectItems();
  const subtotal = items.reduce((s, i) => s + (i.qty * i.price), 0);
  const tax   = applyTax ? Math.round(subtotal * 0.05 * 100) / 100 : 0;
  const total = subtotal + tax;
  const paymentDays = document.getElementById('f-payment-days').value || '7';

  const record = {
    id:            document.getElementById('f-id').value || genId(),
    type,
    number,
    currency,
    date,
    validity:      document.getElementById('f-validity').value || '10',
    paymentDays,
    applyTax,
    clientName,
    clientCode:    document.getElementById('f-client-code').value.trim(),
    clientContact: document.getElementById('f-client-contact').value.trim(),
    clientPhone:   document.getElementById('f-client-phone').value.trim(),
    clientAddress: document.getElementById('f-client-address').value.trim(),
    items,
    subtotal, tax, total,
    remarks: getRemarks(type, currency, paymentDays),
    updatedAt: Date.now(),
  };

  const idx = docs.findIndex(d => d.id === record.id);
  if (idx >= 0) { record.createdAt = docs[idx].createdAt; docs[idx] = record; }
  else          { record.createdAt = Date.now(); docs.push(record); }

  persist();
  currentId = record.id;
  previewDoc(record.id);
}

// ===== Preview =====
function previewDoc(id) {
  const d = docs.find(x => x.id === id);
  if (!d) return;
  currentId = id;
  document.getElementById('preview-title').textContent = d.type === 'QU' ? `報價單 ${d.number}` : `訂單確認單 ${d.number}`;
  document.getElementById('preview-body').innerHTML = d.type === 'QU' ? renderQU(d) : renderCU(d);
  showView('preview');
}

// ===== Render QU =====
function renderQU(d) {
  const rows = d.items.filter(i => i.name || i.qty || i.price).map((item, i) => `
    <tr>
      <td class="center">${i + 1}</td>
      <td>${h(item.name)}</td>
      <td class="center">${item.qty || ''}</td>
      <td class="num">${item.price ? fmtNum(item.price, d.currency) : ''}</td>
      <td class="num">${(item.qty && item.price) ? fmtNum(item.qty * item.price, d.currency) : ''}</td>
      <td class="center">${h(item.extra)}</td>
    </tr>`).join('');

  const taxRow = d.applyTax ? `
    <div class="ptotal-row">
      <div class="ptotal-label">稅　　金：</div>
      <div class="ptotal-val">${fmtNum(d.tax, d.currency)}</div>
    </div>` : `
    <div class="ptotal-row">
      <div class="ptotal-label">稅　　金：</div>
      <div class="ptotal-val"></div>
    </div>`;

  return `<div class="doc-card">
    <div class="doc-title">報　價　單</div>

    <div class="qu-header">
      <div class="qu-header-row">
        <div class="lbl">廠　商：</div>
        <div class="val">${h(COMPANY.name)}</div>
        <div class="lbl">客戶名稱：</div>
        <div class="val">${h(d.clientName)}</div>
      </div>
      <div class="qu-header-row">
        <div class="lbl">地　址：</div>
        <div class="val">${h(COMPANY.address)}</div>
        <div class="lbl">地　　址：</div>
        <div class="val">${h(d.clientAddress)}</div>
      </div>
      <div class="qu-header-row">
        <div class="lbl">聯絡人：</div>
        <div class="val">${h(COMPANY.contact)}</div>
        <div class="lbl">聯絡人：</div>
        <div class="val">${h(d.clientContact)}</div>
      </div>
      <div class="qu-header-row">
        <div class="lbl">電　話：</div>
        <div class="val">${h(COMPANY.phone)}</div>
        <div class="lbl">電　　話：</div>
        <div class="val">${h(d.clientPhone)}${d.clientCode ? `　　客戶代碼：${h(d.clientCode)}` : ''}</div>
      </div>
    </div>

    <div class="qu-header" style="border-top:none;margin-bottom:0">
      <div class="qu-header-row">
        <div class="lbl" style="grid-column:1/3">${rocDate(d.date)}</div>
        <div class="lbl">報價單編號</div>
        <div class="val"><strong>${h(d.number)}</strong></div>
      </div>
    </div>

    <table class="preview-table">
      <thead>
        <tr>
          <th style="width:5%">項次</th>
          <th style="width:40%">品名</th>
          <th style="width:8%">數量</th>
          <th style="width:14%">單 價</th>
          <th style="width:14%">總價</th>
          <th style="width:19%">Lead time</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="preview-totals">
      <div class="ptotal-row">
        <div class="ptotal-label">合　　計:</div>
        <div class="ptotal-val">${fmtNum(d.subtotal, d.currency)}</div>
      </div>
      ${taxRow}
      <div class="ptotal-row ptotal-grand">
        <div class="ptotal-label">總　　計:</div>
        <div class="ptotal-val">${fmtNum(d.total, d.currency)}</div>
        <div class="ptotal-currency">（幣值：${d.currency}）</div>
      </div>
    </div>

    <div style="display:flex;gap:16px;margin-top:12px;align-items:flex-start">
      <div class="preview-notes" style="flex:1">
        <div class="notes-header">【備註】</div>
        <div class="notes-body">${h(d.remarks)}</div>
      </div>
      <div class="validity-line" style="white-space:nowrap;padding-top:8px">本報價單有效期&nbsp;&nbsp;${d.validity||10}&nbsp;&nbsp;天。</div>
    </div>

    <div class="sig-row">
      <div class="sig-box">廠 商 公 司 章</div>
      <div class="sig-box">客 戶 請 簽 章 確 認</div>
    </div>
  </div>`;
}

// ===== Render CU =====
function renderCU(d) {
  const rows = d.items.filter(i => i.name || i.qty || i.price).map((item, i) => `
    <tr>
      <td class="center">${i + 1}</td>
      <td>${h(item.name)}</td>
      <td class="center">${item.qty || ''}</td>
      <td class="num">${item.price ? fmtNum(item.price, d.currency) : ''}</td>
      <td class="num">${(item.qty && item.price) ? fmtNum(item.qty * item.price, d.currency) : ''}</td>
      <td class="center">${h(item.extra)}</td>
    </tr>`).join('');

  const taxRow = d.applyTax ? `
    <div class="ptotal-row">
      <div class="ptotal-label"> 稅　金：</div>
      <div class="ptotal-val">${fmtNum(d.tax, d.currency)}</div>
    </div>` : `
    <div class="ptotal-row">
      <div class="ptotal-label"> 稅　金：</div>
      <div class="ptotal-val"></div>
    </div>`;

  return `<div class="doc-card">
    <div class="doc-title">訂單確認</div>

    <div class="cu-header">
      <div class="cu-header-row">
        <div class="lbl" style="flex:2">${rocDate(d.date)}</div>
        <div class="lbl">訂單確認單號：</div>
        <div class="val"><strong>${h(d.number)}</strong></div>
      </div>
      <div class="cu-header-row">
        <div class="lbl">客戶名稱：</div>
        <div class="val" style="flex:2">${h(d.clientName)}</div>
        <div class="lbl">客戶代碼：</div>
        <div class="val">${h(d.clientCode)}</div>
        <div class="lbl">聯絡人：</div>
        <div class="val">${h(d.clientContact)}</div>
        <div class="lbl">電話：</div>
        <div class="val">${h(d.clientPhone)}</div>
      </div>
      <div class="cu-header-row">
        <div class="lbl">地址：</div>
        <div class="val" style="flex:4">${h(d.clientAddress)}</div>
      </div>
    </div>

    <table class="preview-table">
      <thead>
        <tr>
          <th style="width:5%">項次</th>
          <th style="width:40%">品名</th>
          <th style="width:8%">數量</th>
          <th style="width:14%">單 價</th>
          <th style="width:14%">總價</th>
          <th style="width:19%">出貨日期TW</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="preview-totals">
      <div class="ptotal-row">
        <div class="ptotal-label">合　　計:</div>
        <div class="ptotal-val">${fmtNum(d.subtotal, d.currency)}</div>
      </div>
      ${taxRow}
      <div class="ptotal-row ptotal-grand">
        <div class="ptotal-label">總　　計:</div>
        <div class="ptotal-val">${fmtNum(d.total, d.currency)}</div>
        <div class="ptotal-currency">（幣值：${d.currency}）</div>
      </div>
    </div>

    <div class="preview-notes" style="margin-top:12px">
      <div class="notes-header">【備註】</div>
      <div class="notes-body">${h(d.remarks)}</div>
    </div>

    <div class="sig-row">
      <div class="sig-box">廠 商 公 司 章</div>
      <div class="sig-box">客 戶 請 簽 章 確 認</div>
    </div>
  </div>`;
}

function h(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

// ===== Excel Export =====
function exportExcel() {
  const d = docs.find(x => x.id === currentId);
  if (!d) return;
  const wb = XLSX.utils.book_new();
  const ws = d.type === 'QU' ? buildQUSheet(d) : buildCUSheet(d);
  const sheetName = d.type === 'QU' ? '報價單' : (d.currency === 'USD' ? '訂單確認單 (USD)' : '訂單確認單NTD');
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const filename = `${d.number}.xlsx`;
  if (folderHandle) {
    saveToFolder(wb, filename);
  } else {
    XLSX.writeFile(wb, filename);
    toast(`已下載 ${filename}`);
  }
}

function buildQUSheet(d) {
  const ws = {};
  const M = (r, c) => XLSX.utils.encode_cell({ r, c }); // 0-indexed
  const S = (r, c, v, t) => { ws[M(r,c)] = { v, t: t||'s' }; };

  let row = 0;
  // Row 0: title
  S(row, 1, '報    價    單'); row++;

  // Row 1: 廠商 / 客戶
  S(row,1,'廠　商：'); S(row,2,COMPANY.name); S(row,5,'客戶名稱：'); S(row,6,d.clientName); row++;
  // Row 2: 地址
  S(row,1,'地　址：'); S(row,2,COMPANY.address); S(row,5,'地　　址：'); S(row,6,d.clientAddress); row++;
  // Row 3: 聯絡人
  S(row,1,'聯絡人：'); S(row,2,COMPANY.contact); S(row,5,'聯絡人：'); S(row,6,d.clientContact); row++;
  // Row 4: 電話 + 客戶代碼
  S(row,1,'電　話：'); S(row,2,COMPANY.phone); S(row,5,'電　　話：'); S(row,6,d.clientPhone); S(row,8,'客戶代碼：'); S(row,9,d.clientCode); row++;
  // Row 5: 日期 + 單號
  S(row,1,rocDate(d.date)); S(row,6,'報價單編號'); S(row,7,d.number); row++;
  // Row 6: 表頭
  S(row,1,'項次'); S(row,2,'品名'); S(row,6,'數量'); S(row,7,'單 價 '); S(row,8,'總價 '); S(row,9,'Lead time'); row++;

  // Items
  const itemStart = row;
  d.items.filter(i => i.name || i.qty || i.price).forEach((item, i) => {
    S(row,1, i+1, 'n'); S(row,2, item.name);
    S(row,6, item.qty||0, 'n'); S(row,7, item.price||0, 'n');
    S(row,8, (item.qty||0)*(item.price||0), 'n'); S(row,9, item.extra||'');
    row++;
  });

  // Totals
  S(row,5,'合     計:'); S(row,8, d.subtotal, 'n'); row++;
  S(row,5,' 稅    金：'); S(row,8, d.applyTax ? d.tax : null, d.applyTax ? 'n' : 's'); row++;
  S(row,5,'總     計:'); S(row,8, d.total, 'n'); S(row,9, `NTD：${d.currency}`); row++;

  // Remarks
  const validityNote = `本報價單有效期       ${d.validity||10}天。`;
  S(row,1, validityNote); S(row,4, d.remarks); row++;
  // Signature
  S(row,1,'廠 商 公 司 章'); S(row,5,'客 戶 請 簽 章 確 認'); row++;

  // Merges
  ws['!merges'] = [
    { s:{r:0,c:1}, e:{r:0,c:9} },       // title
    { s:{r:5,c:1}, e:{r:5,c:4} },       // 日期
    { s:{r:5,c:7}, e:{r:5,c:8} },       // 單號
    { s:{r:6,c:2}, e:{r:6,c:5} },       // 品名 header
  ];
  // merge item name cells
  for (let i = itemStart; i < itemStart + d.items.filter(x=>x.name||x.qty||x.price).length; i++) {
    ws['!merges'].push({ s:{r:i,c:2}, e:{r:i,c:5} });
  }

  ws['!cols'] = [ {wch:2},{wch:9},{wch:20},{wch:6},{wch:6},{wch:10},{wch:8},{wch:10},{wch:10},{wch:12} ];
  ws['!ref'] = XLSX.utils.encode_range({ s:{r:0,c:0}, e:{r:row,c:9} });
  return ws;
}

function buildCUSheet(d) {
  const ws = {};
  const M = (r, c) => XLSX.utils.encode_cell({ r, c });
  const S = (r, c, v, t) => { ws[M(r,c)] = { v, t: t||'s' }; };

  let row = 0;
  S(row,1,'訂單確認'); row++;
  S(row,1,rocDate(d.date)); S(row,6,'訂單確認單號：'); S(row,7,d.number); row++;
  S(row,1,'客戶名稱：'); S(row,3,d.clientName); S(row,4,'客戶代碼：'); S(row,5,d.clientCode); S(row,6,'聯絡人：'); S(row,7,d.clientContact); S(row,8,'電話：'); S(row,9,d.clientPhone); row++;
  S(row,1,'地址：'); S(row,3,d.clientAddress); row++;
  // header
  S(row,1,'項次'); S(row,2,'品名'); S(row,6,'數量'); S(row,7,'單 價 '); S(row,8,'總價 '); S(row,9,'出貨日期TW'); row++;

  const itemStart = row;
  d.items.filter(i => i.name || i.qty || i.price).forEach((item, i) => {
    S(row,1, i+1, 'n'); S(row,2, item.name);
    S(row,6, item.qty||0, 'n'); S(row,7, item.price||0, 'n');
    S(row,8, (item.qty||0)*(item.price||0), 'n'); S(row,9, item.extra||'');
    row++;
  });

  S(row,6,'合     計:'); S(row,8, d.subtotal, 'n'); row++;
  S(row,6,' 稅    金：'); S(row,8, d.applyTax ? d.tax : null, d.applyTax ? 'n' : 's'); row++;
  S(row,6,'總     計:'); S(row,8, d.total, 'n'); S(row,9,`(幣值:${d.currency}`); row++;
  S(row,1, d.remarks); row++;
  S(row,1,'廠商公司章'); S(row,6,'客戶請簽章確認'); row++;

  ws['!merges'] = [
    { s:{r:0,c:1}, e:{r:0,c:9} },
    { s:{r:1,c:1}, e:{r:1,c:5} },
    { s:{r:1,c:7}, e:{r:1,c:8} },
    { s:{r:3,c:3}, e:{r:3,c:8} },
    { s:{r:4,c:2}, e:{r:4,c:5} },
  ];
  for (let i = itemStart; i < itemStart + d.items.filter(x=>x.name||x.qty||x.price).length; i++) {
    ws['!merges'].push({ s:{r:i,c:2}, e:{r:i,c:5} });
  }

  ws['!cols'] = [ {wch:2},{wch:9},{wch:20},{wch:8},{wch:8},{wch:8},{wch:8},{wch:10},{wch:10},{wch:12} ];
  ws['!ref'] = XLSX.utils.encode_range({ s:{r:0,c:0}, e:{r:row,c:9} });
  return ws;
}

// ===== Folder Save =====
async function setFolder() {
  if (!window.showDirectoryPicker) {
    toast('您的瀏覽器不支援資料夾選擇，匯出時將直接下載');
    return;
  }
  try {
    folderHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const name = folderHandle.name;
    document.getElementById('folder-label').textContent = `📂 ${name}`;
    toast(`已設定存檔資料夾：${name}`);
  } catch (e) {
    if (e.name !== 'AbortError') toast('設定資料夾失敗');
  }
}

async function saveToFolder(wb, filename) {
  try {
    const fileHandle = await folderHandle.getFileHandle(filename, { create: true });
    const writable   = await fileHandle.createWritable();
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    await writable.write(new Uint8Array(buf));
    await writable.close();
    toast(`已儲存至資料夾：${filename}`);
  } catch (e) {
    // Permission may have expired — fall back to download
    XLSX.writeFile(wb, filename);
    toast(`已下載 ${filename}（請重新選擇資料夾以直接儲存）`);
    folderHandle = null;
    document.getElementById('folder-label').textContent = '選擇存檔資料夾';
  }
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  // 監聽備註相關欄位異動
  ['f-payment-days','f-currency'].forEach(id => {
    document.getElementById(id).addEventListener('change', updateNotesPreview);
  });
  document.getElementById('f-payment-days').addEventListener('input', updateNotesPreview);
  showView('list');
});
