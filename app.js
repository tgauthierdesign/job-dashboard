(function () {
  "use strict";

  var state = { data: null, filter: "valid" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function isRemote(job) {
    return /remote|télétravail/i.test((job.location || "") + " " + (job.note || ""));
  }

  function daysAgo(iso) {
    if (!iso) return null;
    var d = new Date(iso + (iso.length <= 10 ? "T00:00:00" : ""));
    if (isNaN(d)) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  function postedLabel(job) {
    var n = daysAgo(job.posted);
    if (n == null) return "";
    if (n <= 0) return "aujourd'hui";
    if (n === 1) return "il y a 1 jour";
    return "il y a " + n + " jours";
  }

  // Expired last, then local first, then new, then those with a posting date (most recent first).
  function sortJobs(jobs) {
    return jobs.slice().sort(function (a, b) {
      if (!!a.expired !== !!b.expired) return a.expired ? 1 : -1;
      if (!!b.local !== !!a.local) return b.local ? 1 : -1;
      if (!!b.new !== !!a.new) return b.new ? 1 : -1;
      var da = daysAgo(a.posted), db = daysAgo(b.posted);
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });
  }

  function matchesFilter(job) {
    switch (state.filter) {
      case "valid": return !job.expired;
      case "expired": return !!job.expired;
      case "local": return !!job.local && !job.expired;
      case "new": return !!job.new && !job.expired;
      case "remote": return isRemote(job) && !job.expired;
      default: return true; // "all" shows everything, expired dimmed at the bottom
    }
  }

  function jobCard(job) {
    var expired = !!job.expired;
    var badges = "";
    if (expired) badges += '<span class="badge expired">⛔ Expirée</span>';
    if (job.local) badges += '<span class="badge local">⭐ Local</span>';
    if (job.new && !expired) badges += '<span class="badge new">🆕 Nouveau</span>';
    if (job.contract) badges += '<span class="badge contract">' + esc(job.contract) + "</span>";

    var posted = postedLabel(job);
    var salary = job.salary
      ? '<div class="detail salary"><span class="ico">💶</span>' + esc(job.salary) + "</div>"
      : "";
    var note = job.note ? '<p class="note">' + esc(job.note) + "</p>" : "";
    var postedRow = posted
      ? '<div class="detail"><span class="ico">🕑</span>Publié ' + esc(posted) + "</div>"
      : "";
    var expiredMsg = expired
      ? '<p class="expired-msg">⚠️ ' + esc(job.expired_reason || "Annonce expirée ou introuvable.") + "</p>"
      : "";
    var cls = "card" + (expired ? " expired" : job.local ? " local" : "");
    var apply = expired
      ? '<a class="apply muted" href="' + esc(job.url) + '" target="_blank" rel="noopener">Lien (expiré) ↗</a>'
      : '<a class="apply" href="' + esc(job.url) + '" target="_blank" rel="noopener">Voir l\'annonce ↗</a>';

    return (
      '<article class="' + cls + '">' +
        '<div class="badges">' + badges + "</div>" +
        "<h2>" + esc(job.title) + "</h2>" +
        '<div class="detail company"><span class="ico">🏢</span>' + esc(job.company) + "</div>" +
        '<div class="detail"><span class="ico">📍</span>' + esc(job.location) + "</div>" +
        salary +
        postedRow +
        note +
        expiredMsg +
        '<div class="spacer"></div>' +
        apply +
      "</article>"
    );
  }

  function resourceCard(r) {
    return (
      '<div class="resource-card">' +
        '<div class="r-main">' +
          "<h3>⭐ " + esc(r.title) + "</h3>" +
          "<p>" + esc(r.company) + " — " + esc(r.note || "") + "</p>" +
        "</div>" +
        '<a class="apply" href="' + esc(r.url) + '" target="_blank" rel="noopener">Ouvrir ↗</a>' +
      "</div>"
    );
  }

  function render() {
    var d = state.data;
    var jobs = sortJobs(d.jobs || []).filter(matchesFilter);
    var grid = document.getElementById("grid");
    var empty = document.getElementById("empty");

    grid.innerHTML = jobs.map(jobCard).join("");
    empty.hidden = jobs.length > 0;

    // Resources only shown on "all" and "local" views.
    var res = document.getElementById("resources");
    if ((state.filter === "all" || state.filter === "local" || state.filter === "valid") && (d.resources || []).length) {
      res.innerHTML = d.resources.map(resourceCard).join("");
    } else {
      res.innerHTML = "";
    }
  }

  function renderMeta() {
    var d = state.data;
    var all = (d.jobs || []);
    var total = all.length;
    var valid = all.filter(function (j) { return !j.expired; }).length;
    var expired = total - valid;
    var local = all.filter(function (j) { return j.local && !j.expired; }).length;
    document.getElementById("counts").innerHTML =
      "<strong>" + valid + "</strong> valides · <strong>" + expired + "</strong> expirée(s) · " +
      "<strong>" + local + "</strong> locale(s) valide(s)";

    var upd = d.last_updated ? new Date(d.last_updated) : null;
    document.getElementById("updated").textContent = upd && !isNaN(upd)
      ? "Mis à jour le " + upd.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })
      : "";
  }

  function bindFilters() {
    document.getElementById("filters").addEventListener("click", function (e) {
      var btn = e.target.closest(".chip");
      if (!btn) return;
      state.filter = btn.dataset.filter;
      document.querySelectorAll(".chip").forEach(function (c) {
        c.classList.toggle("active", c === btn);
      });
      render();
    });
  }

  fetch("jobs.json?ts=" + Date.now())
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      state.data = data;
      renderMeta();
      bindFilters();
      render();
    })
    .catch(function (err) {
      document.getElementById("grid").innerHTML =
        '<p class="empty">Impossible de charger jobs.json — ' + esc(err.message) + "</p>";
    });
})();
