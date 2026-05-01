async function renderExpenses() {
    const root = document.getElementById("tab-expenses");
    if (!state.supabase) { root.innerHTML = ""; return; }

    root.innerHTML = `
        <div class="search-box"><input type="search" class="search-input" id="exp-search" placeholder="Найти трату…"></div>
        <div id="exp-list">
            <div class="card skeleton" style="height:120px"></div>
            <div class="card skeleton" style="height:120px"></div>
        </div>
    `;

    const [start, end] = periodToRange(state.period);
    let q = state.supabase.from("expenses").select("*").order("spent_at", { ascending: false });
    if (start) q = q.gte("spent_at", start);
    if (end)   q = q.lte("spent_at", end);
    const { data, error } = await q;
    if (error) {
        document.getElementById("exp-list").innerHTML = `<div class="error-state card">${escapeHtml(error.message)}</div>`;
        return;
    }

    function paint(filter) {
        const f = filter.toLowerCase();
        const rows = (data || []).filter(r =>
            !f
            || r.merchant.toLowerCase().includes(f)
            || (r.description || "").toLowerCase().includes(f)
        );
        const listEl = document.getElementById("exp-list");
        if (rows.length === 0) {
            listEl.innerHTML = `
                <div class="card empty-state">
                    <p class="empty-title">${f ? "Ничего не найдено" : "Тут пока пусто"}</p>
                    <p class="empty-hint">${f ? "Попробуй другой запрос" : "Пришли скрин чека боту"}</p>
                </div>
            `;
            return;
        }
        const byDay = {};
        for (const r of rows) {
            const d = r.spent_at.slice(0, 10);
            (byDay[d] ||= []).push(r);
        }
        listEl.innerHTML = Object.keys(byDay).sort().reverse().map(d => `
            <div class="day-card">
                <div class="day-label">${formatDayLabel(d)}</div>
                ${byDay[d].map(r => `
                    <div class="expense-row" data-id="${r.id}">
                        <div class="merchant">${escapeHtml(r.merchant)}</div>
                        ${r.description ? `<div class="desc">${escapeHtml(r.description)}</div>` : ""}
                        <div class="amount">${formatNumber(Number(r.amount))} ₽</div>
                    </div>
                `).join("")}
            </div>
        `).join("");
        listEl.querySelectorAll(".expense-row").forEach(bindSwipe);
    }

    function bindSwipe(row) {
        let startX = null, dx = 0;
        const inner = row;

        const bg = document.createElement("div");
        bg.className = "swipe-bg";
        bg.textContent = "Удалить";
        row.appendChild(bg);

        row.addEventListener("pointerdown", (e) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;
            startX = e.clientX;
            dx = 0;
            row.setPointerCapture(e.pointerId);
            row.classList.add("swiping");
        });
        row.addEventListener("pointermove", (e) => {
            if (startX === null) return;
            dx = Math.min(0, e.clientX - startX);
            const limit = -row.offsetWidth * 0.4;
            const clamped = Math.max(limit, dx);
            inner.style.transform = `translateX(${clamped}px)`;
            bg.style.transform = `translateX(${100 + (clamped / row.offsetWidth) * 100}%)`;
        });
        row.addEventListener("pointerup", async (e) => {
            if (startX === null) return;
            startX = null;
            row.classList.remove("swiping");
            const threshold = -row.offsetWidth * 0.4;
            if (dx <= threshold) {
                haptic("medium");
                row.classList.add("removing");
                inner.style.transform = "";
                bg.style.transform = "";
                await new Promise(r => setTimeout(r, 220));
                const id = row.dataset.id;
                if (!DEV) {
                    const { error } = await state.supabase.from("expenses").delete().eq("id", id);
                    if (error) { alert(error.message); return; }
                }
                const idx = data.findIndex(r => String(r.id) === String(id));
                if (idx !== -1) data.splice(idx, 1);
                row.remove();
            } else {
                inner.style.transform = "";
                bg.style.transform = "";
            }
        });
        row.addEventListener("pointercancel", () => {
            startX = null;
            row.classList.remove("swiping");
            inner.style.transform = "";
            bg.style.transform = "";
        });
    }
    paint("");
    document.getElementById("exp-search").oninput = (e) => paint(e.target.value);
}

function formatDayLabel(iso) {
    const months = ["ЯНВ","ФЕВ","МАР","АПР","МАЯ","ИЮН","ИЮЛ","АВГ","СЕН","ОКТ","НОЯ","ДЕК"];
    const weekdays = ["ВОСКРЕСЕНЬЕ","ПОНЕДЕЛЬНИК","ВТОРНИК","СРЕДА","ЧЕТВЕРГ","ПЯТНИЦА","СУББОТА"];
    const d = new Date(iso + "T00:00:00");
    return `${d.getDate()} ${months[d.getMonth()]} · ${weekdays[d.getDay()]}`;
}
