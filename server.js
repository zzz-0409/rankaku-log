const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "rankaku-log.json");
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-rankaku-log-secret";
const MAX_BODY_BYTES = 25 * 1024 * 1024;
const STATIC_ROOT = __dirname;

let writeQueue = Promise.resolve();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function accountNameKey(name) {
  return normalizeName(name).toLocaleLowerCase("ja-JP");
}

function publicAccount(account) {
  return {
    id: account.id,
    name: account.name,
    createdAt: account.createdAt,
  };
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

function createToken(accountId) {
  const payload = base64url(JSON.stringify({
    accountId,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
  }));
  return `${payload}.${sign(payload)}`;
}

function readToken(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  if (sign(payload) !== signature) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed.accountId || Number(parsed.exp) < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 210000, 32, "sha256").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, account) {
  const { hash } = hashPassword(password, account.salt);
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(account.passwordHash));
}

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify({ accounts: [], records: {} }, null, 2));
  }
}

async function readStore() {
  await ensureDataFile();
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const store = JSON.parse(raw);
    return {
      accounts: Array.isArray(store.accounts) ? store.accounts : [],
      records: store.records && typeof store.records === "object" ? store.records : {},
    };
  } catch {
    return { accounts: [], records: {} };
  }
}

function writeStore(store) {
  writeQueue = writeQueue.then(async () => {
    await ensureDataFile();
    const tmp = `${DATA_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(store, null, 2));
    await fs.rename(tmp, DATA_FILE);
  });
  return writeQueue;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("送信データが大きすぎます。"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("JSONを読み取れませんでした。"));
      }
    });
    req.on("error", reject);
  });
}

async function requireAccount(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const session = readToken(token);
  if (!session) return null;
  const store = await readStore();
  const account = store.accounts.find((item) => item.id === session.accountId);
  if (!account) return null;
  return { store, account };
}

function normalizeRecord(record) {
  return {
    id: String(record.id || crypto.randomUUID()),
    date: String(record.date || new Date().toISOString()),
    waveType: record.waveType === "nightAny" ? "nightAny" : "dayOnly",
    stage: String(record.stage || ""),
    gold: Number(record.gold || 0),
    red: Number(record.red || 0),
    boss: Number(record.boss || 0),
    rescue: Number(record.rescue || 0),
    death: Number(record.death || 0),
    imageData: String(record.imageData || ""),
  };
}

async function handleApi(req, res, pathname) {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && pathname === "/api/health") {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && pathname === "/api/accounts") {
    const store = await readStore();
    json(res, 200, { accounts: store.accounts.map(publicAccount) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/signup") {
    const body = await readBody(req);
    const name = normalizeName(body.name);
    const password = String(body.password || "");
    if (!name) throw new Error("アカウント名を入力してください。");
    if (password.length < 4) throw new Error("パスワードは4文字以上で入力してください。");

    const store = await readStore();
    if (store.accounts.some((account) => accountNameKey(account.name) === accountNameKey(name))) {
      json(res, 409, { error: "このアカウント名はすでに使われています。ログインしてください。" });
      return;
    }

    const passwordData = hashPassword(password);
    const account = {
      id: crypto.randomUUID(),
      name,
      nameKey: accountNameKey(name),
      salt: passwordData.salt,
      passwordHash: passwordData.hash,
      createdAt: new Date().toISOString(),
    };
    store.accounts.push(account);
    store.records[account.id] = [];
    await writeStore(store);
    json(res, 201, { account: publicAccount(account), token: createToken(account.id) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await readBody(req);
    const name = normalizeName(body.name);
    const password = String(body.password || "");
    const store = await readStore();
    const account = store.accounts.find((item) => accountNameKey(item.name) === accountNameKey(name));
    if (!account) {
      json(res, 404, { error: "アカウントがありません。新規作成してください。" });
      return;
    }
    if (!verifyPassword(password, account)) {
      json(res, 401, { error: "パスワードが違います。" });
      return;
    }
    json(res, 200, { account: publicAccount(account), token: createToken(account.id) });
    return;
  }

  const session = await requireAccount(req);
  if (!session) {
    json(res, 401, { error: "ログインし直してください。" });
    return;
  }

  if (req.method === "GET" && pathname === "/api/me") {
    json(res, 200, { account: publicAccount(session.account) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/records") {
    json(res, 200, { records: session.store.records[session.account.id] || [] });
    return;
  }

  if (req.method === "PUT" && pathname === "/api/records") {
    const body = await readBody(req);
    const records = Array.isArray(body.records) ? body.records.map(normalizeRecord) : [];
    session.store.records[session.account.id] = records;
    await writeStore(session.store);
    json(res, 200, { records });
    return;
  }

  if (req.method === "DELETE" && pathname === "/api/records") {
    session.store.records[session.account.id] = [];
    await writeStore(session.store);
    json(res, 200, { records: [] });
    return;
  }

  json(res, 404, { error: "見つかりません。" });
}

async function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.resolve(STATIC_ROOT, `.${safePath}`);
  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const stat = await fs.stat(filePath);
    const target = stat.isDirectory() ? path.join(filePath, "index.html") : filePath;
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=60",
    });
    res.end(await fs.readFile(target));
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    json(res, 400, { error: error.message || "処理に失敗しました。" });
  }
});

server.listen(PORT, () => {
  console.log(`rankaku-log server listening on :${PORT}`);
});
