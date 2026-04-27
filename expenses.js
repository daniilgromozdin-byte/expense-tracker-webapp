async function renderExpenses() {
    const root = document.getElementById("tab-expenses");
    root.innerHTML = `
        <input type="search" class="search-input" id="exp-search" placeholder="Поиск по мерчанту или описанию...">
        <div id="exp-list" class="loader">Загрузка...</div>
    `;
    if (!state.supabase) return;

    const [start, end] = periodToRange(state.period);
    let q = state.supabase.from("expenses").select("*").order("spent_at", { ascending: false });
    if (start) q = q.gte("spent_at", start);
    if (end)   q = q.lte("spent_at", end);
    const { data, error } = await q;
    if (error) { root.innerHTML = `<div class="error">${error.message}</div>`; return; }

    function paint(filter) {
        const f = filter.toLowerCase();
        const rows = data.filter(r =>
            !f
            || r.merchant.toLowerCase().includes(f)
            || (r.description || "").toLowerCase().includes(f)
        );
        const byDay = {};
        for (const r of rows) {
            const d = r.spent_at.slice(0, 10);
            (byDay[d] ||= []).push(r);
        }
        const html = Object.keys(byDay).sort().reverse().map(d => `
            <div class="expense-day">${formatDate(d)}</div>
            ${byDay[d].map(r => `
                <div class="expense-row" data-id="${r.id}">
                    <div class="merchant">${escapeHtml(r.merchant)}<span class="amount">${formatRub(Number(r.amount))}</span></div>
                    ${r.description ? `<div class="desc">${escapeHtml(r.description)}</div>` : ""}
                    <button class="del-btn" data-id="${r.id}" style="background:#c00;color:#fff;border:none;padding:4px 8px;border-radius:4px;font-size:12px;margin-top:4px">Удалить</button>
                </div>
            `).join("")}
        `).join("");
        document.getElementById("exp-list").innerHTML = html || '<div class="loader">Нет трат за период</div>';

        document.querySelectorAll(".del-btn").forEach(btn => {
            btn.onclick = async () => {
                if (!confirm("Удалить эту трату?")) return;
                const id = btn.dataset.id;
                const { error } = await state.supabase.from("expenses").delete().eq("id", id);
                if (error) alert(error.message);
                else renderExpenses();
            };
        });
    }
    paint("");
    document.getElementById("exp-search").oninput = (e) => paint(e.target.value);
}

function formatDate(iso) {
    const [y, m, d] = iso.split("-");
    const months = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
    return `${parseInt(d)} ${months[parseInt(m)-1]}`;
}
