/* 配置后台前端逻辑：加载 js/config.js 的内容，编辑后保存回去 */
"use strict";

const state = { THEMES: {}, CONFIG: {} };
let dirty = false;
let currentSection = "basics";
let imagesCache = null; // GET /api/images 的缓存

/* ---------------- 工具函数 ---------------- */

function esc(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function toast(msg, isError) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.className = "toast show" + (isError ? " error" : "");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { el.className = "toast"; }, 2600);
}

function markDirty() {
    dirty = true;
}

// 事件处理器注册表：配合 content 上的事件委托使用
let handlers = {};
let handlerSeq = 0;
function reg(fn) {
    const id = "h" + (++handlerSeq);
    handlers[id] = fn;
    return id;
}

const contentEl = document.getElementById("content");
contentEl.addEventListener("input", (e) => {
    const fn = handlers[e.target.dataset && e.target.dataset.h];
    if (fn) { fn(e.target.value, e.target); markDirty(); }
});
contentEl.addEventListener("change", (e) => {
    // select / color / date 等控件在部分浏览器只触发 change
    if (e.target.dataset && e.target.dataset.h && e.target.tagName === "SELECT") {
        const fn = handlers[e.target.dataset.h];
        if (fn) { fn(e.target.value, e.target); markDirty(); }
    }
});
contentEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-hc]");
    if (btn && handlers[btn.dataset.hc]) handlers[btn.dataset.hc](btn, e);
});

/* ---------------- 表单小组件（返回 HTML 字符串） ---------------- */

function fieldText(label, value, onInput, opts) {
    opts = opts || {};
    return '<label class="field"><span>' + esc(label) + '</span>' +
        '<input type="' + (opts.type || "text") + '" value="' + esc(value) + '"' +
        (opts.step ? ' step="' + opts.step + '"' : "") +
        ' data-h="' + reg(onInput) + '"></label>';
}

function fieldArea(label, value, onInput, rows) {
    return '<label class="field"><span>' + esc(label) + '</span>' +
        '<textarea rows="' + (rows || 3) + '" data-h="' + reg(onInput) + '">' + esc(value) + '</textarea></label>';
}

function fieldColor(label, value, onInput) {
    const hid = reg(onInput);
    return '<div class="field"><span>' + esc(label) + '</span>' +
        '<div class="color-row">' +
        '<input type="color" value="' + esc(value || "#000000") + '" data-h="' + hid + '">' +
        '<input type="text" value="' + esc(value) + '" data-h="' + hid + '">' +
        '</div></div>';
}

function fieldSelect(label, value, options, onInput) {
    const opts = options.map((o) =>
        '<option value="' + esc(o.value) + '"' + (o.value === value ? " selected" : "") + '>' + esc(o.label) + '</option>'
    ).join("");
    return '<label class="field"><span>' + esc(label) + '</span>' +
        '<select data-h="' + reg(onInput) + '">' + opts + '</select></label>';
}

// 单个图片字段：路径输入框 + 选择按钮 + 预览
function fieldImage(label, value, onChange) {
    const inputHid = reg((v) => onChange(v));
    const pickHid = reg(() => {
        openImagePicker((picked) => {
            onChange(picked.src);
            renderSection(currentSection);
        });
    });
    return '<div class="field img-field"><span>' + esc(label) + '</span>' +
        '<div class="img-row">' +
        '<input type="text" value="' + esc(value) + '" data-h="' + inputHid + '">' +
        '<button type="button" class="btn small" data-hc="' + pickHid + '">选择图片</button>' +
        '</div>' +
        (value ? '<img class="img-preview" src="' + esc(value) + '">' : "") +
        '</div>';
}

