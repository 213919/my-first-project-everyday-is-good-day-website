'use strict';

// ===== Storage =====
const STORAGE_KEY = 'quotation_system_v1';

function loadData() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ===== State =====
let quotes = loadData();
let currentPreviewId = null;
let isReadonlyMode = false; // 客戶端唯讀模式

// ===== Utilities =====
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${y}/${m}/${day}`;
}

function fmtMoney(n) {
  return 'NT$ ' + Number(n || 0).toLocaleString('zh-TW', { minimumFractionDigits: 0 });
}

function statusLabel(s) {
  return { draft: '草稿', sent: '已發送', accepted: '已接受', rejected: '已婉拒' }[s] || s;
}

function statusClass(s) {
  return { draft: 'badge-draft', sent: 'badge-sent', accepted: 'badge-accepted', rejected: 'badge-rejected' }[s] || '';
}

function autoQuoteNo() {
  const y = new Date().getFullYear();
  const existing = quotes
    .map(q => q.number || '')
    .filter(n => n.startsWith(`QT-${y}-`))
    .map(n => parseInt(n.split('-')[2]) || 0);
  const next = existing.length ? Math.max(...existing) + 1 : 1;
  return `QT-${y}-${String(next).padStart(3, '0')}`;
}

// ===== Share Link (encode/decode) =====
function encodeQuote(q) {
  try {
    const json = JSON.stringify(q);
    return btoa(encodeURIComponent(json));
  } catch { return null; }
}

function decodeQuote(str) {
  try {
    return JSON.parse(decodeURIComponent(atob(str)));
  } catch { return null; }
}

function copyShareLink() {
  const q = quotes.find(x => x.id === currentPreviewId);
  if (!q) return;
  const encoded = encodeQuote(q);
  if (!encoded) { showToast('產生連結失敗'); return; }
  const url = `${location.origin}${location.pathname}?q=${encoded}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast('分享連結已複製！傳給客戶即可查看報價單');
  }).catch(() => {
    // fallback: select text
    prompt('複製以下連結並傳給客戶：', url);
  });
}

// ===== Toast =====
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ===== View Switching =====
function showView(name) {
  if (isReadonlyMode && name !== 'preview') return; // 唯讀模式鎖定在 preview
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (name === 'list') {
    document.getElementById('nav-list').classList.add('active');
    renderList();
  } else if (name === 'edit') {
    document.getElementById('nav-new').classList.add('active');
  }
  window.scrollTo(0, 0);
}

