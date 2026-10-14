(() => {
    "use strict";

    const STORAGE_KEY = "laojie-burger-board-v1";
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const world = document.querySelector("#world");
    const dialogLayer = document.querySelector("#dialogLayer");
    const composer = document.querySelector("#composer");
    const composerForm = document.querySelector("#composerForm");
    const composerTitle = document.querySelector("#composerTitle");
    const titleInput = document.querySelector("#entryTitle");
    const bodyInput = document.querySelector("#entryBody");
    const assigneeInput = document.querySelector("#taskAssignee");
    const dueInput = document.querySelector("#taskDue");
    const taskFields = document.querySelector("#taskFields");
    const colorField = document.querySelector("#colorField");
    const composeTypeControl = document.querySelector(".compose-type");
    const deleteEntryButton = document.querySelector("#deleteEntry");
    const toastElement = document.querySelector("#toast");

    const inventoryGroups = [
        [
            { id: "buns", name: "面包胚", quantity: "300 个" },
            { id: "beef", name: "牛肉饼", quantity: "200 片" },
            { id: "cheese", name: "芝士片", quantity: "150 片" },
            { id: "lettuce", name: "生菜", quantity: "20 斤" },
            { id: "other-a", name: "其他", quantity: "待填写" },
        ],
        [
            { id: "fries", name: "薯条", quantity: "20 斤" },
            { id: "chicken", name: "炸鸡排", quantity: "80 片" },
            { id: "wings", name: "鸡翅", quantity: "50 对" },
            { id: "onion", name: "洋葱", quantity: "10 斤" },
            { id: "pickles", name: "酸黄瓜", quantity: "5 斤" },
        ],
        [
            { id: "tomato-sauce", name: "番茄酱", quantity: "10 瓶" },
            { id: "salad-sauce", name: "沙拉酱", quantity: "8 瓶" },
            { id: "mustard", name: "黄芥末", quantity: "5 瓶" },
            { id: "pepper", name: "辣椒", quantity: "2 斤" },
            { id: "other-b", name: "其他", quantity: "待填写" },
        ],
    ];

    const safetyItems = [
        "穿戴整洁，工服干净",
        "头发整洁，戴帽/发网",
        "指甲干净，不戴首饰",
        "班前检查，设备卫生",
        "生熟分开，避免交叉",
        "变质食材，及时处理",
        "关闭火源，下班考核",
        "食材温度，符合标准",
        "酱料密封，存放合规",
        "生菜保鲜，今日更换",
        "餐具消毒，今日完成",
    ];

    const defaultState = {
        inventory: Object.fromEntries(
            inventoryGroups.flat().map((item) => [item.id, "ok"]),
        ),
        safety: safetyItems.map(() => true),
        tasks: [
            {
                id: "task-beef",
                title: "经典牛肉堡",
                body: "按标准克重备料",
                assignee: "张三",
                due: "11:30",
                status: "todo",
            },
            {
                id: "task-spicy",
                title: "香辣鸡腿堡",
                body: "午市前完成首批",
                assignee: "李四",
                due: "11:00",
                status: "todo",
            },
            {
                id: "task-angus",
                title: "安格斯厚牛堡",
                body: "新品物料单独摆放",
                assignee: "待认领",
                due: "12:00",
                status: "todo",
            },
            {
                id: "task-fries",
                title: "薯条",
                body: "检查炸油温度",
                assignee: "赵六",
                due: "10:30",
                status: "todo",
            },
            {
                id: "task-juice",
                title: "九珍果汁",
                body: "补齐冷饮区库存",
                assignee: "周八",
                due: "14:00",
                status: "todo",
            },
            {
                id: "task-crispy",
                title: "脆鸡堡",
                body: "首批已完成",
                assignee: "孙七",
                due: "09:40",
                status: "done",
            },
            {
                id: "task-double",
                title: "双层芝士堡",
                body: "首批已完成",
                assignee: "李四",
                due: "09:50",
                status: "done",
            },
            {
                id: "task-wings",
                title: "鸡翅",
                body: "首批已完成",
                assignee: "赵六",
                due: "10:10",
                status: "done",
            },
            {
                id: "task-cola",
                title: "可乐",
                body: "糖浆已更换",
                assignee: "周八",
                due: "10:20",
                status: "done",
            },
        ],
        notes: [
            {
                id: "note-meal",
                title: "15:30 员工餐",
                body: "值班同事先吃，晚班留两份。",
                color: "yellow",
                x: 1132,
                y: 620,
                rotation: -2.2,
                createdAt: "今日",
            },
        ],
    };

    const statusOrder = ["ok", "low", "out"];
    const statusLabels = {
        ok: "已勾",
        low: "待补",
        out: "缺货",
    };

    let state = loadState();
    let composeType = "note";
    let editing = null;
    let lastOpener = null;
    let toastTimer = 0;
    let viewScale = 1;
    let focusZone = "overview";
    let layoutReady = false;

    function cloneDefaults() {
        return JSON.parse(JSON.stringify(defaultState));
    }

    function loadState() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!saved || typeof saved !== "object") return cloneDefaults();
            return {
                inventory: {
                    ...defaultState.inventory,
                    ...(saved.inventory || {}),
                },
                safety:
                    Array.isArray(saved.safety) ?
                        safetyItems.map(
                            (_, index) => saved.safety[index] ?? true,
                        )
                    :   [...defaultState.safety],
                tasks:
                    Array.isArray(saved.tasks) ?
                        saved.tasks
                    :   cloneDefaults().tasks,
                notes:
                    Array.isArray(saved.notes) ?
                        saved.notes
                    :   cloneDefaults().notes,
            };
        } catch {
            return cloneDefaults();
        }
    }

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function uid(prefix) {
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function refreshIcons(root = document) {
        if (window.lucide) {
            window.lucide.createIcons({
                root,
                attrs: { "aria-hidden": "true" },
            });
        }
    }

    function renderInventory() {
        const stack = document.querySelector("#inventoryStack");
        stack.innerHTML = inventoryGroups
            .map(
                (group) => `
          <article class="inventory-card">
            ${group
                .map((item) => {
                    const itemState = state.inventory[item.id] || "ok";
                    return `
                  <button class="inventory-row" type="button" data-inventory-id="${item.id}" title="切换备料状态">
                    <span class="quantity">${escapeHtml(item.name)}　${escapeHtml(item.quantity)}</span>
                    <span class="inventory-status" data-state="${itemState}">（${statusLabels[itemState]}）</span>
                  </button>
                `;
                })
                .join("")}
          </article>
        `,
            )
            .join("");
    }

    function taskMarkup(task) {
        const done = task.status === "done";
        const meta = [task.assignee, task.due].filter(Boolean).join(" · ");
        return `
      <div class="task-item" data-task-id="${task.id}">
        <button class="task-check" type="button" data-toggle-task="${task.id}" aria-label="${done ? "退回待制作" : "标记完成"}" title="${done ? "退回待制作" : "标记完成"}">
          <i data-lucide="${done ? "check" : "circle"}"></i>
        </button>
        <button class="task-content" type="button" data-edit-task="${task.id}">
          <span class="task-title">${escapeHtml(task.title)}</span>
          <span class="task-meta">${escapeHtml(meta || "待认领")}</span>
        </button>
      </div>
    `;
    }

    function renderTasks() {
        const todo = state.tasks.filter((task) => task.status !== "done");
        const done = state.tasks.filter((task) => task.status === "done");
        document.querySelector("#todoList").innerHTML = todo
            .map(taskMarkup)
            .join("");
        document.querySelector("#doneList").innerHTML = done
            .map(taskMarkup)
            .join("");
        refreshIcons(document.querySelector(".task-section"));
    }

    function renderSafety() {
        document.querySelector("#safetyList").innerHTML = safetyItems
            .map(
                (label, index) => `
          <button class="safety-item ${state.safety[index] ? "is-done" : ""}" type="button" data-safety-index="${index}">
            <span class="safety-box" aria-hidden="true"></span>
            <span>${escapeHtml(label)}</span>
          </button>
        `,
            )
            .join("");
    }

    function renderNotes() {
        const container = document.querySelector("#userNotes");
        container.innerHTML = "";

        state.notes.forEach((note) => {
            const element = document.createElement("article");
            element.className = "user-note";
            element.dataset.noteId = note.id;
            element.dataset.color = note.color || "yellow";
            element.style.left = `${note.x}px`;
            element.style.top = `${note.y}px`;
            element.style.setProperty(
                "--note-rotation",
                `${note.rotation || 0}deg`,
            );
            element.style.transform = "rotate(var(--note-rotation))";
            element.setAttribute("role", "button");
            element.setAttribute("tabindex", "0");
            element.setAttribute("aria-label", `编辑留言：${note.title}`);
            element.innerHTML = `
        <h3>${escapeHtml(note.title)}</h3>
        <p>${escapeHtml(note.body)}</p>
        <time>${escapeHtml(note.createdAt || "今日")}</time>
      `;
            attachNoteInteraction(element, note);
            container.appendChild(element);
        });
    }

    function attachNoteInteraction(element, note) {
        let pointerId = null;
        let startX = 0;
        let startY = 0;
        let originX = 0;
        let originY = 0;
        let moved = false;

        element.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) return;
            pointerId = event.pointerId;
            startX = event.clientX;
            startY = event.clientY;
            originX = note.x;
            originY = note.y;
            moved = false;
            element.setPointerCapture(pointerId);
            element.style.zIndex = "20";
            event.preventDefault();
        });

        element.addEventListener("pointermove", (event) => {
            if (event.pointerId !== pointerId) return;
            const dx = (event.clientX - startX) / viewScale;
            const dy = (event.clientY - startY) / viewScale;
            if (Math.hypot(dx, dy) > 8) moved = true;
            if (!moved) return;
            note.x = Math.round(clamp(originX + dx, 18, 1172));
            note.y = Math.round(clamp(originY + dy, 110, 980));
            element.style.left = `${note.x}px`;
            element.style.top = `${note.y}px`;
        });

        const finish = (event) => {
            if (event.pointerId !== pointerId) return;
            if (element.hasPointerCapture(pointerId))
                element.releasePointerCapture(pointerId);
            pointerId = null;
            element.style.zIndex = "";
            if (moved) {
                saveState();
            } else {
                openComposer("note", { kind: "note", id: note.id }, element);
            }
        };

        element.addEventListener("pointerup", finish);
        element.addEventListener("pointercancel", (event) => {
            if (event.pointerId !== pointerId) return;
            note.x = originX;
            note.y = originY;
            element.style.left = `${note.x}px`;
            element.style.top = `${note.y}px`;
            pointerId = null;
            element.style.zIndex = "";
        });
        element.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openComposer("note", { kind: "note", id: note.id }, element);
            }
        });
    }

    function renderAll() {
        renderInventory();
        renderTasks();
        renderSafety();
        renderNotes();
        refreshIcons();
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function cycleInventory(id) {
        const current = state.inventory[id] || "ok";
        const next =
            statusOrder[
                (statusOrder.indexOf(current) + 1) % statusOrder.length
            ];
        state.inventory[id] = next;
        saveState();
        renderInventory();
        const item = inventoryGroups
            .flat()
            .find((candidate) => candidate.id === id);
        showToast(`${item?.name || "物料"}：${statusLabels[next]}`);
    }

    function moveTask(id, destination, sourceElement) {
        const task = state.tasks.find((item) => item.id === id);
        if (!task) return;

        const sourceRect = sourceElement?.getBoundingClientRect();
        let flyer = null;
        if (sourceRect && !reduceMotion.matches) {
            flyer = sourceElement.cloneNode(true);
            flyer.classList.add("task-flyer");
            flyer.style.left = `${sourceRect.left}px`;
            flyer.style.top = `${sourceRect.top}px`;
            flyer.style.width = `${sourceRect.width}px`;
            flyer.style.height = `${sourceRect.height}px`;
            document.body.appendChild(flyer);
        }

        task.status = destination;
        saveState();
        renderTasks();
        const destinationElement = document.querySelector(
            `[data-task-id="${CSS.escape(id)}"]`,
        );

        if (!flyer || !destinationElement) {
            flyer?.remove();
            showToast(destination === "done" ? "任务已完成" : "任务已退回");
            return;
        }

        const destinationRect = destinationElement.getBoundingClientRect();
        destinationElement.style.opacity = "0";
        const deltaX = destinationRect.left - sourceRect.left;
        const deltaY = destinationRect.top - sourceRect.top;
        const scaleX = destinationRect.width / sourceRect.width;
        const scaleY = destinationRect.height / sourceRect.height;

        const animation = flyer.animate(
            [
                { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 },
                {
                    transform: `translate3d(${deltaX * 0.58}px, ${deltaY * 0.34 - 26}px, 0) scale(1.06) rotate(-2deg)`,
                    opacity: 1,
                    offset: 0.54,
                },
                {
                    transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY}) rotate(0deg)`,
                    opacity: 0.9,
                },
            ],
            {
                duration: 560,
                easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                fill: "forwards",
            },
        );

        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            flyer.remove();
            destinationElement.style.opacity = "";
            destinationElement.animate(
                [
                    { transform: "scale(0.82)", opacity: 0.2 },
                    { transform: "scale(1.07)", opacity: 1, offset: 0.7 },
                    { transform: "scale(1)", opacity: 1 },
                ],
                { duration: 300, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
            );
        };
        animation.finished.then(cleanup, cleanup);
        setTimeout(cleanup, 760);
        showToast(destination === "done" ? "任务已完成" : "任务已退回");
    }

    function setComposeType(type) {
        composeType = type;
        document.querySelectorAll("[data-compose-type]").forEach((button) => {
            const active = button.dataset.composeType === type;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-selected", String(active));
        });
        taskFields.hidden = type !== "task";
        colorField.hidden = type === "task";
        composerTitle.textContent =
            editing ?
                type === "task" ?
                    "编辑任务"
                :   "编辑留言"
            : type === "task" ? "发布一项任务"
            : "写一张留言";
    }

    function openComposer(type = "note", editTarget = null, opener = null) {
        lastOpener = opener || document.activeElement;
        editing = editTarget;
        composerForm.reset();
        composeTypeControl.hidden = Boolean(editTarget);
        deleteEntryButton.hidden = !editTarget;
        setComposeType(type);

        if (editTarget?.kind === "task") {
            const task = state.tasks.find((item) => item.id === editTarget.id);
            if (!task) return;
            titleInput.value = task.title;
            bodyInput.value = task.body || "";
            assigneeInput.value = task.assignee || "";
            dueInput.value = task.due || "";
        } else if (editTarget?.kind === "note") {
            const note = state.notes.find((item) => item.id === editTarget.id);
            if (!note) return;
            titleInput.value = note.title;
            bodyInput.value = note.body;
            const colorInput = composerForm.querySelector(
                `[name="color"][value="${CSS.escape(note.color || "yellow")}"]`,
            );
            if (colorInput) colorInput.checked = true;
        }

        dialogLayer.classList.add("is-open");
        dialogLayer.setAttribute("aria-hidden", "false");

        requestAnimationFrame(() => {
            if (opener && !reduceMotion.matches) {
                const source = opener.getBoundingClientRect();
                const target = composer.getBoundingClientRect();
                const dx =
                    source.left +
                    source.width / 2 -
                    (target.left + target.width / 2);
                const dy =
                    source.top +
                    source.height / 2 -
                    (target.top + target.height / 2);
                const scale = clamp(source.width / target.width, 0.18, 0.7);
                const morph = composer.animate(
                    [
                        {
                            transform: `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`,
                            opacity: 0.25,
                        },
                        {
                            transform: "translate3d(0, 0, 0) scale(1)",
                            opacity: 1,
                        },
                    ],
                    { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
                );
                setTimeout(() => {
                    if (morph.playState === "running") morph.cancel();
                }, 420);
            }
            titleInput.focus();
        });
    }

    function closeComposer() {
        if (!dialogLayer.classList.contains("is-open")) return;
        dialogLayer.classList.remove("is-open");
        dialogLayer.setAttribute("aria-hidden", "true");
        editing = null;
        setTimeout(
            () => {
                composeTypeControl.hidden = false;
                lastOpener?.focus?.({ preventScroll: true });
            },
            reduceMotion.matches ? 0 : 180,
        );
    }

    function submitComposer(event) {
        event.preventDefault();
        const title = titleInput.value.trim();
        const body = bodyInput.value.trim();
        if (!title || !body) return;

        if (composeType === "task") {
            if (editing?.kind === "task") {
                const task = state.tasks.find((item) => item.id === editing.id);
                if (task) {
                    task.title = title;
                    task.body = body;
                    task.assignee = assigneeInput.value.trim() || "待认领";
                    task.due = dueInput.value;
                }
            } else {
                state.tasks.unshift({
                    id: uid("task"),
                    title,
                    body,
                    assignee: assigneeInput.value.trim() || "待认领",
                    due: dueInput.value,
                    status: "todo",
                });
            }
            saveState();
            renderTasks();
            showToast(editing ? "任务已更新" : "任务已发布");
        } else {
            const color =
                composerForm.querySelector('[name="color"]:checked')?.value ||
                "yellow";
            if (editing?.kind === "note") {
                const note = state.notes.find((item) => item.id === editing.id);
                if (note) {
                    note.title = title;
                    note.body = body;
                    note.color = color;
                }
            } else {
                const count = state.notes.length;
                state.notes.push({
                    id: uid("note"),
                    title,
                    body,
                    color,
                    x: 1098 + (count % 2) * 36,
                    y: 605 + (count % 3) * 168,
                    rotation: [-2.4, 1.8, -0.8][count % 3],
                    createdAt: "刚刚",
                });
            }
            saveState();
            renderNotes();
            showToast(editing ? "留言已更新" : "留言已贴上公告板");
        }
        closeComposer();
    }

    function deleteEditingEntry() {
        if (!editing) return;
        if (editing.kind === "task") {
            state.tasks = state.tasks.filter((task) => task.id !== editing.id);
            renderTasks();
            showToast("任务已删除");
        } else {
            state.notes = state.notes.filter((note) => note.id !== editing.id);
            renderNotes();
            showToast("留言已取下");
        }
        saveState();
        closeComposer();
    }

    function showToast(message) {
        clearTimeout(toastTimer);
        toastElement.textContent = message;
        toastElement.classList.add("is-visible");
        toastTimer = setTimeout(
            () => toastElement.classList.remove("is-visible"),
            1800,
        );
    }

    const zones = {
        overview: { cx: 1245, cy: 770, width: 1620, height: 1390 },
        inventory: { cx: 760, cy: 760, width: 720, height: 1240 },
        tasks: { cx: 1270, cy: 500, width: 780, height: 850 },
        shifts: { cx: 1755, cy: 480, width: 690, height: 760 },
        safety: { cx: 1325, cy: 1050, width: 870, height: 700 },
        notes: { cx: 1650, cy: 1040, width: 800, height: 700 },
    };

    function layoutWorld() {
        const mobile = innerWidth <= 760;
        document.body.classList.toggle(
            "is-focused",
            mobile && focusZone !== "overview",
        );
        let scale;
        let tx;
        let ty;

        if (mobile) {
            const zone = zones[focusZone] || zones.overview;
            const top = Math.max(
                48,
                parseFloat(
                    getComputedStyle(document.documentElement).getPropertyValue(
                        "--safe-top",
                    ),
                ) || 48,
            );
            const bottom = 78;
            const availableHeight = innerHeight - top - bottom;
            scale = Math.min(
                (innerWidth - 8) / zone.width,
                (availableHeight - 8) / zone.height,
            );
            scale = clamp(scale, 0.22, 0.64);
            tx = innerWidth / 2 - zone.cx * scale;
            ty = top + availableHeight / 2 - zone.cy * scale;
        } else {
            const frame = { cx: 1248, cy: 768, width: 1585, height: 1325 };
            scale = Math.min(
                (innerWidth - 32) / frame.width,
                (innerHeight - 24) / frame.height,
            );
            scale = clamp(scale, 0.38, 1.22);
            tx = innerWidth / 2 - frame.cx * scale;
            ty = innerHeight / 2 - frame.cy * scale;
        }

        viewScale = scale;
        world.style.transition =
            layoutReady && !reduceMotion.matches ?
                "transform 650ms cubic-bezier(0.22, 1, 0.36, 1)"
            :   "none";
        world.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
        layoutReady = true;
    }

    function setFocusZone(zone) {
        focusZone = zones[zone] ? zone : "overview";
        document.querySelectorAll("[data-focus]").forEach((button) => {
            button.classList.toggle(
                "is-active",
                button.dataset.focus === focusZone,
            );
        });
        layoutWorld();
    }

    document.addEventListener("click", (event) => {
        const composeButton = event.target.closest("[data-compose]");
        if (composeButton) {
            openComposer(composeButton.dataset.compose, null, composeButton);
            return;
        }

        const closeButton = event.target.closest("[data-close-dialog]");
        if (closeButton) {
            closeComposer();
            return;
        }

        const typeButton = event.target.closest("[data-compose-type]");
        if (typeButton) {
            setComposeType(typeButton.dataset.composeType);
            return;
        }

        const inventoryButton = event.target.closest("[data-inventory-id]");
        if (inventoryButton) {
            cycleInventory(inventoryButton.dataset.inventoryId);
            return;
        }

        const safetyButton = event.target.closest("[data-safety-index]");
        if (safetyButton) {
            const index = Number(safetyButton.dataset.safetyIndex);
            state.safety[index] = !state.safety[index];
            saveState();
            renderSafety();
            showToast(state.safety[index] ? "检查项已完成" : "检查项已取消");
            return;
        }

        const taskToggle = event.target.closest("[data-toggle-task]");
        if (taskToggle) {
            const task = state.tasks.find(
                (item) => item.id === taskToggle.dataset.toggleTask,
            );
            if (task) {
                moveTask(
                    task.id,
                    task.status === "done" ? "todo" : "done",
                    taskToggle.closest(".task-item"),
                );
            }
            return;
        }

        const taskEditor = event.target.closest("[data-edit-task]");
        if (taskEditor) {
            openComposer(
                "task",
                { kind: "task", id: taskEditor.dataset.editTask },
                taskEditor.closest(".task-item"),
            );
            return;
        }

        const focusButton = event.target.closest("[data-focus]");
        if (focusButton) setFocusZone(focusButton.dataset.focus);
    });

    composerForm.addEventListener("submit", submitComposer);
    deleteEntryButton.addEventListener("click", deleteEditingEntry);

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeComposer();
        if (event.key !== "Tab" || !dialogLayer.classList.contains("is-open"))
            return;

        const focusable = [
            ...composer.querySelectorAll(
                'button:not([hidden]), input:not([type="radio"]):not([hidden]), textarea, [tabindex]:not([tabindex="-1"])',
            ),
        ].filter(
            (element) => !element.disabled && element.offsetParent !== null,
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });

    addEventListener("resize", layoutWorld);
    reduceMotion.addEventListener("change", layoutWorld);

    renderAll();
    requestAnimationFrame(layoutWorld);
})();
