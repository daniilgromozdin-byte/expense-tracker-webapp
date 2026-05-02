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
                        <button class="row-menu-btn" type="button" aria-label="Действия">⋮</button>
                        <div class="merchant">${escapeHtml(r.merchant)}</div>
                        ${r.description ? `<div class="desc">${escapeHtml(r.description)}</div>` : ""}
                        <div class="amount">${formatNumber(Number(r.amount))} ₽</div>
                    </div>
                `).join("")}
            </div>
        `).join("");
        listEl.querySelectorAll(".expense-row").forEach(bindMenu);
    }

    function bindMenu(row) {
        const btn = row.querySelector(".row-menu-btn");
        if (!btn) return;
        btn.onclick = (e) => {
            e.stopPropagation();
            openActionSheet(row);
        };
    }

    function openActionSheet(row) {
        haptic("light");
        const id = row.dataset.id;

        const backdrop = document.createElement("div");
        backdrop.className = "action-sheet-backdrop";

        const sheet = document.createElement("div");
        sheet.className = "action-sheet";
        sheet.innerHTML = `
            <button class="action-sheet-btn kind-expense"  data-action="kind:expense">Трата</button>
            <button class="action-sheet-btn kind-transfer" data-action="kind:transfer">Перевод</button>
            <button class="action-sheet-btn kind-income"   data-action="kind:income">Доход</button>
            <div class="action-sheet-divider"></div>
            <button class="action-sheet-btn delete" data-action="delete">Удалить</button>
            <button class="action-sheet-btn cancel" data-action="cancel">Отмена</button>
        `;

        document.body.appendChild(backdrop);
        document.body.appendChild(sheet);

        requestAnimationFrame(() => {
            backdrop.classList.add("show");
            sheet.classList.add("show");
        });

        function close() {
            backdrop.classList.remove("show");
            sheet.classList.remove("show");
            setTimeout(() => {
                backdrop.remove();
                sheet.remove();
            }, 250);
        }

        backdrop.onclick = close;

        sheet.querySelectorAll("button").forEach((b) => {
            b.onclick = async () => {
                const action = b.dataset.action;
                if (action === "cancel") {
                    close();
                    return;
                }
                if (action === "delete") {
                    close();
                    await deleteRow(row, id);
                    return;
                }
                const newKind = action.split(":")[1];
                close();
                await reclassifyRow(row, id, newKind);
            };
        });
    }

    async function deleteRow(row, id) {
        if (!DEV) {
            const { error } = await state.supabase.from("transactions").delete().eq("id", id);
            if (error) { alert(error.message); return; }
        }
        haptic("medium");
        row.classList.add("removing");
        await new Promise(r => setTimeout(r, 220));
        const idx = data.findIndex(r => String(r.id) === String(id));
        if (idx !== -1) data.splice(idx, 1);
        row.remove();
    }

    async function reclassifyRow(row, id, newKind) {
        if (!DEV) {
            const { error } = await state.supabase
                .from("transactions").update({ kind: newKind }).eq("id", id);
            if (error) { alert(error.message); return; }
        }
        haptic("medium");

        if (newKind !== state.kindFilter) {
            row.classList.add("removing");
            await new Promise(r => setTimeout(r, 220));
            const idx = data.findIndex(r => String(r.id) === String(id));
            if (idx !== -1) data.splice(idx, 1);
            row.remove();
        } else {
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
