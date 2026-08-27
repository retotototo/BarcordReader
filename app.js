// ====================================================
// DOM 要素の取得
// ====================================================
const videoElement = document.querySelector('#video');
const imagePreview = document.querySelector('#image-preview');
const placeholder = document.querySelector('#placeholder');
const startButton = document.querySelector('#start-button');
const stopButton = document.querySelector('#stop-button');
const fileSelectButton = document.querySelector('#file-select-button');
const fileInput = document.querySelector('#file-input');
const dropZone = document.querySelector('#interactive');
const searchButton = document.querySelector('#search-button');
const status = document.querySelector('#status');
const resultInput = document.querySelector('#result');
const resultMessage = document.querySelector('#result-message');

// 埋め込みプレビュー要素
const productPreviewWrapper = document.querySelector('#product-preview-wrapper');
const iframeLoading = document.querySelector('#iframe-loading');
const cardlaboFrame = document.querySelector('#cardlabo-frame');
const iframeToggleBtn = document.querySelector('#iframe-toggle-btn');

// ====================================================
// バーコード解析用リーダー＆設定
// ====================================================
const codeReader = new ZXing.BrowserMultiFormatReader();

const formatNames = {
  0: 'AZTEC',
  1: 'CODABAR',
  2: 'CODE_39',
  3: 'CODE_93',
  4: 'CODE_128',
  5: 'DATA_MATRIX',
  6: 'EAN_8',
  7: 'EAN_13',
  8: 'ITF',
  9: 'MAXICODE',
  10: 'PDF_417',
  11: 'QR_CODE',
  12: 'RSS_14',
  13: 'RSS_EXPANDED',
  14: 'UPC_A',
  15: 'UPC_E',
  16: 'UPC_EAN_EXTENSION',
};

let isRunning = false;
let lastCode = '';
let lastReadAt = 0;

// ====================================================
// ユーティリティ関数
// ====================================================
function setStatus(message, type = '') {
  if (status) {
    status.textContent = message;
    status.className = `status ${type}`;
  }
}

function getFormatName(result) {
  if (!result) return 'UNKNOWN';
  const format = result.barcodeFormat !== undefined ? result.barcodeFormat : (typeof result.getBarcodeFormat === 'function' ? result.getBarcodeFormat() : undefined);
  if (typeof format === 'string') return format.toUpperCase();
  if (typeof format === 'number') {
    if (formatNames[format]) return formatNames[format];
    if (window.ZXing?.BarcodeFormat && window.ZXing.BarcodeFormat[format]) {
      return String(window.ZXing.BarcodeFormat[format]).toUpperCase();
    }
    return `FORMAT_${format}`;
  }
  return 'UNKNOWN';
}

function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(navigator.userAgent) 
      || window.innerWidth <= 820 
      || ('ontouchstart' in window && window.innerWidth <= 1024);
}

// ====================================================
// カードラボ検索＆プレビュー
// ====================================================
function showCardLaboPreview(keyword) {
  if (!keyword || !cardlaboFrame) return;

  const searchUrl = `https://www.c-labo-online.jp/product-list?keyword=${encodeURIComponent(keyword)}`;

  if (productPreviewWrapper) productPreviewWrapper.style.display = 'block';
  if (iframeLoading) {
    iframeLoading.style.display = 'flex';
    iframeLoading.innerHTML = '<span class="spinner"></span> カードラボの検索結果を読み込み中…';
  }

  cardlaboFrame.onload = () => {
    if (iframeLoading) iframeLoading.style.display = 'none';
  };

  cardlaboFrame.onerror = () => {
    if (iframeLoading) iframeLoading.innerHTML = '⚠️ プレビューの読み込みに失敗しました。<br><small>下の「カードラボで検索して開く」ボタンから直接ご確認ください。</small>';
  };

  setTimeout(() => {
    if (iframeLoading && iframeLoading.style.display !== 'none') {
      iframeLoading.style.display = 'none';
    }
  }, 4000);

  cardlaboFrame.referrerPolicy = 'no-referrer';
  cardlaboFrame.src = searchUrl;
}

// カードラボで検索ページを別タブで開く（スマホ・iOS Safari・ChromeのReferer漏れを100%遮断する確実な方式）
function openSearchPage(keywordOverride) {
  const keyword = keywordOverride || (resultInput ? resultInput.value.trim() : '');
  if (!keyword) {
    setStatus('検索する数値がありません', 'error');
    return;
  }
  const searchUrl = `https://www.c-labo-online.jp/product-list?keyword=${encodeURIComponent(keyword)}`;

  // aタグを動的生成して rel="noreferrer" と referrerpolicy を明示付与してクリック
  const link = document.createElement('a');
  link.href = searchUrl;
  link.target = '_blank';
  link.rel = 'noreferrer noopener nofollow';
  link.referrerPolicy = 'no-referrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
  }, 300);
}

