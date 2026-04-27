// Глобальное состояние
const state = {
    period: "month",
    tab: "overview",
    supabase: null,
    user: null,
};

window.Telegram.WebApp.ready();
window.Telegram.WebApp.expand();

(async function init() {
    const tg = window.Telegram && window.Telegram.WebApp;
    const initData = tg && tg.initData;
    if (!initData) {
        const debug = {
            hasWindowTelegram: !!window.Telegram,
            hasWebApp: !!tg,
            initDataLength: (tg && tg.initData && tg.initData.length) || 0,
            platform: tg && tg.platform,
            version: tg && tg.version,
            colorScheme: tg && tg.colorScheme,
            initDataUnsafe: tg && tg.initDataUnsafe,
        };
        document.querySelector("main").innerHTML =
            '<div class="error">Открой через Telegram</div>' +
            '<pre style="font-size:10px;text-align:left;padding:8px;background:#1a1a1a;color:#ccc;overflow:auto">' +
            JSON.stringify(debug, null, 2) + '</pre>';
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
        document.querySelector("main").innerHTML = '<div class="error">Сеть недоступна</div>';
        return;
    }
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        document.querySelector("main").innerHTML =
            `<div class="error">${err.error || "Авторизация не прошла"}</div>`;
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
    if (typeof renderOverview === "function") await renderOverview();
})();

function bindNav() {
    document.querySelectorAll("#period-switcher button").forEach((btn) => {
        btn.onclick = () => {
            document.querySelectorAll("#period-switcher button").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            state.period = btn.dataset.p;
            renderActive();
        };
    });
    document.querySelectorAll("#tabs button").forEach((btn) => {
        btn.onclick = () => {
            document.querySelectorAll("#tabs button").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
            const id = `tab-${btn.dataset.tab}`;
            document.getElementById(id).classList.add("active");
            state.tab = btn.dataset.tab;
            renderActive();
        };
    });
}

function renderActive() {
    if (state.tab === "overview" && typeof renderOverview === "function") renderOverview();
    else if (state.tab === "expenses" && typeof renderExpenses === "function") renderExpenses();
    else if (state.tab === "insights" && typeof renderInsights === "function") renderInsights();
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