// 多张图片字段（story.img 最多 max 张；footprints.photos 不限）
function fieldImageList(label, arr, max, onChange) {
    const items = arr.map((src, i) => {
        const delHid = reg(() => {
            arr.splice(i, 1);
            onChange(arr);
            markDirty();
            renderSection(currentSection);
        });
        return '<div class="img-item">' +
            '<img src="' + esc(src) + '">' +
            '<div class="img-path" title="' + esc(src) + '">' + esc(src) + '</div>' +
            '<div class="img-ops"><button type="button" class="btn small danger" data-hc="' + delHid + '">删除</button></div>' +
            '</div>';
    }).join("");
    const canAdd = !max || arr.length < max;
    const addHid = reg(() => {
        openImagePicker((picked) => {
            arr.push(picked.src);
            onChange(arr);
            markDirty();
            renderSection(currentSection);
        });
    });
    return '<div class="field"><span>' + esc(label) + (max ? '（最多 ' + max + ' 张）' : "") + '</span>' +
        '<div class="img-list">' + items +
        '<button type="button" class="img-add" data-hc="' + addHid + '"' + (canAdd ? "" : " disabled") + '>+ 添加图片</button>' +
        '</div></div>';
}

/* ---------------- 列表编辑器骨架 ---------------- */

// listCard(items, i, item) 返回每张卡片内部 HTML；makeNew() 返回新条目
function renderList(container, items, itemCard, makeNew, addLabel) {
    const cards = items.map((item, i) => {
        const upHid = reg(() => {
            if (i === 0) return;
            items.splice(i - 1, 0, items.splice(i, 1)[0]);
            markDirty();
            renderSection(currentSection);
        });
        const downHid = reg(() => {
            if (i === items.length - 1) return;
            items.splice(i + 1, 0, items.splice(i, 1)[0]);
            markDirty();
            renderSection(currentSection);
        });
        const delHid = reg(() => {
            if (!confirm("确定删除这一条吗？")) return;
            items.splice(i, 1);
            markDirty();
            renderSection(currentSection);
        });
        return '<div class="card"><div class="card-head">' +
            '<span class="card-title">第 ' + (i + 1) + ' 条</span>' +
            '<span class="card-ops">' +
            '<button type="button" class="btn small" data-hc="' + upHid + '">上移</button>' +
            '<button type="button" class="btn small" data-hc="' + downHid + '">下移</button>' +
            '<button type="button" class="btn small danger" data-hc="' + delHid + '">删除</button>' +
            '</span></div>' +
            itemCard(item, i) +
            '</div>';
    }).join("");
    const addHid = reg(() => {
        items.push(makeNew());
        markDirty();
        renderSection(currentSection);
    });
    return cards + '<button type="button" class="add-item" data-hc="' + addHid + '">+ ' + esc(addLabel || "新增一条") + '</button>';
}

/* ---------------- 10 个区块 ---------------- */

const SECTIONS = [
    { id: "basics", title: "基础信息", render: renderBasics },
    { id: "themes", title: "主题 THEMES", render: renderThemes },
    { id: "photos", title: "照片墙 photos", render: renderPhotos },
    { id: "story", title: "恋爱故事 story", render: renderStory },
    { id: "footprints", title: "足迹地图 footprints", render: renderFootprints },
    { id: "loveLetters", title: "情书 loveLetters", render: renderLoveLetters },
    { id: "heartbeatMoments", title: "心动瞬间", render: renderHeartbeat },
    { id: "meaningToMe", title: "她对我的意义", render: renderMeaning },
    { id: "milestones", title: "里程碑 milestones", render: renderMilestones },
    { id: "birthday", title: "生日页 birthday", render: renderBirthday }
];

function renderBasics() {
    const c = state.CONFIG;
    c.music = c.music && typeof c.music === "object" ? c.music : { main: "", birthday: "" };
    c.github = c.github || {};
    return '<h2>基础信息</h2>' +
        '<div class="desc">在一起的开始日期、背景音乐路径和 GitHub 仓库信息。</div>' +
        '<div class="card">' +
        fieldText("在一起的开始日期（startDate，格式 YYYY-MM-DD）", c.startDate, (v) => { c.startDate = v; }, { type: "date" }) +
        '<div class="field-row">' +
        fieldText("主背景音乐路径（music.main）", c.music.main, (v) => { c.music.main = v; }) +
        fieldText("生日页音乐路径（music.birthday）", c.music.birthday, (v) => { c.music.birthday = v; }) +
        '</div></div>' +
        '<div class="card">' +
        fieldText("GitHub 仓库地址（repoUrl，留空则不显示按钮）", c.github.repoUrl, (v) => { c.github.repoUrl = v; }) +
        '<div class="field-row">' +
        fieldText("commit 署名 · 你（authorName）", c.github.authorName, (v) => { c.github.authorName = v; }) +
        fieldText("commit 署名 · 她（coAuthorName）", c.github.coAuthorName, (v) => { c.github.coAuthorName = v; }) +
        '</div>' +
        fieldText("commit 主题（commitMessage）", c.github.commitMessage, (v) => { c.github.commitMessage = v; }) +
        '</div>';
}

