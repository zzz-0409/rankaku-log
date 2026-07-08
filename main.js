const LEGACY_STORAGE_KEY = "rankaku-log-v1";
const ACCOUNT_LIST_KEY = "rankaku-log-accounts-v1";
const SESSION_KEY = "rankaku-log-current-account-v1";
const RECORD_PREFIX = "rankaku-log-records:";
const LEGACY_IMPORT_PREFIX = "rankaku-log-legacy-imported:";
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

const $ = (id) => document.getElementById(id);

const loginScreen = $("loginScreen");
const loginForm = $("loginForm");
const accountNameInput = $("accountNameInput");
const accountPinInput = $("accountPinInput");
const loginButton = $("loginButton");
const createAccountButton = $("createAccountButton");
const loginMessage = $("loginMessage");
const accountList = $("accountList");
const appShell = $("appShell");
const activeAccountName = $("activeAccountName");
const logoutButton = $("logoutButton");
const imageInput = $("imageInput");
const ocrButton = $("ocrButton");
const saveButton = $("saveButton");
const exportButton = $("exportButton");
const clearButton = $("clearButton");
const preview = $("preview");
const statusText = $("status");
const rawText = $("rawText");
const recordCount = $("recordCount");

let selectedImageData = "";
let activeAccount = null;

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

function loadAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNT_LIST_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNT_LIST_KEY, JSON.stringify(accounts));
}

function hashPin(accountId, pin) {
  if (!pin) return "";
  return simpleHash(`${accountId}:${pin}`);
}

function simpleHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fallback-${(hash >>> 0).toString(16).padStart(8, "0")}`;
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

function showLogin() {
  activeAccount = null;
  sessionStorage.removeItem(SESSION_KEY);
  loginScreen.hidden = false;
  appShell.hidden = true;
  accountPinInput.value = "";
  renderAccountList();
}

function showApp(account) {
  activeAccount = account;
  sessionStorage.setItem(SESSION_KEY, account.id);
  loginScreen.hidden = true;
  appShell.hidden = false;
  activeAccountName.textContent = account.name;
  try {
    maybeImportLegacyRecords(account);
  } catch (error) {
    console.error(error);
    statusText.textContent = "古い記録の取り込みをスキップしました";
  }
  renderAll();
}

function findAccountByName(name) {
  const key = accountNameKey(name);
  return loadAccounts().find((account) => accountNameKey(account.name) === key);
}

function updateLegacyAccountPassword(existing, pinHash) {
  const accounts = loadAccounts().map((account) => (
    account.id === existing.id ? { ...account, pinHash } : account
  ));
  saveAccounts(accounts);
  showApp({ ...existing, pinHash });
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

function loginAccount(name, pin) {
  const credentials = validateCredentials(name, pin);
  if (!credentials) return;
  const { cleanName } = credentials;
  const existing = findAccountByName(cleanName);
  if (!existing) {
    setLoginMessage("アカウントがありません。新規作成してください。");
    return;
  }

  const pinHash = hashPin(existing.id, pin);
  if (!existing.pinHash) {
    updateLegacyAccountPassword(existing, pinHash);
    return;
  }

  if (pinHash !== existing.pinHash) {
    setLoginMessage("パスワードが違います。");
    return;
  }
  showApp(existing);
}

function createAccount(name, pin) {
  const credentials = validateCredentials(name, pin);
  if (!credentials) return;
  const { cleanName } = credentials;
  const existing = findAccountByName(cleanName);
  if (existing?.pinHash) {
    setLoginMessage("このアカウント名はすでに使われています。ログインしてください。");
    return;
  }
  if (existing && !existing.pinHash) {
    const pinHash = hashPin(existing.id, pin);
    updateLegacyAccountPassword(existing, pinHash);
    return;
  }

  const account = {
    id: createId(),
    name: cleanName,
    pinHash: "",
    createdAt: new Date().toISOString(),
  };
  account.pinHash = hashPin(account.id, pin);
  const accounts = loadAccounts();
  accounts.push(account);
  saveAccounts(accounts);
  showApp(account);
}

function normalizeRecord(record) {
  return {
    ...record,
    waveType: record.waveType || "dayOnly",
    imageData: record.imageData || "",
  };
}

function recordsKey() {
  return activeAccount ? `${RECORD_PREFIX}${activeAccount.id}` : LEGACY_STORAGE_KEY;
}

function parseRecordsFromKey(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]").map(normalizeRecord);
  } catch {
    return [];
  }
}

function loadRecords() {
  return parseRecordsFromKey(recordsKey());
}

function saveRecords(records) {
  localStorage.setItem(recordsKey(), JSON.stringify(records.map(normalizeRecord)));
}

function maybeImportLegacyRecords(account) {
  const importedKey = `${LEGACY_IMPORT_PREFIX}${account.id}`;
  if (localStorage.getItem(importedKey)) return;

  const currentRecords = parseRecordsFromKey(`${RECORD_PREFIX}${account.id}`);
  const legacyRecords = parseRecordsFromKey(LEGACY_STORAGE_KEY);
  if (currentRecords.length > 0 || legacyRecords.length === 0) {
    localStorage.setItem(importedKey, "1");
    return;
  }

  if (confirm("未ログイン時代の記録があります。このアカウントに取り込みますか？")) {
    localStorage.setItem(`${RECORD_PREFIX}${account.id}`, JSON.stringify(legacyRecords));
  }
  localStorage.setItem(importedKey, "1");
}

function value(id) {
  return Number($(id).value || 0);
}

function setValue(id, n) {
  if (Number.isFinite(n)) $(id).value = n;
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

function autoFillFromText(text) {
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const zzzIndex = lines.findIndex((line) => line.toLowerCase().includes(PLAYER_NAME));
  const target = zzzIndex >= 0 ? lines.slice(zzzIndex, zzzIndex + 8).join(" ") : text;
  const nums = extractNumbers(target);

  const likelyGold = nums.find((n) => n >= 20 && n <= 300);
  const likelyRed = nums.find((n) => n >= 300 && n <= 5000);
  const likelyBoss = nums.find((n) => n >= 0 && n <= 80);

  setValue("gold", likelyGold ?? 0);
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
  setLoginMessage(loadingText);
  try {
    await action();
  } catch (error) {
    console.error(error);
    setLoginMessage("処理に失敗しました。もう一度試してください。");
  } finally {
    loginButton.disabled = false;
    createAccountButton.disabled = false;
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

accountList.addEventListener("click", (event) => {
  const button = event.target.closest(".accountChip");
  if (!button) return;
  accountNameInput.value = button.dataset.accountName || "";
  accountPinInput.focus();
});

logoutButton.addEventListener("click", showLogin);

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
  rawText.textContent = "";

  try {
    const result = await Tesseract.recognize(file, "eng+jpn", {
      logger: (message) => {
        if (message.status) {
          const pct = message.progress ? ` ${Math.round(message.progress * 100)}%` : "";
          statusText.textContent = `${message.status}${pct}`;
        }
      },
    });

    const text = result.data.text;
    rawText.textContent = text;
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
      gold: value("gold"),
      red: value("red"),
      boss: value("boss"),
      rescue: value("rescue"),
      death: value("death"),
      imageData: selectedImageData,
    };

    const records = loadRecords();
    records.push(record);
    saveRecords(records);
    renderAll();
    statusText.textContent = "記録を保存しました";
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

function bestByGold(records) {
  return records.reduce((best, record) => {
    if (!best) return record;
    if (Number(record.gold || 0) > Number(best.gold || 0)) return record;
    return best;
  }, null);
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
      ${stat("平均 金イクラ", avg(stageRecords, "gold").toFixed(2), `最高 ${max(stageRecords, "gold")}`)}
      ${stat("平均 赤イクラ", avg(stageRecords, "red").toFixed(2), `最高 ${max(stageRecords, "red")}`)}
      ${stat("平均 オオモノ", avg(stageRecords, "boss").toFixed(2), `最高 ${max(stageRecords, "boss")}`)}
      ${stat("平均 救助", avg(stageRecords, "rescue").toFixed(2), `最高 ${max(stageRecords, "rescue")}`)}
      ${stat("平均 デス", avg(stageRecords, "death").toFixed(2), `最少 ${min(stageRecords, "death")}`)}
      <div class="statBox wide">
        <span class="statLabel">合計</span>
        <span class="statSub">
          金 ${sum(stageRecords, "gold")} / 赤 ${sum(stageRecords, "red")} /
          オオモノ ${sum(stageRecords, "boss")} / 救助 ${sum(stageRecords, "rescue")} /
          デス ${sum(stageRecords, "death")}
        </span>
      </div>
    </div>
  `;
}

