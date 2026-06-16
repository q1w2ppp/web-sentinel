const http = require("http"), fs = require("fs"), path = require("path");
const RssParser = require("rss-parser");
const initSqlJs = require("sql.js");

const PORT = process.env.PORT || 9091;
const MIME = { ".html": "text/html;charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };
const DB_PATH = path.join(__dirname, "data", "sentinel.db");

// ═══ DB ═══
let db;

function saveDB() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(db.export().buffer));
}

function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function dbRun(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  stmt.step();
  stmt.free();
  saveDB();
}

function dbGet(sql, params = []) {
  const rows = dbAll(sql, params);
  return rows.length ? rows[0] : null;
}

async function initDB(SQL) {
  const wasmPath = path.join(__dirname, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  db.run("CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, title TEXT, link TEXT, time TEXT, hit INTEGER DEFAULT 0)");
  try { db.run("ALTER TABLE items ADD COLUMN summary TEXT DEFAULT ''"); } catch(e) {}
  db.run("CREATE TABLE IF NOT EXISTS briefings (id INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT, body TEXT)");
  // Unique constraint: try create, ignore if exists
  try { db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_items_unique ON items(source, link)"); } catch(e) {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_items_time ON items(time)"); } catch(e) {}
  saveDB();
}

// ═══ State ═══
let keywords = [
  // 技术
  "开源", "编程", "Rust", "Go", "JavaScript", "Python", "前端", "后端", "数据库",
  // AI
  "AI", "大模型", "DeepSeek", "GPT", "Agent", "prompt", "OpenAI",
  // 产品
  "Figma", "设计", "UI", "UX",
  // 商业
  "创业", "融资", "SaaS", "增长",
  // 科技
  "苹果", "华为", "芯片", "机器人",
  // 游戏
  "游戏", "独立游戏", "Steam",
  // 科学
  "量子", "太空", "生物学",
  // 互联网
  "vibe coding", "浏览器"
];
let latestBriefing = null;

// ═══ RSS Sources ═══
const rssParser = new RssParser();
const SOURCES = [
  { name: "HN", url: "https://hnrss.org/frontpage" },
  { name: "Reddit", url: "https://www.reddit.com/r/programming/.rss" },
  { name: "V2EX", url: "https://www.v2ex.com/index.xml" },
  { name: "少数派", url: "https://sspai.com/feed" },
];

async function fetchSource(source) {
  try {
    const feed = await rssParser.parseURL(source.url);
    const items = feed.items || [];
    let count = 0;
    for (const item of items) {
      const title = item.title || "";
      const link = item.link || "";
      const time = item.isoDate || item.pubDate || new Date().toISOString();
      const hit = keywords.some(k => title.toLowerCase().includes(k.toLowerCase())) ? 1 : 0;
      try { dbRun("INSERT OR IGNORE INTO items (source, title, link, time, hit) VALUES (?, ?, ?, ?, ?)", [source.name, title, link, time, hit]); count++; } catch(e) {}
    }
    console.log(`[${source.name}] ${count} items`);
  } catch (e) {
    console.error(`[${source.name}] fetch error:`, e.message);
  }
}

async function fetchGitHubTrending() {
  try {
    const resp = await fetch("https://github.com/trending?since=daily", {
      headers: { "User-Agent": "SENTINEL/1.0" }
    });
    const html = await resp.text();
    const repoRegex = /<h2[^>]*>\s*<a[^>]*href="(\/[^"]+)"[^>]*>\s*[^<]*<span[^>]*>([^<]*)<\/span>\s*\/\s*<span[^>]*>([^<]*)<\/span>/g;
    let match, count = 0;
    while ((match = repoRegex.exec(html)) !== null) {
      const fullName = match[1].trim();
      const title = `GitHub Trending: ${fullName}`;
      const link = `https://github.com${fullName}`;
      const hit = keywords.some(k => title.toLowerCase().includes(k.toLowerCase())) ? 1 : 0;
      try { dbRun("INSERT OR IGNORE INTO items (source, title, link, time, hit) VALUES (?, ?, ?, ?, ?)", ["GitHub", title, link, new Date().toISOString(), hit]); count++; } catch(e) {}
    }
    console.log(`[GitHub] ${count} repos`);
  } catch (e) {
    console.error("[GitHub] fetch error:", e.message);
  }
}