function renderThemes() {
    const keys = Object.keys(state.THEMES);
    const cards = keys.map((key, i) => {
        const t = state.THEMES[key];
        const keyHid = reg((v) => {
            // key 改名：重建对象保持顺序；失焦/渲染时才真正生效
            const newKey = v.trim();
            if (!newKey || newKey === key) return;
            if (state.THEMES[newKey]) {
                toast("主题 key「" + newKey + "」已存在", true);
                renderSection("themes");
                return;
            }
            const rebuilt = {};
            for (const k of Object.keys(state.THEMES)) {
                rebuilt[k === key ? newKey : k] = k === key ? Object.assign({}, t, { key: newKey }) : state.THEMES[k];
            }
            state.THEMES = rebuilt;
            renderSection("themes");
        });
        const delHid = reg(() => {
            const used = state.CONFIG.story && state.CONFIG.story.some((s) => s && s.theme === key);
            if (used && !confirm("有恋爱故事正在使用主题「" + key + "」，删除后保存会校验失败。仍要删除吗？")) return;
            delete state.THEMES[key];
            markDirty();
            renderSection("themes");
        });
        return '<div class="card"><div class="card-head">' +
            '<span class="card-title">' + esc(t.emoji || "") + ' ' + esc(key) + '</span>' +
            '<span class="card-ops"><button type="button" class="btn small danger" data-hc="' + delHid + '">删除</button></span></div>' +
            '<div class="field-row">' +
            fieldText("key（英文标识）", key, keyHid) +
            fieldText("名称（label）", t.label, (v) => { t.label = v; }) +
            fieldText("emoji", t.emoji, (v) => { t.emoji = v; }) +
            '</div>' +
            '<div class="field-row">' +
            fieldColor("主题色（color）", t.color, (v) => { t.color = v; }) +
            fieldText("光晕色（glow，可选）", t.glow, (v) => { t.glow = v; }) +
            '</div>' +
            fieldText("描述（desc）", t.desc, (v) => { t.desc = v; }) +
            '</div>';
    }).join("");
    const addHid = reg(() => {
        let n = 1;
        while (state.THEMES["theme" + n]) n++;
        const key = "theme" + n;
        state.THEMES[key] = { key: key, label: "新主题", emoji: "💗", color: "#4a6cf7", glow: "rgba(74, 108, 247, 0.28)", desc: "" };
        markDirty();
        renderSection("themes");
    });
    return '<h2>主题 THEMES</h2>' +
        '<div class="desc">恋爱故事时间轴使用的主题色。key 是英文标识，story 里通过 key 引用主题。</div>' +
        cards + '<button type="button" class="add-item" data-hc="' + addHid + '">+ 新增主题</button>';
}

function thumbOf(src) {
    const name = String(src || "").split("/").pop();
    return name ? "images/thumbs/" + name : "";
}

function renderPhotos() {
    const items = state.CONFIG.photos;
    return '<h2>照片墙 photos</h2>' +
        '<div class="desc">首屏照片墙。从图库选择或上传时会自动补上 images/thumbs/ 同名缩略图路径。</div>' +
        renderList(null, items, (p) => {
            return fieldImage("原图路径（src）", p.src, (v) => {
                p.src = v;
                if (v.indexOf("images/") === 0 && v.indexOf("images/thumbs/") !== 0) p.thumb = thumbOf(v);
            }) +
            fieldText("缩略图路径（thumb）", p.thumb, (v) => { p.thumb = v; });
        }, () => ({ src: "", thumb: "" }), "新增照片");
}

