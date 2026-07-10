const SESSION_KEY = "rankaku-log-auth-token-v1";
const API_BASE = (window.RANKAKU_API_BASE || "").replace(/\/$/, "");
const PLAYER_NAME = "zzz";
const STAGES = [
  "シェケナダム",
  "アラマキ砦",
  "ムニ・エール海洋発電所",
  "難破船ドン・ブラコ",
  "すじこジャンクション跡",
  "トキシラズいぶし工房",
  "どんぴこ闘技場",
];
const WAVE_TYPES = {
  dayOnly: "昼のみ",
  nightAny: "夜あり",
};
const OCR_BASE_WIDTH = 720;
const OCR_BASE_HEIGHT = 1280;
const TOP_ROW_FALLBACK_Y = 690;
const TOP_ROW_RECTS = {
  boss: { x: 138, y: 48, width: 90, height: 36 },
  delivery: { x: 499, y: 8, width: 60, height: 42 },
  assistDelivery: { x: 550, y: 8, width: 60, height: 42 },
  red: { x: 482, y: 49, width: 118, height: 42 },
  rescue: { x: 614, y: 9, width: 70, height: 36 },
  death: { x: 614, y: 50, width: 70, height: 36 },
};
const SUMMARY_RECTS = {
  teamDelivery: { x: 36, y: 207, width: 116, height: 43 },
};

const $ = (id) => document.getElementById(id);

const loginScreen = $("loginScreen");
const loginForm = $("loginForm");
const accountNameInput = $("accountNameInput");
const accountPinInput = $("accountPinInput");
const loginButton = $("loginButton");
const createAccountButton = $("createAccountButton");
const loginMessage = $("loginMessage");
const accountList = $("accountList");
const resetLocalDataButton = $("resetLocalDataButton");
const appShell = $("appShell");
const activeAccountName = $("activeAccountName");
const logoutButton = $("logoutButton");
const imageInput = $("imageInput");
const ocrButton = $("ocrButton");
const saveButton = $("saveButton");
const preview = $("preview");
const statusText = $("status");
const recordCount = $("recordCount");

let selectedImageData = "";
let activeAccount = null;
let authToken = localStorage.getItem(SESSION_KEY) || "";
let accountCache = [];
let recordCache = [];

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ");
}

function accountNameKey(name) {
  return normalizeName(name).toLocaleLowerCase("ja-JP");
}

async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (authToken && options.auth !== false) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(payload?.error || "サーバーに接続できません。");
  }
  return payload;
}

function loadAccounts() {
  return accountCache;
}

function setLoginMessage(message) {
  loginMessage.textContent = message;
}

function renderAccountList() {
  const accounts = loadAccounts();
  if (accounts.length === 0) {
    accountList.innerHTML = "";
    return;
  }

  accountList.innerHTML = `
    <span>保存済み</span>
    <div class="accountChips">
      ${accounts.map((account) => `
        <button type="button" class="accountChip" data-account-name="${escapeHtml(account.name)}">
          ${escapeHtml(account.name)}
        </button>
      `).join("")}
    </div>
  `;
}

async function refreshAccountList() {
  const payload = await apiRequest("/api/accounts", { auth: false });
  accountCache = payload.accounts || [];
  renderAccountList();
}

function showLogin() {
  activeAccount = null;
  authToken = "";
  localStorage.removeItem(SESSION_KEY);
  loginScreen.hidden = false;
  appShell.hidden = true;
  accountPinInput.value = "";
  renderAccountList();
}

async function showApp(account) {
  activeAccount = account;
  loginScreen.hidden = true;
  appShell.hidden = false;
  activeAccountName.textContent = account.name;
  try {
    const payload = await apiRequest("/api/records");
    recordCache = (payload.records || []).map(normalizeRecord);
  } catch (error) {
    console.error(error);
    statusText.textContent = "記録の読み込みに失敗しました";
  }
  renderAll();
}

function validateCredentials(name, pin) {
  const cleanName = normalizeName(name);
  if (!cleanName) {
    setLoginMessage("アカウント名を入力してください。");
    return null;
  }
  if (pin.length < 4) {
    setLoginMessage("パスワードは4文字以上で入力してください。");
    return null;
  }
  return { cleanName, pin };
}