async function fetchZhihu() {
  try {
    const resp = await fetch("https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=20", {
      headers: { "User-Agent": "SENTINEL/1.0 Mozilla/5.0" }
    });
    const json = await resp.json();
    const items = json.data || [];
    let count = 0;
    for (const item of items) {
      const target = item.target || {};
      const title = target.title || "";
      const id = target.id || "";
      const link = `https://www.zhihu.com/question/${id}`;
      const hit = keywords.some(k => title.toLowerCase().includes(k.toLowerCase())) ? 1 : 0;
      if (title) { try { dbRun("INSERT OR IGNORE INTO items (source, title, link, time, hit) VALUES (?, ?, ?, ?, ?)", ["知乎", title, link, new Date().toISOString(), hit]); count++; } catch(e) {} }
    }
    console.log(`[知乎] ${count} items`);
  } catch (e) {
    console.error("[知乎] fetch error:", e.message);
  }
}

async function fetchWeibo() {
  try {
    const resp = await fetch("https://weibo.com/ajax/side/hotSearch", {
      headers: { "User-Agent": "SENTINEL/1.0 Mozilla/5.0" }
    });
    const json = await resp.json();
    const items = json.data?.realtime || [];
    let count = 0;
    for (const item of items) {
      const title = item.word || item.note || "";
      const link = `https://s.weibo.com/weibo?q=${encodeURIComponent(title)}`;
      const hit = keywords.some(k => title.toLowerCase().includes(k.toLowerCase())) ? 1 : 0;
      if (title) { try { dbRun("INSERT OR IGNORE INTO items (source, title, link, time, hit) VALUES (?, ?, ?, ?, ?)", ["微博", title, link, new Date().toISOString(), hit]); count++; } catch(e) {} }
    }
    console.log(`[微博] ${count} items`);
  } catch (e) {
    console.error("[微博] fetch error:", e.message);
  }
}

async function fetchBilibili() {
  try {
    const resp = await fetch("https://api.bilibili.com/x/web-interface/popular?ps=20", {
      headers: { "User-Agent": "SENTINEL/1.0 Mozilla/5.0", "Referer": "https://www.bilibili.com" }
    });
    const json = await resp.json();
    const items = json.data?.list || [];
    let count = 0;
    for (const item of items) {
      const title = item.title || "";
      const link = `https://www.bilibili.com/video/${item.bvid}`;
      const hit = keywords.some(k => title.toLowerCase().includes(k.toLowerCase())) ? 1 : 0;
      if (title) { try { dbRun("INSERT OR IGNORE INTO items (source, title, link, time, hit) VALUES (?, ?, ?, ?, ?)", ["B站", title, link, new Date().toISOString(), hit]); count++; } catch(e) {} }
    }
    console.log(`[B站] ${count} items`);
  } catch (e) {
    console.error("[B站] fetch error:", e.message);
  }
}

async function fetchAll() {
  await Promise.all(SOURCES.map(fetchSource));
  await fetchGitHubTrending();
  await fetchZhihu();
  await fetchWeibo();
  await fetchBilibili();
}