function storyImgArray(item) {
    if (Array.isArray(item.img)) return item.img;
    return item.img ? [item.img] : [];
}

function renderStory() {
    const items = state.CONFIG.story;
    const themeOptions = Object.keys(state.THEMES).map((k) => ({
        value: k,
        label: (state.THEMES[k].emoji || "") + " " + (state.THEMES[k].label || k) + "（" + k + "）"
    }));
    return '<h2>恋爱故事 story</h2>' +
        '<div class="desc">时间轴正序叙事。图片 1 张时存为字符串，多张存为数组（最多 4 张）。</div>' +
        renderList(null, items, (item) => {
            const imgs = storyImgArray(item);
            const commitImg = (arr) => {
                item.img = arr.length === 0 ? "" : (arr.length === 1 ? arr[0] : arr.slice());
            };
            return '<div class="field-row">' +
                fieldText("日期", item.date, (v) => { item.date = v; }, { type: "date" }) +
                fieldSelect("主题", item.theme || "", [{ value: "", label: "（未选择）" }].concat(themeOptions), (v) => { item.theme = v; }) +
                '</div>' +
                fieldText("标题", item.title, (v) => { item.title = v; }) +
                fieldArea("描述（支持 &lt;/br&gt; 换行）", item.desc, (v) => { item.desc = v; }, 4) +
                fieldImageList("图片", imgs, 4, commitImg);
        }, () => ({ date: "", title: "", desc: "", img: "", theme: themeOptions.length ? themeOptions[0].value : "" }), "新增故事");
}

function renderFootprints() {
    const items = state.CONFIG.footprints;
    return '<h2>足迹地图 footprints</h2>' +
        '<div class="desc">地图上的回忆地标，按时间顺序排列。经纬度可在地图网站上右键复制。</div>' +
        renderList(null, items, (item) => {
            if (!Array.isArray(item.photos)) item.photos = item.photos ? [item.photos] : [];
            return fieldText("城市 · 地点（city）", item.city, (v) => { item.city = v; }) +
                '<div class="field-row">' +
                fieldText("简称（shortName）", item.shortName, (v) => { item.shortName = v; }) +
                fieldText("日期（date，如 2026-03）", item.date, (v) => { item.date = v; }) +
                fieldText("图标 emoji（icon）", item.icon, (v) => { item.icon = v; }) +
                '</div>' +
                '<div class="field-row">' +
                fieldText("纬度（lat）", item.lat, (v) => { item.lat = parseFloat(v) || 0; }, { type: "number", step: "0.01" }) +
                fieldText("经度（lng）", item.lng, (v) => { item.lng = parseFloat(v) || 0; }, { type: "number", step: "0.01" }) +
                '</div>' +
                fieldImageList("照片", item.photos, 0, (arr) => { item.photos = arr; });
        }, () => ({ city: "", shortName: "", date: "", lat: 0, lng: 0, icon: "📍", photos: [] }), "新增足迹");
}

function renderLoveLetters() {
    const items = state.CONFIG.loveLetters;
    return '<h2>情书 loveLetters</h2>' +
        '<div class="desc">双面情书卡片，可写多封，按顺序展示。</div>' +
        renderList(null, items, (item) => {
            return fieldText("标题", item.title, (v) => { item.title = v; }) +
                '<div class="field-row">' +
                fieldText("日期", item.date, (v) => { item.date = v; }, { type: "date" }) +
                fieldText("写信人（from）", item.from, (v) => { item.from = v; }) +
                fieldText("收信人（to）", item.to, (v) => { item.to = v; }) +
                fieldText("火漆 emoji（seal）", item.seal, (v) => { item.seal = v; }) +
                '</div>' +
                fieldArea("正文（换行直接回车即可）", item.content, (v) => { item.content = v; }, 5) +
                fieldText("署名（signature）", item.signature, (v) => { item.signature = v; });
        }, () => ({ title: "", date: "", from: "", to: "", content: "", signature: "", seal: "💌" }), "新增情书");
}

