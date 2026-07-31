/**
 * 本地配置后台服务（零依赖，只用 Node 内置模块）
 * 仅绑定 127.0.0.1，供本机的 admin.html 使用。
 * 用法：npm start 然后打开 http://127.0.0.1:3000/admin.html
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "js", "config.js");
const CONFIG_BAK_PATH = CONFIG_PATH + ".bak";
const IMAGES_DIR = path.join(ROOT, "images");
const THUMBS_DIR = path.join(IMAGES_DIR, "thumbs");

const HOST = "127.0.0.1";
const PORT = 3000;
const MAX_BODY = 30 * 1024 * 1024; // 30MB

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg",
    ".ico": "image/x-icon"
};

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"]);

function sendJson(res, code, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(body);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY) {
                reject(new Error("请求体超过 30MB 限制"));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}

// 读取 js/config.js 源码，沙箱执行取出 THEMES 和 CONFIG 两个常量
function loadConfig() {
    const src = fs.readFileSync(CONFIG_PATH, "utf8");
    const fn = new Function(src + "\n;return { THEMES: THEMES, CONFIG: CONFIG };");
    return fn();
}

function validate(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        return "请求体必须是 { THEMES, CONFIG } 对象";
    }
    const { THEMES, CONFIG } = data;
    if (!THEMES || typeof THEMES !== "object" || Array.isArray(THEMES)) {
        return "THEMES 必须是对象";
    }
    if (!CONFIG || typeof CONFIG !== "object" || Array.isArray(CONFIG)) {
        return "CONFIG 必须是对象";
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(CONFIG.startDate || "")) {
        return "CONFIG.startDate 必须是 YYYY-MM-DD 格式";
    }
    const arrayFields = ["photos", "story", "footprints", "loveLetters", "heartbeatMoments", "meaningToMe", "milestones"];
    for (const field of arrayFields) {
        if (!Array.isArray(CONFIG[field])) {
            return "CONFIG." + field + " 必须是数组";
        }
    }
    for (let i = 0; i < CONFIG.story.length; i++) {
        const theme = CONFIG.story[i] && CONFIG.story[i].theme;
        if (theme && !Object.prototype.hasOwnProperty.call(THEMES, theme)) {
            return "story[" + i + '] 引用的主题 "' + theme + '" 在 THEMES 中不存在';
        }
    }
    return null;
}

// 重新生成 js/config.js：文件头注释 + 格式化 JSON
function renderConfigJs(data) {
    const header = [
        "/**",
        " * 站点配置文件",
        " * 本文件由配置后台（admin.html）生成与维护，建议直接在后台编辑保存。",
        " * 注意：后台保存时会重新生成本文件，数据完整保留，但手写的行内注释会丢失。",
        " * 每次保存前会自动把旧版本备份为 js/config.js.bak。",
        " */",
        "",
        ""
    ].join("\n");
    return header +
        "const THEMES = " + JSON.stringify(data.THEMES, null, 2) + ";\n\n" +
        "const CONFIG = " + JSON.stringify(data.CONFIG, null, 2) + ";\n";
}

function saveConfig(data) {
    fs.copyFileSync(CONFIG_PATH, CONFIG_BAK_PATH);
    fs.writeFileSync(CONFIG_PATH, renderConfigJs(data), "utf8");
}

function listImages() {
    if (!fs.existsSync(IMAGES_DIR)) return [];
    const thumbs = new Set(
        fs.existsSync(THUMBS_DIR)
            ? fs.readdirSync(THUMBS_DIR, { withFileTypes: true })
                .filter((entry) => entry.isFile())
                .map((entry) => entry.name)
            : []
    );
    return fs.readdirSync(IMAGES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile() && IMAGE_EXTS.has(path.extname(entry.name).toLowerCase()))
        .map((entry) => entry.name)
        .sort()
        .map((name) => {
            // 缩略图与原图同名；原图非 jpg 时缩略图为 .jpg 后缀（见 handleUpload）
            const ext = path.extname(name);
            const alt = name.slice(0, name.length - ext.length) + ".jpg";
            const thumb = thumbs.has(name) ? name : (thumbs.has(alt) ? alt : null);
            return { name: name, thumb: thumb };
        });
}

// 去掉路径穿越，只保留安全字符；重名时加时间戳后缀
function sanitizeFilename(name) {
    let base = path.basename(String(name || ""));
    base = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "");
    if (!base) base = "upload.jpg";
    if (!IMAGE_EXTS.has(path.extname(base).toLowerCase())) {
        base = base.replace(/\.+$/, "") + ".jpg";
    }
    return base;
}

