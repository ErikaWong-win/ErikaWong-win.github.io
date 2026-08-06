/**
 * 核心脚本：照片墙、倒计时、时光轴、梦幻粒子
 */
(function () {
    const photoWall = document.getElementById("photoWall");
    const startDateText = document.getElementById("startDateText");
    const timeline = document.getElementById("timeline");

    // 显示开始日期
    startDateText.textContent = CONFIG.startDate;

    // ==================== 全屏星空与流星雨（Canvas）====================
    function initStarfield() {
        const canvas = document.getElementById("starfield");
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        let width, height;
        let stars = [];
        let meteors = [];
        let bgCanvas = null;
        let lastMeteorTime = 0;
        let nextMeteorDelay = 0;
        let activeGlowColor = { r: 90, g: 80, b: 75, a: 0.22 };
        let targetGlowColor = { ...activeGlowColor };

        function parseRgba(rgba) {
            const m = rgba.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/);
            if (!m) return { r: 90, g: 80, b: 75, a: 0.22 };
            return {
                r: parseFloat(m[1]),
                g: parseFloat(m[2]),
                b: parseFloat(m[3]),
                a: m[4] !== undefined ? parseFloat(m[4]) : 1
            };
        }

        function lerpColor(current, target, factor) {
            return {
                r: current.r + (target.r - current.r) * factor,
                g: current.g + (target.g - current.g) * factor,
                b: current.b + (target.b - current.b) * factor,
                a: current.a + (target.a - current.a) * factor
            };
        }

        function resize() {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;
            createBackground();
            initStars();
        }

        // 预先绘制深邃夜空背景，避免每帧重绘渐变
        function createBackground() {
            bgCanvas = document.createElement("canvas");
            bgCanvas.width = width;
            bgCanvas.height = height;
            const bgCtx = bgCanvas.getContext("2d");

            const gradient = bgCtx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, "#0b1526");      // 深普鲁士蓝
            gradient.addColorStop(0.45, "#08101e");   // 藏蓝
            gradient.addColorStop(1, "#050a12");      // 几乎墨黑
            bgCtx.fillStyle = gradient;
            bgCtx.fillRect(0, 0, width, height);

            // 顶部微微的 atmospheric glow，让天空不那么平
            const glow = bgCtx.createRadialGradient(width * 0.5, 0, 0, width * 0.5, height * 0.2, height * 0.8);
            glow.addColorStop(0, "rgba(80, 70, 65, 0.22)");
            glow.addColorStop(0.5, "rgba(60, 55, 55, 0.08)");
            glow.addColorStop(1, "rgba(5, 10, 18, 0)");
            bgCtx.fillStyle = glow;
            bgCtx.fillRect(0, 0, width, height);
        }

        function initStars() {
            stars = [];
            // 大量细小星星：根据屏幕面积，约每 900 像素一颗
            const count = Math.floor((width * height) / 900);
            const colors = [
                { r: 255, g: 255, b: 255 }, // 纯白
                { r: 220, g: 235, b: 255 }, // 淡蓝白
                { r: 255, g: 250, b: 230 }  // 极浅金色
            ];

            for (let i = 0; i < count; i++) {
                const color = colors[Math.floor(Math.random() * colors.length)];
                stars.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    size: Math.random() * 1.3 + 0.25, // 针尖般到略大
                    baseAlpha: Math.random() * 0.35 + 0.25,
                    color: color,
                    twinkleSpeed: Math.random() * 0.015 + 0.003, // 极慢闪烁
                    twinkleOffset: Math.random() * Math.PI * 2,
                    twinkle: Math.random() > 0.75 // 只有少数星星会闪烁
                });
            }
        }

        function createMeteor() {
            // 主要角度 30 度，少数略有偏差
            const baseAngle = 30;
            const angleVariation = (Math.random() - 0.5) * 14; // ±7 度
            const angleDeg = baseAngle + angleVariation;
            const angleRad = (angleDeg * Math.PI) / 180;

            // 速度：有的快有的慢，2.5 ~ 8 px/frame
            const speed = Math.random() * 5.5 + 2.5;

            // 拖尾长度随速度变化：快的短促，慢的悠长
            const length = Math.random() * 80 + 80 + speed * 10; // 80 ~ 200px+

            // 起始位置：在画布上方或右方外侧，确保完整划过大半个屏幕
            let x, y;
            if (Math.random() > 0.3) {
                // 从顶部偏右进入
                x = Math.random() * width * 0.8 + width * 0.2;
                y = -length - Math.random() * 150;
            } else {
                // 从右侧进入
                x = width + length + Math.random() * 200;
                y = Math.random() * height * 0.5;
            }

            return {
                x,
                y,
                vx: -Math.cos(angleRad) * speed,
                vy: Math.sin(angleRad) * speed,
                length,
                width: Math.random() * 1.2 + 0.8,
                angleRad,
                opacity: Math.random() * 0.25 + 0.55,
                headSize: Math.random() * 0.9 + 1.0,
                life: 0
            };
        }

        function spawnMeteor(timestamp) {
            if (timestamp - lastMeteorTime < nextMeteorDelay) return;
            lastMeteorTime = timestamp;
            nextMeteorDelay = Math.random() * 3000 + 2000; // 2~5 秒
            meteors.push(createMeteor());
        }

        function drawStar(star, time) {
            let alpha = star.baseAlpha;
            if (star.twinkle) {
                alpha += Math.sin(time * star.twinkleSpeed + star.twinkleOffset) * 0.12;
                alpha = Math.max(0.08, Math.min(0.9, alpha));
            }
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${star.color.r}, ${star.color.g}, ${star.color.b}, ${alpha})`;
            ctx.fill();
        }

        function drawMeteor(meteor) {
            // 尾巴终点 = 头部沿反方向延伸
            const tailEndX = meteor.x + Math.cos(meteor.angleRad) * meteor.length;
            const tailEndY = meteor.y - Math.sin(meteor.angleRad) * meteor.length;

            const gradient = ctx.createLinearGradient(meteor.x, meteor.y, tailEndX, tailEndY);
            // 头部：暖白/柔和金色
            gradient.addColorStop(0, `rgba(255, 252, 235, ${meteor.opacity})`);
            gradient.addColorStop(0.15, `rgba(255, 245, 210, ${meteor.opacity * 0.9})`);
            gradient.addColorStop(0.45, `rgba(255, 235, 190, ${meteor.opacity * 0.45})`);
            gradient.addColorStop(1, "rgba(255, 230, 170, 0)");

            ctx.save();
            ctx.lineCap = "round";
            ctx.lineWidth = meteor.width;
            ctx.strokeStyle = gradient;
            ctx.shadowBlur = 6;
            ctx.shadowColor = "rgba(255, 235, 180, 0.25)";
            ctx.beginPath();
            ctx.moveTo(meteor.x, meteor.y);
            ctx.lineTo(tailEndX, tailEndY);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // 头部：柔和金色或暖白光点
            ctx.beginPath();
            ctx.arc(meteor.x, meteor.y, meteor.headSize, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 250, 230, ${meteor.opacity + 0.2})`;
            ctx.shadowBlur = 10;
            ctx.shadowColor = "rgba(255, 230, 160, 0.5)";
            ctx.fill();
            ctx.restore();
        }

        function updateMeteors() {
            for (let i = meteors.length - 1; i >= 0; i--) {
                const m = meteors[i];
                m.x += m.vx;
                m.y += m.vy;
                m.life++;

                // 完全划出屏幕后移除
                if (m.x < -m.length * 1.5 || m.y > height + m.length * 1.5) {
                    meteors.splice(i, 1);
                }
            }
        }

        let time = 0;
        function animate(timestamp) {
            time++;

            // 绘制背景
            if (bgCanvas) {
                ctx.drawImage(bgCanvas, 0, 0);
            }

            // 根据当前主题平滑过渡顶部光晕
            activeGlowColor = lerpColor(activeGlowColor, targetGlowColor, 0.025);
            const glowRgba = `rgba(${Math.round(activeGlowColor.r)}, ${Math.round(activeGlowColor.g)}, ${Math.round(activeGlowColor.b)}, ${activeGlowColor.a.toFixed(3)})`;
            const themeGlow = ctx.createRadialGradient(width * 0.5, height * 0.05, 0, width * 0.5, height * 0.18, height * 0.55);
            themeGlow.addColorStop(0, glowRgba);
            themeGlow.addColorStop(1, "rgba(5, 10, 18, 0)");
            ctx.fillStyle = themeGlow;
            ctx.fillRect(0, 0, width, height);

            // 画静态星星
            for (const star of stars) {
                drawStar(star, time);
            }

            // 生成并画流星
            spawnMeteor(timestamp);
            for (const meteor of meteors) {
                drawMeteor(meteor);
            }
            updateMeteors();

            requestAnimationFrame(animate);
        }

        // 暴露给主题切换器，用于动态改变星空顶部光晕
        window.setThemeGlow = function (color) {
            if (color) targetGlowColor = parseRgba(color);
        };

        window.addEventListener("resize", resize);
        resize();
        requestAnimationFrame(animate);
    }

    // ==================== 照片墙 ====================
    function renderWall() {
        const photos = Array.isArray(CONFIG.photos) ? CONFIG.photos : [];
        const totalPhotos = photos.length;

        // 根据屏幕尺寸计算所需格子数
        // 基准桌面 200px / 手机 90px；若照片较多则自动缩小，
        // 确保所有照片能在首屏可视区域内完整显示，不被截断
        const width = window.innerWidth;
        const height = window.innerHeight;
        const gap = parseInt(getComputedStyle(photoWall).gap, 10) || 6;

        let cellSize = width <= 720 ? 90 : 200;
        const minSize = width <= 720 ? 40 : 70;

        function calcCapacity(size) {
            const cols = Math.max(3, Math.floor((width + gap) / (size + gap)));
            const rows = Math.max(3, Math.floor((height + gap) / (size + gap)));
            return { cols, rows, capacity: cols * rows };
        }

        let { cols, rows, capacity } = calcCapacity(cellSize);
        while (capacity < totalPhotos && cellSize > minSize) {
            cellSize -= 5;
            ({ cols, rows, capacity } = calcCapacity(cellSize));
        }

        photoWall.style.setProperty("--wall-cell-size", `${cellSize}px`);
        const WALL_CELLS = Math.max(capacity, totalPhotos);

        photoWall.innerHTML = "";

        // 先创建空占位格子，减轻首帧 DOM 压力
        const cells = [];
        for (let i = 0; i < WALL_CELLS; i++) {
            const photo = totalPhotos > 0 ? photos[i % totalPhotos] : null;
            // 动画延迟按行列位置计算，避免大数量时尾部延迟过长
            const row = Math.floor(i / cols);
            const col = i % cols;
            const delay = Math.min((row + col) * 0.04, 1.5).toFixed(2);
            const cell = document.createElement("div");
            cell.className = "wall-cell flip-in";
            cell.style.animationDelay = `${delay}s`;

            if (!photo || !photo.src) {
                cell.classList.add("placeholder");
                cell.innerHTML = "<span>💕</span>";
            }

            photoWall.appendChild(cell);
            cells.push({ cell, photo, index: i });
        }

        // 没有照片时直接结束
        if (totalPhotos === 0) return;

        // 优先使用缩略图，没有缩略图才用原图
        function pickSrc(photo) {
            return photo.thumb || photo.src;
        }

        // 为每个格子加载图片；首屏直接加载，首屏外用 IntersectionObserver 延迟加载
        const eagerCount = Math.min(WALL_CELLS, Math.ceil(cols * Math.ceil(window.innerHeight / cellSize) * 0.75));
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const { cell, photo } = entry.target._wallData;
                if (cell.querySelector("img")) return;

                const img = document.createElement("img");
                img.src = pickSrc(photo);
                img.alt = "回忆";
                img.decoding = "async";
                img.loading = "lazy";
                cell.appendChild(img);
                observer.unobserve(cell);
            });
        }, { rootMargin: "200px 0px 200px 0px", threshold: 0 });

        cells.forEach(({ cell, photo, index }) => {
            if (!photo || !photo.src) return;

            cell._wallData = { cell, photo };

            if (index < eagerCount) {
                const img = document.createElement("img");
                img.src = pickSrc(photo);
                img.alt = "回忆";
                img.decoding = "async";
                img.loading = index < 9 ? "eager" : "lazy";
                cell.appendChild(img);
            } else {
                observer.observe(cell);
            }
        });
    }

    // ==================== 倒计时 ====================
    function updateCounter() {
        const start = new Date(CONFIG.startDate + "T00:00:00");
        const now = new Date();

        if (isNaN(start.getTime())) {
            console.error("开始日期格式错误，请使用 YYYY-MM-DD");
            return;
        }

        let years = now.getFullYear() - start.getFullYear();
        let months = now.getMonth() - start.getMonth();
        let days = now.getDate() - start.getDate();
        let hours = now.getHours() - start.getHours();
        let minutes = now.getMinutes() - start.getMinutes();
        let seconds = now.getSeconds() - start.getSeconds();

        if (seconds < 0) { seconds += 60; minutes -= 1; }
        if (minutes < 0) { minutes += 60; hours -= 1; }
        if (hours < 0) { hours += 24; days -= 1; }
        if (days < 0) {
            const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
            days += prevMonth.getDate();
            months -= 1;
        }
        if (months < 0) { months += 12; years -= 1; }

        document.getElementById("years").textContent = years;
        document.getElementById("months").textContent = months;
        document.getElementById("days").textContent = days;
        document.getElementById("hours").textContent = String(hours).padStart(2, "0");
        document.getElementById("minutes").textContent = String(minutes).padStart(2, "0");
        document.getElementById("seconds").textContent = String(seconds).padStart(2, "0");
    }

    setInterval(updateCounter, 1000);
    updateCounter();

    // ==================== 时光轴 ====================
    function renderImages(img, maxCount = 4) {
        if (!img) {
            return `<div class="img-placeholder">🌟</div>`;
        }

        if (Array.isArray(img)) {
            const images = img.slice(0, maxCount);
            if (images.length === 0) {
                return `<div class="img-placeholder">🌟</div>`;
            }
            return images.map(src => `
                <img src="${src}" alt="回忆" loading="lazy" onerror="this.style.display='none'; this.parentElement.classList.add('fallback')">
            `).join("");
        }

        return `<img src="${img}" alt="回忆" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\'img-placeholder\'>🌟</div>'">`;
    }

    function renderTimeline() {
        const story = Array.isArray(CONFIG.story) ? CONFIG.story : [];

        if (story.length === 0) {
            timeline.innerHTML = `
                <ul class="timeline">
                    <li class="timeline-item visible">
                        <div class="timeline-img" data-count="0"><div class="img-placeholder">📝</div></div>
                        <div class="timeline-text">
                            <span class="date">现在</span>
                            <h3>写下你们的第一件小事</h3>
                            <p>在 js/config.js 的 story 里添加日期、标题、描述和照片，故事时间轴就会图文并茂地展示出来。</p>
                        </div>
                    </li>
                </ul>
            `;
            return;
        }

        // 按日期正序排列，讲述从相识到远行的时间线
        const sorted = [...story].sort((a, b) => new Date(a.date) - new Date(b.date));
        let html = `<ul class="timeline">`;

        sorted.forEach((item) => {
            const themeKey = (item.theme && THEMES[item.theme]) ? item.theme : "sakura";
            const theme = THEMES[themeKey];
            const imageCount = Array.isArray(item.img) ? Math.min(item.img.length, 4) : (item.img ? 1 : 0);

            html += `
                <li class="timeline-item" data-theme="${themeKey}">
                    <div class="timeline-img" data-count="${imageCount}">${renderImages(item.img)}</div>
                    <div class="timeline-text">
                        <span class="theme-badge" data-theme="${themeKey}">${theme.emoji} ${theme.label}</span>
                        <span class="date">${item.date}</span>
                        <h3>${item.title}</h3>
                        <p>${item.desc}</p>
                    </div>
                </li>
            `;
        });

        html += "</ul>";
        timeline.innerHTML = html;
    }

    // ==================== 滚动淡入动画 ====================
    function observeTimeline() {
        const items = document.querySelectorAll(".timeline-item");
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("visible");
                }
            });
        }, { threshold: 0.12, rootMargin: "0px 0px -50px 0px" });

        items.forEach(item => observer.observe(item));
    }

    // ==================== 主题切换与过渡动画 ====================
    function initThemeObserver() {
        const items = document.querySelectorAll(".timeline-item");
        if (items.length === 0) return;

        let lastActiveKey = null;

        const observer = new IntersectionObserver((entries) => {
            // 取当前进入视口最靠上的时间轴节点作为激活主题
            const visible = entries
                .filter(e => e.isIntersecting)
                .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

            if (visible.length > 0) {
                const activeKey = visible[0].target.dataset.theme;

                if (activeKey !== lastActiveKey) {
                    document.body.dataset.activeTheme = activeKey;
                    lastActiveKey = activeKey;
                }

                const theme = THEMES[activeKey];
                if (theme && typeof window.setThemeGlow === "function") {
                    window.setThemeGlow(theme.glow);
                }
            }
        }, { threshold: 0.35, rootMargin: "-20% 0px -50% 0px" });

        items.forEach(item => observer.observe(item));

        // 初始化第一个主题
        const first = items[0];
        if (first) {
            const key = first.dataset.theme;
            document.body.dataset.activeTheme = key;
            lastActiveKey = key;
            const theme = THEMES[key];
            if (theme && typeof window.setThemeGlow === "function") {
                window.setThemeGlow(theme.glow);
            }
        }
    }

    // 平滑滚动到时光轴
    function initScrollHint() {
        const hint = document.querySelector(".scroll-hint");
        if (!hint) return;
        hint.addEventListener("click", () => {
            document.querySelector(".timeline-section").scrollIntoView({ behavior: "smooth" });
        });
    }

    // ==================== 顶部滚动进度条 ====================
    function initScrollProgress() {
        const bar = document.getElementById("scrollProgress");
        if (!bar) return;
        window.addEventListener("scroll", () => {
            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
            bar.style.width = `${progress}%`;
        });
    }

    // ==================== 恋爱数据统计 ====================
    function initStats() {
        const section = document.getElementById("statsSection");
        if (!section) return;

        const start = new Date(CONFIG.startDate + "T00:00:00");
        const now = new Date();
        const diffMs = now - start;
        const totalDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

        const photos = Array.isArray(CONFIG.photos) ? CONFIG.photos.length : 0;
        const memories = Array.isArray(CONFIG.memories) ? CONFIG.memories.length : 0;
        // 心动瞬间：按在一起天数 × 每天 3 次估算，也可以自己改
        const heartbeats = totalDays * 3 + memories * 10;

        const targets = {
            days: totalDays,
            photos: photos,
            memories: memories,
            heartbeat: heartbeats
        };

        // 设置最终值到 data-value，方便后续动画读取
        section.querySelectorAll(".stat-number").forEach(el => {
            const key = el.dataset.target;
            if (targets[key] !== undefined) {
                el.dataset.value = targets[key];
            }
        });

        // 滚动到区域时执行计数动画
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.querySelectorAll(".stat-number").forEach(el => {
                        const target = parseInt(el.dataset.value, 10) || 0;
                        animateNumber(el, target, 1500);
                    });
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.35 });

        observer.observe(section);
    }

    function animateNumber(el, target, duration) {
        const start = performance.now();
        const from = 0;

        function step(now) {
            const progress = Math.min((now - start) / duration, 1);
            // easeOutQuart
            const eased = 1 - Math.pow(1 - progress, 4);
            const current = Math.floor(from + (target - from) * eased);
            el.textContent = current.toLocaleString();
            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                el.textContent = target.toLocaleString();
            }
        }
        requestAnimationFrame(step);
    }

    // ==================== 下一个纪念日倒计时 ====================
    function initAnniversaryCountdown() {
        const labelEl = document.getElementById("anniversaryLabel");
        const dateEl = document.getElementById("anniversaryDate");
        if (!labelEl || !dateEl) return;

        const start = new Date(CONFIG.startDate + "T00:00:00");
        const now = new Date();

        // 找到下一个有意义的纪念日：周年、100天、520天、1314天
        const milestones = [];
        const totalDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));

        // 下一个周年
        const years = Math.floor(totalDays / 365);
        const nextYearDate = new Date(start);
        nextYearDate.setFullYear(start.getFullYear() + years + 1);
        milestones.push({ name: `${years + 1} 周年纪念日`, date: nextYearDate });

        // 100 天倍数（100, 200, 300...）
        const nextHundred = Math.ceil((totalDays + 1) / 100) * 100;
        const hundredDate = new Date(start.getTime() + nextHundred * 24 * 60 * 60 * 1000);
        milestones.push({ name: `第 ${nextHundred} 天`, date: hundredDate });

        // 520 天
        if (totalDays < 520) {
            milestones.push({ name: "第 520 天", date: new Date(start.getTime() + 520 * 24 * 60 * 60 * 1000) });
        }

        // 1314 天
        if (totalDays < 1314) {
            milestones.push({ name: "第 1314 天", date: new Date(start.getTime() + 1314 * 24 * 60 * 60 * 1000) });
        }

        // 情人节（每年 2 月 14）
        let valentine = new Date(now.getFullYear(), 1, 14);
        if (valentine <= now) {
            valentine = new Date(now.getFullYear() + 1, 1, 14);
        }
        milestones.push({ name: "情人节", date: valentine });

        // 取最近的未来纪念日
        const future = milestones
            .filter(m => m.date > now)
            .sort((a, b) => a.date - b.date);

        const next = future.length > 0 ? future[0] : { name: "明天", date: new Date(now.getTime() + 24 * 60 * 60 * 1000) };

        labelEl.textContent = `距离我们的 ${next.name}还有`;
        dateEl.textContent = `纪念日：${next.date.toLocaleDateString("zh-CN")}`;

        function updateCountdown() {
            const current = new Date();
            const diff = next.date - current;

            if (diff <= 0) {
                document.getElementById("annDays").textContent = "0";
                document.getElementById("annHours").textContent = "00";
                document.getElementById("annMinutes").textContent = "00";
                document.getElementById("annSeconds").textContent = "00";
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            document.getElementById("annDays").textContent = days;
            document.getElementById("annHours").textContent = String(hours).padStart(2, "0");
            document.getElementById("annMinutes").textContent = String(minutes).padStart(2, "0");
            document.getElementById("annSeconds").textContent = String(seconds).padStart(2, "0");
        }

        updateCountdown();
        setInterval(updateCountdown, 1000);
    }

    // ==================== 情书手札 ====================
    function initLoveLetter() {
        const wrap = document.getElementById("envelopeWrap");
        const tabsContainer = document.getElementById("letterTabs");
        const envelopeTitle = document.getElementById("envelopeTitle");
        const envelopeMeta = document.getElementById("envelopeMeta");
        const envelopeSeal = document.getElementById("envelopeSeal");
        const letterTitle = document.getElementById("letterTitle");
        const letterTo = document.getElementById("letterTo");
        const letterDate = document.getElementById("letterDate");
        const letterContent = document.getElementById("letterContent");
        const letterSignature = document.getElementById("letterSignature");
        const openBtn = document.getElementById("openLetterBtn");
        const closeBtn = document.getElementById("closeLetterBtn");
        const replayBtn = document.getElementById("replayLetterBtn");
        const prevBtn = document.getElementById("letterPrev");
        const nextBtn = document.getElementById("letterNext");

        if (!wrap || !tabsContainer) return;

        // 兼容旧配置：对象格式 {fromMe, fromYou} 或数组格式
        let letters = [];
        if (Array.isArray(CONFIG.loveLetters)) {
            letters = CONFIG.loveLetters;
        } else if (CONFIG.loveLetters && typeof CONFIG.loveLetters === "object") {
            const { fromMe, fromYou } = CONFIG.loveLetters;
            if (fromMe) letters.push({ ...fromMe, from: fromMe.from || "我", to: fromMe.to || "TA", seal: fromMe.seal || "💌" });
            if (fromYou) letters.push({ ...fromYou, from: fromYou.from || "TA", to: fromYou.to || "我", seal: fromYou.seal || "💕" });
        } else if (CONFIG.loveLetter) {
            letters = [{ ...CONFIG.loveLetter, from: "我", to: "TA", seal: "💌" }];
        }

        if (letters.length === 0) return;

        let activeIndex = 0;
        let isOpen = false;
        let typeTimer = null;
        let typingDone = false;

        function renderTabs() {
            tabsContainer.innerHTML = letters.map((letter, index) => `
                <button class="letter-tab ${index === activeIndex ? "active" : ""}" data-index="${index}" aria-label="打开${letter.title || "情书"}">
                    <span>${letter.title || "未命名情书"}</span>
                    ${letter.date ? `<small> · ${letter.date}</small>` : ""}
                </button>
            `).join("");
        }

        function renderEnvelope() {
            const letter = letters[activeIndex];
            envelopeTitle.textContent = letter.title || "";
            envelopeMeta.textContent = [letter.from, letter.to, letter.date]
                .filter(Boolean)
                .join(" · ");
            envelopeSeal.textContent = letter.seal || "💌";
        }

        function renderPaper() {
            const letter = letters[activeIndex];
            letterTitle.textContent = letter.title || "";
            letterTo.textContent = letter.to ? `致 ${letter.to}` : "";
            letterDate.textContent = letter.date || "";
            letterSignature.textContent = letter.signature || letter.from || "";
        }

        function typeText(text) {
            if (typeTimer) clearInterval(typeTimer);
            letterContent.textContent = "";
            letterContent.classList.remove("done");
            typingDone = false;

            if (!text) {
                typingDone = true;
                return;
            }

            let index = 0;
            typeTimer = setInterval(() => {
                if (index < text.length) {
                    letterContent.textContent += text.charAt(index);
                    index++;
                } else {
                    clearInterval(typeTimer);
                    letterContent.classList.add("done");
                    typingDone = true;
                }
            }, 55);
        }

        function openLetter() {
            if (isOpen) return;
            isOpen = true;
            wrap.classList.add("opened");
            openBtn.classList.add("hidden");
            if (closeBtn) closeBtn.classList.remove("hidden");
            replayBtn.classList.remove("hidden");
            renderPaper();
            // 等信笺展开动画过半后开始打字
            setTimeout(() => typeText(letters[activeIndex].content || ""), 650);
        }

        function closeLetter(callback) {
            if (!isOpen) {
                if (callback) callback();
                return;
            }
            isOpen = false;
            wrap.classList.remove("opened");
            if (typeTimer) clearInterval(typeTimer);
            letterContent.classList.add("done");
            openBtn.classList.remove("hidden");
            if (closeBtn) closeBtn.classList.add("hidden");
            replayBtn.classList.add("hidden");
            setTimeout(() => {
                if (callback) callback();
            }, 450);
        }

        function selectLetter(index) {
            if (index < 0 || index >= letters.length || index === activeIndex) return;
            activeIndex = index;
            renderTabs();
            renderEnvelope();

            if (isOpen) {
                closeLetter(() => openLetter());
            } else {
                renderPaper();
            }
        }

        function replay() {
            if (!isOpen) return;
            typeText(letters[activeIndex].content || "");
        }

        tabsContainer.addEventListener("click", (e) => {
            const tab = e.target.closest(".letter-tab");
            if (!tab) return;
            selectLetter(parseInt(tab.dataset.index, 10));
        });

        openBtn.addEventListener("click", openLetter);
        if (closeBtn) closeBtn.addEventListener("click", () => closeLetter());
        replayBtn.addEventListener("click", replay);
        prevBtn.addEventListener("click", () => selectLetter((activeIndex - 1 + letters.length) % letters.length));
        nextBtn.addEventListener("click", () => selectLetter((activeIndex + 1) % letters.length));

        document.addEventListener("keydown", (e) => {
            if (e.key === "ArrowLeft") selectLetter((activeIndex - 1 + letters.length) % letters.length);
            if (e.key === "ArrowRight") selectLetter((activeIndex + 1) % letters.length);
        });

        renderTabs();
        renderEnvelope();
        renderPaper();
    }

    // ==================== 回忆画廊 ====================
    const galleryImages = [];

    function collectGalleryImages() {
        galleryImages.length = 0;
        const memories = Array.isArray(CONFIG.memories) ? CONFIG.memories : [];
        memories.forEach(item => {
            if (!item.img) return;
            if (Array.isArray(item.img)) {
                item.img.forEach(src => galleryImages.push({ src, title: item.title, date: item.date, source: "memory" }));
            } else {
                galleryImages.push({ src: item.img, title: item.title, date: item.date, source: "memory" });
            }
        });

        const footprints = Array.isArray(CONFIG.footprints) ? CONFIG.footprints : [];
        footprints.forEach(item => {
            if (!Array.isArray(item.photos)) return;
            item.photos.forEach(src => galleryImages.push({ src, title: item.city, date: item.date, source: "footprint", city: item.city }));
        });
    }

    function renderGallery() {
        const grid = document.getElementById("galleryGrid");
        if (!grid) return;

        const memoryImages = galleryImages.filter(item => item.source === "memory");
        if (memoryImages.length === 0) {
            grid.innerHTML = `<div class="gallery-item visible" style="grid-column: 1 / -1; display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#e0c3fc,#fbc2eb);color:#fff;">在 config.js 的 memories 里添加照片，这里会自动生成画廊 💕</div>`;
            return;
        }

        grid.innerHTML = galleryImages.map((item, index) => {
            if (item.source !== "memory") return "";
            return `
                <div class="gallery-item" data-index="${index}">
                    <img src="${item.src}" alt="${item.title || "回忆"}" loading="lazy">
                </div>
            `;
        }).join("");

        observeGallery();
        initLightbox();
    }

    function observeGallery() {
        const items = document.querySelectorAll(".gallery-item");
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("visible");
                }
            });
        }, { threshold: 0.1, rootMargin: "0px 0px -30px 0px" });

        items.forEach((item, i) => {
            item.style.transitionDelay = `${i * 0.05}s`;
            observer.observe(item);
        });
    }

    // ==================== 灯箱 ====================
    let currentLightboxIndex = 0;

    function openLightbox() {
        const lightbox = document.getElementById("lightbox");
        const img = document.getElementById("lightboxImg");
        if (galleryImages.length === 0 || !lightbox || !img) return;
        img.src = galleryImages[currentLightboxIndex].src;
        lightbox.classList.add("active");
        document.body.style.overflow = "hidden";
    }

    function closeLightbox() {
        const lightbox = document.getElementById("lightbox");
        if (!lightbox) return;
        lightbox.classList.remove("active");
        document.body.style.overflow = "";
    }

    function showLightboxPrev() {
        const img = document.getElementById("lightboxImg");
        if (!img || galleryImages.length === 0) return;
        currentLightboxIndex = (currentLightboxIndex - 1 + galleryImages.length) % galleryImages.length;
        img.src = galleryImages[currentLightboxIndex].src;
    }

    function showLightboxNext() {
        const img = document.getElementById("lightboxImg");
        if (!img || galleryImages.length === 0) return;
        currentLightboxIndex = (currentLightboxIndex + 1) % galleryImages.length;
        img.src = galleryImages[currentLightboxIndex].src;
    }

    function initLightbox() {
        const lightbox = document.getElementById("lightbox");
        const closeBtn = document.getElementById("lightboxClose");
        const prevBtn = document.getElementById("lightboxPrev");
        const nextBtn = document.getElementById("lightboxNext");
        if (!lightbox) return;

        document.querySelectorAll(".gallery-item").forEach(item => {
            item.addEventListener("click", () => {
                currentLightboxIndex = parseInt(item.dataset.index, 10);
                openLightbox();
            });
        });

        if (closeBtn) closeBtn.addEventListener("click", closeLightbox);
        if (prevBtn) prevBtn.addEventListener("click", (e) => { e.stopPropagation(); showLightboxPrev(); });
        if (nextBtn) nextBtn.addEventListener("click", (e) => { e.stopPropagation(); showLightboxNext(); });
        lightbox.addEventListener("click", (e) => {
            if (e.target === lightbox) closeLightbox();
        });
        document.addEventListener("keydown", (e) => {
            if (!lightbox.classList.contains("active")) return;
            if (e.key === "Escape") closeLightbox();
            if (e.key === "ArrowLeft") showLightboxPrev();
            if (e.key === "ArrowRight") showLightboxNext();
        });
    }

    // ==================== 那些让我心动的瞬间 ====================
    function renderHeartbeatMoments() {
        const grid = document.getElementById("heartbeatGrid");
        if (!grid) return;

        const moments = Array.isArray(CONFIG.heartbeatMoments) ? CONFIG.heartbeatMoments : [];
        if (moments.length === 0) {
            grid.innerHTML = `<div class="heartbeat-empty">在 config.js 的 heartbeatMoments 里添加照片和文字，这里会生成心动瞬间卡片 💕</div>`;
            return;
        }

        grid.innerHTML = moments.map((item, index) => `
            <div class="heartbeat-card" style="transition-delay: ${index * 0.1}s">
                <div class="heartbeat-img">
                    <img src="${item.img || ""}" alt="心动瞬间" loading="lazy" onerror="this.style.display='none'; this.parentElement.classList.add('fallback')">
                </div>
                <div class="heartbeat-text">
                    <p>${item.text || ""}</p>
                </div>
            </div>
        `).join("");

        observeHeartbeatMoments();
    }

    function observeHeartbeatMoments() {
        const items = document.querySelectorAll(".heartbeat-card");
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("visible");
                }
            });
        }, { threshold: 0.12, rootMargin: "0px 0px -50px 0px" });

        items.forEach(item => observer.observe(item));
    }

    // ==================== 足迹地图（Leaflet + 高德瓦片真实长三角地图） ====================
    function renderFootprintMap() {
        const section = document.getElementById("footprintSection");
        const mapWrap = document.getElementById("handdrawnMap");
        const tooltip = document.getElementById("mapTooltip");
        const legendEl = document.getElementById("footprintLegend");
        if (!section || !mapWrap || !tooltip || !legendEl) return;

        const footprints = Array.isArray(CONFIG.footprints) ? CONFIG.footprints : [];
        if (footprints.length === 0) {
            section.style.display = "none";
            return;
        }

        // 等待 Leaflet 加载
        if (typeof L === "undefined") {
            console.warn("Leaflet 未加载，足迹地图将不可用");
            section.style.display = "none";
            return;
        }

        // 初始化 Leaflet 地图
        const map = L.map("leafletMap", {
            zoomControl: false,
            attributionControl: false,
            scrollWheelZoom: false
        });

        // 高德街道图瓦片（中国高精度底图）
        const amapLayer = L.tileLayer(
            "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
            {
                subdomains: ["1", "2", "3", "4"],
                maxZoom: 18,
                minZoom: 3
            }
        ).addTo(map);

        // 瓦片加载失败时切换到 OpenStreetMap
        amapLayer.on("tileerror", () => {
            if (!map.hasLayer(amapLayer)) return;
            map.removeLayer(amapLayer);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 18,
                minZoom: 3
            }).addTo(map);
        });

        // 上海、舟山及周边省市视野：聚焦长三角，同时容纳花鸟岛等较远足迹
        const deltaBounds = L.latLngBounds([
            [30.5, 120.4],
            [32.0, 123.2]
        ]);

        // 足迹点边界
        const latLngs = footprints.map(f => [f.lat, f.lng]);
        const footprintBounds = L.latLngBounds(latLngs).pad(0.18);

        // 合并边界：既要包含所有足迹点，也要展示长三角城市上下文
        const finalBounds = footprintBounds.extend(deltaBounds);
        map.fitBounds(finalBounds, { padding: [80, 80], maxZoom: 11 });

        // 图标颜色
        const iconColors = {
            "🌸": "#ff85a2",
            "🏠": "#f1c40f",
            "🌿": "#7cb342",
            "🎡": "#e74c3c",
            "📚": "#5b7cfa",
            "🌊": "#3ec2d1",
            "🏰": "#e66ef7",
            "🦁": "#e67e22",
            "🐠": "#3498db"
        };

        const markers = [];

        footprints.forEach((f, i) => {
            const color = iconColors[f.icon] || "#e06c9f";
            const isCurrent = i === footprints.length - 1;
            const iconHtml = `
                <div class="map-marker ${isCurrent ? "current" : ""}" data-index="${i}" style="--marker-color: ${color};">
                    <span class="marker-pulse"></span>
                    <span class="marker-icon">${f.icon}</span>
                    ${isCurrent ? '<span class="marker-star">✨</span>' : ""}
                </div>
            `;
            const icon = L.divIcon({
                html: iconHtml,
                className: "custom-leaflet-marker",
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });
            const marker = L.marker([f.lat, f.lng], { icon }).addTo(map);
            markers.push(marker);

            // 绑定自定义交互
            const el = marker.getElement();
            if (el) {
                const markerInner = el.querySelector(".map-marker");
                if (markerInner) {
                    markerInner.addEventListener("mouseenter", () => showTooltip(markerInner, f));
                    markerInner.addEventListener("mouseleave", () => {
                        if (!markerInner.classList.contains("locked")) hideTooltip();
                    });
                    markerInner.addEventListener("click", (e) => {
                        e.stopPropagation();
                        const isLocked = markerInner.classList.contains("locked");
                        mapWrap.querySelectorAll(".map-marker.locked").forEach(m => m.classList.remove("locked"));
                        if (!isLocked) {
                            markerInner.classList.add("locked");
                            showTooltip(markerInner, f);
                        } else {
                            hideTooltip();
                        }
                    });
                }
            }
        });

        // 绘制足迹路线
        L.polyline(latLngs, {
            color: "#C98B8B",
            weight: 2.5,
            opacity: 0.85,
            dashArray: "6 6",
            lineCap: "round",
            lineJoin: "round",
            className: "footprint-route"
        }).addTo(map);

        // 图例
        legendEl.innerHTML = footprints.map((f, i) => {
            const color = iconColors[f.icon] || "#e06c9f";
            return `
                <span class="legend-item" data-index="${i}">
                    <span class="legend-icon" style="color: ${color};">${f.icon}</span>
                    <span>${f.shortName || f.city}</span>
                </span>
            `;
        }).join("");

        function showTooltip(markerEl, data) {
            const rect = markerEl.getBoundingClientRect();
            const wrapRect = mapWrap.getBoundingClientRect();
            const nameEl = tooltip.querySelector(".tooltip-name");
            const timeEl = tooltip.querySelector(".tooltip-time");
            const photosEl = tooltip.querySelector(".tooltip-photos");
            if (nameEl) nameEl.textContent = data.city;
            if (timeEl) timeEl.textContent = `回忆时间：${data.date}`;
            if (photosEl) {
                const photos = Array.isArray(data.photos) ? data.photos.slice(0, 3) : [];
                if (photos.length > 0) {
                    photosEl.innerHTML = photos.map(src => `
                        <img src="${src}" alt="${data.city}" loading="lazy" onerror="this.style.display='none'">
                    `).join("");
                    photosEl.classList.remove("hidden");
                } else {
                    photosEl.innerHTML = "";
                    photosEl.classList.add("hidden");
                }
            }

            const left = rect.left - wrapRect.left + rect.width / 2;
            const top = rect.top - wrapRect.top - 8;
            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;
            tooltip.classList.add("visible");

            mapWrap.querySelectorAll(".map-marker.active").forEach(m => m.classList.remove("active"));
            markerEl.classList.add("active");
        }

        function hideTooltip() {
            tooltip.classList.remove("visible");
            mapWrap.querySelectorAll(".map-marker.active").forEach(m => m.classList.remove("active"));
        }

        legendEl.querySelectorAll(".legend-item").forEach((item, i) => {
            item.addEventListener("click", () => {
                const marker = markers[i];
                if (!marker) return;
                const el = marker.getElement();
                const markerInner = el ? el.querySelector(".map-marker") : null;
                if (markerInner) {
                    mapWrap.querySelectorAll(".map-marker.locked").forEach(m => m.classList.remove("locked"));
                    markerInner.classList.add("locked");
                    showTooltip(markerInner, footprints[i]);
                    map.flyTo([footprints[i].lat, footprints[i].lng], Math.max(map.getZoom(), 11), {
                        duration: 1.2
                    });
                }
            });
        });

        // 点击地图空白处取消锁定
        map.on("click", () => {
            mapWrap.querySelectorAll(".map-marker.locked").forEach(m => m.classList.remove("locked"));
            hideTooltip();
        });

        // 地图视图变化时更新锁定 tooltip 位置
        map.on("move zoom", () => {
            const locked = mapWrap.querySelector(".map-marker.locked");
            if (locked) {
                const index = parseInt(locked.dataset.index, 10);
                if (!isNaN(index) && footprints[index]) {
                    showTooltip(locked, footprints[index]);
                }
            } else {
                hideTooltip();
            }
        });

        // 卡片入场动画
        const card = section.querySelector(".footprint-card");
        if (card) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("visible");
                        setTimeout(() => map.invalidateSize(), 50);
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.15, rootMargin: "0px 0px -50px 0px" });
            observer.observe(card);
        }
    }

    // ==================== 她对我的意义 ====================
    function initMeaningSection() {
        const section = document.getElementById("meaningSection");
        const grid = document.getElementById("meaningGrid");
        if (!section || !grid) return;

        const items = Array.isArray(CONFIG.meaningToMe) ? CONFIG.meaningToMe : [];
        if (items.length === 0) {
            section.style.display = "none";
            return;
        }

        const stickyColors = ["#fff8dc", "#ffe4e1", "#e8f5e9", "#e3f2fd"];
        const stickyRotations = [-2, 1.5, -1, 2.5];

        grid.innerHTML = items.map((item, index) => {
            const color = stickyColors[index % stickyColors.length];
            const rotate = stickyRotations[index % stickyRotations.length];
            return `
                <div class="meaning-card" style="--sticky-color: ${color}; --rotate: ${rotate}deg; transition-delay: ${index * 0.12}s">
                    <h3>${item.title || ""}</h3>
                    <p>${item.content || ""}</p>
                </div>
            `;
        }).join("");

        const cards = grid.querySelectorAll(".meaning-card");
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("visible");
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15, rootMargin: "0px 0px -50px 0px" });

        cards.forEach(card => observer.observe(card));
    }

    // ==================== 生日过渡页 ====================
    function initBirthdayTransition() {
        const section = document.getElementById("birthdayTransition");
        if (!section) return;

        const content = section.querySelector(".transition-content");
        if (!content) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("visible");
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.3, rootMargin: "0px 0px -50px 0px" });

        observer.observe(content);
    }

    // ==================== 生日专属页 ====================
    function initBirthdaySection() {
        const section = document.getElementById("birthdaySection");
        if (!section) return;

        const birthdayConfig = CONFIG.birthday || {};

        // 应用配置文案
        const pretitle = document.getElementById("birthdayPretitle");
        const title = document.getElementById("birthdayTitle");
        const subtitle = document.getElementById("birthdaySubtitle");
        const cakeHint = document.getElementById("cakeHint");

        if (pretitle) pretitle.textContent = birthdayConfig.pretitle || "致我 23 岁的女孩";
        if (title) {
            // 保持 span 包裹的结构
            const chars = (birthdayConfig.title || "生日快乐").split("");
            title.innerHTML = chars.map(ch => `<span>${ch}</span>`).join("");
        }
        if (subtitle) subtitle.textContent = birthdayConfig.subtitle || "愿你眼里有星河，笑里有清风";

        // ==================== 星空背景生成 ====================
        const starsContainer = document.getElementById("birthdayStars");
        const stardustContainer = document.getElementById("stardustContainer");

        function createStars() {
            if (!starsContainer) return;
            const count = Math.min(120, Math.floor(window.innerWidth / 12));
            starsContainer.innerHTML = "";
            for (let i = 0; i < count; i++) {
                const star = document.createElement("div");
                star.className = "star";
                const size = Math.random() * 2.5 + 0.5;
                star.style.width = `${size}px`;
                star.style.height = `${size}px`;
                star.style.left = `${Math.random() * 100}%`;
                star.style.top = `${Math.random() * 100}%`;
                star.style.setProperty("--duration", `${Math.random() * 3 + 2}s`);
                star.style.setProperty("--opacity", `${Math.random() * 0.5 + 0.3}`);
                star.style.animationDelay = `${Math.random() * 3}s`;
                starsContainer.appendChild(star);
            }
        }

        function createStardust() {
            if (!stardustContainer) return;
            stardustContainer.innerHTML = "";
            const count = 24;
            for (let i = 0; i < count; i++) {
                const dust = document.createElement("div");
                dust.className = "dust";
                const size = Math.random() * 4 + 2;
                dust.style.width = `${size}px`;
                dust.style.height = `${size}px`;
                dust.style.left = `${Math.random() * 100}%`;
                dust.style.top = `${Math.random() * 100}%`;
                dust.style.setProperty("--duration", `${Math.random() * 4 + 4}s`);
                dust.style.setProperty("--opacity", `${Math.random() * 0.4 + 0.2}`);
                dust.style.setProperty("--tx", `${(Math.random() - 0.5) * 40}px`);
                dust.style.setProperty("--ty", `${(Math.random() - 0.5) * 60 - 20}px`);
                dust.style.animationDelay = `${Math.random() * 4}s`;
                stardustContainer.appendChild(dust);
            }
        }

        createStars();
        createStardust();
        window.addEventListener("resize", () => {
            createStars();
        });

        // ==================== 流星画布 ====================
        const meteorCanvas = document.getElementById("birthdayMeteors");
        if (meteorCanvas) {
            const mctx = meteorCanvas.getContext("2d");
            let mWidth, mHeight;
            let meteors = [];

            function resizeMeteor() {
                mWidth = section.offsetWidth;
                mHeight = section.offsetHeight;
                meteorCanvas.width = mWidth;
                meteorCanvas.height = mHeight;
            }

            function createMeteor() {
                const x = Math.random() * mWidth;
                const y = Math.random() * mHeight * 0.4;
                const length = Math.random() * 80 + 40;
                const speed = Math.random() * 3 + 2;
                const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.2;
                meteors.push({ x, y, length, speed, angle, alpha: 1 });
            }

            function drawMeteors() {
                mctx.clearRect(0, 0, mWidth, mHeight);
                for (let i = meteors.length - 1; i >= 0; i--) {
                    const m = meteors[i];
                    const tailX = m.x - Math.cos(m.angle) * m.length;
                    const tailY = m.y - Math.sin(m.angle) * m.length;
                    const grad = mctx.createLinearGradient(m.x, m.y, tailX, tailY);
                    grad.addColorStop(0, `rgba(255, 255, 255, ${m.alpha})`);
                    grad.addColorStop(1, "rgba(255, 255, 255, 0)");
                    mctx.strokeStyle = grad;
                    mctx.lineWidth = 2;
                    mctx.beginPath();
                    mctx.moveTo(m.x, m.y);
                    mctx.lineTo(tailX, tailY);
                    mctx.stroke();

                    m.x += Math.cos(m.angle) * m.speed;
                    m.y += Math.sin(m.angle) * m.speed;
                    m.alpha -= 0.008;

                    if (m.x > mWidth + m.length || m.y > mHeight + m.length || m.alpha <= 0) {
                        meteors.splice(i, 1);
                    }
                }
                requestAnimationFrame(drawMeteors);
            }

            resizeMeteor();
            drawMeteors();
            setInterval(() => {
                if (Math.random() > 0.6) createMeteor();
            }, 2000);
            window.addEventListener("resize", resizeMeteor);
        }

        // ==================== 生日页进入视口动画 + 音乐切换 ====================
        const sectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("visible");
                    if (typeof window.switchBirthdayMusic === "function") {
                        window.switchBirthdayMusic();
                    }
                }
                // 离开生日板块时不切回主音乐，保持生日歌延续到结尾
            });
        }, { threshold: 0.25 });

        sectionObserver.observe(section);

        // ==================== 生日手写信 ====================
        const birthdayLetter = document.getElementById("birthdayLetter");
        const birthdayLetterContent = document.getElementById("birthdayLetterContent");
        const birthdayLetterSignature = document.getElementById("birthdayLetterSignature");
        if (birthdayLetterContent) {
            birthdayLetterContent.textContent = birthdayConfig.letter || "";
        }
        if (birthdayLetterSignature) {
            birthdayLetterSignature.textContent = birthdayConfig.letterSignature || "";
        }

        // ==================== 蜡烛交互 ====================
        const candles = section.querySelectorAll(".candle");
        const cakeContainer = document.getElementById("cakeContainer");
        const smokeContainer = document.getElementById("smokeContainer");
        const wishDelivered = document.getElementById("wishDelivered");
        let extinguishedCount = 0;
        let letterShown = false;

        function createSmoke(candleEl) {
            if (!smokeContainer) return;
            const rect = candleEl.getBoundingClientRect();
            const sectionRect = section.getBoundingClientRect();
            const x = rect.left - sectionRect.left + rect.width / 2;
            const y = rect.top - sectionRect.top;

            for (let i = 0; i < 6; i++) {
                const smoke = document.createElement("div");
                smoke.className = "smoke";
                smoke.style.left = `${x + (Math.random() - 0.5) * 10}px`;
                smoke.style.top = `${y}px`;
                smoke.style.setProperty("--dx", `${(Math.random() - 0.5) * 30}px`);
                smoke.style.animationDelay = `${i * 0.08}s`;
                smokeContainer.appendChild(smoke);
                setTimeout(() => smoke.remove(), 1600);
            }
        }

        function createSparkleBurst(x, y) {
            if (!stardustContainer) return;
            for (let i = 0; i < 16; i++) {
                const spark = document.createElement("div");
                spark.className = "dust";
                const size = Math.random() * 5 + 3;
                spark.style.width = `${size}px`;
                spark.style.height = `${size}px`;
                spark.style.left = `${x}px`;
                spark.style.top = `${y}px`;
                const angle = (Math.PI * 2 / 16) * i + Math.random() * 0.3;
                const dist = Math.random() * 80 + 40;
                spark.style.setProperty("--tx", `${Math.cos(angle) * dist}px`);
                spark.style.setProperty("--ty", `${Math.sin(angle) * dist}px`);
                spark.style.setProperty("--duration", "1.2s");
                spark.style.setProperty("--opacity", "1");
                spark.style.animation = "dustFloat 1.2s ease-out forwards";
                stardustContainer.appendChild(spark);
                setTimeout(() => spark.remove(), 1200);
            }
        }

        function onAllCandlesOut() {
            if (cakeContainer) cakeContainer.classList.add("all-out");
            if (cakeHint) cakeHint.textContent = birthdayConfig.afterBlowHint || "愿望已实现 ✨";

            // 吹灭蜡烛后，缓缓展开手写信
            if (birthdayLetter && !letterShown) {
                letterShown = true;
                setTimeout(() => {
                    birthdayLetter.classList.add("show");
                    // 信纸开始展开后，平滑滚动到信件中心，让用户无需手动下拉
                    setTimeout(() => {
                        birthdayLetter.scrollIntoView({ behavior: "smooth", block: "center" });
                    }, 700);
                }, 500);
            }

            // 显示“愿望已送达”
            if (wishDelivered) {
                setTimeout(() => wishDelivered.classList.add("show"), 2200);
            }

            // 触发烟花
            if (typeof window.startBirthdayFireworks === "function") {
                window.startBirthdayFireworks();
            }
        }

        candles.forEach(candle => {
            candle.addEventListener("click", () => {
                if (candle.classList.contains("extinguished")) return;
                candle.classList.add("extinguished");
                createSmoke(candle);

                const rect = candle.getBoundingClientRect();
                const sectionRect = section.getBoundingClientRect();
                createSparkleBurst(
                    rect.left - sectionRect.left + rect.width / 2,
                    rect.top - sectionRect.top
                );

                extinguishedCount++;
                if (extinguishedCount >= candles.length) {
                    setTimeout(onAllCandlesOut, 500);
                }
            });
        });
    }

    // ==================== 烟花画布 ====================
    function initFireworks() {
        const canvas = document.getElementById("fireworks");
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        let width, height;
        let particles = [];
        let running = false;
        let animationId = null;

        function resize() {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;
        }

        function createParticle(x, y, color) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 4 + 2;
            return {
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                alpha: 1,
                decay: Math.random() * 0.015 + 0.008,
                color,
                size: Math.random() * 2.5 + 1
            };
        }

        function explode(x, y) {
            const colors = ["#ffcc4d", "#e66ef7", "#ff9ec8", "#8fd3f4", "#ff9f5a", "#ffffff"];
            const color = colors[Math.floor(Math.random() * colors.length)];
            const count = Math.floor(Math.random() * 30 + 40);
            for (let i = 0; i < count; i++) {
                particles.push(createParticle(x, y, color));
            }
        }

        function animate() {
            if (!running && particles.length === 0) {
                cancelAnimationFrame(animationId);
                animationId = null;
                ctx.clearRect(0, 0, width, height);
                return;
            }

            // 拖尾效果
            ctx.fillStyle = "rgba(26, 18, 37, 0.15)";
            ctx.fillRect(0, 0, width, height);

            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.08; // 重力
                p.vx *= 0.98;
                p.vy *= 0.98;
                p.alpha -= p.decay;

                if (p.alpha <= 0) {
                    particles.splice(i, 1);
                    continue;
                }

                ctx.globalAlpha = p.alpha;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.globalAlpha = 1;
            animationId = requestAnimationFrame(animate);
        }

        function launchFirework() {
            if (!running) return;
            const x = Math.random() * width * 0.8 + width * 0.1;
            const y = Math.random() * height * 0.4 + height * 0.1;
            explode(x, y);
        }

        window.startBirthdayFireworks = function () {
            running = true;
            if (!animationId) animate();

            // 连续放多轮烟花
            let bursts = 0;
            const maxBursts = 8;
            const interval = setInterval(() => {
                launchFirework();
                bursts++;
                if (bursts >= maxBursts) {
                    clearInterval(interval);
                    // 再放最后一轮后停止生成
                    setTimeout(() => { running = false; }, 2500);
                }
            }, 400);
        };

        window.stopBirthdayFireworks = function () {
            running = false;
        };

        window.addEventListener("resize", resize);
        resize();
    }

    // ==================== 那些被记录的里程碑 ====================
    function initMilestones() {
        const section = document.getElementById("milestonesSection");
        const grid = document.getElementById("milestonesGrid");
        if (!section || !grid) return;

        const milestones = Array.isArray(CONFIG.milestones) ? CONFIG.milestones : [];
        if (milestones.length === 0) {
            section.style.display = "none";
            return;
        }

        grid.innerHTML = milestones.map((item, index) => `
            <div class="milestone-card" style="transition-delay: ${index * 0.12}s">
                <span class="milestone-number">NO.${String(index + 1).padStart(2, "0")}</span>
                <div class="milestone-seal">
                    <span class="milestone-icon">${item.icon || "✨"}</span>
                </div>
                <h3>${item.title || ""}</h3>
                ${item.img ? `
                    <div class="milestone-img">
                        <img src="${item.img}" alt="${item.title || "里程碑"}" loading="lazy" onerror="this.style.display='none'; this.parentElement.classList.add('fallback')">
                    </div>
                ` : ""}
                <p class="milestone-desc">${item.desc || ""}</p>
                ${item.quote ? `<blockquote class="milestone-quote">${item.quote}</blockquote>` : ""}
            </div>
        `).join("");

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("visible");
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15, rootMargin: "0px 0px -50px 0px" });

        grid.querySelectorAll(".milestone-card").forEach(card => observer.observe(card));
    }

    // ==================== 背景音乐播放器 ====================
    function initMusicPlayer() {
        const btn = document.getElementById("musicPlayer");
        const audio = document.getElementById("bgMusic");
        if (!btn || !audio) return;

        // 兼容旧配置：字符串形式；新配置：对象 { main, birthday }
        let mainSrc = "";
        let birthdaySrc = "";
        if (typeof CONFIG.music === "string") {
            mainSrc = CONFIG.music;
        } else if (CONFIG.music && typeof CONFIG.music === "object") {
            mainSrc = CONFIG.music.main || "";
            birthdaySrc = CONFIG.music.birthday || "";
        }

        if (!mainSrc && !birthdaySrc) {
            btn.classList.add("hidden");
            return;
        }

        audio.loop = true;

        let isPlaying = false;
        let currentSrc = "";
        let birthdayMode = false;
        let autoplayPrompt = null;

        function updateButtonState() {
            if (isPlaying) {
                btn.classList.add("playing");
            } else {
                btn.classList.remove("playing");
            }
        }

        function play() {
            if (!audio.src) return;
            audio.play().then(() => {
                isPlaying = true;
                updateButtonState();
                hideAutoplayPrompt();
            }).catch(err => {
                isPlaying = false;
                updateButtonState();
                showAutoplayPrompt();
                console.warn("音乐自动播放被阻止，等待用户交互后重试", err);
            });
        }

        function switchTo(src) {
            if (!src || currentSrc === src) return;
            audio.src = src;
            currentSrc = src;
            play();
        }

        function initMainMusic() {
            if (mainSrc) {
                audio.src = mainSrc;
                currentSrc = mainSrc;
                play();
            } else if (birthdaySrc) {
                audio.src = birthdaySrc;
                currentSrc = birthdaySrc;
                play();
            }
        }

        // 显示自动播放被阻止的轻提示
        function showAutoplayPrompt() {
            if (autoplayPrompt) return;
            autoplayPrompt = document.createElement("div");
            autoplayPrompt.className = "autoplay-prompt";
            autoplayPrompt.textContent = "🎵 点击或滑动任意处开启音乐";
            document.body.appendChild(autoplayPrompt);
            requestAnimationFrame(() => autoplayPrompt.classList.add("visible"));
        }

        function hideAutoplayPrompt() {
            if (!autoplayPrompt) return;
            autoplayPrompt.classList.remove("visible");
            setTimeout(() => {
                if (autoplayPrompt && autoplayPrompt.parentElement) {
                    autoplayPrompt.remove();
                }
                autoplayPrompt = null;
            }, 400);
        }

        // 用户首次交互时尝试播放，成功后移除监听
        function tryAutoPlayOnInteraction() {
            if (isPlaying) {
                removeAutoplayListeners();
                return;
            }
            initMainMusic();
        }

        function removeAutoplayListeners() {
            interactionEvents.forEach(evt => {
                document.removeEventListener(evt, tryAutoPlayOnInteraction, { passive: true });
            });
        }

        const interactionEvents = ["click", "touchstart", "scroll", "keydown", "mousemove"];
        interactionEvents.forEach(evt => {
            document.addEventListener(evt, tryAutoPlayOnInteraction, { passive: true });
        });

        // 页面加载后立刻尝试自动播放主音乐
        audio.autoplay = true;
        initMainMusic();

        btn.addEventListener("click", () => {
            if (isPlaying) {
                audio.pause();
            } else {
                play();
            }
        });

        audio.addEventListener("play", () => {
            isPlaying = true;
            updateButtonState();
        });

        audio.addEventListener("pause", () => {
            isPlaying = false;
            updateButtonState();
        });

        audio.addEventListener("ended", () => {
            isPlaying = false;
            updateButtonState();
        });

        // 暴露给生日页：切换到生日音乐
        window.switchBirthdayMusic = function () {
            if (birthdayMode) return;
            birthdayMode = true;
            if (birthdaySrc) {
                switchTo(birthdaySrc);
            }
        };

        // 离开生日页时切回主音乐
        window.switchMainMusic = function () {
            if (!birthdayMode) return;
            birthdayMode = false;
            if (mainSrc) {
                switchTo(mainSrc);
            }
        };
    }

    // ==================== 共同维护邀请 ====================
    function initInviteSection() {
        const section = document.getElementById("inviteSection");
        if (!section) return;

        const github = CONFIG.github || {};
        const authorEl = document.getElementById("commitAuthor");
        const coAuthorEl = document.getElementById("commitCoAuthor");
        const messageEl = document.getElementById("commitMessage");
        const repoBtn = document.getElementById("inviteRepoBtn");
        const acceptBtn = document.getElementById("inviteAcceptBtn");
        const responseEl = document.getElementById("inviteResponse");

        if (authorEl) authorEl.textContent = github.authorName || "你";
        if (coAuthorEl) coAuthorEl.textContent = github.coAuthorName || "她";
        if (messageEl) messageEl.textContent = github.commitMessage || "feat: invite you to co-maintain our story";

        if (repoBtn) {
            if (github.repoUrl) {
                repoBtn.href = github.repoUrl;
            } else {
                repoBtn.style.display = "none";
            }
        }

        if (!acceptBtn || !responseEl) return;

        const storageKey = "our_story_invite_accepted";
        if (localStorage.getItem(storageKey) === "true") {
            acceptBtn.classList.add("accepted");
            responseEl.classList.remove("hidden");
        }

        acceptBtn.addEventListener("click", () => {
            if (acceptBtn.classList.contains("accepted")) return;
            acceptBtn.classList.add("accepted");
            responseEl.classList.remove("hidden");
            localStorage.setItem(storageKey, "true");

            // 小小的庆祝动画：按钮位置飘出几颗爱心
            const rect = acceptBtn.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const hearts = ["💕", "💖", "💗"];
            for (let i = 0; i < 6; i++) {
                const heart = document.createElement("span");
                heart.className = "click-heart";
                heart.textContent = hearts[Math.floor(Math.random() * hearts.length)];
                heart.style.left = `${centerX + (Math.random() - 0.5) * 60}px`;
                heart.style.top = `${centerY + (Math.random() - 0.5) * 20}px`;
                heart.style.setProperty("--tx", `${(Math.random() - 0.5) * 80}px`);
                heart.style.setProperty("--rot", `${(Math.random() - 0.5) * 40}deg`);
                heart.style.fontSize = `${Math.random() * 0.5 + 0.9}rem`;
                document.body.appendChild(heart);
                setTimeout(() => heart.remove(), 1200);
            }
        });
    }

    // ==================== 点击飘爱心 ====================
    function initClickHearts() {
        const hearts = ["💕", "💖"];
        document.addEventListener("click", (e) => {
            // 避免点击按钮、链接、画廊时触发
            if (e.target.closest("button, a, .gallery-item, .lightbox-nav, .lightbox-close")) return;

            const heart = document.createElement("span");
            heart.className = "click-heart";
            heart.textContent = hearts[Math.floor(Math.random() * hearts.length)];
            heart.style.left = `${e.clientX}px`;
            heart.style.top = `${e.clientY}px`;
            heart.style.setProperty("--tx", `${(Math.random() - 0.5) * 40}px`);
            heart.style.setProperty("--rot", `${(Math.random() - 0.5) * 30}deg`);
            heart.style.fontSize = `${Math.random() * 0.6 + 0.9}rem`;
            document.body.appendChild(heart);
            setTimeout(() => heart.remove(), 1200);
        });
    }

    // ==================== 自动滚动开关 ====================
    function initAutoScroll() {
        const toggle = document.getElementById("autoScrollToggle");
        if (!toggle) return;

        let isAutoScrolling = false;
        let rafId = null;
        let lastTime = null;
        let currentSpeed = 80; // 默认滚动速度（像素/秒）

        function updateToggle() {
            toggle.classList.toggle("active", isAutoScrolling);
            const text = toggle.querySelector(".auto-scroll-text");
            if (text) text.textContent = isAutoScrolling ? "滚动中" : "自动滚动";
        }

        function stop() {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = null;
            lastTime = null;
            isAutoScrolling = false;
            updateToggle();
        }

        function step(timestamp) {
            if (!isAutoScrolling) return;
            if (!lastTime) lastTime = timestamp;
            const delta = timestamp - lastTime;
            lastTime = timestamp;

            const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            if (window.scrollY >= maxScroll - 2) {
                stop();
                return;
            }

            const newY = window.scrollY + currentSpeed * delta / 1000;
            window.scrollTo(0, newY);
            rafId = requestAnimationFrame(step);
        }

        toggle.addEventListener("click", () => {
            if (isAutoScrolling) {
                stop();
            } else {
                start();
            }
        });

        // 用户手动滚动时自动暂停，避免冲突；添加短暂保护期防止误触
        let protectUntil = 0;
        window.addEventListener("wheel", () => {
            if (!isAutoScrolling || Date.now() < protectUntil) return;
            stop();
        }, { passive: true });

        window.addEventListener("touchmove", () => {
            if (!isAutoScrolling || Date.now() < protectUntil) return;
            stop();
        }, { passive: true });

        function start() {
            if (rafId) cancelAnimationFrame(rafId);
            isAutoScrolling = true;
            lastTime = null;
            protectUntil = Date.now() + 400;
            updateToggle();

            // 计算到生日祝福板块的速度，按 3 分钟（180 秒）均摊，确保 4 分钟内到达且速度更快
            const birthdaySection = document.getElementById("birthdaySection");
            if (birthdaySection) {
                const targetY = birthdaySection.offsetTop;
                const currentY = window.scrollY;
                const distance = Math.max(0, targetY - currentY);
                if (distance > 0) {
                    currentSpeed = distance / 180;
                } else {
                    currentSpeed = 100;
                }
            } else {
                currentSpeed = 100;
            }

            rafId = requestAnimationFrame(step);
        }
    }

    // ==================== 初始化 ====================
    initStarfield();
    renderWall();
    renderFootprintMap();
    renderTimeline();
    observeTimeline();
    initThemeObserver();
    initScrollHint();
    initScrollProgress();
    renderHeartbeatMoments();
    initLoveLetter();
    initMeaningSection();
    initBirthdayTransition();
    initBirthdaySection();
    initFireworks();
    initMilestones();
    initMusicPlayer();
    initInviteSection();
    initClickHearts();
    initAutoScroll();
})();