// ═══ AI Briefing ═══
async function generateBriefing() {
  const hits = dbAll("SELECT * FROM items WHERE hit = 1 ORDER BY time DESC LIMIT 30");
  if (hits.length === 0) { console.log("📝 No hits to summarize"); return; }

  const itemsText = hits.map(h => `[${h.source}] ${h.title}`).join("\n");
  const prompt = `你是一个技术趋势分析助手。以下是过去一段时间内匹配到关键词的网络热点：

${itemsText}

请用中文写一段简洁的趋势简报（200字以内），包含：
1. 核心要点（2-3条最重要的发现）
2. 趋势判断（这些热点反映出什么方向）
3. 建议关注

用三段式输出，每段之间空一行。`;

  try {
    // Read API key from ai-matrix project
    const keysPath = path.join(__dirname, "..", "ai-matrix", "data", "keys.json");
    let apiKey = "";
    if (fs.existsSync(keysPath)) {
      const keys = JSON.parse(fs.readFileSync(keysPath, "utf-8"));
      apiKey = keys[0]?.key || "";
    }
    if (!apiKey) { console.log("📝 No API key found, using mock briefing"); return mockBriefing(hits); }

    const https = require("https");
    const body = JSON.stringify({
      model: "deepseek-ai/DeepSeek-V3",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 600
    });

    const result = await new Promise((resolve, reject) => {
      const r = https.request({
        hostname: "api.siliconflow.cn",
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + apiKey,
          "Content-Length": Buffer.byteLength(body)
        }
      }, res => {
        let d = ""; res.on("data", c => d += c);
        res.on("end", () => {
          try {
            const j = JSON.parse(d);
            if (j.error) reject(new Error(j.error.message || "API error"));
            resolve(j.choices?.[0]?.message?.content || "");
          } catch(e) { reject(e); }
        });
      });
      r.on("error", reject);
      r.write(body); r.end();
    });

    const briefBody = result.trim();
    if (!briefBody) { console.log("📝 Empty AI response, using mock"); return mockBriefing(hits); }
    console.log(`📝 AI briefing: ${briefBody.length} chars`);
    const id = dbGet("SELECT MAX(id) as mid FROM briefings").mid;
    latestBriefing = { time: new Date().toISOString(), body: briefBody, num: id };
    console.log("📝 AI briefing generated and saved");
  } catch (e) {
    console.error("📝 AI briefing error:", e.message);
    mockBriefing(hits);
  }
}

function mockBriefing(hits) {
  const top3 = hits.slice(0, 3).map(h => `「${h.source}」${h.title}`).join("；");
  const body = `本周期共捕获 ${hits.length} 条关键词命中。

核心热点：${top3 || "暂无足够数据"}。

趋势判断：话题热度持续上升，建议持续关注该领域动态。

建议关注：未来 24 小时内可能会有更多相关讨论出现。`;
  dbRun("INSERT INTO briefings (time, body) VALUES (?, ?)", [new Date().toISOString(), body]);
  const id = dbGet("SELECT MAX(id) as mid FROM briefings").mid;
  latestBriefing = { time: new Date().toISOString(), body, num: id };
  console.log(`📝 Mock briefing generated (${hits.length} hits)`);
}

// ═══ Periodic Fetch ═══
async function periodicFetch() {
  console.log("⏳ Fetching all sources...");
  await fetchAll();
  console.log("✅ Fetch done");
  // Auto-summarize new hit items
  summarizeNewHits();
}

// ═══ AI Summary ═══
async function summarizeItem(item) {
  try {
    // Try to fetch article content
    let content = "";
    try {
      const resp = await fetch(item.link, { 
        headers: { "User-Agent": "SENTINEL/1.0" },
        signal: AbortSignal.timeout(5000)
      });
      const html = await resp.text();
      // Extract text from HTML (simple approach)
      content = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .substring(0, 3000);
    } catch(e) { /* Use title only */ }

    const text = content || item.title;
    const prompt = `请用一句话中文总结以下内容的核心要点（30字以内，只返回总结，不要任何前缀）：\n\n标题：${item.title}\n\n${content ? '内容：' + content.substring(0, 2000) : ''}`;

    const keysPath = path.join(__dirname, "..", "ai-matrix", "data", "keys.json");
    let apiKey = "";
    if (fs.existsSync(keysPath)) {
      const keys = JSON.parse(fs.readFileSync(keysPath, "utf-8"));
      apiKey = keys[0]?.key || "";
    }
    if (!apiKey) return;

    const body = JSON.stringify({
      model: "deepseek-ai/DeepSeek-V3",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 100
    });

    const result = await new Promise((resolve, reject) => {
      const r = https.request({
        hostname: "api.siliconflow.cn",
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + apiKey,
          "Content-Length": Buffer.byteLength(body)
        }
      }, res => {
        let d = ""; res.on("data", c => d += c);
        res.on("end", () => {
          try {
            const j = JSON.parse(d);
            if (j.error) reject(new Error(j.error.message));
            resolve(j.choices?.[0]?.message?.content?.trim() || "");
          } catch(e) { reject(e); }
        });
      });
      r.on("error", reject);
      r.write(body); r.end();
    });

    if (result) {
      dbRun("UPDATE items SET summary = ? WHERE id = ?", [result, item.id]);
      console.log(`📝 Summarized #${item.id}: ${result}`);
    }
  } catch(e) {
    // Silently fail - summary is optional
  }
}

