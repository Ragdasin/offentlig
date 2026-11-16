const $ = (id) => document.getElementById(id);
const PROVIDERS = { flixbus: "FlixBus", dsb: "DSB", kombardo: "Kombardo" };
const STORE_KEY = "offentlig:last";

// ---------- Husk sidste valg i browseren ----------
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    if (s.from) $("from").value = s.from;
    if (s.to) $("to").value = s.to;
    if (s.discount) {
      $("useDiscount").checked = true;
      $("discount").value = s.discount;
    }
  } catch {}
  syncToggles();
}
function save(q) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ from: q.from, to: q.to, discount: q.discount || "" }));
  } catch {}
}

// ---------- Formular ----------
// Tidsrum og rabat: fluebenet styrer, om man ser selve feltet eller en "slået fra"-boks.
function syncToggles() {
  const time = $("useTime").checked, disc = $("useDiscount").checked;
  $("times").hidden = !time;
  $("timesOff").hidden = time;
  $("discount").hidden = !disc;
  $("discountOff").hidden = disc;
}
$("useTime").addEventListener("change", syncToggles);
$("useDiscount").addEventListener("change", syncToggles);
$("timesOff").addEventListener("click", () => {
  $("useTime").checked = true; syncToggles(); $("timeFrom").focus();
});
$("discountOff").addEventListener("click", () => {
  $("useDiscount").checked = true; syncToggles(); $("discount").focus();
});
$("swap").addEventListener("click", () => {
  [$("from").value, $("to").value] = [$("to").value, $("from").value];
});

// ---------- Byforslag (egen dropdown) ----------
for (const id of ["from", "to"]) {
  const input = $(id);
  const box = document.createElement("ul");
  box.className = "suggest";
  box.hidden = true;
  input.parentElement.appendChild(box);
  let timer, active = -1, reqNo = 0;

  const close = () => { box.hidden = true; active = -1; };
  const pick = (name) => { input.value = name; close(); };
  const highlight = () =>
    [...box.children].forEach((li, i) => li.classList.toggle("active", i === active));

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) return close();
    timer = setTimeout(async () => {
      const my = ++reqNo;
      let names = [];
      try { names = await (await fetch(`/api/autocomplete?q=${encodeURIComponent(q)}`)).json(); } catch {}
      if (my !== reqNo || document.activeElement !== input) return; // et nyere svar er på vej
      if (!names.length) return close();
      box.innerHTML = names.map((n) => `<li>${escapeHtml(n)}</li>`).join("");
      [...box.children].forEach((li, i) =>
        li.addEventListener("mousedown", (e) => { e.preventDefault(); pick(names[i]); }));
      active = -1;
      box.hidden = false;
    }, 200);
  });

  input.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    const n = box.children.length;
    if (e.key === "ArrowDown") { active = (active + 1) % n; highlight(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { active = (active - 1 + n) % n; highlight(); e.preventDefault(); }
    else if (e.key === "Enter" && active >= 0) { pick(box.children[active].textContent); e.preventDefault(); }
    else if (e.key === "Escape") close();
  });
  input.addEventListener("blur", close);
}

// ---------- Søgning ----------
$("search").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = {
    from: $("from").value.trim(),
    to: $("to").value.trim(),
    date: $("date").value,
  };
  if ($("useTime").checked) {
    q.time_from = $("timeFrom").value;
    q.time_to = $("timeTo").value;
  }
  if ($("useDiscount").checked) q.discount = $("discount").value;
  save(q);

  $("results").hidden = false;
  $("ecoSources").hidden = false;
  $("banner").hidden = true;
  const params = new URLSearchParams(q).toString();

  const all = await Promise.all(
    Object.keys(PROVIDERS).map(async (p) => {
      const list = document.querySelector(`[data-provider="${p}"] .list`);
      list.innerHTML = '<div class="skeleton"></div>'.repeat(3);
      let data;
      try {
        data = await (await fetch(`/api/search/${p}?${params}`)).json();
      } catch {
        data = { status: "error", message: "Kunne ikke hente lige nu" };
      }
      renderColumn(p, list, data);
      return (data.trips || []).map((t) => ({ ...t, provider: p }));
    })
  );

  markCheapest(all.flat());
});

function renderColumn(provider, list, data) {
  const name = PROVIDERS[provider];
  if (data.status === "soon") {
    list.innerHTML = `<div class="card note">${name} kommer snart. <a href="${data.url}" target="_blank" rel="noopener">Søg på ${name} →</a></div>`;
    return;
  }
  if (data.status !== "ok") {
    list.innerHTML = `<div class="card note">${escapeHtml(data.message || "Fejl")}.</div>`;
    return;
  }
  if (!data.trips.length) {
    list.innerHTML = `<div class="card note">Ingen ledige afgange i det valgte tidsrum.</div>`;
    return;
  }
  list.innerHTML = data.trips
    .map((t, i) => `
      <a class="card trip" href="${t.url}" target="_blank" rel="noopener"
         data-key="${provider}-${t.departure}-${t.price}" style="animation-delay:${i * 60}ms">
        <div class="top">
          <span class="time">${t.departure} → ${t.arrival}</span>
          <span class="price">${t.price} kr</span>
        </div>
        <div class="meta">
          <span>${fmtDuration(t.duration_min)}</span>
          <span>${t.transfers ? t.transfers + " skift" : "Direkte"}</span>
          <span class="tag">${escapeHtml(t.ticket_type)}</span>
          <span>Plads: ${t.seat_price == null ? "vælges ved booking" : "+" + t.seat_price + " kr"}</span>
        </div>
      </a>`)
    .join("");
}

function markCheapest(trips) {
  if (!trips.length) return;
  const best = trips.reduce((a, b) => (b.price < a.price ? b : a));
  document
    .querySelector(`[data-key="${best.provider}-${best.departure}-${best.price}"]`)
    ?.classList.add("cheapest");

  const b = $("banner");
  b.innerHTML = `
    <div>
      <div class="label">Billigst</div>
      <div class="what">${PROVIDERS[best.provider]} · ${best.departure} → ${best.arrival} · ${best.price} kr</div>
    </div>
    <a href="${best.url}" target="_blank" rel="noopener">Book hos ${PROVIDERS[best.provider]} →</a>`;
  b.hidden = false;
}

function fmtDuration(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} t ${m ? m + " min" : ""}`.trim() : `${m} min`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

load();

// ---------- Klima-bokse: fold alle tre ud/ind sammen, så man kan sammenligne ----------
document.querySelectorAll("details.eco").forEach((d) => {
  d.addEventListener("toggle", () => {
    document.querySelectorAll("details.eco").forEach((o) => {
      if (o !== d && o.open !== d.open) o.open = d.open;
    });
  });
});
