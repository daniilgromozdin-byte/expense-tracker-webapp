let overviewChartByDay = null;
let overviewChartByMerchant = null;

async function renderOverview() {
    const root = document.getElementById("tab-overview");
    if (!state.supabase) { root.innerHTML = ""; return; }

    root.innerHTML = renderSkeletonOverview();

    const [start, end] = periodToRange(state.period);
    let q = state.supabase.from("expenses").select("amount,merchant,spent_at");
    if (start) q = q.gte("spent_at", start);
    if (end)   q = q.lte("spent_at", end);
    const { data, error } = await q;
    if (error) { root.innerHTML = `<div class="error-state card">${escapeHtml(error.message)}</div>`; return; }

    if (!data || data.length === 0) { root.innerHTML = renderEmptyOverview(); return; }

    const total = data.reduce((s, r) => s + Number(r.amount), 0);
    const byDay = {};
    const byMerch = {};
    for (const r of data) {
        const day = r.spent_at.slice(0, 10);
        byDay[day] = (byDay[day] || 0) + Number(r.amount);
        byMerch[r.merchant] = (byMerch[r.merchant] || 0) + Number(r.amount);
    }
    const days = Object.keys(byDay).sort();
    const top = Object.entries(byMerch).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const totalTop = top.reduce((s, [, v]) => s + v, 0);
    const restCount = Object.keys(byMerch).length - top.length;
    const restSum = total - totalTop;

    root.innerHTML = `
        <section class="card big-number-card">
            <div class="big-number-label">${periodLabel(state.period)}</div>
            <div class="big-number">${formatNumber(total)}<span class="currency">₽</span></div>
            <div class="big-number-delta">${data.length} ${pluralize(data.length, ["покупка","покупки","покупок"])}</div>
        </section>
        <section class="card chart-card">
            <h3 class="card-title">Траты по дням</h3>
            <div class="chart-canvas-wrap"><canvas id="chart-by-day"></canvas></div>
        </section>
        <section class="card merchants-card">
            <h3 class="card-title">Топ мерчантов</h3>
            <div class="merchants-grid">
                <div class="donut-wrap">
                    <canvas id="chart-by-merchant"></canvas>
                    <div class="donut-center">
                        <div class="donut-total">${formatNumber(total)} ₽</div>
                        <div class="donut-label">всего</div>
                    </div>
                </div>
                <ul class="merchants-list">
                    ${top.map(([m, s], i) => `
                        <li>
                            <span class="dot" style="background:${CHART_PALETTE[i]}"></span>
                            <span class="m-name">${escapeHtml(m)}</span>
                            <span class="m-sum">${formatNumber(s)} ₽</span>
                        </li>
                    `).join("")}
                    ${restCount > 0 ? `<li class="rest">Ещё ${restCount} · ${formatNumber(restSum)} ₽</li>` : ""}
                </ul>
            </div>
        </section>
    `;

    if (overviewChartByDay) overviewChartByDay.destroy();
    overviewChartByDay = new Chart(document.getElementById("chart-by-day"), {
        type: "bar",
        data: {
            labels: days.map(d => d.slice(8)),
            datasets: [{
                data: days.map(d => byDay[d]),
                backgroundColor: getCSSVar('--accent-primary'),
                borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
                borderSkipped: false,
                barPercentage: 0.7,
                categoryPercentage: 0.85,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false }, border: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 7, color: getCSSVar('--text-secondary'), font: { size: 11 } } },
                y: { display: false },
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        title: (items) => `${items[0].label}`,
                        label: (item) => `${formatNumber(item.parsed.y)} ₽`,
                    },
                },
            },
        },
    });

    if (overviewChartByMerchant) overviewChartByMerchant.destroy();
    overviewChartByMerchant = new Chart(document.getElementById("chart-by-merchant"), {
        type: "doughnut",
        data: {
            labels: top.map(([m]) => m),
            datasets: [{
                data: top.map(([, s]) => s),
                backgroundColor: CHART_PALETTE.slice(0, top.length),
                borderColor: getCSSVar('--surface'),
                borderWidth: 2,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '62%',
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (item) => `${item.label}: ${formatNumber(item.parsed)} ₽`,
                    },
                },
            },
        },
    });
}

function renderSkeletonOverview() {
    return `
        <section class="card skeleton" style="height:140px"></section>
        <section class="card skeleton" style="height:220px"></section>
        <section class="card skeleton" style="height:280px"></section>
    `;
}

function renderEmptyOverview() {
    return `
        <section class="card empty-state">
            <p class="empty-title">Тут пока пусто</p>
            <p class="empty-hint">Пришли скрин чека боту</p>
        </section>
    `;
}

function periodLabel(p) {
    return p === "week"  ? "ПОТРАЧЕНО ЗА НЕДЕЛЮ"
         : p === "month" ? "ПОТРАЧЕНО ЗА МЕСЯЦ"
         : p === "year"  ? "ПОТРАЧЕНО ЗА ГОД"
         : "ПОТРАЧЕНО ЗА ВСЁ ВРЕМЯ";
}

function formatNumber(n) {
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

function formatRub(n) {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);
}

function pluralize(n, [a, b, c]) {
    const m10 = n % 10, m100 = n % 100;
    if (m100 >= 11 && m100 <= 19) return c;
    if (m10 === 1) return a;
    if (m10 >= 2 && m10 <= 4) return b;
    return c;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
