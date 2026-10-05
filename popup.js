const API = "https://open.er-api.com/v6/latest/USD";
const MAX_AGE = 60 * 60 * 1000; // refresh hourly
const INFO = {
  USD: { sym: "$", name: "US Dollar" },
  PKR: { sym: "₨", name: "Pakistani Rupee" }
};

const $ = (id) => document.getElementById(id);
const topEl = $("top"), bottomEl = $("bottom");

let topCur = "USD";
let rate = null;
let lastEdited = "top";

// Shrink text until the whole number fits inside the field
function fit(el) {
  let size = 28;
  el.style.fontSize = size + "px";
  while (el.scrollWidth > el.clientWidth && size > 10) {
    size -= 1;
    el.style.fontSize = size + "px";
  }
}
const fitAll = () => { fit(topEl); fit(bottomEl); };

const other = (c) => (c === "USD" ? "PKR" : "USD");
const bottomCur = () => other(topCur);

const convert = (amt, from) => (from === "USD" ? amt * rate : amt / rate);
const fmt = (n) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);

function sanitize(v) {
  v = v.replace(/,/g, "").replace(/[^\d.]/g, "");
  const i = v.indexOf(".");
  if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "");
  return v.slice(0, 15);
}
// Live thousands separators while typing, keeping the caret in place
function formatLive(el) {
  const caret = el.selectionStart ?? el.value.length;
  const typedBefore = sanitize(el.value.slice(0, caret)).length;
  const raw = sanitize(el.value);
  let [int, dec] = raw.split(".");
  int = int.replace(/^0+(?=\d)/, "");
  el.value =
    int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
    (dec !== undefined ? "." + dec.slice(0, 2) : "");
  let count = 0, pos = 0;
  while (pos < el.value.length && count < typedBefore) {
    if (el.value[pos] !== ",") count++;
    pos++;
  }
  el.setSelectionRange(pos, pos);
}
const parse = (v) => parseFloat(sanitize(v));

function update(source) {
  if (!rate) return;
  const [src, dst, srcCur] =
    source === "top" ? [topEl, bottomEl, topCur] : [bottomEl, topEl, bottomCur()];
  formatLive(src);
  const n = parse(src.value);
  dst.value = isNaN(n) ? "" : fmt(convert(n, srcCur));
  fitAll();
}

function renderLabels(animate) {
  [["Top", topCur], ["Bottom", bottomCur()]].forEach(([pos, c]) => {
    $("badge" + pos).textContent = INFO[c].sym;
    $("code" + pos).textContent = c;
    $("name" + pos).textContent = INFO[c].name;
    const cur = $("badge" + pos).parentElement;
    if (animate) {
      cur.classList.remove("flip");
      void cur.offsetWidth;
      cur.classList.add("flip");
    }
  });
}

function showRate(t, live) {
  $("rate").textContent = `1 USD = ${rate.toFixed(2)} PKR`;
  $("dot").className = "dot " + (live ? "live" : "stale");
  const time = new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  $("note").textContent = live
    ? `Updated ${time} · Mid-market rate`
    : `Offline. Showing the rate from ${time}.`;
}

async function loadRate() {
  const { cache } = await chrome.storage.local.get("cache");
  if (cache) {
    rate = cache.rate;
    showRate(cache.t, Date.now() - cache.t < MAX_AGE);
    update(lastEdited);
  }
  if (cache && Date.now() - cache.t < MAX_AGE) return;
  try {
    const res = await fetch(API);
    const data = await res.json();
    const r = data?.rates?.PKR;
    if (!r) throw new Error("No rate");
    rate = r;
    const t = Date.now();
    await chrome.storage.local.set({ cache: { rate: r, t } });
    showRate(t, true);
    update(lastEdited);
  } catch {
    if (!rate) {
      $("rate").textContent = "Rate unavailable";
      $("note").textContent = "Check your connection and reopen.";
    }
  }
}

topEl.addEventListener("input", () => { lastEdited = "top"; update("top"); });
bottomEl.addEventListener("input", () => { lastEdited = "bottom"; update("bottom"); });

[topEl, bottomEl].forEach((el) => {
  const toEnd = () => { const n = el.value.length; el.setSelectionRange(n, n); };
  el.addEventListener("focus", () => { toEnd(); fitAll(); });
  el.addEventListener("click", toEnd);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      el.value = "";
      lastEdited = el.id;
      update(el.id);
    }
  });
  el.addEventListener("keyup", (e) => { if (e.key.startsWith("Arrow") || e.key === "Home") toEnd(); });
  el.addEventListener("blur", () => {
    const n = parse(el.value);
    el.value = isNaN(n) ? "" : fmt(n);
    fitAll();
  });
});

$("swap").addEventListener("click", () => {
  topCur = other(topCur);
  $("swap").classList.toggle("spin");
  renderLabels(true);
  update("top");
  lastEdited = "top";
  chrome.storage.local.set({ topCur });
});

(async function init() {
  const { topCur: saved } = await chrome.storage.local.get("topCur");
  if (saved === "PKR") { topCur = "PKR"; $("swap").classList.add("spin"); }
  renderLabels(false);
  await loadRate();
  update("top");
  topEl.focus();
})();
