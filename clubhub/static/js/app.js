// Register the service worker so the app can be installed (PWA).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}

// Show an "Install app" button when the browser allows it (Chrome / Edge / Android).
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById("install-btn");
  if (btn) btn.hidden = false;
});
document.addEventListener("click", async (e) => {
  if (e.target.id === "install-btn" && deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    e.target.hidden = true;
  }
});

// Event form: only show the "kind" options that match sport/social, and the opponent field for sport.
const form = document.getElementById("event-form");
if (form) {
  const kind = document.getElementById("kind");
  const sync = () => {
    const cat = form.querySelector("input[name=category]:checked").value;
    let firstVisible = null, currentOk = false;
    for (const opt of kind.options) {
      const show = opt.dataset.cat === cat;
      opt.hidden = !show; opt.disabled = !show;
      if (show && !firstVisible) firstVisible = opt;
      if (show && opt.selected) currentOk = true;
    }
    if (!currentOk && firstVisible) firstVisible.selected = true;
    form.querySelectorAll(".sport-only").forEach((el) => (el.hidden = cat !== "sport"));
  };
  form.querySelectorAll("input[name=category]").forEach((r) => r.addEventListener("change", sync));
  sync();
}

// Members page: instant search filter.
const filter = document.getElementById("member-filter");
if (filter) {
  filter.addEventListener("input", () => {
    const q = filter.value.toLowerCase();
    document.querySelectorAll("#member-list [data-search]").forEach((el) => {
      el.hidden = !el.dataset.search.includes(q);
    });
  });
}