// ====================================================
// 読み取り成功時の共通処理
// ====================================================
function handleSuccess(result, source = '画像') {
  if (!result) return;

  const rawText = result.text || (typeof result.getText === 'function' ? result.getText() : '') || '';
  if (!rawText) return;

  const now = Date.now();
  if (source === 'カメラ' && rawText === lastCode && now - lastReadAt < 1500) return;
  lastCode = rawText;
  lastReadAt = now;

  // カメラ停止
  if (source === 'カメラ' && isRunning) {
    stopScanner();
  }

  const formatName = getFormatName(result);
  const processedText = rawText.length > 0 ? rawText.slice(0, -1) : '';

  if (resultInput) {
    resultInput.value = processedText;
    resultInput.setAttribute('value', processedText);
  }

  if (searchButton) searchButton.disabled = false;

  setStatus('読み取りに成功しました！', 'active');
  if (resultMessage) resultMessage.textContent = `${source}から読み取り完了 (コード: ${processedText})`;

  // 履歴に追加
  HistoryManager.add({
    code: processedText,
    raw: rawText,
    format: formatName,
  });

  // デバイス別のアクション
  if (isMobileDevice()) {
    openSearchPage(processedText);
  } else {
    showCardLaboPreview(processedText);
    setTimeout(() => {
      if (productPreviewWrapper) {
        productPreviewWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 150);
  }

  if (navigator.vibrate) navigator.vibrate(100);
}

// ====================================================
// カメラ制御
// ====================================================
function stopScanner() {
  if (!isRunning) return;
  codeReader.reset();
  isRunning = false;
  if (startButton) startButton.disabled = false;
  if (stopButton) stopButton.disabled = true;
  setStatus('カメラを停止しました');
  if (placeholder) placeholder.style.display = 'block';
  if (videoElement) videoElement.style.display = 'none';
}

async function startScanner() {
  if (isRunning) return;
  if (!window.ZXing) {
    setStatus('ライブラリを読み込めませんでした', 'error');
    return;
  }
  if (!window.isSecureContext) {
    setStatus('HTTPSで開いてください', 'error');
    if (resultMessage) resultMessage.textContent = 'カメラは HTTPS または localhost でのみ利用できます。';
    return;
  }

  setStatus('カメラを起動中…');
  if (startButton) startButton.disabled = true;

  try {
    if (imagePreview) imagePreview.style.display = 'none';
    if (placeholder) placeholder.style.display = 'none';
    if (videoElement) videoElement.style.display = 'block';

    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    };

    await codeReader.decodeFromConstraints(constraints, videoElement, (result, error) => {
      if (result) {
        handleSuccess(result, 'カメラ');
      }
    });

    isRunning = true;
    if (stopButton) stopButton.disabled = false;
    setStatus('読み取り中 (カメラ)', 'active');
  } catch (err) {
    console.error('Camera start error:', err);
    setStatus('カメラを開始できませんでした', 'error');
    if (resultMessage) resultMessage.textContent = 'カメラの利用を許可し、HTTPS または localhost で開いてください。';
    if (startButton) startButton.disabled = false;
    if (placeholder) placeholder.style.display = 'block';
    if (videoElement) videoElement.style.display = 'none';
  }
}

// ====================================================
// 画像解析処理
// ====================================================
async function tryDecodeImage(imageElement, objectUrl) {
  try {
    const res = await codeReader.decodeFromImageUrl(objectUrl);
    if (res && (res.text || res.getText())) return res;
  } catch {}

  try {
    const res = await codeReader.decodeFromImageElement(imageElement);
    if (res && (res.text || res.getText())) return res;
  } catch {}

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imgW = imageElement.naturalWidth || imageElement.width || 800;
  const imgH = imageElement.naturalHeight || imageElement.height || 600;

  const scales = [1, 0.6, 0.35, 1.4];
  const angles = [0, 90, 180, 270];

  for (const scale of scales) {
    for (const angle of angles) {
      if (scale === 1 && angle === 0) continue;

      const targetW = Math.round(imgW * scale);
      const targetH = Math.round(imgH * scale);

      if (angle === 90 || angle === 270) {
        canvas.width = targetH;
        canvas.height = targetW;
      } else {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((angle * Math.PI) / 180);
      ctx.drawImage(imageElement, -targetW / 2, -targetH / 2, targetW, targetH);
      ctx.restore();

      try {
        const res = await codeReader.decodeFromCanvas(canvas);
        if (res && (res.text || res.getText())) return res;
      } catch {}
    }
  }

  throw new Error('NotFoundException');
}

async function processImageFile(file) {
  if (!file) return;

  stopScanner();

  setStatus('解析中…');
  if (resultMessage) resultMessage.textContent = '画像を解析しています…';
  if (resultInput) resultInput.value = '';
  if (searchButton) searchButton.disabled = true;
  if (productPreviewWrapper) productPreviewWrapper.style.display = 'none';

  const imageUrl = URL.createObjectURL(file);

  if (imagePreview) {
    imagePreview.src = imageUrl;
    imagePreview.style.display = 'block';
  }
  if (videoElement) videoElement.style.display = 'none';
  if (placeholder) placeholder.style.display = 'none';

  imagePreview.onload = async () => {
    try {
      const result = await tryDecodeImage(imagePreview, imageUrl);
      handleSuccess(result, '画像');
    } catch (err) {
      console.error('Image decode error:', err);
      setStatus('バーコードを検出できませんでした', 'error');
      if (resultMessage) resultMessage.textContent = '画像からバーコードを検出できませんでした。画像が鮮明かご確認ください。';
    }
  };
}

// ====================================================
// スキャン履歴管理 (HistoryManager)
// ====================================================
const historyListEl = document.querySelector('#history-list');
const historyCountEl = document.querySelector('#history-count');
const clearHistoryBtn = document.querySelector('#clear-history-btn');

const HistoryManager = {
  storageKey: 'codereader_history_v1',
  items: [],

  init() {
    this.load();
    this.render();
    this.bindEvents();
  },

  load() {
    try {
      const data = localStorage.getItem(this.storageKey);
      this.items = data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('Failed to load history:', e);
      this.items = [];
    }
  },

  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.items));
    } catch (e) {
      console.warn('Failed to save history:', e);
    }
  },

  add({ code, raw, format }) {
    if (!code) return;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;

    const newItem = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      code,
      raw,
      format,
      time: timeStr,
      datetime: `${dateStr} ${timeStr}`,
    };

    this.items.unshift(newItem);
    if (this.items.length > 500) {
      this.items.pop();
    }

    this.save();
    this.render();
  },

  delete(id) {
    this.items = this.items.filter(item => item.id !== id);
    this.save();
    this.render();
  },

  clear() {
    if (this.items.length === 0) return;
    if (confirm('スキャン履歴をすべて消去しますか？')) {
      this.items = [];
      this.save();
      this.render();
    }
  },

  selectItem(item) {
    if (resultInput) resultInput.value = item.code;
    if (searchButton) searchButton.disabled = false;
    if (resultMessage) resultMessage.textContent = `履歴から選択: ${item.code}`;

    if (isMobileDevice()) {
      openSearchPage(item.code);
    } else {
      showCardLaboPreview(item.code);
      if (productPreviewWrapper) {
        productPreviewWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  },

  render() {
    if (!historyListEl || !historyCountEl) return;

    historyCountEl.textContent = this.items.length;

    if (this.items.length === 0) {
      historyListEl.innerHTML = `
        <tr class="empty-history-row">
          <td colspan="3" style="text-align: center; color: #94a3b8; padding: 20px;">
            スキャン履歴はまだありません
          </td>
        </tr>
      `;
      return;
    }

    let html = '';
    this.items.forEach(item => {
      html += `
        <tr data-id="${item.id}">
          <td class="history-time">${item.time}</td>
          <td>
            <span class="history-code" title="クリックして開く">${item.code}</span>
          </td>
          <td>
            <div class="history-row-actions">
              <button class="history-icon-btn select-btn" type="button" title="このカードを表示">🔍</button>
              <button class="history-icon-btn copy-btn" type="button" title="コードをコピー">📋</button>
              <button class="history-icon-btn delete delete-btn" type="button" title="削除">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    });

    historyListEl.innerHTML = html;

    historyListEl.querySelectorAll('tr[data-id]').forEach(row => {
      const id = row.getAttribute('data-id');
      const item = this.items.find(i => i.id === id);
      if (!item) return;

      row.querySelector('.history-code')?.addEventListener('click', () => this.selectItem(item));
      row.querySelector('.select-btn')?.addEventListener('click', () => this.selectItem(item));

      row.querySelector('.copy-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(item.code);
        }
        if (resultMessage) resultMessage.textContent = `コピーしました: ${item.code}`;
      });

      row.querySelector('.delete-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.delete(id);
      });
    });
  },

  bindEvents() {
    clearHistoryBtn?.addEventListener('click', () => this.clear());
  }
};

HistoryManager.init();

// ====================================================
// イベントリスナーの登録
// ====================================================
if (iframeToggleBtn) {
  iframeToggleBtn.addEventListener('click', () => {
    if (cardlaboFrame) {
      cardlaboFrame.classList.toggle('show-full');
      const isFull = cardlaboFrame.classList.contains('show-full');
      iframeToggleBtn.textContent = isFull ? '↕️ 全体表示中' : '↕️ 検索結果フォーカス';
    }
  });
}

startButton?.addEventListener('click', startScanner);
stopButton?.addEventListener('click', stopScanner);
searchButton?.addEventListener('click', () => openSearchPage());

fileSelectButton?.addEventListener('click', () => {
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
});

fileInput?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) {
    processImageFile(file);
  }
});

dropZone?.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone?.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone?.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file) {
    processImageFile(file);
  }
});

window.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        processImageFile(file);
        break;
      }
    }
  }
});

window.addEventListener('beforeunload', stopScanner);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}
