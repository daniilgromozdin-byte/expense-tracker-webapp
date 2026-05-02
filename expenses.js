async function renderExpenses() {
    const root = document.getElementById("tab-expenses");
    if (!state.supabase) { root.innerHTML = ""; return; }

    root.innerHTML = `
        <div class="kind-switcher" role="tablist">
            <button class="kind-pill ${state.kindFilter === 'expense'  ? 'active' : ''}" data-kind="expense">Траты</button>
            <button class="kind-pill ${state.kindFilter === 'transfer' ? 'active' : ''}" data-kind="transfer">Переводы</button>
            <button class="kind-pill ${state.kindFilter === 'income'   ? 'active' : ''}" data-kind="income">Доход</button>
        </div>
        <div class="search-box"><input type="search" class="search-input" id="exp-search" placeholder="Найти трату…"></div>
        <div id="exp-list">
            <div class="card skeleton" style="height:120px"></div>
            <div class="card skeleton" style="height:120px"></div>
        </div>
    `;

    document.querySelectorAll(".kind-pill").forEach((btn) => {
        btn.onclick = () => {
            document.querySelectorAll(".kind-pill").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            state.kindFilter = btn.dataset.kind;
            haptic("light");
            renderExpenses();
        };
    });

    const [start, end] = periodToRange(state.period);
    let q = state.supabase.from("transactions").select("*").eq("kind", state.kindFilter).order("spent_at", { ascending: false });
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
            const emptyByKind = {
                expense:  { title: f ? "Ничего не найдено" : "Тут пока пусто",                   hint: f ? "Попробуй другой запрос" : "Пришли скрин чека боту" },
                transfer: { title: f ? "Ничего не найдено" : "Переводов за этот период нет",     hint: f ? "Попробуй другой запрос" : "Переводы появятся когда ты их пометишь" },
                income:   { title: f ? "Ничего не найдено" : "Доход не зафиксирован",            hint: f ? "Попробуй другой запрос" : "Поступления появятся после получения зарплаты" },
            };
            const e = emptyByKind[state.kindFilter];
            listEl.innerHTML = `
                <div class="card empty-state">
                    <p class="empty-title">${e.title}</p>
                    <p class="empty-hint">${e.hint}</p>
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
        let startX = null, dx = 0, direction = null;
        const inner = row;

        const bg = document.createElement("div");
        bg.className = "swipe-bg";
        bg.textContent = "Удалить";
        row.appendChild(bg);

        const actions = document.createElement("div");
        actions.className = "swipe-actions";
        actions.innerHTML = `
            <button class="kind-expense"  data-kind="expense">Трата</button>
            <button class="kind-transfer" data-kind="transfer">Перевод</button>
            <button class="kind-income"   data-kind="income">Доход</button>
        `;
        row.appendChild(actions);

        actions.querySelectorAll("button").forEach((btn) => {
            btn.onclick = (e) => {
                e.stopPropagation();
                reclassify(row, row.dataset.id, btn.dataset.kind);
            };
        });

        row.addEventListener("pointerdown", (e) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;
            if (e.target.closest(".swipe-actions")) return;
            startX = e.clientX;
            dx = 0;
            direction = null;
            row.setPointerCapture(e.pointerId);
            row.classList.add("swiping");
        });
        row.addEventListener("pointermove", (e) => {
            if (startX === null) return;
            dx = e.clientX - startX;
            if (direction === null && Math.abs(dx) > 6) direction = dx > 0 ? "right" : "left";
            if (direction === "left") {
                const limit = -row.offsetWidth * 0.4;
                const clamped = Math.max(limit, Math.min(0, dx));
                inner.style.transform = `translateX(${clamped}px)`;
                bg.style.transform = `translateX(${100 + (clamped / row.offsetWidth) * 100}%)`;
            } else if (direction === "right") {
                const limit = row.offsetWidth * 0.6;
                const clamped = Math.min(limit, Math.max(0, dx));
                inner.style.transform = `translateX(${clamped}px)`;
                actions.style.transform = `translateX(${-100 + (clamped / row.offsetWidth) * 100}%)`;
            }
        });
        row.addEventListener("pointerup", async (e) => {
            if (startX === null) return;
            startX = null;
            row.classList.remove("swiping");
            if (direction === "left") {
                const threshold = -row.offsetWidth * 0.4;
                if (dx <= threshold) {
                    haptic("medium");
                    row.classList.add("removing");
                    inner.style.transform = "";
                    bg.style.transform = "";
                    await new Promise(r => setTimeout(r, 220));
                    const id = row.dataset.id;
                    if (!DEV) {
                        const { error } = await state.supabase.from("transactions").delete().eq("id", id);
                        if (error) { alert(error.message); return; }
                    }
                    const idx = data.findIndex(r => String(r.id) === String(id));
                    if (idx !== -1) data.splice(idx, 1);
                    row.remove();
                } else {
                    inner.style.transform = "";
                    bg.style.transform = "";
                }
            } else if (direction === "right") {
                const threshold = row.offsetWidth * 0.4;
                if (dx >= threshold) {
                    haptic("light");
                    row.classList.add("reclass-revealed");
                    inner.style.transform = "";
                    actions.style.transform = "";
                } else {
                    inner.style.transform = "";
                    actions.style.transform = "";
                }
            }
        });
        row.addEventListener("pointercancel", () => {
            startX = null;
            direction = null;
            row.classList.remove("swiping");
            inner.style.transform = "";
            bg.style.transform = "";
            actions.style.transform = "";
        });
    }

    async function reclassify(row, id, newKind) {
        if (!DEV) {
            const { error } = await state.supabase
                .from("transactions").update({ kind: newKind }).eq("id", id);
            if (error) {
                alert(error.message);
                row.classList.remove("reclass-revealed");
                return;
            }
        }
        haptic("medium");

        if (newKind !== state.kindFilter) {
            row.classList.add("removing");
            await new Promise(r => setTimeout(r, 220));
            const idx = data.findIndex(r => String(r.id) === String(id));
            if (idx !== -1) data.splice(idx, 1);
            row.remove();
        } else {
            row.classList.remove("reclass-revealed");
            row.classList.add("reclassified");
            const t = data.find(r => String(r.id) === String(id));
            if (t) t.kind = newKind;
            setTimeout(() => row.classList.remove("reclassified"), 400);
        }
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
