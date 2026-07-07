(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function daysAgo(iso) {
    if (!iso) return null;
    var d = new Date(iso + (iso.length <= 10 ? "T00:00:00" : ""));
    if (isNaN(d)) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  function agoLabel(iso, prefix) {
    var n = daysAgo(iso);
    if (n == null) return "";
    if (n <= 0) return (prefix || "") + "aujourd'hui";
    if (n === 1) return (prefix || "") + "il y a 1 jour";
    return (prefix || "") + "il y a " + n + " jours";
  }

  function getJSON(path) {
    return fetch(path + "?ts=" + Date.now()).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  /* =========================================================================
   * ONGLET EMPLOI  (logique existante — inchangée fonctionnellement)
   * ========================================================================= */
  var jobsState = { data: null, filter: "valid", loaded: false };

  function isRemote(job) {
    return /remote|télétravail/i.test((job.location || "") + " " + (job.note || ""));
  }

  function postedLabel(job) { return agoLabel(job.posted, ""); }

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
    switch (jobsState.filter) {
      case "valid": return !job.expired;
      case "expired": return !!job.expired;
      case "local": return !!job.local && !job.expired;
      case "new": return !!job.new && !job.expired;
      case "remote": return isRemote(job) && !job.expired;
      default: return true;
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
        salary + postedRow + note + expiredMsg +
        '<div class="spacer"></div>' + apply +
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

  function renderJobs() {
    var d = jobsState.data;
    var jobs = sortJobs(d.jobs || []).filter(matchesFilter);
    document.getElementById("grid").innerHTML = jobs.map(jobCard).join("");
    document.getElementById("empty").hidden = jobs.length > 0;

    var res = document.getElementById("resources");
    if ((jobsState.filter === "all" || jobsState.filter === "local" || jobsState.filter === "valid") && (d.resources || []).length) {
      res.innerHTML = d.resources.map(resourceCard).join("");
    } else {
      res.innerHTML = "";
    }
  }

  function renderJobsMeta() {
    var d = jobsState.data;
    var all = (d.jobs || []);
    var valid = all.filter(function (j) { return !j.expired; }).length;
    var expired = all.length - valid;
    var local = all.filter(function (j) { return j.local && !j.expired; }).length;
    document.getElementById("counts").innerHTML =
      "<strong>" + valid + "</strong> valides · <strong>" + expired + "</strong> expirée(s) · " +
      "<strong>" + local + "</strong> locale(s) valide(s)";
    var upd = d.last_updated ? new Date(d.last_updated) : null;
    document.getElementById("updated").textContent = upd && !isNaN(upd)
      ? "Mis à jour le " + upd.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })
      : "";
  }

  function loadJobs() {
    if (jobsState.loaded) return;
    jobsState.loaded = true;
    document.getElementById("filters").addEventListener("click", function (e) {
      var btn = e.target.closest(".chip");
      if (!btn) return;
      jobsState.filter = btn.dataset.filter;
      document.querySelectorAll("#filters .chip").forEach(function (c) {
        c.classList.toggle("active", c === btn);
      });
      renderJobs();
    });
    getJSON("jobs.json").then(function (data) {
      jobsState.data = data;
      renderJobsMeta();
      renderJobs();
    }).catch(function (err) {
      document.getElementById("grid").innerHTML =
        '<p class="empty">Impossible de charger jobs.json — ' + esc(err.message) + "</p>";
    });
  }

  /* =========================================================================
   * ONGLET RECHERCHE MAC
   * ========================================================================= */
  var macLoaded = false;

  function macCard(l) {
    var badges = '<span class="badge contract platform">' + esc(l.platform || "?") + "</span>";
    var found = l.found_at ? '<div class="detail"><span class="ico">🕑</span>Trouvé ' + esc(agoLabel(l.found_at, "")) + "</div>" : "";
    var price = l.price ? '<div class="detail salary"><span class="ico">💶</span>' + esc(l.price) + "</div>" : "";
    var note = l.note ? '<p class="note">' + esc(l.note) + "</p>" : "";
    return (
      '<article class="card">' +
        '<div class="badges">' + badges + "</div>" +
        "<h2>" + esc(l.title) + "</h2>" +
        price + found + note +
        '<div class="spacer"></div>' +
        '<a class="apply" href="' + esc(l.url) + '" target="_blank" rel="noopener">Voir l\'annonce ↗</a>' +
      "</article>"
    );
  }

  function renderMac(d) {
    var bar = document.getElementById("mac-status");
    var st = (d.scraping_status || "unknown").toLowerCase();
    var failing = st === "failing" || st === "partial";
    bar.className = "status-bar " + (failing ? "warn" : "ok");
    var checked = d.last_checked
      ? new Date(d.last_checked).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })
      : "jamais";
    var target = d.target ? (esc(d.target.specs || "") ) : "";
    bar.innerHTML =
      '<span class="st-dot ' + (failing ? "warn" : "ok") + '"></span>' +
      '<span>Dernière vérification : <strong>' + esc(checked) + "</strong></span>" +
      '<span class="st-sep">·</span>' +
      '<span>Cible : ' + target + "</span>" +
      (failing ? '<span class="st-sep">·</span><span>⚠️ ' + esc(d.status_note || "Scraping en échec — la liste peut être obsolète.") + "</span>" : "");

    var listings = (d.listings || []).slice().sort(function (a, b) {
      return String(b.found_at || "").localeCompare(String(a.found_at || ""));
    });
    document.getElementById("mac-grid").innerHTML = listings.map(macCard).join("");
    document.getElementById("mac-empty").hidden = listings.length > 0;
  }

  function loadMac() {
    if (macLoaded) return;
    macLoaded = true;
    getJSON("mac-listings.json").then(renderMac).catch(function (err) {
      document.getElementById("mac-status").className = "status-bar warn";
      document.getElementById("mac-status").innerHTML =
        "⚠️ Impossible de charger mac-listings.json — " + esc(err.message);
    });
  }

  /* =========================================================================
   * ONGLET TÂCHES  (source: tasks.json + overlay localStorage, export manuel)
   * ========================================================================= */
  var tasksLoaded = false;
  var LS_KEY = "hub_tasks_v1";
  var tasksData = { tasks: [] };
  var taskFilter = "active";

  function loadTasksState(base) {
    var local = null;
    try { local = JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) {}
    // localStorage (édité par Thomas dans son navigateur) prime sur le JSON committé.
    if (local && Array.isArray(local.tasks)) return local;
    return base && Array.isArray(base.tasks) ? base : { tasks: [] };
  }

  function persistTasks() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(tasksData)); } catch (e) {}
  }

  function newId() { return "t" + Date.now().toString(36); }
  function today() { return new Date().toISOString().slice(0, 10); }

  var STATUS_ORDER = ["todo", "doing", "done"];
  var STATUS_LABEL = { todo: "À faire", doing: "En cours", done: "Fait" };

  function taskMatches(t) {
    switch (taskFilter) {
      case "active": return t.statut !== "done" && !t.archived;
      case "done": return t.statut === "done" && !t.archived;
      case "archived": return !!t.archived;
      default: return true; // all
    }
  }

  function taskRow(t) {
    var done = t.statut === "done";
    var cls = "task-row" + (done ? " done" : "") + (t.archived ? " archived" : "");
    var nextStatus = STATUS_ORDER[(STATUS_ORDER.indexOf(t.statut) + 1) % STATUS_ORDER.length];
    var meta = "Créée le " + esc(t.date_creation || "?") + (t.notes ? " · " + esc(t.notes) : "");
    return (
      '<div class="' + cls + '" data-id="' + esc(t.id) + '">' +
        '<button class="task-check ' + (done ? "checked" : "") + '" data-act="toggle" title="Cocher / décocher">' + (done ? "✓" : "") + "</button>" +
        '<div class="task-main">' +
          '<div class="task-title">' + esc(t.titre) + "</div>" +
          '<div class="task-meta">' + STATUS_LABEL[t.statut] + " · " + meta + "</div>" +
        "</div>" +
        '<button class="task-status-btn ' + (t.statut === "doing" ? "doing" : "") + '" data-act="cycle" title="Changer le statut">→ ' + STATUS_LABEL[nextStatus] + "</button>" +
        (t.archived
          ? '<button class="task-status-btn" data-act="unarchive">Restaurer</button>'
          : '<button class="task-status-btn" data-act="archive">Archiver</button>') +
        '<button class="task-del" data-act="del" title="Supprimer">🗑</button>' +
      "</div>"
    );
  }

  function renderTasks() {
    var list = tasksData.tasks.filter(taskMatches);
    // À faire d'abord, puis en cours, puis fait ; plus récentes en tête.
    var rank = { doing: 0, todo: 1, done: 2 };
    list.sort(function (a, b) {
      if (rank[a.statut] !== rank[b.statut]) return rank[a.statut] - rank[b.statut];
      return String(b.date_creation || "").localeCompare(String(a.date_creation || ""));
    });
    document.getElementById("tasks-list").innerHTML = list.map(taskRow).join("");
    document.getElementById("tasks-empty").hidden = list.length > 0;
  }

  function findTask(id) {
    for (var i = 0; i < tasksData.tasks.length; i++) if (tasksData.tasks[i].id === id) return tasksData.tasks[i];
    return null;
  }

  function loadTasks() {
    if (tasksLoaded) return;
    tasksLoaded = true;

    document.getElementById("task-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var input = document.getElementById("task-input");
      var v = input.value.trim();
      if (!v) return;
      tasksData.tasks.push({ id: newId(), titre: v, statut: "todo", date_creation: today(), notes: "" });
      input.value = "";
      persistTasks(); renderTasks();
    });

    document.getElementById("task-filters").addEventListener("click", function (e) {
      var btn = e.target.closest(".chip");
      if (!btn) return;
      taskFilter = btn.dataset.tfilter;
      document.querySelectorAll("#task-filters .chip").forEach(function (c) {
        c.classList.toggle("active", c === btn);
      });
      renderTasks();
    });

    document.getElementById("tasks-list").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-act]");
      if (!btn) return;
      var row = e.target.closest(".task-row");
      var t = findTask(row.dataset.id);
      if (!t) return;
      switch (btn.dataset.act) {
        case "toggle": t.statut = t.statut === "done" ? "todo" : "done"; break;
        case "cycle": t.statut = STATUS_ORDER[(STATUS_ORDER.indexOf(t.statut) + 1) % STATUS_ORDER.length]; break;
        case "archive": t.archived = true; break;
        case "unarchive": t.archived = false; break;
        case "del": tasksData.tasks = tasksData.tasks.filter(function (x) { return x.id !== t.id; }); break;
      }
      persistTasks(); renderTasks();
    });

    renderSyncBox();

    getJSON("tasks.json").then(function (base) {
      tasksData = loadTasksState(base);
      renderTasks();
    }).catch(function () {
      tasksData = loadTasksState(null);
      renderTasks();
    });
  }

  function renderSyncBox() {
    var box = document.getElementById("tasks-sync");
    box.innerHTML =
      '<div class="sync-box">' +
        "💾 <strong>Persistance</strong> — tes ajouts/coches sont sauvegardés <em>dans ce navigateur</em> (localStorage). " +
        "Pour les rendre permanents sur le dashboard (multi-appareils), exporte le JSON et transmets-le à Jarvis, " +
        "ou demande-lui simplement de mettre à jour <code>tasks.json</code>." +
        '<div><button class="apply" id="task-export-btn" style="margin-top:10px">📋 Exporter tasks.json</button></div>' +
        '<textarea id="task-export" readonly></textarea>' +
      "</div>";
    document.getElementById("task-export-btn").addEventListener("click", function () {
      var ta = document.getElementById("task-export");
      ta.value = JSON.stringify({ last_updated: today(), tasks: tasksData.tasks }, null, 2);
      ta.style.display = "block";
      ta.select();
      try { document.execCommand("copy"); this.textContent = "✓ Copié dans le presse-papier"; } catch (e) { this.textContent = "Sélectionne et copie ↓"; }
    });
  }

  /* =========================================================================
   * ONGLET KIOSQUE  (résumé condensé de kiosque-strojna/data.json)
   * ========================================================================= */
  var kiosqueLoaded = false;

  function eur(n) {
    if (n == null || isNaN(n)) return "—";
    return Math.round(n).toLocaleString("fr-FR") + " €";
  }

  function kpi(label, value, sub, subCls, valCls) {
    return (
      '<div class="kpi-card">' +
        '<div class="k-label">' + esc(label) + "</div>" +
        '<div class="k-value ' + (valCls || "") + '">' + value + "</div>" +
        (sub ? '<div class="k-sub ' + (subCls || "") + '">' + sub + "</div>" : "") +
      "</div>"
    );
  }

  function renderKiosque(d) {
    var head = document.getElementById("kiosque-head");
    var gen = d.generated_at ? new Date(d.generated_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "?";
    head.innerHTML = "<h2>🥪 " + esc(d.restaurant || "Kiosque") + "</h2><p>Indicateurs clés · données générées le " + esc(gen) + "</p>";

    var cards = [];
    var m = d.last_closed_month;
    if (m) {
      var delta = (m.prev_ca != null && m.ca_ttc != null) ? m.ca_ttc - m.prev_ca : null;
      var sub = delta != null
        ? (delta >= 0 ? "▲ +" : "▼ ") + eur(Math.abs(delta)) + " vs " + esc(m.prev_label || "mois préc.")
        : "";
      cards.push(kpi("CA dernier mois clos", eur(m.ca_ttc), esc(m.label) + (sub ? " · " + sub : ""), delta >= 0 ? "up" : "down"));
    }
    var w = d.week_forecast;
    if (w) {
      cards.push(kpi("Prévision semaine (" + esc(w.label || "") + ")", eur(w.estimated_ca),
        "Net estimé " + eur(w.estimated_net) + " · confiance " + Math.round(w.confidence_pct || 0) + "%", "", "pos"));
      if (w.best_day) {
        cards.push(kpi("Meilleur jour prévu", esc(w.best_day.dow || "?"),
          esc(w.best_day.date || "") + " · " + eur(w.best_day.ca)));
      }
    }
    var fc = d.food_cost;
    if (fc) {
      var over = fc.avg_pct != null && fc.target_pct != null && fc.avg_pct > fc.target_pct;
      cards.push(kpi("Food cost moyen", (fc.avg_pct != null ? fc.avg_pct.toFixed(1) + " %" : "—"),
        "Cible " + (fc.target_pct != null ? Math.round(fc.target_pct) + " %" : "?") + " · " + (fc.items_above_35pct || 0) + " produit(s) > 35 %",
        over ? "down" : "up"));
    }
    document.getElementById("kiosque-cards").innerHTML = cards.join("");

    var alerts = (d.alerts || []);
    document.getElementById("kiosque-alerts").innerHTML = alerts.length
      ? alerts.map(function (a) {
          var cls = a.level === "crit" ? "crit" : a.level === "ok" ? "ok" : "";
          var ico = a.level === "crit" ? "🔴" : a.level === "ok" ? "🟢" : "🟠";
          return '<div class="alert ' + cls + '">' + ico + " " + esc(a.text) + "</div>";
        }).join("")
      : '<div class="alert ok">🟢 Aucune alerte active.</div>';
  }

  function loadKiosque() {
    if (kiosqueLoaded) return;
    kiosqueLoaded = true;
    getJSON("kiosque-summary.json").then(renderKiosque).catch(function (err) {
      document.getElementById("kiosque-head").innerHTML =
        '<div class="status-bar warn">⚠️ Impossible de charger kiosque-summary.json — ' + esc(err.message) + "</div>";
    });
  }

  /* =========================================================================
   * ROUTER D'ONGLETS
   * ========================================================================= */
  var TITLES = {
    jobs: ["Offres d'emploi <span class=\"accent\">UX / UI / VR Designer</span>",
           "Veille pour Thomas — Perros-Guirec & Bretagne · dispo septembre 2026 · CDI / CDD / Freelance"],
    mac: ["Recherche <span class=\"accent\">Mac Studio / mini</span>",
          "Veille reconditionné/occasion · ≥64 Go RAM · ≥1 To · puce Max/Ultra/Pro · ≤2520 € TTC"],
    tasks: ["Tâches <span class=\"accent\">& activités en cours</span>",
            "Petit gestionnaire de tâches perso de Thomas"],
    kiosque: ["Kiosque <span class=\"accent\">Strojna</span>",
              "Indicateurs clés du restaurant — Port de Perros-Guirec"]
  };
  var LOADERS = { jobs: loadJobs, mac: loadMac, tasks: loadTasks, kiosque: loadKiosque };

  function activate(tab) {
    document.querySelectorAll(".tab").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === tab); });
    document.querySelectorAll(".panel").forEach(function (p) { p.classList.toggle("active", p.id === "panel-" + tab); });
    document.querySelectorAll(".tab-head").forEach(function (h) { h.classList.toggle("active", h.dataset.head === tab); });
    var t = TITLES[tab];
    if (t) {
      document.getElementById("page-title").innerHTML = t[0];
      document.getElementById("page-subtitle").textContent = t[1];
    }
    if (LOADERS[tab]) LOADERS[tab]();
    if (history.replaceState) history.replaceState(null, "", "#" + tab);
  }

  function init() {
    document.getElementById("tabs").addEventListener("click", function (e) {
      var btn = e.target.closest(".tab");
      if (btn) activate(btn.dataset.tab);
    });
    var initial = (location.hash || "").replace("#", "");
    activate(TITLES[initial] ? initial : "jobs");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
