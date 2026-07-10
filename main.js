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
const CROP_WIDTH = 750;
const CROP_HEIGHT = 1012;
const OCR_PROFILES = {
  full: {
    width: 720,
    height: 1280,
    rowLeft: 18,
    rowStartY: 610,
    rowEndY: 835,
    rowFallbackY: 690,
    minRedPixels: 430,
    summaryRects: {
      teamDelivery: { x: 36, y: 207, width: 116, height: 43 },
    },
    topRowRects: {
      boss: { x: 138, y: 48, width: 90, height: 36 },
      deliveryPair: { x: 482, y: 6, width: 132, height: 46 },
      delivery: { x: 499, y: 8, width: 60, height: 42 },
      assistDelivery: { x: 550, y: 8, width: 60, height: 42 },
      red: { x: 482, y: 49, width: 118, height: 42 },
      rescue: { x: 614, y: 9, width: 70, height: 36 },
      death: { x: 614, y: 50, width: 70, height: 36 },
    },
  },
  cropped: {
    width: CROP_WIDTH,
    height: CROP_HEIGHT,
    rowLeft: 20,
    rowStartY: 520,
    rowEndY: 765,
    rowFallbackY: 565,
    minRedPixels: 450,
    summaryRects: {
      teamDelivery: { x: 38, y: 77, width: 121, height: 45 },
    },
    topRowRects: {
      boss: { x: 144, y: 48, width: 94, height: 36 },
      deliveryPair: { x: 502, y: 6, width: 138, height: 46 },
      delivery: { x: 520, y: 8, width: 63, height: 42 },
      assistDelivery: { x: 573, y: 8, width: 63, height: 42 },
      red: { x: 502, y: 49, width: 123, height: 42 },
      rescue: { x: 640, y: 9, width: 73, height: 36 },
      death: { x: 640, y: 50, width: 73, height: 36 },
    },
  },
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
const cropEditor = $("cropEditor");
const cropCanvas = $("cropCanvas");
const cropZoom = $("cropZoom");
const cropX = $("cropX");
const cropY = $("cropY");
const applyCropButton = $("applyCropButton");
const originalOcrButton = $("originalOcrButton");
const imageModal = $("imageModal");
const imageModalTitle = $("imageModalTitle");
const expandedImage = $("expandedImage");
const closeImageModal = $("closeImageModal");

let selectedImageData = "";
let croppedImageBlob = null;
let cropSourceImage = null;
let lastImageSource = "";
let lastOcrResult = null;
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
  accountList.innerHTML = "";
  accountList.hidden = true;
}