function renderHeartbeat() {
    const items = state.CONFIG.heartbeatMoments;
    return '<h2>心动瞬间 heartbeatMoments</h2>' +
        '<div class="desc">照片 + 文字卡片。</div>' +
        renderList(null, items, (item) => {
            return fieldImage("图片", item.img, (v) => { item.img = v; }) +
                fieldArea("文字", item.text, (v) => { item.text = v; }, 3);
        }, () => ({ img: "", text: "" }), "新增心动瞬间");
}

function renderMeaning() {
    const items = state.CONFIG.meaningToMe;
    return '<h2>她对我的意义 meaningToMe</h2>' +
        '<div class="desc">标题 + 一段内容。</div>' +
        renderList(null, items, (item) => {
            return fieldText("标题", item.title, (v) => { item.title = v; }) +
                fieldArea("内容", item.content, (v) => { item.content = v; }, 5);
        }, () => ({ title: "", content: "" }), "新增一条");
}

function renderMilestones() {
    const items = state.CONFIG.milestones;
    return '<h2>里程碑 milestones</h2>' +
        '<div class="desc">她已经为我做过的、让我感动的事。</div>' +
        renderList(null, items, (item) => {
            return '<div class="field-row">' +
                fieldText("图标 emoji", item.icon, (v) => { item.icon = v; }) +
                fieldText("标题", item.title, (v) => { item.title = v; }) +
                '</div>' +
                fieldArea("描述（desc）", item.desc, (v) => { item.desc = v; }, 2) +
                fieldArea("引言（quote）", item.quote, (v) => { item.quote = v; }, 5) +
                fieldImage("图片", item.img, (v) => { item.img = v; });
        }, () => ({ icon: "⭐", title: "", desc: "", quote: "", img: "" }), "新增里程碑");
}

function renderBirthday() {
    const b = state.CONFIG.birthday = state.CONFIG.birthday || {};
    return '<h2>生日页 birthday</h2>' +
        '<div class="desc">生日专属页的全部文案。</div>' +
        '<div class="card">' +
        fieldText("蛋糕上方小字（pretitle）", b.pretitle, (v) => { b.pretitle = v; }) +
        fieldText("大标题（title）", b.title, (v) => { b.title = v; }) +
        fieldText("蛋糕下方提示（subtitle）", b.subtitle, (v) => { b.subtitle = v; }) +
        fieldArea("蜡烛熄灭后的祝福语（message）", b.message, (v) => { b.message = v; }, 4) +
        fieldArea("手写信件内容（letter）", b.letter, (v) => { b.letter = v; }, 12) +
        fieldText("信件署名（letterSignature）", b.letterSignature, (v) => { b.letterSignature = v; }) +
        fieldText("吹蜡烛后蛋糕下方文案（afterBlowHint）", b.afterBlowHint, (v) => { b.afterBlowHint = v; }) +
        '</div>';
}

/* ---------------- 渲染框架 ---------------- */

function renderSection(id) {
    currentSection = id;
    const sec = SECTIONS.find((s) => s.id === id);
    handlers = {}; // 重渲染时清掉旧处理器，防止泄漏
    contentEl.innerHTML = '<div class="section active" id="section-' + id + '">' + sec.render() + '</div>';
    document.querySelectorAll(".sidebar .nav-item").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.section === id);
    });
}

function renderSidebar() {
    const sidebar = document.getElementById("sidebar");
    sidebar.innerHTML = SECTIONS.map((s) =>
        '<button type="button" class="nav-item" data-section="' + s.id + '">' + esc(s.title) + '</button>'
    ).join("");
    sidebar.addEventListener("click", (e) => {
        const btn = e.target.closest(".nav-item");
        if (btn) renderSection(btn.dataset.section);
    });
}

/* ---------------- 图片选择器 ---------------- */

const pickerMask = document.getElementById("pickerMask");
const pickerGrid = document.getElementById("pickerGrid");
const uploadInput = document.getElementById("uploadInput");
let pickerCallback = null;

