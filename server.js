const http = require("http");
const fs = require("fs");
const path = require("path");
const https = require("https");

const PORT = process.env.PORT || 3000;
const SETTINGS_FILE = path.join(__dirname, "settings.json");
const ADMIN_PASSWORD = "Admin1234";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    }
  } catch (e) {}
  return {
    bot_token: process.env.BOT_TOKEN || "",
    chat_id: process.env.CHAT_ID || "",
    updated_at: null,
  };
}

function saveSettings(s) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
}

function sendTelegram(botToken, chatId, text) {
  return new Promise((resolve) => {
    if (!botToken || !chatId) {
      console.log("[TG] missing token/chatId");
      return resolve(false);
    }
    console.log("[TG] sending to chat", chatId);
    const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" });
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${botToken}/sendMessage`,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          console.log("[TG] response:", res.statusCode);
          resolve(res.statusCode === 200);
        });
      }
    );
    req.on("error", (e) => {
      console.log("[TG] error:", e.message);
      resolve(false);
    });
    req.write(payload);
    req.end();
  });
}

function deserializeSeroval(node) {
  if (!node || typeof node !== "object") return node;
  switch (node.t) {
    case 0: return node.s;
    case 1: return node.s;
    case 2: return [null, undefined, true, false, -0, Infinity, -Infinity, NaN][node.s];
    case 9: return (node.a || []).map(deserializeSeroval);
    case 10: {
      const obj = {};
      if (node.p) {
        for (let i = 0; i < node.p.k.length; i++)
          obj[node.p.k[i]] = deserializeSeroval(node.p.v[i]);
      }
      return obj;
    }
    default: return node;
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        let tree = parsed;
        if (parsed && typeof parsed.t === "object" && parsed.t !== null && "f" in parsed) {
          tree = parsed.t;
        }
        if (tree && typeof tree.t === "number" && tree.p) {
          resolve(deserializeSeroval(tree));
        } else {
          resolve(parsed);
        }
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res, data) {
  const json = JSON.stringify({ result: data });
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(json);
}

function sendJsonRaw(res, data) {
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>لوحة التحكم</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#f0f2f5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);width:100%;max-width:440px;padding:32px}
h1{text-align:center;color:#1a5c38;font-size:22px;margin-bottom:24px}
label{display:block;font-weight:700;margin-bottom:6px;color:#333;font-size:14px}
input{width:100%;padding:10px 14px;border:2px solid #e0e0e0;border-radius:10px;font-size:15px;margin-bottom:16px;transition:border-color .2s}
input:focus{outline:none;border-color:#1a5c38}
button{width:100%;padding:12px;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;transition:all .2s}
.btn-primary{background:#1a5c38;color:#fff}
.btn-primary:hover{background:#15472c}
.btn-secondary{background:#e8f5e9;color:#1a5c38;margin-top:8px}
.btn-danger{background:#fee;color:#c00;margin-top:8px}
.toast{position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:10px;color:#fff;font-weight:600;font-size:14px;z-index:9999;opacity:0;transition:opacity .3s}
.toast.show{opacity:1}
.toast.ok{background:#22c55e}
.toast.err{background:#ef4444}
#login-box,#panel-box{display:none}
.active{display:block!important}
</style>
</head>
<body>
<div class="card">
<h1>🔐 لوحة التحكم</h1>
<div id="login-box" class="active">
<label>كلمة المرور</label>
<input type="password" id="pwd" placeholder="أدخل كلمة المرور">
<button class="btn-primary" onclick="doLogin()">دخول</button>
</div>
<div id="panel-box">
<label>Bot Token</label>
<input type="text" id="bot_token" placeholder="123456:ABC..." dir="ltr">
<label>Chat ID</label>
<input type="text" id="chat_id" placeholder="123456789" dir="ltr">
<button class="btn-primary" onclick="doSave()">💾 حفظ الإعدادات</button>
<button class="btn-secondary" onclick="doTest()">📤 إرسال رسالة اختبار</button>
</div>
</div>
<div class="toast" id="toast"></div>
<script>
var pw='';
function toast(msg,ok){var t=document.getElementById('toast');t.textContent=msg;t.className='toast show '+(ok?'ok':'err');setTimeout(()=>t.className='toast',3000)}
async function api(url,body){var r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return r.json()}
async function doLogin(){
  pw=document.getElementById('pwd').value;
  if(!pw){toast('أدخل كلمة المرور',false);return}
  var r=await api('/api/admin/login',{password:pw});
  if(r.ok){
    document.getElementById('login-box').classList.remove('active');
    document.getElementById('panel-box').classList.add('active');
    document.getElementById('bot_token').value=r.bot_token||'';
    document.getElementById('chat_id').value=r.chat_id||'';
    toast('تم تسجيل الدخول',true);
  }else{toast(r.error||'خطأ',false)}
}
async function doSave(){
  var r=await api('/api/admin/save',{password:pw,bot_token:document.getElementById('bot_token').value,chat_id:document.getElementById('chat_id').value});
  toast(r.ok?'تم الحفظ بنجاح':r.error||'خطأ',r.ok);
}
async function doTest(){
  var r=await api('/api/admin/test',{password:pw});
  toast(r.ok?'تم إرسال الرسالة بنجاح':r.error||'فشل الإرسال',r.ok);
}
document.getElementById('pwd').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin()});
</script>
</body>
</html>`;

http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);

  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-tsr-serverFn",
    });
    res.end();
    return;
  }

  // Admin API endpoints (plain JSON, no TanStack wrapper)
  if (urlPath === "/api/admin/login" && req.method === "POST") {
    const body = await readBody(req);
    if (body.password !== ADMIN_PASSWORD) {
      return sendJsonRaw(res, { ok: false, error: "كلمة المرور غير صحيحة" });
    }
    const s = loadSettings();
    return sendJsonRaw(res, { ok: true, bot_token: s.bot_token, chat_id: s.chat_id });
  }

  if (urlPath === "/api/admin/save" && req.method === "POST") {
    const body = await readBody(req);
    if (body.password !== ADMIN_PASSWORD) {
      return sendJsonRaw(res, { ok: false, error: "كلمة المرور غير صحيحة" });
    }
    saveSettings({ bot_token: body.bot_token || "", chat_id: body.chat_id || "", updated_at: new Date().toISOString() });
    return sendJsonRaw(res, { ok: true });
  }

  if (urlPath === "/api/admin/test" && req.method === "POST") {
    const body = await readBody(req);
    if (body.password !== ADMIN_PASSWORD) {
      return sendJsonRaw(res, { ok: false, error: "كلمة المرور غير صحيحة" });
    }
    const s = loadSettings();
    const sent = await sendTelegram(s.bot_token, s.chat_id, "✅ رسالة اختبار — البوت يعمل بنجاح!");
    return sendJsonRaw(res, sent ? { ok: true } : { ok: false, error: "فشل إرسال الرسالة — تأكد من التوكن والـ Chat ID" });
  }

  // Admin page
  if (urlPath === "/admin") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(ADMIN_HTML);
    return;
  }

  // TanStack server functions
  if (urlPath.startsWith("/_serverFn/") && req.method === "POST") {
    const hash = urlPath.replace("/_serverFn/", "");
    console.log("[REQ] serverFn hash:", hash.slice(0, 12) + "...");
    try {
      const body = await readBody(req);
      const input = body.data || body;
      console.log("[REQ] input keys:", Object.keys(input));

      // All pages send {text: "pre-formatted message"} to the single server function
      if (input.text) {
        const s = loadSettings();
        await sendTelegram(s.bot_token, s.chat_id, input.text);
      }

      sendJson(res, { ok: true });
    } catch (e) {
      console.error("[REQ] error:", e);
      sendJson(res, { ok: true });
    }
    return;
  }

  // Static files
  let filePath = "." + urlPath;
  if (filePath === "./") filePath = "./index.html";

  const ext = path.extname(filePath).toLowerCase();

  if (ext && fs.existsSync(filePath)) {
    const contentType = MIME[ext] || "application/octet-stream";
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(500); res.end("Error"); return; }
      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    });
  } else {
    // SPA fallback
    fs.readFile("./index.html", (err, data) => {
      if (err) { res.writeHead(500); res.end("Error"); return; }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
  }
}).listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
