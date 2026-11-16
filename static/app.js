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
$("useTime").addEventListener("change", () => {
  syncToggles();
  if ($("useTime").checked) $("timeBtn").click();   // slå til = åbn tidsvælgeren med det samme
});
$("useDiscount").addEventListener("change", syncToggles);
$("timesOff").addEventListener("click", () => {
  $("useTime").checked = true; syncToggles(); $("timeBtn").click();
});
$("discountOff").addEventListener("click", () => {
  $("useDiscount").checked = true; syncToggles(); $("discount").focus();
});
$("swap").addEventListener("click", () => {
  [$("from").value, $("to").value] = [$("to").value, $("from").value];
});

// ---------- Byforslag (egen dropdown) ----------
// "Århus" = "aarhus", "kobenhavn" = "københavn" osv.
const norm = (s) => s.toLowerCase()
  .replace(/å/g, "aa").replace(/æ/g, "ae").replace(/ø/g, "oe")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "");
// Folk skriver også "kobenhavn" / "arhus" uden danske bogstaver
const plain = (s) => norm(s.toLowerCase().replace(/å/g, "a").replace(/ø/g, "o").replace(/æ/g, "a"));
const PLACES = (typeof POPULAR_PLACES !== "undefined" ? POPULAR_PLACES : [])
  .map(([name, ...alias]) => ({ name, keys: [name, ...alias].flatMap((x) => [norm(x), plain(x)]) }));

// Lokale forslag: først dem der starter med det skrevne, så dem hvor et ord gør.
function localSuggestions(q) {
  const n = norm(q);
  if (!n) return [];
  const starts = [], words = [];
  for (const p of PLACES) {
    if (p.keys.some((k) => k.startsWith(n))) starts.push(p.name);
    else if (p.keys.some((k) => k.split(" ").some((w) => w.startsWith(n)))) words.push(p.name);
  }
  return [...starts, ...words];
}

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

  const show = (names) => {
    if (!names.length) return close();
    const keep = active >= 0 ? box.children[active]?.textContent : null;
    box.innerHTML = names.map((n) => `<li>${escapeHtml(n)}</li>`).join("");
    [...box.children].forEach((li, i) =>
      li.addEventListener("mousedown", (e) => { e.preventDefault(); pick(names[i]); }));
    active = keep ? names.indexOf(keep) : -1;
    highlight();
    box.hidden = false;
  };

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    reqNo++;
    if (!q) return close();

    // 1) Populære steder: med det samme, fra 1 bogstav
    const local = localSuggestions(q).slice(0, 8);
    show(local);

    // 2) Alle andre stationer: spørg DSB efter 0,1 sek (DSB giver først gode svar fra 3 bogstaver)
    if (q.length < 3) return;
    timer = setTimeout(async () => {
      const my = reqNo;
      let remote = [];
      try { remote = await (await fetch(`/api/autocomplete?q=${encodeURIComponent(q)}`)).json(); } catch {}
      if (my !== reqNo || document.activeElement !== input) return; // brugeren har skrevet videre
      const seen = new Set(local.map(norm));
      show([...local, ...remote.filter((n) => !seen.has(norm(n)))].slice(0, 8));
    }, 100);
  });

  input.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    const n = box.children.length;
    // Tab/pil ned = næste forslag, Shift+Tab/pil op = forrige (kun mens listen er åben).
    // Når listen er lukket (Enter eller Esc), virker Tab normalt og går til næste felt.
    const next = e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey);
    const prev = e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey);
    if (next) { active = (active + 1) % n; highlight(); e.preventDefault(); }
    else if (prev) { active = active <= 0 ? n - 1 : active - 1; highlight(); e.preventDefault(); }
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

  $("searchSummaryText").textContent =
    `${q.from} → ${q.to} · ${$("dateText").textContent}` + (q.discount ? ` · ${$("discount").selectedOptions[0].text}` : "");
  $("search").classList.add("collapsed");

  $("results").hidden = false;
  $("ecoSources").hidden = false;
  $("banner").hidden = true;
  const params = new URLSearchParams(q).toString();

  const all = await Promise.all(
    Object.keys(PROVIDERS).map(async (p) => {
      const list = document.querySelector(`[data-provider="${p}"] .list`);
      list.innerHTML = '<div class="skeleton"></div>'.repeat(4);
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
        <div class="m-price">${t.price} kr</div>
        <div class="m-dep">${t.departure}<span class="m-arr"> → ${t.arrival}</span></div>
        <div class="m-more"><div>
          <div class="m-sub">${fmtDuration(t.duration_min).replace(" min", "")} · ${t.transfers ? t.transfers + " skift" : "direkte"}</div>
          <div class="m-details">
            <span class="tag">${escapeHtml(t.ticket_type)}</span>
            <span>Plads: ${t.seat_price == null ? "ved booking" : "+" + t.seat_price + " kr"}</span>
            <span class="book-btn">Book hos ${name} →</span>
          </div>
        </div></div>
        <span class="m-chev" aria-hidden="true"></span>
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

// ---------- Mobil (under 820 px) ----------
const MOBILE = window.matchMedia("(max-width: 820px)");

$("editSearch").addEventListener("click", () => {
  $("search").classList.remove("collapsed");
  $("from").focus();
});

// Første tryk på et kort viser detaljer; "Book"-knappen sender videre til selskabet.
$("results").addEventListener("click", (e) => {
  const card = e.target.closest(".trip");
  if (!card || !MOBILE.matches) return;
  if (card.classList.contains("open") && e.target.closest(".book-btn")) return; // lad linket virke
  e.preventDefault();
  const wasOpen = card.classList.contains("open");
  document.querySelectorAll(".trip.open").forEach((c) => c.classList.remove("open"));
  if (!wasOpen) card.classList.add("open");
});

// ---------- Klima-bokse: fold alle tre ud/ind sammen, så man kan sammenligne ----------
document.querySelectorAll("details.eco").forEach((d) => {
  d.addEventListener("toggle", () => {
    $("ecoAll").hidden = !d.open; // samlet boks på mobil (skjult via CSS på pc)
    document.querySelectorAll("details.eco").forEach((o) => {
      if (o !== d && o.open !== d.open) o.open = d.open;
    });
  });
});
