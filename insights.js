async function renderInsights() {
    const root = document.getElementById("tab-insights");
    root.innerHTML = '<div class="loader">Загрузка...</div>';
    if (!state.supabase) return;

    const period = periodToInsightKey(state.period);

    const { data, error } = await state.supabase
        .from("expense_insights").select("*")
        .eq("period", period).limit(1);
    if (error) { root.innerHTML = `<div class="error">${error.message}</div>`; return; }

    const cached = data && data[0];
    root.innerHTML = `
        ${cached ? `
            <div style="white-space:pre-wrap;line-height:1.5">${escapeHtml(cached.content)}</div>
            <div style="color:var(--hint);margin-top:16px;font-size:12px">
                Сгенерировано: ${new Date(cached.generated_at).toLocaleString("ru-RU")}
            </div>
        ` : '<div class="loader">Советов ещё нет</div>'}
        <button id="refresh-ins" style="margin-top:24px;width:100%;padding:12px;background:var(--button);color:var(--button-text);border:none;border-radius:6px;cursor:pointer">
            🔄 Обновить советы
        </button>
    `;

    document.getElementById("refresh-ins").onclick = async () => {
        const btn = document.getElementById("refresh-ins");
        btn.disabled = true; btn.textContent = "Запрашиваю у бота...";
        const { error: insErr } = await state.supabase
            .from("insights_requests")
            .insert({ user_id: state.user.id, period, status: "pending" });
        if (insErr) { btn.textContent = "Ошибка: " + insErr.message; btn.disabled = false; return; }
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 3000));
            const { data: fresh } = await state.supabase
                .from("expense_insights").select("*")
                .eq("period", period).limit(1);
            if (fresh && fresh[0] && new Date(fresh[0].generated_at) > new Date(cached?.generated_at || 0)) {
                renderInsights();
                return;
            }
        }
        btn.textContent = "Не дождался ответа. Попробуй позже.";
        btn.disabled = false;
    };
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