async function loginAccount(name, pin) {
  const credentials = validateCredentials(name, pin);
  if (!credentials) return;
  const payload = await apiRequest("/api/login", {
    method: "POST",
    auth: false,
    body: JSON.stringify({
      name: credentials.cleanName,
      password: pin,
    }),
  });
  authToken = payload.token;
  localStorage.setItem(SESSION_KEY, authToken);
  await refreshAccountList();
  await showApp(payload.account);
}

async function createAccount(name, pin) {
  const credentials = validateCredentials(name, pin);
  if (!credentials) return;
  const payload = await apiRequest("/api/signup", {
    method: "POST",
    auth: false,
    body: JSON.stringify({
      name: credentials.cleanName,
      password: pin,
    }),
  });
  authToken = payload.token;
  localStorage.setItem(SESSION_KEY, authToken);
  await refreshAccountList();
  await showApp(payload.account);
}

function resetLocalData() {
  const ok = confirm("この端末のログイン状態だけリセットしますか？サーバー上の記録は消えません。");
  if (!ok) return;

  localStorage.removeItem(SESSION_KEY);
  authToken = "";
  activeAccount = null;
  recordCache = [];
  accountNameInput.value = "";
  accountPinInput.value = "";
  loginScreen.hidden = false;
  appShell.hidden = true;
  renderAccountList();
  setLoginMessage("この端末のログイン状態をリセットしました。");
}

function normalizeRecord(record) {
  const delivery = Number(record.delivery ?? record.delivered ?? 0);
  const assistDelivery = Number(record.assistDelivery ?? record.assist ?? 0);
  const teamDelivery = Number(record.teamDelivery ?? record.totalDelivery ?? record.gold ?? 0);
  return {
    ...record,
    delivery,
    assistDelivery,
    teamDelivery,
    waveType: record.waveType || "dayOnly",
    imageData: record.imageData || "",
  };
}

function loadRecords() {
  return recordCache;
}

async function saveRecords(records) {
  recordCache = records.map(normalizeRecord);
  await apiRequest("/api/records", {
    method: "PUT",
    body: JSON.stringify({ records: recordCache }),
  });
}

function value(id) {
  const element = $(id);
  return Number(element?.value || 0);
}

function setValue(id, n) {
  const element = $(id);
  if (element && Number.isFinite(n)) element.value = n;
}

