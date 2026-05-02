// ==================== Dev mock ====================
// Открыть как ?dev=1 для локальной визуальной правки без Telegram.
const DEV = new URLSearchParams(location.search).get("dev") === "1";

if (DEV) {
    window.Telegram = window.Telegram || {};
    window.Telegram.WebApp = {
        ready: () => {},
        expand: () => {},
        initData: "DEV_MOCK",
        get colorScheme() {
            return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        },
        HapticFeedback: { impactOccurred: () => {} },
        onEvent: (name, cb) => {
            if (name === "themeChanged") {
                matchMedia("(prefers-color-scheme: dark)").addEventListener("change", cb);
            }
        },
    };
}

// ==================== Theme & haptic ====================
const tg = window.Telegram.WebApp;

function applyTheme() {
    document.body.dataset.theme = tg.colorScheme || "light";
}

function haptic(type = "light") {
    try { tg.HapticFeedback.impactOccurred(type); } catch (_) {}
}

// ==================== Top progress bar ====================
let progressTimer = null;
function startProgress() {
    const el = document.getElementById("top-progress");
    if (!el) return;
    el.classList.add("active");
    el.style.width = "0%";
    let pct = 0;
    clearInterval(progressTimer);
    progressTimer = setInterval(() => {
        pct = Math.min(90, pct + Math.random() * 12);
        el.style.width = pct + "%";
    }, 180);
}
function stopProgress() {
    const el = document.getElementById("top-progress");
    if (!el) return;
    clearInterval(progressTimer);
    el.style.width = "100%";
    setTimeout(() => {
        el.classList.remove("active");
        el.style.width = "0%";
    }, 220);
}

applyTheme();
tg.onEvent("themeChanged", () => {
    applyTheme();
    if (typeof onThemeChanged === "function") onThemeChanged();
});

// Глобальное состояние
const state = {
    period: "month",
    tab: "overview",
    kindFilter: "expense",   // 'expense' | 'transfer' | 'income'
    supabase: null,
    user: null,
};

tg.ready();
tg.expand();

(async function init() {
    const initData = tg.initData;
    if (!initData) {
        document.querySelector("main").innerHTML = '<div class="error-state">Открой через Telegram</div>';
        return;
    }

    if (DEV) {
        // В dev-режиме пропускаем edge-function и используем фейковые данные.
        state.user = { id: "dev-user", first_name: "Даня" };
        document.getElementById("hello").textContent = `Привет, ${state.user.first_name}`;
        state.supabase = makeDevSupabase();
        bindNav();
        startProgress();
        try {
            if (typeof renderOverview === "function") await renderOverview();
        } finally {
            stopProgress();
        }
        return;
    }

    let resp;
    try {
        resp = await fetch(`${window.EDGE_URL}/verify-initdata`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData }),
        });
    } catch (e) {
        document.querySelector("main").innerHTML = '<div class="error-state">Сеть недоступна</div>';
        return;
    }
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        document.querySelector("main").innerHTML =
            `<div class="error-state">${err.error || "Авторизация не прошла"}</div>`;
        return;
    }
    const { jwt, user_id, first_name } = await resp.json();
    state.user = { id: user_id, first_name };
    document.getElementById("hello").textContent = `Привет, ${first_name}`;

    state.supabase = window.supabase.createClient(
        window.SUPABASE_URL,
        window.SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${jwt}` } } },
    );

    bindNav();
    startProgress();
    try {
        if (typeof renderOverview === "function") await renderOverview();
    } finally {
        stopProgress();
    }
})();

// ==================== Dev fake supabase client ====================
function makeDevSupabase() {
    const fakeExpenses = generateFakeExpenses();
    const fakeInsights = [{
        period: "2026-05",
        content: "В апреле ты потратил на еду 18 200 ₽ — это на 22% больше марта.\n\n*Половина — Пятёрочка и Магнит, средний чек 470 ₽.*",
        generated_at: new Date().toISOString(),
    }];
    function builder(table) {
        let rows = table === "transactions" ? [...fakeExpenses]
                  : table === "expense_insights" ? [...fakeInsights]
                  : [];
        const api = {
            select: () => api,
            order:  () => api,
            limit:  () => api,
            eq:     (col, val) => { rows = rows.filter(r => r[col] === val); return api; },
            gte:    (col, val) => { rows = rows.filter(r => r[col] >= val); return api; },
            lte:    (col, val) => { rows = rows.filter(r => r[col] <= val); return api; },
            insert: () => Promise.resolve({ data: null, error: null }),
            delete: () => Promise.resolve({ data: null, error: null }),
            update: (patch) => Promise.resolve({
                data: rows.map(r => ({ ...r, ...patch })), error: null
            }),
            then:   (resolve) => resolve({ data: rows, error: null }),
        };
        return api;
    }
    return { from: builder };
}

function generateFakeExpenses() {
    const expense_merchants = ["Пятёрочка","Магнит","Яндекс Такси","Wildberries","Старбакс","Перекрёсток","ВкусВилл","OZON","Аптека","Книжный"];
    const transfer_merchants = ["Иван И.", "Мария К.", "Tinkoff → Альфа", "Сергей Н."];
    const income_merchants = ["Зарплата ООО Ромашка", "Премия", "Возврат WB"];
    const today = new Date();
    const out = [];
    let id = 0;
    for (let i = 0; i < 50; i++) {
        const d = new Date(today); d.setDate(today.getDate() - Math.floor(Math.random() * 30));
        const m = expense_merchants[Math.floor(Math.random() * expense_merchants.length)];
        out.push({
            id: "fake-" + (id++),
            merchant: m,
            amount: Math.floor(50 + Math.random() * 3000),
            currency: "RUB",
            description: Math.random() < 0.4 ? "молоко, хлеб" : null,
            spent_at: d.toISOString(),
            created_at: d.toISOString(),
            kind: "expense",
        });
    }
    for (let i = 0; i < 8; i++) {
        const d = new Date(today); d.setDate(today.getDate() - Math.floor(Math.random() * 30));
        const m = transfer_merchants[Math.floor(Math.random() * transfer_merchants.length)];
        out.push({
            id: "fake-" + (id++),
            merchant: m,
            amount: Math.floor(1000 + Math.random() * 50000),
            currency: "RUB",
            description: null,
            spent_at: d.toISOString(),
            created_at: d.toISOString(),
            kind: "transfer",
        });
    }
    for (let i = 0; i < 2; i++) {
        const d = new Date(today); d.setDate(today.getDate() - Math.floor(Math.random() * 30));
        const m = income_merchants[Math.floor(Math.random() * income_merchants.length)];
        out.push({
            id: "fake-" + (id++),
            merchant: m,
            amount: Math.floor(50000 + Math.random() * 100000),
            currency: "RUB",
            description: null,
            spent_at: d.toISOString(),
            created_at: d.toISOString(),
            kind: "income",
        });
    }
    return out;
}

function bindNav() {
    document.querySelectorAll("#period-switcher button").forEach((btn) => {
        btn.onclick = () => {
            document.querySelectorAll("#period-switcher button").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            state.period = btn.dataset.p;
            haptic("light");
            renderActive();
        };
    });

    const tabBtns = document.querySelectorAll("#tabs button");
    const indicator = document.querySelector(".tab-indicator");
    function moveIndicator(idx) {
        if (indicator) indicator.style.transform = `translateX(${idx * 100}%)`;
    }
    tabBtns.forEach((btn, idx) => {
        btn.onclick = () => {
            tabBtns.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
            const id = `tab-${btn.dataset.tab}`;
            document.getElementById(id).classList.add("active");
            state.tab = btn.dataset.tab;
            moveIndicator(idx);
            haptic("light");
            renderActive();
        };
    });
}

async function renderActive() {
    startProgress();
    try {
        if (state.tab === "overview" && typeof renderOverview === "function") await renderOverview();
        else if (state.tab === "expenses" && typeof renderExpenses === "function") await renderExpenses();
        else if (state.tab === "insights" && typeof renderInsights === "function") await renderInsights();
    } finally {
        stopProgress();
    }
}

function switchToTabWithKind(tabName, kind) {
    state.kindFilter = kind;
    const btn = document.querySelector(`#tabs button[data-tab="${tabName}"]`);
    if (btn) btn.click();
}

