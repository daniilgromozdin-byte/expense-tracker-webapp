async function renderInsights() {
    const root = document.getElementById("tab-insights");
    if (!state.supabase) { root.innerHTML = ""; return; }

    root.innerHTML = `<div class="card skeleton" style="height:60px"></div><div class="card skeleton" style="height:200px"></div>`;

    const period = periodToInsightKey(state.period);

    const { data, error } = await state.supabase
        .from("expense_insights").select("*")
        .eq("period", period).limit(1);
    if (error) {
        root.innerHTML = `<div class="error-state card">${escapeHtml(error.message)}</div>`;
        return;
    }

    const cached = data && data[0];
    root.innerHTML = `
        <button id="refresh-ins" class="btn-primary">Обновить советы</button>
        ${cached ? `
            <article class="card">
                <div class="insights-text">${renderMarkdown(cached.content)}</div>
                <div class="insights-meta">Обновлено ${new Date(cached.generated_at).toLocaleString("ru-RU")}</div>
            </article>
        ` : `
            <article class="card">
                <p class="insights-text-empty">Здесь появятся наблюдения после первых трат</p>
            </article>
        `}
    `;

    const btn = document.getElementById("refresh-ins");
    btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = "Готовлю советы…";
        haptic("light");

        if (DEV) {
            await new Promise(r => setTimeout(r, 800));
            btn.disabled = false;
            btn.textContent = "Обновить советы";
            renderInsights();
            return;
        }

        const { error: insErr } = await state.supabase
            .from("insights_requests")
            .insert({ user_id: state.user.id, period, status: "pending" });
        if (insErr) {
            btn.textContent = "Ошибка: " + insErr.message;
            btn.disabled = false;
            return;
        }
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 3000));
            const { data: fresh } = await state.supabase
                .from("expense_insights").select("*")
                .eq("period", period).limit(1);
            if (fresh && fresh[0] && new Date(fresh[0].generated_at) > new Date(cached?.generated_at || 0)) {
                btn.disabled = false;
                btn.textContent = "Обновить советы";
                renderInsights();
                return;
            }
        }
        btn.textContent = "Не дождался ответа. Попробуй позже.";
        btn.disabled = false;
    };
}

function renderMarkdown(text) {
    // Простой парсер: **bold**, *italic*, числа в span.num.
    const escaped = escapeHtml(text);
    return escaped
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/(\d[\d\s]*\s?₽)/g, '<span class="num">$1</span>')
        .replace(/\n/g, "<br>");
}

function periodToInsightKey(period) {
    const now = new Date();
    if (period === "month") return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    if (period === "year")  return String(now.getFullYear());
    if (period === "week")  return `${now.getFullYear()}-W${getISOWeek(now).toString().padStart(2,"0")}`;
    return "all";
}

function getISOWeek(d) {
    const t = new Date(d.valueOf());
    t.setDate(t.getDate() + 4 - (t.getDay() || 7));
    const yearStart = new Date(t.getFullYear(), 0, 1);
    return Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
}