async function summarizeNewHits() {
  const items = dbAll("SELECT * FROM items WHERE hit = 1 AND summary = '' LIMIT 5");
  for (const item of items) {
    await summarizeItem(item);
  }
}

// ═══ HTTP Server ═══
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("OK");
  }

  // Static files
  if (req.method === "GET" && (req.url === "/" || req.url.match(/\.(html|js|css|json|png|ico)$/))) {
    let fp = req.url === "/" ? "/index.html" : req.url;
    fp = path.join(__dirname, fp);
    try {
      if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        const ext = path.extname(fp);
        res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain" });
        return res.end(fs.readFileSync(fp));
      }
    } catch (e) {}
    res.writeHead(404);
    return res.end("404");
  }

  // API: State
  if (req.method === "GET" && req.url.startsWith("/api/state")) {
    try {
      const url = new URL(req.url, "http://localhost");
      const showAll = url.searchParams.get("all") === "1";
      const feed = showAll
        ? dbAll("SELECT * FROM items ORDER BY time DESC LIMIT 50")
        : dbAll("SELECT * FROM items WHERE hit = 1 ORDER BY time DESC LIMIT 50");
      const totalRow = dbGet("SELECT COUNT(*) as c FROM items");
      const hitRow = dbGet("SELECT COUNT(*) as c FROM items WHERE hit = 1");
      const brfRow = dbGet("SELECT COUNT(*) as c FROM briefings");
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        sources: SOURCES.length + 4,
        total: totalRow ? totalRow.c : 0,
        hits: hitRow ? hitRow.c : 0,
        briefings: brfRow ? brfRow.c : 0,
        feed,
        latestBriefing,
      }));
    } catch(e) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // API: Keywords
  if (req.method === "POST" && req.url === "/api/keywords") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        if (data.keywords) keywords = data.keywords;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Bad JSON" }));
      }
    });
    return;
  }

  // API: Summarize item
  if (req.method === "POST" && req.url.startsWith("/api/summarize/")) {
    const id = parseInt(req.url.split("/").pop());
    const item = dbGet("SELECT * FROM items WHERE id = ?", [id]);
    if (!item) { res.writeHead(404); return res.end(JSON.stringify({ error: "Not found" })); }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    summarizeItem(item);
    return;
  }

  // API: Generate Briefing
  if (req.method === "POST" && req.url === "/api/briefing") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, message: "Briefing generation started" }));
    generateBriefing();
    return;
  }

  // API: Briefings Archive
  if (req.method === "GET" && req.url === "/api/briefings") {
    const briefings = dbAll("SELECT * FROM briefings ORDER BY id DESC LIMIT 20");
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(briefings));
  }

  // API: CRM — save customer data
  if (req.method === "POST" && req.url === "/api/crm/save") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        fs.writeFileSync(path.join(__dirname, "data", "crm.json"), body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: CRM — load customer data
  if (req.method === "GET" && req.url === "/api/crm/load") {
    try {
      const fp = path.join(__dirname, "data", "crm.json");
      if (fs.existsSync(fp)) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(fs.readFileSync(fp, "utf-8"));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("[]");
    } catch(e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Default: serve index
  res.writeHead(200, { "Content-Type": "text/html;charset=utf-8" });
  res.end(fs.readFileSync(path.join(__dirname, "index.html")));
});

// ═══ Boot ═══
initSqlJs({ locateFile: (file) => path.join(__dirname, "node_modules", "sql.js", "dist", file) }).then(async (SQL) => {
  await initDB(SQL);
  // Load latest briefing
  const lastBriefing = dbGet("SELECT * FROM briefings ORDER BY id DESC LIMIT 1");
  if (lastBriefing) {
    latestBriefing = { time: lastBriefing.time, body: lastBriefing.body, num: lastBriefing.id };
  }
  // Start server
  server.listen(PORT, () => {
    console.log(`SENTINEL :${PORT}`);
    // Start first fetch
    periodicFetch();
    setInterval(periodicFetch, 10 * 60 * 1000);
    // Generate first briefing after 30s, then every 6 hours
    setTimeout(() => generateBriefing(), 30000);
    setInterval(() => generateBriefing(), 6 * 60 * 60 * 1000);
  });
});