function periodToRange(period) {
    const now = new Date();
    if (period === "week") {
        const start = new Date(now); start.setDate(now.getDate() - 6);
        return [start.toISOString(), now.toISOString()];
    }
    if (period === "month") {
        return [new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), now.toISOString()];
    }
    if (period === "year") {
        return [new Date(now.getFullYear(), 0, 1).toISOString(), now.toISOString()];
    }
    return [null, null]; // all
}

// ==================== Scroll shadow ====================
window.addEventListener("scroll", () => {
    document.body.classList.toggle("scrolled", window.scrollY > 4);
}, { passive: true });

// ==================== Header height tracker ====================
function updateHeaderHeight() {
    const h = document.querySelector("header");
    if (!h) return;
    document.documentElement.style.setProperty("--header-h", h.offsetHeight + "px");
}
if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(updateHeaderHeight);
    queueMicrotask(() => {
        const h = document.querySelector("header");
        if (h) ro.observe(h);
        updateHeaderHeight();
    });
} else {
    window.addEventListener("load", updateHeaderHeight);
    window.addEventListener("resize", updateHeaderHeight);
}

// ==================== Chart.js setup ====================
const CHART_PALETTE = [
    '#D88A6B', '#D4A574', '#9DB892', '#A07655',
    '#E8B49A', '#A07380', '#C9B894'
];

function getCSSVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function setChartDefaults() {
    const C = window.Chart;
    if (!C) return;
    C.defaults.font.family = "'Inter', system-ui, sans-serif";
    C.defaults.font.size = 12;
    C.defaults.color = getCSSVar('--text-secondary');
    C.defaults.borderColor = getCSSVar('--border');
    C.defaults.plugins.legend.display = false;
    C.defaults.plugins.tooltip.backgroundColor = getCSSVar('--surface');
    C.defaults.plugins.tooltip.titleColor = getCSSVar('--text-primary');
    C.defaults.plugins.tooltip.bodyColor = getCSSVar('--text-primary');
    C.defaults.plugins.tooltip.borderColor = getCSSVar('--border');
    C.defaults.plugins.tooltip.borderWidth = 1;
    C.defaults.plugins.tooltip.padding = 10;
    C.defaults.plugins.tooltip.displayColors = false;
    C.defaults.plugins.tooltip.titleFont = { family: "'Inter'", weight: '600', size: 12 };
    C.defaults.plugins.tooltip.bodyFont = { family: "'Inter'", weight: '400', size: 12 };
}
setChartDefaults();

// Хук, вызываемый из applyTheme при смене темы
function onThemeChanged() {
    setChartDefaults();
    if (overviewChartByDay) {
        overviewChartByDay.data.datasets[0].backgroundColor = getCSSVar('--accent-primary');
        overviewChartByDay.update();
    }
    if (overviewChartByMerchant) {
        overviewChartByMerchant.data.datasets[0].borderColor = getCSSVar('--surface');
        overviewChartByMerchant.update();
    }
}
