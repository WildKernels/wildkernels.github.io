/* Wild Kernels — site behaviour. No frameworks, no trackers. */
(function () {
  "use strict";

  document.documentElement.classList.add("js");
  var D = window.WK || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var num = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); };

  /* ---------- chrome ---------- */
  var head = $(".site-head");
  var toTop = $(".to-top");
  function onScroll() {
    var y = window.scrollY;
    if (head) head.classList.toggle("is-stuck", y > 4);
    if (toTop) toTop.classList.toggle("show", y > 900);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  if (toTop) toTop.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  var menuBtn = $(".menu-btn"), sheet = $(".sheet");
  if (menuBtn && sheet) {
    menuBtn.addEventListener("click", function () {
      var open = sheet.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(open));
      document.body.style.overflow = open ? "hidden" : "";
    });
    $$("a", sheet).forEach(function (a) {
      a.addEventListener("click", function () {
        sheet.classList.remove("open");
        document.body.style.overflow = "";
        menuBtn.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- reveal ---------- */
  var reveals = $$(".reveal");
  if (reveals.length && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    reveals.forEach(function (el, i) {
      el.style.transitionDelay = Math.min(i % 4, 3) * 60 + "ms";
      io.observe(el);
    });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- index: release ledger ---------- */
  var ledger = $("#ledger-rows");
  if (ledger && D.stats) {
    var m = D.stats.matrix;
    var rowsData = Object.keys(m).map(function (line) {
      var newest = null, total = 0;
      Object.keys(m[line]).forEach(function (and) {
        var list = m[line][and];
        total += list.length;
        list.forEach(function (v) {
          if (!newest || cmpVer(v, newest.v) > 0) newest = { v: v, and: and };
        });
      });
      return { line: line, newest: newest, total: total };
    }).sort(function (a, b) { return cmpLine(a.line, b.line); });

    var grand = rowsData.reduce(function (a, r) { return a + r.total; }, 0);
    ledger.innerHTML = rowsData.map(function (r) {
      return '<div class="ledger-row">' +
        '<span class="line">' + esc(r.line) + '</span>' +
        '<span class="ver"><b>' + esc(r.newest.v.split("-")[0]) + '</b> · ' + esc(r.newest.and) + '</span>' +
        '<span class="n">' + r.total + ' builds</span>' +
        '</div>';
    }).join("") +
      '<div class="ledger-foot"><span>' + num(grand) + ' images · ' + D.stats.roots.length + ' roots</span>' +
      '<a href="builds.html">all builds →</a></div>';
  }

  function cmpVer(a, b) {
    var pa = a.split("-")[0].split(".").map(Number), pb = b.split("-")[0].split(".").map(Number);
    for (var i = 0; i < 3; i++) { if (pa[i] !== pb[i]) return pa[i] - pb[i]; }
    return 0;
  }
  function cmpLine(a, b) {
    var pa = a.split(".").map(Number), pb = b.split(".").map(Number);
    return pa[0] - pb[0] || pa[1] - pb[1];
  }

  /* ---------- index: latest builds ---------- */
  var size = function (mb) {
    return mb >= 1 ? mb.toFixed(1) + " MB" : Math.round(mb * 1024) + " KB";
  };
  var latest = $("#latest-builds");
  if (latest && D.repos) {
    var gk = D.repos.gki.assets.slice().sort(function (a, b) {
      return b.dl - a.dl || a.name.localeCompare(b.name);
    });
    latest.innerHTML = gk.slice(0, 9).map(function (a) {
      var label, built = a.date || a.at;
      if (a.kind === "kernel") label = a.version + " · " + a.android;
      else if (a.kind === "manager") label = a.root + " manager APK" + (a.spoofed ? " (spoofed)" : "");
      else label = "NoMount metamodule";
      return '<a class="brow" href="' + esc(a.url) + '">' +
        '<span class="name">' + esc(label) + ' <i>· ' + esc(a.kind === "kernel" ? a.channel.toLowerCase() : a.kind) + '</i></span>' +
        '<span class="tag root">' + esc(a.kind === "module" ? "NoMount" : a.root) + '</span>' +
        '<span class="tag">' + esc(built) + '</span>' +
        '<span class="sz">' + size(a.size) + '</span>' +
        '<span class="go">↓</span>' +
        '</a>';
    }).join("");
  }

  /* ---------- index: coverage matrix ---------- */
  var mbody = $("#matrix-body");
  if (mbody && D.stats) {
    var M = D.stats.matrix, ANDS = ["android12", "android13", "android14", "android15", "android16"];
    var NOTE = { "5.10": "GKI 2.0 baseline", "5.15": "GKI 2.0", "6.1": "GKI 2.0", "6.6": "GKI 2.0", "6.12": "GKI 2.0" };
    mbody.innerHTML = Object.keys(M).sort(cmpLine).map(function (line) {
      var cells = ANDS.map(function (and) {
        var list = M[line][and];
        if (!list || !list.length) return '<td class="cell empty">—</td>';
        var best = list.slice().sort(cmpVer).pop();
        return '<td class="cell"><b>' + esc(best.split("-")[0]) + '</b><span>' + list.length + ' images</span></td>';
      }).join("");
      return '<tr><td class="line">' + esc(line) + '<small>' + esc(NOTE[line] || "GKI 2.0") + '</small></td>' + cells + '</tr>';
    }).join("");
  }

  /* ---------- projects page ---------- */
  var repoTable = $("#repo-table");
  if (repoTable && D.org) {
    repoTable.innerHTML = D.org.filter(function (r) { return r.name !== "wildkernels.github.io"; })
      .map(function (r) {
        var badge = r.archived ? '<span class="badge archived">archived</span>' :
          r.fork ? '<span class="badge fork">fork</span>' :
          '<span class="badge active">active</span>';
        return '<a class="repo-row" href="' + esc(r.url) + '">' +
          '<span class="rname">' + esc(r.name) + (r.desc ? '<small>' + esc(r.desc) + '</small>' : '') + '</span>' +
          '<span class="rstat rlang">' + esc(r.lang || "—") + '</span>' +
          '<span class="rstat">★ <b>' + num(r.stars) + '</b></span>' +
          '<span class="rstat small-hide">⑂ <b>' + num(r.forks) + '</b></span>' +
          badge +
          '</a>';
      }).join("");
  }

  /* ---------- builds page ---------- */
  var grid = $("#bgrid");
  if (grid && D.repos) {
    var state = { repo: "gki", f1: "", f2: "", root: "", q: "", limit: 30, sort: "dl" };
    var tabsEl = $("#repo-tabs"), f1El = $("#f1"), f2El = $("#f2"), rootEl = $("#froot"),
        qEl = $("#q"), countEl = $("#count"), relEl = $("#release-meta"),
        moreEl = $("#loadmore"), emptyEl = $("#empty-state"),
        l1 = $("#l1"), l2 = $("#l2"), sortEl = $("#sort");

    var LABELS = {
      gki: { f1: "Kernel line", f2: "Android target", root: "Root flavor" },
      oneplus: { f1: "Device", f2: "Android target", root: "Root" },
      samsung: { f1: "Device model", f2: "One UI", root: "" },
      sultan: { f1: "Device", f2: "Android target", root: "Build" }
    };

    function assets() { return D.repos[state.repo].assets; }
    function field(a, which) {
      if (which === "f1") return a.line || a.device || "";
      return a.android || (a.oneui ? "One UI " + a.oneui : "") || "";
    }

    function fillSelect(el, values, label, current) {
      el.innerHTML = '<option value="">All</option>' + values.map(function (v) {
        return '<option value="' + esc(v) + '"' + (v === current ? " selected" : "") + '>' + esc(v) + '</option>';
      }).join("");
      el.disabled = !values.length;
    }

    function uniq(list) {
      var seen = {}, out = [];
      list.forEach(function (v) { if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
      return out.sort(function (a, b) {
        if (/^[\d.]+$/.test(a) && /^[\d.]+$/.test(b)) return cmpLine(a, b);
        return a.localeCompare(b, undefined, { numeric: true });
      });
    }

    function syncControls() {
      var L = LABELS[state.repo];
      l1.textContent = L.f1; l2.textContent = L.f2;
      var roots = uniq(assets().map(function (a) { return a.root; }));
      fillSelect(f1El, uniq(assets().map(function (a) { return field(a, "f1"); })), L.f1, state.f1);
      fillSelect(f2El, uniq(assets().map(function (a) { return field(a, "f2"); })), L.f2, state.f2);
      if (L.root) {
        rootEl.parentElement.style.display = "";
        fillSelect(rootEl, roots, L.root, state.root);
      } else {
        rootEl.parentElement.style.display = "none";
      }
      var rel = D.repos[state.repo];
      relEl.innerHTML = 'latest <a href="' + esc(rel.url) + '" target="_blank" rel="noopener">' + esc(rel.tag) +
        '</a> · published ' + esc(rel.published) + ' · ★ ' + num(rel.stars);
    }

    function view() {
      var q = state.q.trim().toLowerCase();
      var rows = assets().filter(function (a) {
        if (state.f1 && field(a, "f1") !== state.f1) return false;
        if (state.f2 && field(a, "f2") !== state.f2) return false;
        if (state.root && a.root !== state.root) return false;
        if (q && a.name.toLowerCase().indexOf(q) === -1) return false;
        return true;
      });
      if (state.sort === "name") rows.sort(function (a, b) { return a.name.localeCompare(b.name); });
      else if (state.sort === "new") rows.sort(function (a, b) { return (b.version || b.at).localeCompare(a.version || a.at, undefined, { numeric: true }); });
      else rows.sort(function (a, b) { return b.dl - a.dl || a.name.localeCompare(b.name); });
      return rows;
    }

    function mark(name) {
      var q = state.q.trim();
      if (!q) return esc(name);
      var i = name.toLowerCase().indexOf(q.toLowerCase());
      if (i < 0) return esc(name);
      return esc(name.slice(0, i)) + "<mark>" + esc(name.slice(i, i + q.length)) + "</mark>" + esc(name.slice(i + q.length));
    }

    function render(append) {
      var rows = view();
      countEl.innerHTML = "<b>" + num(rows.length) + "</b> " + (rows.length === 1 ? "file" : "files") +
        (rows.length !== assets().length ? " of " + num(assets().length) : "");
      emptyEl.hidden = rows.length > 0;
      var clearBtn = $("#clear");
      if (clearBtn) clearBtn.hidden = !(state.f1 || state.f2 || state.root || state.q);
      var slice = rows.slice(0, state.limit);
      grid.innerHTML = slice.map(function (a) {
        var meta = [];
        if (a.version) meta.push('<span class="v">' + esc(a.version) + "</span>");
        if (a.android) meta.push(esc(a.android));
        if (a.line) meta.push("line " + esc(a.line));
        if (a.oneui) meta.push("One UI " + esc(a.oneui));
        if (a.os && !a.android) meta.push(esc(a.os));
        if (a.device) meta.push(esc(a.device));
        if (a.channel) meta.push(esc(a.channel));
        if (a.susfs) meta.push(esc(a.susfs));
        if (a.kind === "manager") meta.push((a.spoofed ? "spoofed" : "normal") + " · " + esc(a.abi || ""));
        if (a.kind === "module") meta.push("meta module");
        meta.push('<span class="r">' + esc(a.root || a.kind) + "</span>");
        meta.push('<span class="s">' + (a.size >= 1 ? a.size + " MB" : Math.round(a.size * 1024) + " KB") + " · " + num(a.dl) + " ↓</span>");
        return '<article class="bitem">' +
          '<span class="fname">' + mark(a.name) + "</span>" +
          '<a class="get" href="' + esc(a.url) + '">download ↓</a>' +
          '<span class="fmeta">' + meta.join("") + "</span>" +
          "</article>";
      }).join("");
      moreEl.hidden = rows.length <= state.limit;
      if (!moreEl.hidden) {
        $("button", moreEl).textContent = "load " + Math.min(30, rows.length - state.limit) + " more of " + num(rows.length);
      }
    }

    $$(".tab", tabsEl).forEach(function (t) {
      t.addEventListener("click", function () {
        state.repo = t.dataset.repo;
        state.f1 = state.f2 = state.root = state.q = "";
        state.limit = 30;
        qEl.value = "";
        $$(".tab", tabsEl).forEach(function (x) { x.setAttribute("aria-selected", String(x === t)); });
        syncControls(); render();
      });
    });

    [f1El, f2El, rootEl].forEach(function (el) {
      el.addEventListener("change", function () {
        state[el.id === "f1" ? "f1" : el.id === "f2" ? "f2" : "root"] = el.value;
        state.limit = 30; render();
      });
    });
    qEl.addEventListener("input", function () { state.q = qEl.value; state.limit = 30; render(); });
    $("#clear").addEventListener("click", function () {
      state.f1 = state.f2 = state.root = state.q = "";
      qEl.value = ""; state.limit = 30;
      syncControls(); render();
    });
    sortEl.addEventListener("change", function () { state.sort = sortEl.value; render(); });
    $("button", moreEl).addEventListener("click", function () { state.limit += 30; render(); });

    syncControls(); render();
  }

  /* ---------- docs: TOC highlight ---------- */
  var tocLinks = $$(".toc a[href^='#']");
  if (tocLinks.length && "IntersectionObserver" in window) {
    var heads = tocLinks.map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); });
    var io2 = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        tocLinks.forEach(function (a) {
          a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id);
        });
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    heads.forEach(function (h) { if (h) io2.observe(h); });
  }

  /* ---------- copy buttons ---------- */
  $$("pre").forEach(function (pre) {
    var btn = document.createElement("button");
    btn.className = "copy";
    btn.type = "button";
    btn.textContent = "copy";
    btn.style.cssText = "position:absolute;top:6px;right:6px;font:500 9.5px var(--mono);letter-spacing:.12em;text-transform:uppercase;background:#22261c;color:#cfcabb;border:1px solid #3a4032;border-radius:2px;padding:5px 8px;cursor:pointer;opacity:0;transition:opacity .15s";
    pre.style.position = "relative";
    pre.appendChild(btn);
    pre.addEventListener("mouseenter", function () { btn.style.opacity = "1"; });
    pre.addEventListener("mouseleave", function () { btn.style.opacity = "0"; });
    btn.addEventListener("click", function () {
      var code = pre.querySelector("code") || pre;
      navigator.clipboard.writeText(code.innerText.replace(/\ncopy$/, "")).then(function () {
        btn.textContent = "copied";
        setTimeout(function () { btn.textContent = "copy"; }, 1400);
      });
    });
  });
})();
