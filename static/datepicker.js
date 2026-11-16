// Egen datovælger: hele datofeltet åbner en kalender i sidens tema.
(() => {
  const input = document.getElementById("date");      // skjult felt med ISO-dato (YYYY-MM-DD)
  const btn = document.getElementById("dateBtn");
  const text = document.getElementById("dateText");
  const pop = document.getElementById("datePicker");

  const MONTHS = ["januar", "februar", "marts", "april", "maj", "juni", "juli",
                  "august", "september", "oktober", "november", "december"];
  const DAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
  const DAYS_LONG = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

  const parse = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
  const iso = (dt) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const sameDay = (a, b) => iso(a) === iso(b);

  const min = parse(input.dataset.min || iso(new Date()));
  let selected = parse(input.value || iso(min));
  let view = new Date(selected.getFullYear(), selected.getMonth(), 1);
  let focus = new Date(selected);

  function label(dt) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((dt - today) / 86400000);
    const base = `${DAYS_LONG[dt.getDay()]} ${dt.getDate()}. ${MONTHS[dt.getMonth()].slice(0, 3)}.`;
    const short = `${DAYS[(dt.getDay() + 6) % 7].toLowerCase()}. ${dt.getDate()}. ${MONTHS[dt.getMonth()].slice(0, 3)}.`;
    if (diff === 0) return `I dag · ${short}`;
    if (diff === 1) return `I morgen · ${short}`;
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  function setDate(dt) {
    selected = new Date(dt);
    input.value = iso(selected);
    text.textContent = label(selected);
    input.dispatchEvent(new Event("change"));  // så tidsvælgeren kan grå timer ud, der er gået
  }

  function render() {
    const y = view.getFullYear(), m = view.getMonth();
    const first = new Date(y, m, 1);
    const offset = (first.getDay() + 6) % 7;            // mandag = første kolonne
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const canPrev = new Date(y, m, 0) >= min;

    let cells = "";
    for (let i = 0; i < offset; i++) cells += `<span class="dp-empty"></span>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(y, m, d);
      const cls = ["dp-day"];
      if (sameDay(dt, selected)) cls.push("selected");
      if (sameDay(dt, today)) cls.push("today");
      const disabled = dt < min;
      cells += `<button type="button" class="${cls.join(" ")}" data-date="${iso(dt)}"
        ${disabled ? "disabled" : ""} tabindex="${sameDay(dt, focus) ? 0 : -1}"
        aria-label="${DAYS_LONG[dt.getDay()]} ${d}. ${MONTHS[m]}"
        ${sameDay(dt, selected) ? 'aria-pressed="true"' : ""}>${d}</button>`;
    }

    pop.innerHTML = `
      <div class="dp-head">
        <button type="button" class="dp-nav" data-nav="-1" aria-label="Forrige måned" ${canPrev ? "" : "disabled"}>‹</button>
        <span class="dp-title">${MONTHS[m]} ${y}</span>
        <button type="button" class="dp-nav" data-nav="1" aria-label="Næste måned">›</button>
      </div>
      <div class="dp-week">${DAYS.map((d) => `<span>${d}</span>`).join("")}</div>
      <div class="dp-grid">${cells}</div>
      <div class="dp-quick">
        <button type="button" data-quick="0">I dag</button>
        <button type="button" data-quick="1">I morgen</button>
        <button type="button" data-quick="weekend">Fredag</button>
      </div>`;
  }

  function focusDay() {
    pop.querySelector(`[data-date="${iso(focus)}"]`)?.focus();
  }

  function open() {
    view = new Date(selected.getFullYear(), selected.getMonth(), 1);
    focus = new Date(selected);
    render();
    pop.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    focusDay();
  }

  function close(returnFocus = true) {
    pop.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (returnFocus) btn.focus();
  }

  function choose(dt) {
    if (dt < min) return;
    setDate(dt);
    close();
  }

  btn.addEventListener("click", () => (pop.hidden ? open() : close()));

  pop.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-nav]");
    const day = e.target.closest("[data-date]");
    const quick = e.target.closest("[data-quick]");
    if (nav) {
      view.setMonth(view.getMonth() + Number(nav.dataset.nav));
      focus = new Date(view);
      if (focus < min) focus = new Date(min);
      render();
    } else if (day && !day.disabled) {
      choose(parse(day.dataset.date));
    } else if (quick) {
      const t = new Date(); t.setHours(0, 0, 0, 0);
      if (quick.dataset.quick === "weekend") t.setDate(t.getDate() + ((5 - t.getDay() + 7) % 7));
      else t.setDate(t.getDate() + Number(quick.dataset.quick));
      choose(t);
    }
  });

  pop.addEventListener("keydown", (e) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key === "Escape") { e.preventDefault(); return close(); }
    if (!e.target.matches(".dp-day")) return;
    if (moves[e.key] !== undefined) {
      e.preventDefault();
      const next = new Date(focus); next.setDate(next.getDate() + moves[e.key]);
      if (next < min) return;
      focus = next;
      if (focus.getMonth() !== view.getMonth() || focus.getFullYear() !== view.getFullYear()) {
        view = new Date(focus.getFullYear(), focus.getMonth(), 1);
      }
      render();
      focusDay();
    }
  });

  document.addEventListener("mousedown", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) close(false);
  });

  setDate(selected);
})();
