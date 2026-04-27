let overviewChartByDay = null;
let overviewChartByMerchant = null;

async function renderOverview() {
    const root = document.getElementById("tab-overview");
    root.innerHTML = '<div class="loader">Загрузка...</div>';
    if (!state.supabase) return;

    const [start, end] = periodToRange(state.period);
    let q = state.supabase.from("expenses").select("amount,merchant,spent_at");
    if (start) q = q.gte("spent_at", start);
    if (end)   q = q.lte("spent_at", end);
    const { data, error } = await q;
    if (error) { root.innerHTML = `<div class="error">${error.message}</div>`; return; }

    const total = data.reduce((s, r) => s + Number(r.amount), 0);
    const byDay = {};
    const byMerch = {};
    for (const r of data) {
        const day = r.spent_at.slice(0, 10);
        byDay[day] = (byDay[day] || 0) + Number(r.amount);
        byMerch[r.merchant] = (byMerch[r.merchant] || 0) + Number(r.amount);
    }
    const days = Object.keys(byDay).sort();
    const top = Object.entries(byMerch).sort((a, b) => b[1] - a[1]).slice(0, 10);

    root.innerHTML = `
        <div class="big-number">${formatRub(total)}</div>
        <div class="big-number-label">Всего за период (${data.length} покупок)</div>
        <canvas id="chart-by-day" height="120"></canvas>
        <h3 style="margin-top:24px">Топ-10 мерчантов</h3>
        <div id="merchant-list"></div>
        <canvas id="chart-by-merchant" height="200" style="margin-top:16px"></canvas>
    `;

    document.getElementById("merchant-list").innerHTML = top
        .map(([m, s]) => `<div class="merchant-row"><span>${escapeHtml(m)}</span><strong>${formatRub(s)}</strong></div>`)
        .join("");

    if (overviewChartByDay) overviewChartByDay.destroy();
    overviewChartByDay = new Chart(document.getElementById("chart-by-day"), {
        type: "bar",
        data: { labels: days, datasets: [{ data: days.map(d => byDay[d]), backgroundColor: "#2481cc" }] },
        options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { autoSkip: true } } } },
    });
    if (overviewChartByMerchant) overviewChartByMerchant.destroy();
    overviewChartByMerchant = new Chart(document.getElementById("chart-by-merchant"), {
        type: "doughnut",
        data: {
            labels: top.map(([m]) => m),
            datasets: [{ data: top.map(([, s]) => s) }],
        },
    });
}

function formatRub(n) {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