async function refreshAccountList() {
  accountCache = [];
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
    bossBattle: Boolean(record.bossBattle),
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

function currentNumberFields() {
  return {
    delivery: value("delivery"),
    assistDelivery: value("assistDelivery"),
    teamDelivery: value("teamDelivery"),
    red: value("red"),
    boss: value("boss"),
    rescue: value("rescue"),
    death: value("death"),
  };
}

function buildOcrTrainingData(correctedFields) {
  if (!lastOcrResult) return null;
  const ocrFields = lastOcrResult.fields || {};
  const changedFields = {};
  Object.entries(correctedFields).forEach(([key, saved]) => {
    const read = Number(ocrFields[key]);
    if (!Number.isFinite(read) || read !== saved) {
      changedFields[key] = {
        read: Number.isFinite(read) ? read : null,
        saved,
      };
    }
  });

  return {
    source: lastOcrResult.source,
    readAt: lastOcrResult.readAt,
    rowTop: lastOcrResult.rowTop ?? null,
    profile: lastOcrResult.profile || "",
    ocrFields,
    correctedFields,
    changedFields,
    reads: lastOcrResult.reads || [],
  };
}

function resetRecordForm() {
  selectedImageData = "";
  croppedImageBlob = null;
  cropSourceImage = null;
  lastImageSource = "";
  lastOcrResult = null;
  imageInput.value = "";
  cropEditor.hidden = true;
  preview.removeAttribute("src");
  preview.style.display = "none";
  const noBossBattle = document.querySelector('input[name="bossBattle"][value="none"]');
  if (noBossBattle) noBossBattle.checked = true;

  ["delivery", "assistDelivery", "teamDelivery", "red", "boss", "rescue", "death"].forEach((id) => {
    const element = $(id);
    if (element) element.value = "";
  });
}

function currentWaveType() {
  return document.querySelector('input[name="waveType"]:checked')?.value || "dayOnly";
}

function currentBossBattle() {
  return document.querySelector('input[name="bossBattle"]:checked')?.value === "yes";
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

function drawCropPreview() {
  if (!cropSourceImage) return;

  cropCanvas.width = CROP_WIDTH;
  cropCanvas.height = CROP_HEIGHT;
  const context = cropCanvas.getContext("2d");
  const zoom = Number(cropZoom.value || 100) / 100;
  const baseScale = Math.max(
    CROP_WIDTH / cropSourceImage.width,
    CROP_HEIGHT / cropSourceImage.height
  );
  const scale = baseScale * zoom;
  const drawWidth = cropSourceImage.width * scale;
  const drawHeight = cropSourceImage.height * scale;
  const maxShiftX = Math.max(0, (drawWidth - CROP_WIDTH) / 2);
  const maxShiftY = Math.max(0, (drawHeight - CROP_HEIGHT) / 2);
  const shiftX = (Number(cropX.value || 0) / 100) * maxShiftX;
  const shiftY = (Number(cropY.value || 0) / 100) * maxShiftY;
  const drawX = (CROP_WIDTH - drawWidth) / 2 + shiftX;
  const drawY = (CROP_HEIGHT - drawHeight) / 2 + shiftY;

  context.fillStyle = "#050706";
  context.fillRect(0, 0, CROP_WIDTH, CROP_HEIGHT);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(cropSourceImage, drawX, drawY, drawWidth, drawHeight);
}

function canvasToBlob(canvas, type = "image/jpeg", quality = 0.86) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function applyCurrentCrop() {
  if (!cropSourceImage) return null;
  drawCropPreview();
  const blob = await canvasToBlob(cropCanvas);
  if (!blob) return null;

  croppedImageBlob = blob;
  lastImageSource = "cropped";
  selectedImageData = cropCanvas.toDataURL("image/jpeg", 0.76);
  preview.src = selectedImageData;
  preview.style.display = "block";
  statusText.textContent = "切り取りました。読み取り前に位置を確認してください。";
  return blob;
}

async function getOcrImageSource(useOriginal = false) {
  if (useOriginal) return imageInput.files[0];
  if (cropSourceImage) return croppedImageBlob;
  return croppedImageBlob || imageInput.files[0];
}

function selectOcrProfile(image) {
  const ratio = image.width / image.height;
  return ratio > 0.64 ? OCR_PROFILES.cropped : OCR_PROFILES.full;
}

function drawBaseImage(image, profile) {
  const canvas = document.createElement("canvas");
  canvas.width = profile.width;
  canvas.height = profile.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

function detectTopPlayerRow(context, profile) {
  const startY = profile.rowStartY;
  const endY = profile.rowEndY;
  const minRedPixels = profile.minRedPixels;
  let bestY = profile.rowFallbackY;
  let streak = 0;

  for (let y = startY; y < endY; y += 1) {
    const { data } = context.getImageData(0, y, profile.width, 1);
    let redPixels = 0;
    for (let x = 0; x < profile.width; x += 1) {
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

  const bounds = detectTopPlayerPanelBounds(context, profile, bestY);
  return {
    top: bestY,
    left: bounds.left,
    right: bounds.right,
    xOffset: bounds.left - profile.rowLeft,
  };
}

function isPlayerPanelRed(r, g, b) {
  return r > 150 && g > 35 && g < 115 && b > 18 && b < 100 && r > g * 1.55 && r > b * 1.6;
}

function detectTopPlayerPanelBounds(context, profile, rowTop) {
  const sampleHeight = 80;
  const startY = Math.max(0, rowTop + 6);
  const endY = Math.min(profile.height, startY + sampleHeight);
  const counts = new Array(profile.width).fill(0);

  for (let y = startY; y < endY; y += 1) {
    const { data } = context.getImageData(0, y, profile.width, 1);
    for (let x = 0; x < profile.width; x += 1) {
      const index = x * 4;
      if (isPlayerPanelRed(data[index], data[index + 1], data[index + 2])) {
        counts[x] += 1;
      }
    }
  }

  const threshold = Math.max(5, Math.floor((endY - startY) * 0.18));
  let left = -1;
  let right = -1;
  for (let x = 0; x < profile.width; x += 1) {
    if (counts[x] >= threshold) {
      if (left < 0) left = x;
      right = x;
    }
  }

  if (left < 0 || right < 0 || right - left < profile.width * 0.45) {
    return {
      left: profile.rowLeft,
      right: profile.width - profile.rowLeft,
    };
  }

  return { left, right };
}

function cropTopRowRegion(baseCanvas, rowInfo, rect) {
  const top = typeof rowInfo === "number" ? rowInfo : rowInfo.top;
  const xOffset = typeof rowInfo === "number" ? 0 : rowInfo.xOffset;
  const sourceX = Math.max(0, Math.min(baseCanvas.width - rect.width, rect.x + xOffset));
  const sourceY = Math.max(0, Math.min(baseCanvas.height - rect.height, top + rect.y));
  const source = {
    x: sourceX,
    y: sourceY,
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

let digitTemplates = null;

function getDigitTemplates() {
  if (digitTemplates) return digitTemplates;
  const fonts = [
    "900 34px Impact",
    "900 34px Arial Black",
    "900 34px sans-serif",
    "800 36px sans-serif",
  ];
  digitTemplates = {};
  for (let digit = 0; digit <= 9; digit += 1) {
    digitTemplates[String(digit)] = fonts.map((font) => createDigitTemplate(String(digit), font));
  }
  return digitTemplates;
}

function createDigitTemplate(digit, font) {
  const canvas = document.createElement("canvas");
  canvas.width = 42;
  canvas.height = 58;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000";
  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(digit, canvas.width / 2, canvas.height / 2 + 1);
  return normalizeGlyphBitmap(canvas, { left: 0, right: canvas.width - 1, top: 0, bottom: canvas.height - 1 });
}

function isInkPixel(data, index) {
  return data[index] < 150 && data[index + 1] < 150 && data[index + 2] < 150;
}

function findInkBounds(canvas, runLeft = 0, runRight = canvas.width - 1) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let left = canvas.width;
  let right = -1;
  let top = canvas.height;
  let bottom = -1;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = runLeft; x <= runRight; x += 1) {
      const index = (y * canvas.width + x) * 4;
      if (isInkPixel(data, index)) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }

  if (right < left || bottom < top) return null;
  return { left, right, top, bottom };
}

function normalizeGlyphBitmap(canvas, bounds) {
  const size = 18;
  const normalized = document.createElement("canvas");
  normalized.width = size;
  normalized.height = size + 10;
  const context = normalized.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "#fff";
  context.fillRect(0, 0, normalized.width, normalized.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const sourceWidth = Math.max(1, bounds.right - bounds.left + 1);
  const sourceHeight = Math.max(1, bounds.bottom - bounds.top + 1);
  const scale = Math.min((normalized.width - 2) / sourceWidth, (normalized.height - 2) / sourceHeight);
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
  const targetX = Math.round((normalized.width - targetWidth) / 2);
  const targetY = Math.round((normalized.height - targetHeight) / 2);

  context.drawImage(
    canvas,
    bounds.left,
    bounds.top,
    sourceWidth,
    sourceHeight,
    targetX,
    targetY,
    targetWidth,
    targetHeight
  );

  const imageData = context.getImageData(0, 0, normalized.width, normalized.height);
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    const ink = isInkPixel(data, i);
    const value = ink ? 0 : 255;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
  context.putImageData(imageData, 0, 0);
  return imageData.data;
}

function bitmapDistance(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i += 4) {
    diff += Math.abs(a[i] - b[i]);
  }
  return diff / (a.length / 4) / 255;
}

function classifyDigit(canvas, bounds) {
  const bitmap = normalizeGlyphBitmap(canvas, bounds);
  const templates = getDigitTemplates();
  let best = { digit: "", score: -Infinity };

  for (const [digit, variants] of Object.entries(templates)) {
    for (const template of variants) {
      const score = 1 - bitmapDistance(bitmap, template);
      if (score > best.score) best = { digit, score };
    }
  }

  return best;
}

function extractGlyphRuns(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const columnInk = [];
  for (let x = 0; x < canvas.width; x += 1) {
    let ink = 0;
    for (let y = 0; y < canvas.height; y += 1) {
      const index = (y * canvas.width + x) * 4;
      if (isInkPixel(data, index)) ink += 1;
    }
    columnInk[x] = ink;
  }

  const minColumnInk = Math.max(2, Math.floor(canvas.height * 0.05));
  const runs = [];
  let runStart = -1;
  let empty = 0;
  for (let x = 0; x < canvas.width; x += 1) {
    if (columnInk[x] >= minColumnInk) {
      if (runStart < 0) runStart = x;
      empty = 0;
    } else if (runStart >= 0) {
      empty += 1;
      if (empty >= 3) {
        runs.push({ left: runStart, right: x - empty });
        runStart = -1;
        empty = 0;
      }
    }
  }
  if (runStart >= 0) runs.push({ left: runStart, right: canvas.width - 1 });
  return runs;
}

function readGameFontNumber(canvas, options = {}) {
  const runs = extractGlyphRuns(canvas);
  const digits = [];
  const minScore = options.minScore ?? 0.56;
  const maxDigits = options.maxDigits ?? 4;

  for (const run of runs) {
    const bounds = findInkBounds(canvas, run.left, run.right);
    if (!bounds) continue;
    const width = bounds.right - bounds.left + 1;
    const height = bounds.bottom - bounds.top + 1;
    if (height < canvas.height * 0.22 || width < 4) continue;

    const isLikelyBracket = width <= 7 && height > canvas.height * 0.38;
    if (isLikelyBracket) continue;

    const classified = classifyDigit(canvas, bounds);
    if (classified.score >= minScore) {
      digits.push({ ...classified, x: bounds.left });
    }
  }

  const text = digits
    .sort((a, b) => a.x - b.x)
    .slice(0, maxDigits)
    .map((item) => item.digit)
    .join("");

  if (!text) return "";
  const number = Number(text);
  if (Number.isFinite(options.min) && number < options.min) return "";
  if (Number.isFinite(options.max) && number > options.max) return "";
  return text;
}

function gameFontOptionsForLabel(label) {
  const options = {
    teamDelivery: { min: 0, max: 999, maxDigits: 3, minScore: 0.54 },
    delivery: { min: 0, max: 200, maxDigits: 3, minScore: 0.54 },
    assistDelivery: { min: 0, max: 99, maxDigits: 2, minScore: 0.52 },
    deliveryPair: { min: 0, max: 9999, maxDigits: 5, minScore: 0.54 },
    red: { min: 0, max: 9999, maxDigits: 4, minScore: 0.54 },
    boss: { min: 0, max: 99, maxDigits: 2, minScore: 0.54 },
    rescue: { min: 0, max: 9, maxDigits: 1, minScore: 0.52 },
    death: { min: 0, max: 9, maxDigits: 1, minScore: 0.52 },
  };
  return options[label] || {};
}

function firstNumber(text) {
  return extractNumbers(text)[0];
}

function firstNumberInRange(text, min, max) {
  return extractNumbers(text).find((number) => number >= min && number <= max);
}

function parseDeliveryPair(text) {
  const clean = String(text || "")
    .replace(/[＜〈《‹]/g, "<")
    .replace(/[＞〉》›]/g, ">")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[［]/g, "[")
    .replace(/[］]/g, "]");

  const bracketed = clean.match(/(?:[xX]\s*)?(\d{1,3})\s*[<({\[]\s*(\d{1,2})/);
  if (bracketed) {
    return {
      delivery: Number(bracketed[1]),
      assistDelivery: Number(bracketed[2]),
    };
  }

  const assistOnly = clean.match(/[<({\[]\s*(\d{1,2})/);
  const numbers = extractNumbers(clean);
  return {
    delivery: numbers[0],
    assistDelivery: assistOnly ? Number(assistOnly[1]) : numbers.find((number, index) => (
      index > 0 && number >= 0 && number <= 99
    )),
  };
}

function fillFromTopRowOcr(reads) {
  const byLabel = Object.fromEntries(reads.map((read) => [read.label, read.text]));
  const byGameFont = Object.fromEntries(reads.map((read) => [read.label, read.gameFontText || ""]));
  const playerDelivery = parseDeliveryPair(byLabel.deliveryPair || "");
  const gameFontPair = byGameFont.deliveryPair || "";
  const fields = {
    teamDelivery: firstNumber(byGameFont.teamDelivery || "") ?? firstNumber(byLabel.teamDelivery || ""),
    delivery: firstNumberInRange(byGameFont.delivery || "", 0, 200) ?? playerDelivery.delivery ?? firstNumberInRange(gameFontPair.slice(0, 3), 0, 200) ?? firstNumberInRange(byLabel.delivery || "", 0, 200),
    assistDelivery: firstNumberInRange(byGameFont.assistDelivery || "", 0, 99) ?? playerDelivery.assistDelivery ?? firstNumberInRange(gameFontPair.slice(2), 0, 99) ?? firstNumberInRange(byLabel.assistDelivery || "", 0, 99),
    red: firstNumber(byGameFont.red || "") ?? firstNumber(byLabel.red || ""),
    boss: firstNumberInRange(byGameFont.boss || "", 0, 99) ?? firstNumber(byLabel.boss || ""),
    rescue: firstNumberInRange(byGameFont.rescue || "", 0, 9) ?? firstNumber(byLabel.rescue || ""),
    death: firstNumberInRange(byGameFont.death || "", 0, 9) ?? firstNumber(byLabel.death || ""),
  };

  Object.entries(fields).forEach(([id, number]) => {
    if (Number.isFinite(number)) setValue(id, number);
  });
  return fields;
}

async function readTopResultFromImage(file) {
  const image = await loadImageFromFile(file);
  const profile = selectOcrProfile(image);
  const { canvas: baseCanvas, context } = drawBaseImage(image, profile);
  const rowInfo = detectTopPlayerRow(context, profile);
  const reads = [];

  for (const [label, rect] of Object.entries(profile.summaryRects)) {
    statusText.textContent = `合計欄を読み取り中... ${label}`;
    const crop = cropTopRowRegion(baseCanvas, 0, rect);
    const read = await recognizeDigits(crop, label);
    read.gameFontText = readGameFontNumber(crop, gameFontOptionsForLabel(label));
    reads.push(read);
  }

  for (const [label, rect] of Object.entries(profile.topRowRects)) {
    statusText.textContent = `1番上の行を読み取り中... ${label}`;
    const crop = cropTopRowRegion(baseCanvas, rowInfo, rect);
    const read = await recognizeDigits(crop, label);
    read.gameFontText = readGameFontNumber(crop, gameFontOptionsForLabel(label));
    reads.push(read);
  }

  const fields = fillFromTopRowOcr(reads);
  return { rowTop: rowInfo.top, rowInfo, reads, fields, profile };
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

function rememberOcrResult(source, result, extra = {}) {
  lastOcrResult = {
    source,
    readAt: new Date().toISOString(),
    rowTop: result?.rowTop ?? null,
    profile: result?.profile ? `${result.profile.width}x${result.profile.height}` : "",
    fields: { ...(result?.fields || currentNumberFields()) },
    reads: (result?.reads || []).map((read) => ({
      label: read.label,
      text: read.text || "",
      gameFontText: read.gameFontText || "",
    })),
    ...extra,
  };
}

async function runImageRead(useOriginal = false) {
  if (!imageInput.files[0]) {
    alert("スクショを選択してください。");
    return;
  }

  if (!useOriginal && cropSourceImage && !croppedImageBlob) {
    alert("先にガイド枠に合わせて「この形に切り取る」を押してください。");
    statusText.textContent = "ガイド枠に合わせて切り取りを確定するか、「切り取らずに読み取る」を使ってください。";
    return;
  }

  const activeButton = useOriginal ? originalOcrButton : ocrButton;
  activeButton.disabled = true;
  statusText.textContent = useOriginal ? "元画像を読み取り中..." : "切り取り画像を読み取り中...";

  try {
    const ocrSource = await getOcrImageSource(useOriginal);
    if (useOriginal) {
      selectedImageData = "";
      preview.src = URL.createObjectURL(imageInput.files[0]);
      preview.style.display = "block";
    }
    const topResult = await readTopResultFromImage(ocrSource);
    const sourceName = useOriginal ? "original" : "cropped";
    rememberOcrResult(sourceName, topResult);
    lastImageSource = sourceName;
    const readCount = Object.values(topResult.fields).filter(Number.isFinite).length;
    const hasCoreNumbers = ["teamDelivery", "delivery", "red", "boss"].every((key) => (
      Number.isFinite(topResult.fields[key])
    ));
    if (hasCoreNumbers && readCount >= 4) {
      statusText.textContent = "1番上の行を読み取りました。数字を確認してください。";
      return;
    }

    statusText.textContent = "固定位置で読めなかったため、全文OCRに切り替えます...";
    const result = await Tesseract.recognize(ocrSource, "eng+jpn", {
      logger: (message) => {
        if (message.status) {
          const pct = message.progress ? ` ${Math.round(message.progress * 100)}%` : "";
          statusText.textContent = `${message.status}${pct}`;
        }
      },
    });

    const text = result.data.text;
    autoFillFromText(text);
    rememberOcrResult(`${sourceName}-fallback`, {
      fields: currentNumberFields(),
      reads: [{ label: "fallback", text }],
    });
    lastImageSource = sourceName;
    statusText.textContent = "読み取り完了。数字を確認してください。";
  } catch (error) {
    console.error(error);
    statusText.textContent = "読み取りに失敗しました";
    alert("OCRに失敗しました。手入力で記録してください。");
  } finally {
    activeButton.disabled = false;
  }
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

  croppedImageBlob = null;
  lastImageSource = "";
  lastOcrResult = null;
  cropSourceImage = await loadImageFromFile(file);
  cropZoom.value = "100";
  cropX.value = "0";
  cropY.value = "0";
  cropEditor.hidden = false;
  drawCropPreview();
  preview.src = URL.createObjectURL(file);
  preview.style.display = "block";
  statusText.textContent = "薄いガイドに合わせて切り取り位置を調整してください。";
  selectedImageData = "";
});

[cropZoom, cropX, cropY].forEach((control) => {
  control.addEventListener("input", () => {
    croppedImageBlob = null;
    selectedImageData = "";
    lastImageSource = "";
    drawCropPreview();
  });
});

applyCropButton.addEventListener("click", async () => {
  applyCropButton.disabled = true;
  try {
    await applyCurrentCrop();
  } finally {
    applyCropButton.disabled = false;
  }
});

ocrButton.addEventListener("click", () => {
  runImageRead(false);
});

originalOcrButton.addEventListener("click", () => {
  runImageRead(true);
});

/*
ocrButton.addEventListener("click", async () => {
  if (!imageInput.files[0]) {
    alert("スクショを選択してください。");
    return;
  }

  if (cropSourceImage && !croppedImageBlob) {
    alert("先にガイド枠に合わせて「この形に切り取る」を押してください。");
    statusText.textContent = "ガイド枠に合わせて切り取りを確定してから読み取れます。";
    return;
  }

  ocrButton.disabled = true;
  statusText.textContent = "読み取り中...";

  try {
    const ocrSource = await getOcrImageSource();
    const topResult = await readTopResultFromImage(ocrSource);
    const readCount = Object.values(topResult.fields).filter(Number.isFinite).length;
    const hasCoreNumbers = ["teamDelivery", "delivery", "red", "boss"].every((key) => (
      Number.isFinite(topResult.fields[key])
    ));
    if (hasCoreNumbers && readCount >= 4) {
      statusText.textContent = "1番上の行を読み取りました。数字を確認してください。";
      return;
    }

    statusText.textContent = "固定位置で読めなかったため、全文OCRに切り替えます...";
    const result = await Tesseract.recognize(ocrSource, "eng+jpn", {
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
*/

saveButton.addEventListener("click", async () => {
  saveButton.disabled = true;

  try {
    if (!selectedImageData && imageInput.files[0]) {
      selectedImageData = await fileToCompressedDataUrl(imageInput.files[0]);
    }

    const correctedFields = currentNumberFields();
    const record = {
      id: createId(),
      date: new Date().toISOString(),
      waveType: currentWaveType(),
      bossBattle: currentBossBattle(),
      stage: $("stage").value,
      delivery: correctedFields.delivery,
      assistDelivery: correctedFields.assistDelivery,
      teamDelivery: correctedFields.teamDelivery,
      gold: 0,
      red: correctedFields.red,
      boss: correctedFields.boss,
      rescue: correctedFields.rescue,
      death: correctedFields.death,
      imageData: selectedImageData,
      imageSource: lastImageSource || (croppedImageBlob ? "cropped" : "original"),
      ocrTraining: buildOcrTrainingData(correctedFields),
    };

    const records = loadRecords();
    records.push(record);
    await saveRecords(records);
    resetRecordForm();
    renderAll();
    statusText.textContent = "保存しました。";
    alert("保存しました。");
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

function normalWaveRecords(records) {
  return records.filter((record) => !record.bossBattle);
}

function bestByTeamDelivery(records) {
  return records.reduce((best, record) => {
    if (!best) return record;
    if (Number(record.teamDelivery || 0) > Number(best.teamDelivery || 0)) return record;
    return best;
  }, null);
}

function stageBestEntries(records, waveType) {
  return STAGES.map((stage) => {
    const stageRecords = records.filter((record) => (
      record.waveType === waveType && record.stage === stage
    ));
    return {
      stage,
      best: bestByTeamDelivery(stageRecords),
    };
  });
}

function bestTotal(entries) {
  return entries.reduce((total, entry) => total + Number(entry.best?.teamDelivery || 0), 0);
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
  const actionRecords = normalWaveRecords(stageRecords);

  $("summary").innerHTML = `
    <div class="stats">
      <div class="statBox wide">
        <span class="statLabel">${escapeHtml(stage)} / ${WAVE_TYPES[waveType]}</span>
        <span class="statValue">${stageRecords.length}戦</span>
        <span class="statSub">行動系平均はオカシラなし ${actionRecords.length}戦</span>
      </div>
      ${stat("平均 合計納品数", avg(stageRecords, "teamDelivery").toFixed(2), `最高 ${max(stageRecords, "teamDelivery")}`)}
      ${stat("平均 個人納品数", avg(stageRecords, "delivery").toFixed(2), `最高 ${max(stageRecords, "delivery")}`)}
      ${stat("平均 アシスト納品数", avg(stageRecords, "assistDelivery").toFixed(2), `最高 ${max(stageRecords, "assistDelivery")}`)}
      ${stat("平均 赤イクラ", avg(actionRecords, "red").toFixed(2), `オカシラなし最高 ${max(actionRecords, "red")}`)}
      ${stat("平均 オオモノ", avg(actionRecords, "boss").toFixed(2), `オカシラなし最高 ${max(actionRecords, "boss")}`)}
      ${stat("平均 救助", avg(actionRecords, "rescue").toFixed(2), `オカシラなし最高 ${max(actionRecords, "rescue")}`)}
      ${stat("平均 デス", avg(actionRecords, "death").toFixed(2), `オカシラなし最少 ${min(actionRecords, "death")}`)}
      <div class="statBox wide">
        <span class="statLabel">合計</span>
        <span class="statSub">
          最高合計納品数 ${max(stageRecords, "teamDelivery")} / 個人納品数 ${sum(stageRecords, "delivery")} / アシスト納品数 ${sum(stageRecords, "assistDelivery")} / 赤イクラ ${sum(actionRecords, "red")} /
          オオモノ ${sum(actionRecords, "boss")} / 救助 ${sum(actionRecords, "rescue")} /
          デス ${sum(actionRecords, "death")}
        </span>
      </div>
    </div>
  `;
}

function renderRecentAverage(recentRecords) {
  const actionRecords = normalWaveRecords(recentRecords);
  $("recentAverage").innerHTML = `
    <div class="stats">
      <div class="statBox wide">
        <span class="statLabel">対象</span>
        <span class="statValue">${recentRecords.length}戦</span>
        <span class="statSub">行動系平均はオカシラなし ${actionRecords.length}戦</span>
      </div>
      ${stat("平均 合計納品数", avg(recentRecords, "teamDelivery").toFixed(2), `最高 ${max(recentRecords, "teamDelivery")}`)}
      ${stat("平均 個人納品数", avg(recentRecords, "delivery").toFixed(2), `最高 ${max(recentRecords, "delivery")}`)}
      ${stat("平均 アシスト", avg(recentRecords, "assistDelivery").toFixed(2), `最高 ${max(recentRecords, "assistDelivery")}`)}
      ${stat("平均 赤イクラ", avg(actionRecords, "red").toFixed(2), `オカシラなし最高 ${max(actionRecords, "red")}`)}
      ${stat("平均 オオモノ", avg(actionRecords, "boss").toFixed(2), `オカシラなし最高 ${max(actionRecords, "boss")}`)}
      ${stat("平均 救助", avg(actionRecords, "rescue").toFixed(2), `オカシラなし最高 ${max(actionRecords, "rescue")}`)}
      ${stat("平均 デス", avg(actionRecords, "death").toFixed(2), `オカシラなし最少 ${min(actionRecords, "death")}`)}
    </div>
  `;
}

function renderRecentRecord(record) {
  const image = record.imageData
    ? `<img src="${record.imageData}" alt="最近の記録画像" />`
    : `<div class="recentNoImage">画像なし</div>`;
  const bossBadge = record.bossBattle ? `<span class="bossBattleBadge">オカシラあり</span>` : "";

  return `
    <article class="recentCard">
      ${image}
      <div class="recentMain">
        <div class="recentTop">
          <div>
            <h3>${escapeHtml(record.stage || "ステージ未設定")}</h3>
            <p>${escapeHtml(formatRecordDate(record.date))} / ${WAVE_TYPES[record.waveType] || ""} ${bossBadge}</p>
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
  const entries = stageBestEntries(records, waveType);
  const completedStages = entries.filter((entry) => entry.best).length;
  return `
    <div class="totalCard">
      <span class="statLabel">${WAVE_TYPES[waveType]}</span>
      <span class="statValue">${bestTotal(entries)}</span>
      <span class="statSub">各ステージ最高合計納品数 / ${completedStages}ステージ / ${filtered.length}戦</span>
      <div class="shareActions">
        <button type="button" data-share-wave="${waveType}" data-share-kind="text">数字だけ共有</button>
        <button type="button" data-share-wave="${waveType}" data-share-kind="image">画像付き共有</button>
      </div>
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

function bestShareTitle(waveType) {
  return `乱獲ログ 最高記録（${WAVE_TYPES[waveType]}）`;
}

function bestShareText(waveType) {
  const entries = stageBestEntries(loadRecords(), waveType);
  const total = bestTotal(entries);
  const lines = [
    bestShareTitle(waveType),
    `各ステージ最高合計納品数: ${total}`,
    "",
    ...entries.map((entry) => `${entry.stage}: ${Number(entry.best?.teamDelivery || 0)}`),
    "",
    "https://rankaku-log.onrender.com",
  ];
  return lines.join("\n");
}

async function dataUrlToFile(dataUrl, filename) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}

async function bestShareFiles(waveType) {
  const entries = stageBestEntries(loadRecords(), waveType)
    .filter((entry) => entry.best?.imageData);
  return Promise.all(entries.map((entry, index) => (
    dataUrlToFile(
      entry.best.imageData,
      `rankaku-log-${waveType}-${String(index + 1).padStart(2, "0")}.jpg`
    )
  )));
}

function downloadShareFiles(files) {
  files.forEach((file, index) => {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    setTimeout(() => {
      link.click();
      URL.revokeObjectURL(url);
    }, index * 180);
  });
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function loadShareImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawCoverImage(context, image, x, y, width, height) {
  const imageRatio = image.width / image.height;
  const targetRatio = width / height;
  let sourceWidth = image.width;
  let sourceHeight = image.height;
  let sourceX = 0;
  let sourceY = 0;

  if (imageRatio > targetRatio) {
    sourceWidth = image.height * targetRatio;
    sourceX = (image.width - sourceWidth) / 2;
  } else {
    sourceHeight = image.width / targetRatio;
    sourceY = (image.height - sourceHeight) / 2;
  }

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function drawFittedText(context, text, x, y, maxWidth) {
  let output = String(text);
  while (output.length > 1 && context.measureText(output).width > maxWidth) {
    output = `${output.slice(0, -2)}…`;
  }
  context.fillText(output, x, y);
}

async function createBestShareImage(waveType) {
  const entries = stageBestEntries(loadRecords(), waveType);
  const width = 1080;
  const rowHeight = 142;
  const height = 270 + entries.length * rowHeight + 70;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  context.fillStyle = "#101312";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#b7e34b";
  context.fillRect(0, 0, width, 14);

  context.fillStyle = "#f4f7f2";
  context.font = "900 54px system-ui, sans-serif";
  context.fillText("乱獲ログ 最高記録", 56, 92);
  context.fillStyle = "#b7c2b7";
  context.font = "800 30px system-ui, sans-serif";
  context.fillText(WAVE_TYPES[waveType], 58, 138);

  context.fillStyle = "#b7e34b";
  context.font = "900 92px system-ui, sans-serif";
  context.fillText(String(bestTotal(entries)), 56, 235);
  context.fillStyle = "#b7c2b7";
  context.font = "800 26px system-ui, sans-serif";
  context.fillText("各ステージ最高合計納品数", 310, 218);

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const y = 282 + i * rowHeight;
    context.fillStyle = i % 2 === 0 ? "#1a201d" : "#141a17";
    context.fillRect(44, y, width - 88, rowHeight - 14);

    const image = await loadShareImage(entry.best?.imageData || "");
    if (image) {
      drawCoverImage(context, image, 66, y + 18, 136, 92);
    } else {
      context.fillStyle = "#050706";
      context.fillRect(66, y + 18, 136, 92);
      context.fillStyle = "#6f7a70";
      context.font = "800 22px system-ui, sans-serif";
      context.fillText("画像なし", 88, y + 72);
    }

    context.fillStyle = "#f4f7f2";
    context.font = "850 31px system-ui, sans-serif";
    drawFittedText(context, entry.stage, 228, y + 55, 610);
    context.fillStyle = "#b7c2b7";
    context.font = "750 22px system-ui, sans-serif";
    context.fillText(entry.best ? formatRecordDate(entry.best.date) : "記録なし", 228, y + 92);
    context.fillStyle = "#b7e34b";
    context.font = "900 54px system-ui, sans-serif";
    context.textAlign = "right";
    context.fillText(String(Number(entry.best?.teamDelivery || 0)), width - 76, y + 76);
    context.textAlign = "left";
  }

  context.fillStyle = "#b7c2b7";
  context.font = "750 24px system-ui, sans-serif";
  context.fillText("rankaku-log.onrender.com", 56, height - 34);
  return canvasToPngBlob(canvas);
}

async function shareBestSummary(waveType, kind) {
  const title = bestShareTitle(waveType);
  const text = bestShareText(waveType);

  if (kind === "text") {
    if (navigator.share) {
      await navigator.share({ title, text });
      return;
    }
    await navigator.clipboard.writeText(text);
    alert("共有用テキストをコピーしました。");
    return;
  }

  const files = await bestShareFiles(waveType);
  if (files.length === 0) {
    alert("共有できる最高記録画像がまだありません。");
    return;
  }
  if (navigator.share && navigator.canShare?.({ files })) {
    await navigator.share({ title, text, files });
    return;
  }

  downloadShareFiles(files);
  if (navigator.clipboard) await navigator.clipboard.writeText(text);
  alert("最高記録画像を保存しました。対応SNSで画像を選んで投稿してください。");
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

function openImageModal(src, title) {
  if (!src) return;
  expandedImage.src = src;
  imageModalTitle.textContent = title || "最高記録画像";
  imageModal.hidden = false;
  closeImageModal.focus();
}

function closeExpandedImage() {
  imageModal.hidden = true;
  expandedImage.removeAttribute("src");
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

document.querySelectorAll(".collapsiblePanel > .sectionTitle").forEach((title) => {
  title.setAttribute("role", "button");
  title.setAttribute("tabindex", "0");
  title.setAttribute("aria-expanded", "true");
  const togglePanel = () => {
    const panel = title.closest(".collapsiblePanel");
    const collapsed = panel.classList.toggle("collapsed");
    title.setAttribute("aria-expanded", String(!collapsed));
  };
  title.addEventListener("click", togglePanel);
  title.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    togglePanel();
  });
});

$("totalSummary").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-share-wave][data-share-kind]");
  if (!button) return;

  button.disabled = true;
  try {
    await shareBestSummary(button.dataset.shareWave, button.dataset.shareKind);
  } catch (error) {
    console.error(error);
    alert("共有に失敗しました。もう一度試してください。");
  } finally {
    button.disabled = false;
  }
});

document.querySelectorAll(".bestList").forEach((list) => {
  list.addEventListener("click", (event) => {
    const image = event.target.closest(".bestCard img");
    if (!image) return;
    const title = image.closest(".bestCard")?.querySelector("h3")?.textContent || "最高記録画像";
    openImageModal(image.src, title);
  });
});

closeImageModal.addEventListener("click", closeExpandedImage);

imageModal.addEventListener("click", (event) => {
  if (event.target === imageModal) closeExpandedImage();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !imageModal.hidden) closeExpandedImage();
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