// ===== List =====
function renderList() {
  const search = (document.getElementById('search-input').value || '').toLowerCase();
  const filterStatus = document.getElementById('filter-status').value;

  let filtered = quotes.filter(q => {
    const matchSearch = !search
      || (q.clientName || '').toLowerCase().includes(search)
      || (q.number || '').toLowerCase().includes(search);
    const matchStatus = !filterStatus || q.status === filterStatus;
    return matchSearch && matchStatus;
  });

  filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const tbody = document.getElementById('quote-tbody');
  const empty = document.getElementById('quote-list-empty');
  const tableWrap = document.getElementById('quote-list-table');

  if (filtered.length === 0) {
    empty.style.display = 'flex';
    tableWrap.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  tableWrap.style.display = 'block';

  tbody.innerHTML = filtered.map(q => `
    <tr>
      <td><strong>${q.number || '—'}</strong></td>
      <td>${q.clientName || '—'}</td>
      <td>${fmtDate(q.date)}</td>
      <td>${fmtDate(q.validUntil)}</td>
      <td class="amount-cell">${fmtMoney(q.total)}</td>
      <td><span class="badge ${statusClass(q.status)}">${statusLabel(q.status)}</span></td>
      <td>
        <div class="action-btns">
          <button class="action-btn" onclick="previewQuote('${q.id}')">預覽</button>
          <button class="action-btn" onclick="editQuote('${q.id}')">編輯</button>
          <button class="action-btn danger" onclick="deleteQuote('${q.id}')">刪除</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ===== Delete =====
function deleteQuote(id) {
  const q = quotes.find(x => x.id === id);
  if (!q) return;
  if (!confirm(`確定要刪除報價單「${q.number || id}」嗎？此操作無法復原。`)) return;
  quotes = quotes.filter(x => x.id !== id);
  saveData(quotes);
  renderList();
}

// ===== New Quote =====
function newQuote() {
  document.getElementById('edit-title').textContent = '新增報價單';
  document.getElementById('edit-id').value = '';
  document.getElementById('f-number').value = autoQuoteNo();
  document.getElementById('f-status').value = 'draft';
  document.getElementById('f-date').value = today();
  document.getElementById('f-valid-until').value = '';
  document.getElementById('f-client-name').value = '';
  document.getElementById('f-client-contact').value = '';
  document.getElementById('f-client-email').value = '';
  document.getElementById('f-client-phone').value = '';
  document.getElementById('f-client-address').value = '';
  document.getElementById('f-discount').value = '0';
  document.getElementById('f-tax').value = '5';
  document.getElementById('f-notes').value = '';

  renderItemsTable([{ name: '', desc: '', qty: 1, unit: '式', price: 0 }]);
  recalc();
  showView('edit');
}

// ===== Edit Quote =====
function editQuote(id) {
  const q = quotes.find(x => x.id === id);
  if (!q) return;

  document.getElementById('edit-title').textContent = '編輯報價單';
  document.getElementById('edit-id').value = q.id;
  document.getElementById('f-number').value = q.number || '';
  document.getElementById('f-status').value = q.status || 'draft';
  document.getElementById('f-date').value = q.date || '';
  document.getElementById('f-valid-until').value = q.validUntil || '';
  document.getElementById('f-client-name').value = q.clientName || '';
  document.getElementById('f-client-contact').value = q.clientContact || '';
  document.getElementById('f-client-email').value = q.clientEmail || '';
  document.getElementById('f-client-phone').value = q.clientPhone || '';
  document.getElementById('f-client-address').value = q.clientAddress || '';
  document.getElementById('f-discount').value = q.discount ?? 0;
  document.getElementById('f-tax').value = q.tax ?? 5;
  document.getElementById('f-notes').value = q.notes || '';

  renderItemsTable(q.items && q.items.length ? q.items : [{ name: '', desc: '', qty: 1, unit: '式', price: 0 }]);
  recalc();
  showView('edit');
}

function editFromPreview() {
  if (currentPreviewId) editQuote(currentPreviewId);
}

// ===== Items Table =====
function renderItemsTable(items) {
  const tbody = document.getElementById('items-tbody');
  tbody.innerHTML = items.map((item, i) => itemRow(item, i)).join('');
}

function itemRow(item, i) {
  return `
    <tr id="item-row-${i}">
      <td><input type="text" value="${escAttr(item.name)}" placeholder="品項名稱" oninput="recalc()"></td>
      <td><input type="text" value="${escAttr(item.desc || '')}" placeholder="說明"></td>
      <td><input type="number" value="${item.qty ?? 1}" min="0" oninput="recalc()" style="width:70px"></td>
      <td><input type="text" value="${escAttr(item.unit || '式')}" placeholder="單位" style="width:56px"></td>
      <td><input type="number" value="${item.price ?? 0}" min="0" oninput="recalc()" style="width:100px"></td>
      <td class="subtotal-cell" id="subtotal-${i}">${fmtMoney((item.qty ?? 1) * (item.price ?? 0))}</td>
      <td><button type="button" class="del-item-btn" onclick="removeItem(${i})" title="刪除">✕</button></td>
    </tr>
  `;
}

function escAttr(s) {
  return String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function addItem() {
  const items = collectItems();
  items.push({ name: '', desc: '', qty: 1, unit: '式', price: 0 });
  renderItemsTable(items);
  recalc();
  const rows = document.querySelectorAll('#items-tbody tr');
  const lastRow = rows[rows.length - 1];
  if (lastRow) lastRow.querySelector('input').focus();
}

function removeItem(i) {
  let items = collectItems();
  if (items.length <= 1) { alert('至少保留一個品項'); return; }
  items.splice(i, 1);
  renderItemsTable(items);
  recalc();
}

function collectItems() {
  const rows = document.querySelectorAll('#items-tbody tr');
  return Array.from(rows).map(row => {
    const inputs = row.querySelectorAll('input');
    return {
      name: inputs[0].value,
      desc: inputs[1].value,
      qty: parseFloat(inputs[2].value) || 0,
      unit: inputs[3].value,
      price: parseFloat(inputs[4].value) || 0,
    };
  });
}

// ===== Recalculate =====
function recalc() {
  const items = collectItems();
  let subtotal = 0;

  items.forEach((item, i) => {
    const s = (item.qty || 0) * (item.price || 0);
    subtotal += s;
    const cell = document.getElementById(`subtotal-${i}`);
    if (cell) cell.textContent = fmtMoney(s);
  });

  const discount = parseFloat(document.getElementById('f-discount').value) || 0;
  const tax = parseFloat(document.getElementById('f-tax').value) || 0;
  const afterDiscount = subtotal * (1 - discount / 100);
  const total = afterDiscount * (1 + tax / 100);

  document.getElementById('t-subtotal').textContent = fmtMoney(subtotal);
  document.getElementById('t-total').textContent = fmtMoney(Math.round(total));
}

// ===== Save =====
function saveQuote() {
  const number = document.getElementById('f-number').value.trim();
  const clientName = document.getElementById('f-client-name').value.trim();
  const date = document.getElementById('f-date').value;

  if (!number) { alert('請填寫報價單號'); document.getElementById('f-number').focus(); return; }
  if (!clientName) { alert('請填寫客戶名稱'); document.getElementById('f-client-name').focus(); return; }
  if (!date) { alert('請選擇報價日期'); document.getElementById('f-date').focus(); return; }

  const items = collectItems();
  const discount = parseFloat(document.getElementById('f-discount').value) || 0;
  const tax = parseFloat(document.getElementById('f-tax').value) || 0;
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const total = Math.round(subtotal * (1 - discount / 100) * (1 + tax / 100));

  const id = document.getElementById('edit-id').value;

  const record = {
    id: id || genId(),
    number,
    status: document.getElementById('f-status').value,
    date,
    validUntil: document.getElementById('f-valid-until').value,
    clientName,
    clientContact: document.getElementById('f-client-contact').value.trim(),
    clientEmail: document.getElementById('f-client-email').value.trim(),
    clientPhone: document.getElementById('f-client-phone').value.trim(),
    clientAddress: document.getElementById('f-client-address').value.trim(),
    items,
    discount,
    tax,
    subtotal,
    total,
    notes: document.getElementById('f-notes').value.trim(),
    updatedAt: Date.now(),
  };

  if (!id) record.createdAt = Date.now();

  const idx = quotes.findIndex(q => q.id === record.id);
  if (idx >= 0) {
    record.createdAt = quotes[idx].createdAt;
    quotes[idx] = record;
  } else {
    quotes.push(record);
  }

  saveData(quotes);
  previewQuote(record.id);
}

// ===== Preview =====
function renderPreviewHTML(q) {
  const subtotal = q.subtotal ?? 0;
  const discount = q.discount ?? 0;
  const tax = q.tax ?? 0;
  const afterDiscount = subtotal * (1 - discount / 100);
  const total = q.total ?? Math.round(afterDiscount * (1 + tax / 100));

  const itemRows = (q.items || []).map(item => `
    <tr>
      <td>${esc(item.name)}</td>
      <td>${esc(item.desc || '')}</td>
      <td style="text-align:center">${item.qty}</td>
      <td style="text-align:center">${esc(item.unit || '')}</td>
      <td style="text-align:right">${fmtMoney(item.price)}</td>
      <td style="text-align:right">${fmtMoney(item.qty * item.price)}</td>
    </tr>
  `).join('');

  const discountRow = discount > 0 ? `<tr><td colspan="5" style="text-align:right">折扣 (${discount}%)</td><td style="text-align:right">- ${fmtMoney(subtotal * discount / 100)}</td></tr>` : '';
  const taxRow = tax > 0 ? `<tr><td colspan="5" style="text-align:right">稅金 (${tax}%)</td><td style="text-align:right">${fmtMoney(afterDiscount * tax / 100)}</td></tr>` : '';

  const notesSection = q.notes ? `
    <div class="preview-notes">
      <h3>備註 / 條款</h3>
      <p>${esc(q.notes)}</p>
    </div>` : '';

  return `
    <div class="preview-header">
      <div class="preview-company">
        <h1>報價單</h1>
        <p>QUOTATION</p>
      </div>
      <div class="preview-meta">
        <div class="quote-no">${esc(q.number)}</div>
        <p>報價日期：${fmtDate(q.date)}</p>
        ${q.validUntil ? `<p>有效期限：${fmtDate(q.validUntil)}</p>` : ''}
        <p style="margin-top:8px"><span class="badge ${statusClass(q.status)}">${statusLabel(q.status)}</span></p>
      </div>
    </div>

    <div class="preview-parties">
      <div>
        <h3>報價對象</h3>
        <p>
          <strong>${esc(q.clientName)}</strong>
          ${q.clientContact ? `<br>${esc(q.clientContact)}` : ''}
          ${q.clientEmail ? `<br>${esc(q.clientEmail)}` : ''}
          ${q.clientPhone ? `<br>${esc(q.clientPhone)}` : ''}
          ${q.clientAddress ? `<br>${esc(q.clientAddress)}` : ''}
        </p>
      </div>
    </div>

    <table class="preview-table">
      <thead>
        <tr>
          <th style="width:30%">品項名稱</th>
          <th style="width:22%">說明</th>
          <th style="width:8%;text-align:center">數量</th>
          <th style="width:8%;text-align:center">單位</th>
          <th style="width:16%;text-align:right">單價</th>
          <th style="width:16%;text-align:right">小計</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        <tr><td colspan="5" style="text-align:right">小計</td><td style="text-align:right">${fmtMoney(subtotal)}</td></tr>
        ${discountRow}
        ${taxRow}
        <tr class="total-row"><td colspan="5" style="text-align:right"><strong>總計</strong></td><td style="text-align:right"><strong>${fmtMoney(total)}</strong></td></tr>
      </tfoot>
    </table>

    ${notesSection}

    <div class="preview-footer">
      此報價單由報價系統自動產生・如有疑問請聯繫我們
    </div>
  `;
}

function previewQuote(id) {
  const q = quotes.find(x => x.id === id);
  if (!q) return;
  currentPreviewId = id;
  document.getElementById('quote-preview-content').innerHTML = renderPreviewHTML(q);
  showView('preview');
}

// ===== Readonly mode (client view from share link) =====
function enterReadonlyMode(q) {
  isReadonlyMode = true;

  // 隱藏導覽列，改顯示唯讀提示
  document.querySelector('.topbar').style.display = 'none';
  const banner = document.createElement('div');
  banner.className = 'readonly-banner no-print';
  banner.textContent = '您正在查看報價單 · 此頁面為唯讀';
  document.body.insertBefore(banner, document.body.firstChild);

  // 隱藏編輯和返回按鈕
  document.querySelectorAll('.owner-only').forEach(el => el.style.display = 'none');

  currentPreviewId = null;
  document.getElementById('quote-preview-content').innerHTML = renderPreviewHTML(q);
  document.getElementById('view-preview').classList.add('active');
  document.getElementById('preview-title').textContent = `報價單 ${q.number || ''}`;
  document.title = `報價單 ${q.number || ''} - ${q.clientName || ''}`;
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const qParam = params.get('q');

  if (qParam) {
    const q = decodeQuote(qParam);
    if (q) {
      enterReadonlyMode(q);
    } else {
      showToast('連結已損毀，無法載入報價單');
      showView('list');
    }
  } else {
    showView('list');
  }
});