function totalCard(records, waveType) {
  const filtered = records.filter((record) => record.waveType === waveType);
  return `
    <div class="totalCard">
      <span class="statLabel">${WAVE_TYPES[waveType]}</span>
      <span class="statValue">${sum(filtered, "gold")}</span>
      <span class="statSub">合計納品数 / ${filtered.length}戦</span>
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
          <span>最高納品数</span>
          <b>${Number(best.gold || 0)}</b>
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
      return renderBestCard(stage, bestByGold(stageRecords));
    }).join("");
  });
}

function renderAll() {
  if (!activeAccount) return;
  renderSummary();
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

$("stage").addEventListener("change", renderAll);
document.querySelectorAll('input[name="waveType"]').forEach((radio) => {
  radio.addEventListener("change", renderAll);
});

exportButton.addEventListener("click", () => {
  const records = loadRecords();
  const header = ["account", "date", "waveType", "stage", "gold", "red", "boss", "rescue", "death", "hasImage"];
  const rows = records.map((record) => header.map((key) => {
    if (key === "account") return JSON.stringify(activeAccount?.name ?? "");
    if (key === "hasImage") return JSON.stringify(Boolean(record.imageData));
    return JSON.stringify(record[key] ?? "");
  }).join(","));
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `rankaku-log-${activeAccount?.name || "account"}.csv`;
  anchor.click();
});

clearButton.addEventListener("click", () => {
  if (!confirm("このアカウントの記録をすべて削除しますか？")) return;
  localStorage.removeItem(recordsKey());
  renderAll();
  statusText.textContent = "記録を削除しました";
});

function boot() {
  renderAccountList();
  const accounts = loadAccounts();
  const sessionId = sessionStorage.getItem(SESSION_KEY);
  const sessionAccount = accounts.find((account) => account.id === sessionId);
  if (sessionAccount) {
    showApp(sessionAccount);
  } else {
    showLogin();
  }
}

boot();