function uniqueName(dir, base) {
    if (!fs.existsSync(path.join(dir, base))) return base;
    const ext = path.extname(base);
    const stem = base.slice(0, base.length - ext.length);
    const stamped = stem + "_" + Date.now() + ext;
    if (!fs.existsSync(path.join(dir, stamped))) return stamped;
    let i = 1;
    while (fs.existsSync(path.join(dir, stem + "_" + Date.now() + "_" + i + ext))) i++;
    return stem + "_" + Date.now() + "_" + i + ext;
}

// 支持 base64 dataURL 或纯 base64，返回 { buffer, mime }
function decodeBase64(input) {
    const str = String(input || "");
    const match = str.match(/^data:([a-zA-Z0-9/+.-]+);base64,(.*)$/s);
    if (match) {
        return { buffer: Buffer.from(match[2], "base64"), mime: match[1].toLowerCase() };
    }
    return { buffer: Buffer.from(str, "base64"), mime: "" };
}

function handleUpload(res, body) {
    let payload;
    try {
        payload = JSON.parse(body.toString("utf8"));
    } catch (e) {
        sendJson(res, 400, { error: "请求体必须是 JSON" });
        return;
    }
    const { filename, original, thumb } = payload || {};
    if (!original || !thumb) {
        sendJson(res, 400, { error: "缺少 original 或 thumb 字段" });
        return;
    }
    const base = uniqueName(IMAGES_DIR, sanitizeFilename(filename));
    const originalData = decodeBase64(original);
    const thumbData = decodeBase64(thumb);
    if (!originalData.buffer.length || !thumbData.buffer.length) {
        sendJson(res, 400, { error: "base64 数据为空" });
        return;
    }
    // 缩略图固定按 JPEG 保存；若原图不是 .jpg/.jpeg，缩略图改用 .jpg 后缀保证内容类型一致
    let thumbName = base;
    const ext = path.extname(base).toLowerCase();
    if (ext !== ".jpg" && ext !== ".jpeg") {
        thumbName = base.slice(0, base.length - ext.length) + ".jpg";
    }
    thumbName = uniqueName(THUMBS_DIR, thumbName);
    if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });
    fs.writeFileSync(path.join(IMAGES_DIR, base), originalData.buffer);
    fs.writeFileSync(path.join(THUMBS_DIR, thumbName), thumbData.buffer);
    sendJson(res, 200, { src: "images/" + base, thumb: "images/thumbs/" + thumbName });
}

function serveStatic(req, res, pathname) {
    let rel;
    try {
        rel = decodeURIComponent(pathname);
    } catch (e) {
        sendJson(res, 400, { error: "URL 编码错误" });
        return;
    }
    if (rel === "/" || rel === "") rel = "/index.html";
    const filePath = path.normalize(path.join(ROOT, rel));
    if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
        sendJson(res, 403, { error: "禁止访问" });
        return;
    }
    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            sendJson(res, 404, { error: "文件不存在" });
            return;
        }
        const type = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
        fs.createReadStream(filePath).pipe(res);
    });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://" + HOST + ":" + PORT);
    const pathname = url.pathname;

    try {
        if (req.method === "GET" && pathname === "/api/config") {
            sendJson(res, 200, loadConfig());
            return;
        }
        if (req.method === "POST" && pathname === "/api/config") {
            const body = await readBody(req);
            let data;
            try {
                data = JSON.parse(body.toString("utf8"));
            } catch (e) {
                sendJson(res, 400, { error: "请求体必须是 JSON" });
                return;
            }
            const error = validate(data);
            if (error) {
                sendJson(res, 400, { error: error });
                return;
            }
            saveConfig(data);
            sendJson(res, 200, { ok: true, message: "已写入 js/config.js（旧版本备份为 js/config.js.bak）" });
            return;
        }
        if (req.method === "GET" && pathname === "/api/images") {
            sendJson(res, 200, listImages());
            return;
        }
        if (req.method === "POST" && pathname === "/api/upload") {
            const body = await readBody(req);
            handleUpload(res, body);
            return;
        }
        if (req.method === "GET" || req.method === "HEAD") {
            serveStatic(req, res, pathname);
            return;
        }
        sendJson(res, 405, { error: "方法不支持" });
    } catch (err) {
        sendJson(res, 500, { error: "服务器内部错误：" + err.message });
    }
});

server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
        console.error("端口 " + PORT + " 已被占用：配置后台可能已在运行（http://" + HOST + ":" + PORT + "/admin.html）");
        console.error("如需重启，请先关闭已有的服务进程。");
        process.exit(1);
    }
    throw err;
});

server.listen(PORT, HOST, () => {
    console.log("配置后台已启动（仅本机可访问）");
    console.log("后台地址: http://" + HOST + ":" + PORT + "/admin.html");
    console.log("按 Ctrl+C 停止服务");
});
