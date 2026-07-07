(function () {
  "use strict";

  var state = { data: null, filter: "all" };

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

  // Local first, then new, then those with a posting date (most recent first).
  function sortJobs(jobs) {
    return jobs.slice().sort(function (a, b) {
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
      case "local": return !!job.local;
      case "new": return !!job.new;
      case "remote": return isRemote(job);
      default: return true;
    }
  }

  function jobCard(job) {
    var badges = "";
    if (job.local) badges += '<span class="badge local">⭐ Local</span>';
    if (job.new) badges += '<span class="badge new">🆕 Nouveau</span>';
    if (job.contract) badges += '<span class="badge contract">' + esc(job.contract) + "</span>";

    var posted = postedLabel(job);
    var salary = job.salary
      ? '<div class="detail salary"><span class="ico">💶</span>' + esc(job.salary) + "</div>"
      : "";
    var note = job.note ? '<p class="note">' + esc(job.note) + "</p>" : "";
    var postedRow = posted
      ? '<div class="detail"><span class="ico">🕑</span>Publié ' + esc(posted) + "</div>"
      : "";

    return (
      '<article class="card' + (job.local ? " local" : "") + '">' +
        '<div class="badges">' + badges + "</div>" +
        "<h2>" + esc(job.title) + "</h2>" +
        '<div class="detail company"><span class="ico">🏢</span>' + esc(job.company) + "</div>" +
        '<div class="detail"><span class="ico">📍</span>' + esc(job.location) + "</div>" +
        salary +
        postedRow +
        note +
        '<div class="spacer"></div>' +
        '<a class="apply" href="' + esc(job.url) + '" target="_blank" rel="noopener">Voir l\'annonce ↗</a>' +
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
    if ((state.filter === "all" || state.filter === "local") && (d.resources || []).length) {
      res.innerHTML = d.resources.map(resourceCard).join("");
    } else {
      res.innerHTML = "";
    }
  }

  function renderMeta() {
    var d = state.data;
    var total = (d.jobs || []).length;
    var local = (d.jobs || []).filter(function (j) { return j.local; }).length;
    document.getElementById("counts").innerHTML =
      "<strong>" + total + "</strong> offres · <strong>" + local + "</strong> locale(s)";

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