function currentWaveType() {
  return document.querySelector('input[name="waveType"]:checked')?.value || "dayOnly";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function extractNumbers(text) {
  return [...text.matchAll(/\d+/g)].map((match) => Number(match[0]));
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
}

function drawBaseImage(image) {
  const canvas = document.createElement("canvas");
  canvas.width = OCR_BASE_WIDTH;
  canvas.height = OCR_BASE_HEIGHT;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

function detectTopPlayerRow(context) {
  const startY = 610;
  const endY = 835;
  const minRedPixels = 430;
  let bestY = TOP_ROW_FALLBACK_Y;
  let streak = 0;

  for (let y = startY; y < endY; y += 1) {
    const { data } = context.getImageData(0, y, OCR_BASE_WIDTH, 1);
    let redPixels = 0;
    for (let x = 0; x < OCR_BASE_WIDTH; x += 1) {
      const index = x * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      if (r > 160 && g > 40 && g < 105 && b > 20 && b < 90) {
        redPixels += 1;
      }
    }
    if (redPixels > minRedPixels) {
      streak += 1;
      if (streak === 5) {
        bestY = y - 4;
        break;
      }
    } else {
      streak = 0;
    }
  }

  return bestY;
}

function cropTopRowRegion(baseCanvas, rowTop, rect) {
  const source = {
    x: rect.x,
    y: rowTop + rect.y,
    width: rect.width,
    height: rect.height,
  };
  const scale = 4;
  const canvas = document.createElement("canvas");
  canvas.width = source.width * scale;
  canvas.height = source.height * scale;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = false;
  context.drawImage(
    baseCanvas,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const brightness = (r + g + b) / 3;
    const isText = brightness > 130 && Math.max(r, g, b) - Math.min(r, g, b) < 95;
    const value = isText ? 0 : 255;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

async function recognizeDigits(canvas, label) {
  const result = await Tesseract.recognize(canvas, "eng", {
    tessedit_char_whitelist: "0123456789xX<>()[]{}",
  });
  return {
    label,
    text: result.data.text.replace(/\s+/g, " ").trim(),
  };
}

function firstNumber(text) {
  return extractNumbers(text)[0];
}

function fillFromTopRowOcr(reads) {
  const byLabel = Object.fromEntries(reads.map((read) => [read.label, read.text]));
  const fields = {
    teamDelivery: firstNumber(byLabel.teamDelivery || ""),
    delivery: firstNumber(byLabel.delivery || ""),
    assistDelivery: firstNumber(byLabel.assistDelivery || ""),
    red: firstNumber(byLabel.red || ""),
    boss: firstNumber(byLabel.boss || ""),
    rescue: firstNumber(byLabel.rescue || ""),
    death: firstNumber(byLabel.death || ""),
  };

  Object.entries(fields).forEach(([id, number]) => {
    if (Number.isFinite(number)) setValue(id, number);
  });
  return fields;
}

async function readTopResultFromImage(file) {
  const image = await loadImageFromFile(file);
  const { canvas: baseCanvas, context } = drawBaseImage(image);
  const rowTop = detectTopPlayerRow(context);
  const reads = [];

  for (const [label, rect] of Object.entries(SUMMARY_RECTS)) {
    statusText.textContent = `合計欄を読み取り中... ${label}`;
    const crop = cropTopRowRegion(baseCanvas, 0, rect);
    reads.push(await recognizeDigits(crop, label));
  }

  for (const [label, rect] of Object.entries(TOP_ROW_RECTS)) {
    statusText.textContent = `1番上の行を読み取り中... ${label}`;
    const crop = cropTopRowRegion(baseCanvas, rowTop, rect);
    reads.push(await recognizeDigits(crop, label));
  }

  const fields = fillFromTopRowOcr(reads);
  return { rowTop, reads, fields };
}

function autoFillFromText(text) {
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const zzzIndex = lines.findIndex((line) => line.toLowerCase().includes(PLAYER_NAME));
  const target = zzzIndex >= 0 ? lines.slice(zzzIndex, zzzIndex + 8).join(" ") : text;
  const nums = extractNumbers(target);

  const likelyGold = nums.find((n) => n >= 20 && n <= 300);
  const likelyRed = nums.find((n) => n >= 300 && n <= 5000);
  const likelyBoss = nums.find((n) => n >= 0 && n <= 80);

  setValue("delivery", likelyGold ?? 0);
  setValue("assistDelivery", 0);
  setValue("teamDelivery", likelyGold ?? 0);
  setValue("red", likelyRed ?? 0);
  setValue("boss", likelyBoss ?? 0);
}

function updateRecordCount() {
  const count = loadRecords().length;
  recordCount.textContent = `${count}件`;
}

function fileToCompressedDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSide = 900;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      image.onerror = () => resolve(String(reader.result || ""));
      image.src = reader.result;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

async function runAuth(action, loadingText) {
  loginButton.disabled = true;
  createAccountButton.disabled = true;
  resetLocalDataButton.disabled = true;
  setLoginMessage(loadingText);
  try {
    await action();
  } catch (error) {
    console.error(error);
    setLoginMessage(error.message || "処理に失敗しました。もう一度試してください。");
  } finally {
    loginButton.disabled = false;
    createAccountButton.disabled = false;
    resetLocalDataButton.disabled = false;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAuth(
    () => loginAccount(accountNameInput.value, accountPinInput.value),
    "ログイン中..."
  );
});

createAccountButton.addEventListener("click", async () => {
  await runAuth(
    () => createAccount(accountNameInput.value, accountPinInput.value),
    "作成中..."
  );
});

resetLocalDataButton.addEventListener("click", resetLocalData);

accountList.addEventListener("click", (event) => {
  const button = event.target.closest(".accountChip");
  if (!button) return;
  accountNameInput.value = button.dataset.accountName || "";
  accountPinInput.focus();
});

logoutButton.addEventListener("click", () => {
  if (confirm("ログアウトしますか？")) {
    showLogin();
  }
});

imageInput.addEventListener("change", async () => {
  const file = imageInput.files[0];
  if (!file) return;

  preview.src = URL.createObjectURL(file);
  preview.style.display = "block";
  statusText.textContent = "画像を選択しました";
  selectedImageData = await fileToCompressedDataUrl(file);
});

ocrButton.addEventListener("click", async () => {
  const file = imageInput.files[0];
  if (!file) {
    alert("スクショを選択してください。");
    return;
  }

  ocrButton.disabled = true;
  statusText.textContent = "読み取り中...";

  try {
    const topResult = await readTopResultFromImage(file);
    const readCount = Object.values(topResult.fields).filter(Number.isFinite).length;
    const hasCoreNumbers = ["teamDelivery", "delivery", "red", "boss"].every((key) => (
      Number.isFinite(topResult.fields[key])
    ));
    if (hasCoreNumbers && readCount >= 4) {
      statusText.textContent = "1番上の行を読み取りました。数字を確認してください。";
      return;
    }

    statusText.textContent = "固定位置で読めなかったため、全文OCRに切り替えます...";
    const result = await Tesseract.recognize(file, "eng+jpn", {
      logger: (message) => {
        if (message.status) {
          const pct = message.progress ? ` ${Math.round(message.progress * 100)}%` : "";
          statusText.textContent = `${message.status}${pct}`;
        }
      },
    });

    const text = result.data.text;
    autoFillFromText(text);
    statusText.textContent = "読み取り完了。数字を確認してください。";
  } catch (error) {
    console.error(error);
    statusText.textContent = "読み取りに失敗しました";
    alert("OCRに失敗しました。手入力で記録してください。");
  } finally {
    ocrButton.disabled = false;
  }
});

saveButton.addEventListener("click", async () => {
  saveButton.disabled = true;

  try {
    if (!selectedImageData && imageInput.files[0]) {
      selectedImageData = await fileToCompressedDataUrl(imageInput.files[0]);
    }

    const record = {
      id: createId(),
      date: new Date().toISOString(),
      waveType: currentWaveType(),
      stage: $("stage").value,
      delivery: value("delivery"),
      assistDelivery: value("assistDelivery"),
      teamDelivery: value("teamDelivery"),
      gold: 0,
      red: value("red"),
      boss: value("boss"),
      rescue: value("rescue"),
      death: value("death"),
      imageData: selectedImageData,
    };

    const records = loadRecords();
    records.push(record);
    await saveRecords(records);
    renderAll();
    statusText.textContent = "記録を保存しました";
  } catch (error) {
    console.error(error);
    statusText.textContent = error.message || "記録の保存に失敗しました";
  } finally {
    saveButton.disabled = false;
  }
});

function avg(records, key) {
  if (records.length === 0) return 0;
  return records.reduce((sum, record) => sum + Number(record[key] || 0), 0) / records.length;
}

function sum(records, key) {
  return records.reduce((total, record) => total + Number(record[key] || 0), 0);
}

function max(records, key) {
  if (records.length === 0) return 0;
  return Math.max(...records.map((record) => Number(record[key] || 0)));
}

function min(records, key) {
  if (records.length === 0) return 0;
  return Math.min(...records.map((record) => Number(record[key] || 0)));
}

function bestByTeamDelivery(records) {
  return records.reduce((best, record) => {
    if (!best) return record;
    if (Number(record.teamDelivery || 0) > Number(best.teamDelivery || 0)) return record;
    return best;
  }, null);
}

function latestRecords(records, limit = 30) {
  return [...records]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}

function formatRecordDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stat(label, valueText, subText = "") {
  return `
    <div class="statBox">
      <span class="statLabel">${escapeHtml(label)}</span>
      <span class="statValue">${escapeHtml(valueText)}</span>
      ${subText ? `<span class="statSub">${escapeHtml(subText)}</span>` : ""}
    </div>
  `;
}

async function deleteRecord(recordId) {
  const record = loadRecords().find((item) => item.id === recordId);
  if (!record) return false;

  const ok = confirm(`${formatRecordDate(record.date)} ${record.stage} の記録を削除しますか？`);
  if (!ok) return false;

  const nextRecords = loadRecords().filter((item) => item.id !== recordId);
  await saveRecords(nextRecords);
  renderAll();
  statusText.textContent = "記録を削除しました";
  return true;
}

function renderSummary() {
  const records = loadRecords();
  const stage = $("stage").value;
  const waveType = currentWaveType();
  const stageRecords = records.filter((record) => (
    record.stage === stage && record.waveType === waveType
  ));

  $("summary").innerHTML = `
    <div class="stats">
      <div class="statBox wide">
        <span class="statLabel">${escapeHtml(stage)} / ${WAVE_TYPES[waveType]}</span>
        <span class="statValue">${stageRecords.length}戦</span>
      </div>
      ${stat("平均 合計納品数", avg(stageRecords, "teamDelivery").toFixed(2), `最高 ${max(stageRecords, "teamDelivery")}`)}
      ${stat("平均 個人納品数", avg(stageRecords, "delivery").toFixed(2), `最高 ${max(stageRecords, "delivery")}`)}
      ${stat("平均 アシスト納品数", avg(stageRecords, "assistDelivery").toFixed(2), `最高 ${max(stageRecords, "assistDelivery")}`)}
      ${stat("平均 赤イクラ", avg(stageRecords, "red").toFixed(2), `最高 ${max(stageRecords, "red")}`)}
      ${stat("平均 オオモノ", avg(stageRecords, "boss").toFixed(2), `最高 ${max(stageRecords, "boss")}`)}
      ${stat("平均 救助", avg(stageRecords, "rescue").toFixed(2), `最高 ${max(stageRecords, "rescue")}`)}
      ${stat("平均 デス", avg(stageRecords, "death").toFixed(2), `最少 ${min(stageRecords, "death")}`)}
      <div class="statBox wide">
        <span class="statLabel">合計</span>
        <span class="statSub">
          最高合計納品数 ${max(stageRecords, "teamDelivery")} / 個人納品数 ${sum(stageRecords, "delivery")} / アシスト納品数 ${sum(stageRecords, "assistDelivery")} / 赤イクラ ${sum(stageRecords, "red")} /
          オオモノ ${sum(stageRecords, "boss")} / 救助 ${sum(stageRecords, "rescue")} /
          デス ${sum(stageRecords, "death")}
        </span>
      </div>
    </div>
  `;
}

function renderRecentAverage(recentRecords) {
  $("recentAverage").innerHTML = `
    <div class="stats">
      <div class="statBox wide">
        <span class="statLabel">対象</span>
        <span class="statValue">${recentRecords.length}戦</span>
        <span class="statSub">保存日時が新しい順の直近30戦</span>
      </div>
      ${stat("平均 合計納品数", avg(recentRecords, "teamDelivery").toFixed(2), `最高 ${max(recentRecords, "teamDelivery")}`)}
      ${stat("平均 個人納品数", avg(recentRecords, "delivery").toFixed(2), `最高 ${max(recentRecords, "delivery")}`)}
      ${stat("平均 アシスト", avg(recentRecords, "assistDelivery").toFixed(2), `最高 ${max(recentRecords, "assistDelivery")}`)}
      ${stat("平均 赤イクラ", avg(recentRecords, "red").toFixed(2), `最高 ${max(recentRecords, "red")}`)}
      ${stat("平均 オオモノ", avg(recentRecords, "boss").toFixed(2), `最高 ${max(recentRecords, "boss")}`)}
      ${stat("平均 救助", avg(recentRecords, "rescue").toFixed(2), `最高 ${max(recentRecords, "rescue")}`)}
      ${stat("平均 デス", avg(recentRecords, "death").toFixed(2), `最少 ${min(recentRecords, "death")}`)}
    </div>
  `;
}

function renderRecentRecord(record) {
  const image = record.imageData
    ? `<img src="${record.imageData}" alt="最近の記録画像" />`
    : `<div class="recentNoImage">画像なし</div>`;

  return `
    <article class="recentCard">
      ${image}
      <div class="recentMain">
        <div class="recentTop">
          <div>
            <h3>${escapeHtml(record.stage || "ステージ未設定")}</h3>
            <p>${escapeHtml(formatRecordDate(record.date))} / ${WAVE_TYPES[record.waveType] || ""}</p>
          </div>
          <button class="deleteRecordButton" type="button" data-record-id="${escapeHtml(record.id)}">削除</button>
        </div>
        <div class="recentNumbers">
          <span>合計 <b>${Number(record.teamDelivery || 0)}</b></span>
          <span>個人 <b>${Number(record.delivery || 0)}</b></span>
          <span>アシスト <b>${Number(record.assistDelivery || 0)}</b></span>
          <span>赤 <b>${Number(record.red || 0)}</b></span>
          <span>オオモノ <b>${Number(record.boss || 0)}</b></span>
          <span>救助 <b>${Number(record.rescue || 0)}</b></span>
          <span>デス <b>${Number(record.death || 0)}</b></span>
        </div>
      </div>
    </article>
  `;
}

function renderRecentRecords() {
  const recent = latestRecords(loadRecords(), 30);
  renderRecentAverage(recent);
  $("recentRecords").innerHTML = recent.length
    ? recent.map(renderRecentRecord).join("")
    : `<p class="emptyText">記録がまだありません</p>`;
}

function totalCard(records, waveType) {
  const filtered = records.filter((record) => record.waveType === waveType);
  return `
    <div class="totalCard">
      <span class="statLabel">${WAVE_TYPES[waveType]}</span>
      <span class="statValue">${max(filtered, "teamDelivery")}</span>
      <span class="statSub">最高合計納品数 / ${filtered.length}戦</span>
    </div>
  `;
}

function renderBestCard(stage, best) {
  if (!best) {
    return `
      <article class="bestCard empty">
        <div class="bestMeta">
          <h3>${escapeHtml(stage)}</h3>
          <p>記録なし</p>
        </div>
      </article>
    `;
  }

  const image = best.imageData
    ? `<img src="${best.imageData}" alt="${escapeHtml(stage)}の最高記録画像" />`
    : `<div class="noImage">画像なし</div>`;

  return `
    <article class="bestCard">
      ${image}
      <div class="bestMeta">
        <h3>${escapeHtml(stage)}</h3>
        <div class="bestScore">
          <span>最高合計納品数</span>
          <b>${Number(best.teamDelivery || 0)}</b>
        </div>
      </div>
    </article>
  `;
}

function renderBestSummary() {
  const records = loadRecords();
  $("totalSummary").innerHTML = `
    <div class="totalGrid">
      ${totalCard(records, "dayOnly")}
      ${totalCard(records, "nightAny")}
    </div>
  `;

  Object.keys(WAVE_TYPES).forEach((waveType) => {
    const container = waveType === "dayOnly" ? $("dayOnlyBest") : $("nightAnyBest");
    container.innerHTML = STAGES.map((stage) => {
      const stageRecords = records.filter((record) => (
        record.waveType === waveType && record.stage === stage
      ));
      return renderBestCard(stage, bestByTeamDelivery(stageRecords));
    }).join("");
  });
}

function renderAll() {
  if (!activeAccount) return;
  renderSummary();
  renderRecentRecords();
  renderBestSummary();
  updateRecordCount();
}

function setView(viewId) {
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === viewId);
  });
  document.querySelectorAll(".viewTab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.viewTarget === viewId);
  });
  renderAll();
}