async function openImagePicker(cb) {
    pickerCallback = cb;
    pickerMask.classList.add("show");
    pickerGrid.innerHTML = '<div class="picker-empty">加载中…</div>';
    try {
        if (!imagesCache) {
            const res = await fetch("/api/images");
            imagesCache = await res.json();
        }
        renderPickerGrid();
    } catch (err) {
        pickerGrid.innerHTML = '<div class="picker-empty">图片列表加载失败：' + esc(err.message) + '</div>';
    }
}

function renderPickerGrid() {
    if (!imagesCache || !imagesCache.length) {
        pickerGrid.innerHTML = '<div class="picker-empty">images/ 目录还没有图片，点击右上角"上传新图片"。</div>';
        return;
    }
    // 网格统一用 400px 缩略图，避免一次加载上百张原图造成卡顿；缩略图缺失时回退原图
    pickerGrid.innerHTML = imagesCache.map((item) => {
        const original = "images/" + encodeURIComponent(item.name);
        const src = item.thumb ? "images/thumbs/" + encodeURIComponent(item.thumb) : original;
        const fallback = item.thumb ? ' onerror="this.onerror=null;this.src=\'' + original + '\'"' : "";
        return '<div class="picker-item" data-name="' + esc(item.name) + '">' +
            '<img loading="lazy" decoding="async" src="' + src + '"' + fallback + '>' +
            '<div class="picker-name">' + esc(item.name) + '</div>' +
            '</div>';
    }).join("");
}

pickerGrid.addEventListener("click", (e) => {
    const item = e.target.closest(".picker-item");
    if (!item || !pickerCallback) return;
    const src = "images/" + item.dataset.name;
    const cb = pickerCallback;
    closePicker();
    cb({ src: src, thumb: thumbOf(src) });
});

function closePicker() {
    pickerMask.classList.remove("show");
    pickerCallback = null;
}

document.getElementById("pickerCloseBtn").addEventListener("click", closePicker);
pickerMask.addEventListener("click", (e) => { if (e.target === pickerMask) closePicker(); });

document.getElementById("pickerUploadBtn").addEventListener("click", () => uploadInput.click());

// 用 Canvas 生成最长边 400px 的 JPEG 缩略图
function makeThumbDataUrl(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const max = 400;
            const scale = Math.min(1, max / Math.max(img.width, img.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("图片读取失败")); };
        img.src = url;
    });
}

function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("文件读取失败"));
        reader.readAsDataURL(file);
    });
}

uploadInput.addEventListener("change", async () => {
    const file = uploadInput.files[0];
    uploadInput.value = "";
    if (!file || !pickerCallback) return;
    try {
        toast("正在上传…");
        const [original, thumb] = await Promise.all([readAsDataUrl(file), makeThumbDataUrl(file)]);
        const res = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: file.name, original: original, thumb: thumb })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
        imagesCache = null; // 让下次打开选择器时刷新列表
        const cb = pickerCallback;
        closePicker();
        cb({ src: data.src, thumb: data.thumb });
        toast("上传成功");
    } catch (err) {
        toast("上传失败：" + err.message, true);
    }
});

/* ---------------- 加载与保存 ---------------- */

async function loadConfig() {
    try {
        const res = await fetch("/api/config");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
        state.THEMES = data.THEMES || {};
        state.CONFIG = data.CONFIG || {};
        dirty = false;
        renderSection("basics");
    } catch (err) {
        contentEl.innerHTML = '<div class="loading">配置加载失败：' + esc(err.message) +
            '<br><br>请确认是通过 <b>npm start</b> 启动后访问 http://127.0.0.1:3000/admin.html</div>';
    }
}

async function saveConfig() {
    const btn = document.getElementById("saveBtn");
    btn.disabled = true;
    try {
        const res = await fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ THEMES: state.THEMES, CONFIG: state.CONFIG })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
        dirty = false;
        toast("已写入 js/config.js（旧版本已备份为 config.js.bak）");
    } catch (err) {
        toast("保存失败：" + err.message, true);
    } finally {
        btn.disabled = false;
    }
}

document.getElementById("saveBtn").addEventListener("click", saveConfig);

window.addEventListener("beforeunload", (e) => {
    if (dirty) {
        e.preventDefault();
        e.returnValue = "有未保存的修改，确定离开吗？";
    }
});

renderSidebar();
loadConfig();
