// Egen tidsvælger: hele tidsfeltet åbner et timegitter.
// Hver celle er en hel time (14 = 14:00–14:59). Tryk på første og sidste time; båndet imellem farves.
// Resultatet skrives i de skjulte felter timeFrom/timeTo ("14:00" / "18:00"), som søgningen bruger.
(() => {
  const from = document.getElementById("timeFrom");
  const to = document.getElementById("timeTo");
  const btn = document.getElementById("timeBtn");
  const text = document.getElementById("timeText");
  const pop = document.getElementById("timePicker");
  const dateInput = document.getElementById("date");
  const COLS = 6;

  const PRESETS = [
    { id: "morgen", name: "Morgen", a: 5, b: 8 },
    { id: "formiddag", name: "Formiddag", a: 9, b: 11 },
    { id: "eftermiddag", name: "Eftermiddag", a: 12, b: 16 },
    { id: "aften", name: "Aften", a: 17, b: 23 },
  ];

  const pad = (h) => String(h).padStart(2, "0");
  const endLabel = (b) => `${pad(b + 1)}:00`;             // sidste time 17 → "18:00"; 23 → "24:00"
  const span = (a, b) => `${pad(a)}:00 – ${endLabel(b)}`;

  // Startværdi fra de skjulte felter
  let a = parseInt(from.value, 10) || 14;
  let b = Math.max(a, (parseInt(to.value, 10) || 18) - 1);
  let pickingEnd = false;   // true = første tryk er sket, venter på sluttime
  let hover = null;
  let focusH = a;

  // Timer der er gået, når datoen er i dag (den igangværende time kan stadig vælges)
  function firstHour() {
    const now = new Date();
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    return dateInput && dateInput.value === today ? now.getHours() : 0;
  }

  function commit() {
    from.value = `${pad(a)}:00`;
    to.value = b === 23 ? "23:59" : `${pad(b + 1)}:00`;
    text.textContent = span(a, b);
    btn.setAttribute("aria-label", `Afgang mellem ${pad(a)}:00 og ${endLabel(b)}, skift tidsrum`);
  }

  // Hvis datoen skifter til i dag, og tidsrummet ligger før nu: ryk det frem
  function clampToNow() {
    const min = firstHour();
    if (b < min) { const len = b - a; a = min; b = Math.min(23, min + len); }
    else if (a < min) a = min;
    commit();
  }

  function render() {
    const min = firstHour();
    const now = new Date().getHours();
    const lo = pickingEnd && hover !== null ? Math.min(a, hover) : a;
    const hi = pickingEnd && hover !== null ? Math.max(a, hover) : b;

    const quick = PRESETS.map((p) => {
      const dis = p.b < min;
      const on = !pickingEnd && a === Math.max(p.a, min) && b === p.b;
      return `<button type="button" data-a="${p.a}" data-b="${p.b}" class="${on ? "on" : ""}" ${dis ? "disabled" : ""}>
        <b>${p.name}</b><small>${pad(Math.max(p.a, dis ? p.a : min))}–${endLabel(p.b).slice(0, 2)}</small></button>`;
    }).join("");
    // "Fra nu" kun når det er i dag og giver noget andet end "Aften" (efter kl. 17 er de ens)
    const fromNow = min > 0 && min < 17
      ? `<button type="button" data-a="${min}" data-b="23" class="${!pickingEnd && a === min && b === 23 ? "on" : ""}">
          <b>Fra nu</b><small>${pad(min)}–24</small></button>`
      : "";

    let cells = "";
    for (let h = 0; h < 24; h++) {
      const cls = ["tp-h"];
      const inRange = h >= lo && h <= hi;
      if (inRange) cls.push("in");
      if (pickingEnd && hover !== null) { if (inRange && h !== a) cls.push("preview"); if (h === a) cls.push("start", "end"); }
      else if (pickingEnd) { if (h === a) cls.push("start", "end"); }
      else { if (h === a) cls.push("start"); if (h === b) cls.push("end"); }
      if (h % COLS === 0) cls.push("rowstart");
      if (h % COLS === COLS - 1) cls.push("rowend");
      if (min > 0 && h === now) cls.push("now");
      const dis = h < min;
      cells += `<button type="button" class="${cls.join(" ")}" data-h="${h}" ${dis ? "disabled" : ""}
        tabindex="${h === focusH ? 0 : -1}" aria-label="Kl. ${pad(h)}" ${inRange && !pickingEnd ? 'aria-pressed="true"' : ""}>${pad(h)}</button>`;
    }

    const hint = pickingEnd
      ? `<span>Vælg sidste time</span><b>${pad(lo)}:00 – ${endLabel(hi)}</b>`
      : `<span>Afgang mellem</span><b>${span(a, b)}</b>`;

    pop.innerHTML = `
      <div class="tp-quick">${quick}${fromNow}</div>
      <div class="tp-hint" aria-live="polite">${hint}</div>
      <div class="tp-grid" role="group" aria-label="Timer">${cells}</div>
      <div class="tp-foot">
        <button type="button" data-act="all">Hele dagen</button>
        <button type="button" class="tp-done" data-act="done">Færdig</button>
      </div>`;
  }

  function focusCell() { pop.querySelector(`[data-h="${focusH}"]`)?.focus(); }

  function open() {
    clampToNow();
    pickingEnd = false; hover = null; focusH = a;
    render();
    pop.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    focusCell();
  }

  function close(returnFocus = true) {
    if (pickingEnd) { pickingEnd = false; b = a; commit(); }   // kun ét tryk = én time
    pop.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (returnFocus) btn.focus();
  }

  function tapHour(h) {
    if (h < firstHour()) return;
    focusH = h;
    if (!pickingEnd) {
      a = h; b = h; pickingEnd = true; hover = null;
      render(); focusCell();
    } else {
      const lo = Math.min(a, h), hi = Math.max(a, h);
      a = lo; b = hi; pickingEnd = false; hover = null;
      commit(); render();
      setTimeout(() => close(), 220);   // lad båndet blive set et øjeblik
    }
  }

  btn.addEventListener("click", () => (pop.hidden ? open() : close()));

  pop.addEventListener("click", (e) => {
    const cell = e.target.closest("[data-h]");
    const q = e.target.closest("[data-a]");
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (cell && !cell.disabled) tapHour(Number(cell.dataset.h));
    else if (q && !q.disabled) {
      a = Math.max(Number(q.dataset.a), firstHour()); b = Number(q.dataset.b); pickingEnd = false;
      commit(); render(); setTimeout(() => close(), 160);
    } else if (act === "done") close();
    else if (act === "all") {
      pickingEnd = false; close(false);
      const cb = document.getElementById("useTime");
      cb.checked = false; cb.dispatchEvent(new Event("change"));
    }
  });

  // Forhåndsvis båndet, mens man bevæger musen efter første tryk
  pop.addEventListener("mouseover", (e) => {
    if (!pickingEnd) return;
    const cell = e.target.closest("[data-h]");
    const h = cell && !cell.disabled ? Number(cell.dataset.h) : null;
    if (h !== hover) { hover = h; render(); }
  });
  pop.addEventListener("mouseleave", () => { if (pickingEnd && hover !== null) { hover = null; render(); } });

  pop.addEventListener("keydown", (e) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLS, ArrowDown: COLS };
    if (e.key === "Escape") { e.preventDefault(); return close(); }
    if (!e.target.matches(".tp-h")) return;
    if (moves[e.key] !== undefined) {
      e.preventDefault();
      const next = focusH + moves[e.key];
      if (next < firstHour() || next > 23) return;
      focusH = next;
      if (pickingEnd) hover = next;
      render(); focusCell();
    }
  });

  document.addEventListener("mousedown", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) close(false);
  });
  dateInput?.addEventListener("change", () => { if (document.getElementById("useTime").checked) clampToNow(); });

  commit();
})();
