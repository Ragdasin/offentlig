// Egen tidsvælger: hele tidsfeltet åbner en pop-up med to hjul (som på iPhone).
// Venstre hjul = fra kl. (00–23), højre hjul = til kl. (01–24). Kun hele timer.
// Over hjulene ligger genveje (Morgen, Aften …). Til kl. 24 sendes som "23:59".
// Resultatet skrives i de skjulte felter timeFrom/timeTo, som søgningen bruger.
(() => {
  const from = document.getElementById("timeFrom");
  const to = document.getElementById("timeTo");
  const btn = document.getElementById("timeBtn");
  const text = document.getElementById("timeText");
  const pop = document.getElementById("timePicker");
  const dateInput = document.getElementById("date");
  const ITEM = 40;   // højde på én række i hjulet (skal matche CSS)

  const PRESETS = [
    { name: "Morgen", a: 5, b: 9 },
    { name: "Formiddag", a: 9, b: 12 },
    { name: "Eftermiddag", a: 12, b: 17 },
    { name: "Aften", a: 17, b: 24 },
  ];

  const pad = (h) => String(h).padStart(2, "0");
  const span = (a, b) => `${pad(a)}:00 – ${pad(b)}:00`;

  let a = parseInt(from.value, 10) || 14;
  let b = to.value === "23:59" ? 24 : Math.max(a + 1, parseInt(to.value, 10) || 18);
  let wheels = {};          // { a: element, b: element }
  let settleTimer = {};
  let drag = null;          // igangværende træk med musen
  let suppressClick = false;

  // Timer der er gået, når datoen er i dag (den igangværende time kan stadig vælges)
  function firstHour() {
    const now = new Date();
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    return dateInput && dateInput.value === today ? now.getHours() : 0;
  }

  function commit() {
    from.value = `${pad(a)}:00`;
    to.value = b === 24 ? "23:59" : `${pad(b)}:00`;
    text.innerHTML = `<span class="t-long">${span(a, b)}</span><span class="t-short">kl. ${pad(a)}–${pad(b)}</span>`;
    btn.setAttribute("aria-label", `Afgang mellem ${span(a, b)}, skift tidsrum`);
  }

  // Hvis datoen skifter til i dag, og tidsrummet ligger før nu: ryk det frem
  function clampToNow() {
    const min = firstHour();
    if (b <= min) { const len = b - a; a = min; b = Math.min(24, min + len); }
    else if (a < min) a = min;
    commit();
  }

  // ---------- Hjul ----------
  const first = (k) => (k === "a" ? 0 : 1);               // laveste værdi i hjulet
  const last = (k) => (k === "a" ? 23 : 24);
  const disabled = (k, h) => (k === "a" ? h < firstHour() : h <= firstHour());

  function wheelHTML(k) {
    let items = "";
    for (let h = first(k); h <= last(k); h++) {
      items += `<div class="tp-item" data-k="${k}" data-h="${h}">${pad(h)}</div>`;
    }
    const label = k === "a" ? "Fra kl." : "Til kl.";
    return `<div class="tp-col">
      <span class="tp-lbl">${label}</span>
      <div class="tp-wheel" data-k="${k}" tabindex="0" role="spinbutton" aria-label="${label}"
           aria-valuemin="${first(k)}" aria-valuemax="${last(k)}">
        <div class="tp-pad"></div>${items}<div class="tp-pad"></div>
      </div>
    </div>`;
  }

  function scrollTo(k, h, smooth) {
    const w = wheels[k];
    if (w) w.scrollTo({ top: (h - first(k)) * ITEM, behavior: smooth ? "smooth" : "auto" });
  }
  const valueAt = (k) => first(k) + Math.round(wheels[k].scrollTop / ITEM);

  // Opdater markeringer uden at tegne pop-up'en forfra (så scroll og tryk ikke afbrydes)
  function paint(liveK) {
    for (const k of ["a", "b"]) {
      const w = wheels[k];
      if (!w) continue;
      const cur = k === liveK ? valueAt(k) : (k === "a" ? a : b);
      w.querySelectorAll(".tp-item").forEach((el) => {
        const h = Number(el.dataset.h);
        el.classList.toggle("sel", h === cur);
        el.classList.toggle("dis", disabled(k, h));
      });
      w.setAttribute("aria-valuenow", cur);
      w.setAttribute("aria-valuetext", `${pad(cur)}:00`);
    }
    const hint = pop.querySelector(".tp-hint b");
    if (hint) hint.textContent = span(a, b);
    pop.querySelectorAll(".tp-quick [data-a]").forEach((q) => {
      q.classList.toggle("on", a === Math.max(Number(q.dataset.a), firstHour()) && b === Number(q.dataset.b));
    });
  }

  // Når et hjul står stille: læs værdien og hold fra < til
  function settle(k) {
    const min = firstHour();
    let h = valueAt(k);
    if (k === "a") {
      if (h < min) { h = min; scrollTo("a", h, true); }
      a = h;
      if (b <= a) { b = a + 1; scrollTo("b", b, true); }
    } else {
      if (h <= min) { h = min + 1; scrollTo("b", h, true); }
      b = h;
      if (a >= b) { a = b - 1; scrollTo("a", a, true); }
    }
    commit();
    paint();
  }

  function render() {
    const min = firstHour();
    const quick = PRESETS.map((p) => {
      const dis = p.b <= min;
      return `<button type="button" data-a="${p.a}" data-b="${p.b}" ${dis ? "disabled" : ""}>
        <b>${p.name}</b><small>${pad(Math.max(p.a, dis ? p.a : min))}–${pad(p.b)}</small></button>`;
    }).join("");
    // "Fra nu" kun når det er i dag og giver noget andet end "Aften"
    const fromNow = min > 0 && min < 17
      ? `<button type="button" data-a="${min}" data-b="24"><b>Fra nu</b><small>${pad(min)}–24</small></button>`
      : "";

    pop.innerHTML = `
      <div class="tp-quick">${quick}${fromNow}<button type="button" data-act="all"><b>Hele dagen</b><small>00–24</small></button></div>
      <div class="tp-hint"><span>Afgang mellem</span><b aria-live="polite">${span(a, b)}</b></div>
      <div class="tp-wheels">${wheelHTML("a")}<span class="tp-dash" aria-hidden="true">–</span>${wheelHTML("b")}</div>
      <button type="button" class="tp-done" data-act="done">Vælg</button>`;

    wheels = { a: pop.querySelector('.tp-wheel[data-k="a"]'), b: pop.querySelector('.tp-wheel[data-k="b"]') };
    for (const k of ["a", "b"]) {
      wheels[k].addEventListener("scroll", () => {
        paint(k);                                   // fremhæv tallet i midten, mens man scroller
        clearTimeout(settleTimer[k]);
        settleTimer[k] = setTimeout(() => settle(k), 120);
      }, { passive: true });

      // Klik-og-træk med mus (telefon kan allerede swipe). Snap slås fra under trækket og til igen bagefter.
      wheels[k].addEventListener("pointerdown", (e) => {
        if (e.pointerType !== "mouse" || e.button !== 0) return;
        e.preventDefault();
        const w = wheels[k];
        drag = { k, w, y: e.clientY, top: w.scrollTop, moved: false, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
        w.classList.add("dragging");
      });
    }
  }

  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    if (Math.abs(dy) > 3) drag.moved = true;
    drag.w.scrollTop = drag.top - dy;
    const dt = e.timeStamp - drag.lastT;
    if (dt > 0) drag.v = (e.clientY - drag.lastY) / dt;   // px pr. ms, til et lille "kast"
    drag.lastY = e.clientY; drag.lastT = e.timeStamp;
  });

  window.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const { k, w, moved, lastT } = drag;
    // Lille "kast": kun hvis musen stadig bevægede sig lige før slip, og højst ca. 1 time ekstra
    const v = e.timeStamp - lastT < 60 ? Math.max(-1, Math.min(1, drag.v)) : 0;
    drag = null;
    if (moved) {
      suppressClick = true; setTimeout(() => (suppressClick = false), 0);
      const target = w.scrollTop - v * 40;
      const h = Math.min(last(k), Math.max(first(k), first(k) + Math.round(target / ITEM)));
      scrollTo(k, h, true);
      setTimeout(() => w.classList.remove("dragging"), 400);
    } else {
      w.classList.remove("dragging");
    }
  });

  function open(viaKeyboard) {
    clampToNow();
    render();
    pop.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    scrollTo("a", a, false);
    scrollTo("b", b, false);
    paint();
    if (viaKeyboard) wheels.a.focus({ preventScroll: true });   // kun tastatur: ingen fokusramme ved tryk
  }

  function close(returnFocus = true) {
    for (const k in settleTimer) clearTimeout(settleTimer[k]);
    pop.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (returnFocus) btn.focus({ preventScroll: true });
  }

  btn.addEventListener("click", (e) => (pop.hidden ? open(e.isTrusted && e.detail === 0) : close()));

  pop.addEventListener("click", (e) => {
    if (suppressClick) return;   // slutningen af et træk er ikke et klik
    const item = e.target.closest(".tp-item");
    const q = e.target.closest("[data-a]");
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (item) {
      // Tryk på et tal i hjulet: rul det ind i midten
      const k = item.dataset.k, h = Number(item.dataset.h);
      if (!disabled(k, h)) scrollTo(k, h, true);
    } else if (q && !q.disabled) {
      a = Math.max(Number(q.dataset.a), firstHour()); b = Number(q.dataset.b);
      scrollTo("a", a, true); scrollTo("b", b, true);
      commit(); paint();
      setTimeout(() => close(), 380);   // lad hjulene nå at dreje, så man ser valget
    } else if (act === "done") {
      close();
    } else if (act === "all") {
      close(false);
      const cb = document.getElementById("useTime");
      cb.checked = false; cb.dispatchEvent(new Event("change"));
    }
  });

  pop.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); return close(); }
    const w = e.target.closest(".tp-wheel");
    if (!w) return;
    const step = { ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (step) {
      e.preventDefault();
      const k = w.dataset.k;
      const h = Math.min(last(k), Math.max(first(k), (k === "a" ? a : b) + step));
      if (!disabled(k, h)) scrollTo(k, h, true);
    } else if (e.key === "Enter") {
      e.preventDefault(); close();
    }
  });

  document.addEventListener("mousedown", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) close(false);
  });
  dateInput?.addEventListener("change", () => { if (document.getElementById("useTime").checked) clampToNow(); });

  commit();
})();
