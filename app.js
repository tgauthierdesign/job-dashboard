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
  var showArchived = false;
  var dragId = null;

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

  function taskCard(t) {
    var idx = STATUS_ORDER.indexOf(t.statut);
    var meta = "Créée le " + esc(t.date_creation || "?") + (t.notes ? " · " + esc(t.notes) : "");
    return (
      '<div class="kanban-card" draggable="true" data-id="' + esc(t.id) + '">' +
        '<div class="kanban-card-title">' + esc(t.titre) + "</div>" +
        '<div class="kanban-card-meta">' + meta + "</div>" +
        '<div class="kanban-card-actions">' +
          (idx > 0 ? '<button class="task-mini" data-act="left" title="Colonne précédente">◀</button>' : "") +
          (idx < STATUS_ORDER.length - 1 ? '<button class="task-mini" data-act="right" title="Colonne suivante">▶</button>' : "") +
          '<span class="task-mini-spacer"></span>' +
          '<button class="task-mini" data-act="archive" title="Archiver">🗄</button>' +
          '<button class="task-mini del" data-act="del" title="Supprimer">🗑</button>' +
        "</div>" +
      "</div>"
    );
  }

  function archivedRow(t) {
    return (
      '<div class="archived-row" data-id="' + esc(t.id) + '">' +
        '<span class="archived-title">' + esc(t.titre) + "</span>" +
        '<span class="archived-badge">' + STATUS_LABEL[t.statut] + "</span>" +
        '<button class="task-mini" data-act="unarchive" title="Restaurer">↩ Restaurer</button>' +
        '<button class="task-mini del" data-act="del" title="Supprimer">🗑</button>' +
      "</div>"
    );
  }

  function byDateDesc(a, b) {
    return String(b.date_creation || "").localeCompare(String(a.date_creation || ""));
  }

  function renderTasks() {
    var cols = { todo: [], doing: [], done: [] };
    var archived = [];
    tasksData.tasks.forEach(function (t) {
      if (t.archived) { archived.push(t); return; }
      if (!cols[t.statut]) t.statut = "todo"; // statut inconnu -> À faire
      cols[t.statut].push(t);
    });

    STATUS_ORDER.forEach(function (st) {
      var col = document.querySelector('.kanban-col[data-status="' + st + '"]');
      var arr = cols[st].sort(byDateDesc);
      col.querySelector(".kanban-body").innerHTML =
        arr.length ? arr.map(taskCard).join("") : '<div class="kanban-empty">Rien ici</div>';
      col.querySelector(".kanban-count").textContent = arr.length;
    });

    document.getElementById("arch-count").textContent = "(" + archived.length + ")";
    var wrap = document.getElementById("archived-wrap");
    if (showArchived) {
      wrap.hidden = false;
      wrap.innerHTML = archived.length
        ? archived.sort(byDateDesc).map(archivedRow).join("")
        : '<div class="kanban-empty">Aucune tâche archivée</div>';
    } else {
      wrap.hidden = true;
    }
  }

  function findTask(id) {
    for (var i = 0; i < tasksData.tasks.length; i++) if (tasksData.tasks[i].id === id) return tasksData.tasks[i];
    return null;
  }

  function moveTask(t, delta) {
    var idx = STATUS_ORDER.indexOf(t.statut);
    var ni = Math.max(0, Math.min(STATUS_ORDER.length - 1, idx + delta));
    if (ni !== idx) { t.statut = STATUS_ORDER[ni]; persistTasks(); renderTasks(); }
  }

  function setupDnd() {
    var board = document.getElementById("kanban");
    var zone = document.getElementById("archive-zone");

    board.addEventListener("dragstart", function (e) {
      var card = e.target.closest(".kanban-card");
      if (!card) return;
      dragId = card.dataset.id;
      card.classList.add("dragging");
      zone.hidden = false;
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", dragId); } catch (x) {} }
    });

    board.addEventListener("dragend", function () {
      var d = board.querySelector(".dragging");
      if (d) d.classList.remove("dragging");
      document.querySelectorAll(".kanban-col.drop-over").forEach(function (c) { c.classList.remove("drop-over"); });
      zone.classList.remove("drop-over");
      zone.hidden = true;
      dragId = null;
    });

    board.addEventListener("dragover", function (e) {
      var col = e.target.closest(".kanban-col");
      if (!col || !dragId) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      document.querySelectorAll(".kanban-col.drop-over").forEach(function (c) { if (c !== col) c.classList.remove("drop-over"); });
      col.classList.add("drop-over");
    });

    board.addEventListener("drop", function (e) {
      var col = e.target.closest(".kanban-col");
      if (!col || !dragId) return;
      e.preventDefault();
      var t = findTask(dragId);
      if (t && t.statut !== col.dataset.status) { t.statut = col.dataset.status; persistTasks(); }
      renderTasks();
    });

    // Zone d'archive (drop)
    zone.addEventListener("dragover", function (e) { if (dragId) { e.preventDefault(); zone.classList.add("drop-over"); } });
    zone.addEventListener("dragleave", function () { zone.classList.remove("drop-over"); });
    zone.addEventListener("drop", function (e) {
      if (!dragId) return;
      e.preventDefault();
      var t = findTask(dragId);
      if (t) { t.archived = true; persistTasks(); }
      renderTasks();
    });
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

    document.getElementById("toggle-archived").addEventListener("click", function () {
      showArchived = !showArchived;
      this.classList.toggle("active", showArchived);
      renderTasks();
    });

    // Clics sur les cartes (colonnes + zone archivées)
    function onCardClick(e) {
      var btn = e.target.closest("[data-act]");
      if (!btn) return;
      var host = e.target.closest(".kanban-card, .archived-row");
      if (!host) return;
      var t = findTask(host.dataset.id);
      if (!t) return;
      switch (btn.dataset.act) {
        case "left": moveTask(t, -1); return;
        case "right": moveTask(t, +1); return;
        case "archive": t.archived = true; break;
        case "unarchive": t.archived = false; break;
        case "del": tasksData.tasks = tasksData.tasks.filter(function (x) { return x.id !== t.id; }); break;
      }
      persistTasks(); renderTasks();
    }
    document.getElementById("kanban").addEventListener("click", onCardClick);
    document.getElementById("archived-wrap").addEventListener("click", onCardClick);

    setupDnd();
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