document.querySelectorAll(".viewTab").forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.viewTarget));
});

$("recentRecords").addEventListener("click", async (event) => {
  const button = event.target.closest(".deleteRecordButton");
  if (!button) return;
  button.disabled = true;
  try {
    const deleted = await deleteRecord(button.dataset.recordId);
    if (!deleted) button.disabled = false;
  } catch (error) {
    console.error(error);
    statusText.textContent = error.message || "記録の削除に失敗しました";
    button.disabled = false;
  }
});

$("stage").addEventListener("change", renderAll);
document.querySelectorAll('input[name="waveType"]').forEach((radio) => {
  radio.addEventListener("change", renderAll);
});

async function boot() {
  loginButton.disabled = true;
  createAccountButton.disabled = true;
  resetLocalDataButton.disabled = true;
  setLoginMessage("サーバーに接続中...");
  try {
    await refreshAccountList();
    if (authToken) {
      const payload = await apiRequest("/api/me");
      await showApp(payload.account);
      return;
    }
    showLogin();
    setLoginMessage("初めてなら新規作成、作成済みならログインしてください。");
  } catch (error) {
    console.error(error);
    authToken = "";
    localStorage.removeItem(SESSION_KEY);
    showLogin();
    setLoginMessage("サーバーに接続できません。RenderのURLで開いてください。");
  } finally {
    loginButton.disabled = false;
    createAccountButton.disabled = false;
    resetLocalDataButton.disabled = false;
  }
}

boot();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
}
