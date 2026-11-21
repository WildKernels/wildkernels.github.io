/* Wild Kernels — shared behaviour. No frameworks, no trackers. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var fmt = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); };
  var size = function (mb) { return mb >= 1 ? mb.toFixed(1) + " MB" : Math.round(mb * 1024) + " KB"; };
  var K = window.WK_STATS || {};

  /* ---------- live numbers (stats.js) ---------- */
  var statsReady = false;
  function fillStats() {
    if (!window.WK_STATS) return;
    K = window.WK_STATS;
    $$("[data-stat]").forEach(function (el) {
      var v = K[el.dataset.stat];
      if (v === undefined) return;
      el.textContent = (el.dataset.stat === "tag" || el.dataset.stat === "date_text") ? v : fmt(v);
    });
    $$("[data-kline]").forEach(function (tile) {
      var n = K.line_counts && K.line_counts[tile.dataset.kline];
      var slot = $("[data-line]", tile);
      if (n !== undefined && slot) slot.textContent = fmt(n);
    });
    renderTiles();
    statsReady = true;
  }

  function renderTiles() {
    var host = $("#vers");
    if (!host) return;
    var K2 = window.WK_STATS;
    if (!K2) return;
    var order = K2.line_order || Object.keys(K2.line_counts || {});
    host.innerHTML = order.map(function (line) {
      var targets = (K2.line_targets && K2.line_targets[line]) || [];
      var android = targets.length
        ? "Android " + targets.map(function (a) { return a.replace("android", ""); }).join(" · ")
        : "";
      var n = (K2.line_counts && K2.line_counts[line]) || 0;
      return '<a class="ver" data-kline="' + line + '" href="builds.html#line=' + encodeURIComponent(line) + '">' +
        '<div class="n">' + line + '</div>' +
        '<div class="t">' + android + '</div>' +
        '<div class="c">' + fmt(n) + " builds →</div></a>";
    }).join("");
  }

  fillStats();
  document.addEventListener("DOMContentLoaded", fillStats);
  document.addEventListener("wk:stats", function () { fillStats(); });

  /* ---------- build browser ---------- */
  var grid = $("#bgrid");
  if (grid && window.WK && window.WK.repos) {
    var D = window.WK;

    var LABELS = {
      gki: { f1: "Kernel line", f2: "Android target", root: "Root flavor" },
      oneplus: { f1: "Device", f2: "Android target", root: "Root" },
      samsung: { f1: "Device model", f2: "One UI", root: "" },
      sultan: { f1: "Device", f2: "Android target", root: "Build" }
    };
    var state = { repo: "gki", f1: "", f2: "", root: "", q: "", limit: 24, sort: "dl" };
    var el = {
      tabs: $("#repo-tabs"), f1: $("#f1"), f2: $("#f2"), root: $("#froot"), q: $("#q"),
      count: $("#count"), release: $("#release-meta"), more: $("#more"), empty: $("#empty"),
      l1: $("#l1"), l2: $("#l2"), sort: $("#sort"), clear: $("#clear")
    };

    var assets = function () { return D.repos[state.repo].assets; };
    var f1v = function (a) { return a.line || a.device || ""; };
    var f2v = function (a) { return a.android || (a.oneui ? "One UI " + a.oneui : "") || ""; };

    function uniq(list) {
      var seen = {}, out = [];
      list.forEach(function (v) {
        if (v && !seen[v]) { seen[v] = 1; out.push(v); }
      });
      return out.sort(function (a, b) {
        if (/^[\d.]+$/.test(a) && /^[\d.]+$/.test(b)) {
          var pa = a.split(".").map(Number), pb = b.split(".").map(Number);
          return pa[0] - pb[0] || pa[1] - pb[1];
        }
        return a.localeCompare(b, undefined, { numeric: true });
      });
    }

    function fillSelect(sel, values, current, allLabel) {
      sel.innerHTML = '<option value="">' + (allLabel || "All") + "</option>" + values.map(function (v) {
        return '<option value="' + esc(v) + '"' + (v === current ? " selected" : "") + ">" + esc(v) + "</option>";
      }).join("");
      sel.disabled = !values.length;
    }

    function sync() {
      var L = LABELS[state.repo], repo = D.repos[state.repo];
      el.l1.textContent = L.f1;
      el.l2.textContent = L.f2;
      fillSelect(el.f1, uniq(assets().map(f1v)), state.f1);
      fillSelect(el.f2, uniq(assets().map(f2v)), state.f2);
      if (L.root) {
        el.root.parentElement.hidden = false;
        fillSelect(el.root, uniq(assets().map(function (a) { return a.root; })), state.root);
      } else {
        el.root.parentElement.hidden = true;
      }
      el.release.innerHTML = "latest <a href=\"" + esc(repo.url) + "\" target=\"_blank\" rel=\"noopener\">" +
        esc(repo.tag) + "</a> · published " + esc(repo.published) + " · ★ " + fmt(repo.stars) + " stars";
    }

    function rows() {
      var q = state.q.trim().toLowerCase();
      var out = assets().filter(function (a) {
        if (state.f1 && f1v(a) !== state.f1) return false;
        if (state.f2 && f2v(a) !== state.f2) return false;
        if (state.root && a.root !== state.root) return false;
        if (q && a.name.toLowerCase().indexOf(q) === -1) return false;
        return true;
      });
      if (state.sort === "name") out.sort(function (a, b) { return a.name.localeCompare(b.name); });
      else if (state.sort === "new") out.sort(function (a, b) {
        return (b.version || b.at).localeCompare(a.version || a.at, undefined, { numeric: true });
      });
      else out.sort(function (a, b) { return b.dl - a.dl || a.name.localeCompare(b.name); });
      return out;
    }

    function mark(name) {
      var q = state.q.trim();
      if (!q) return esc(name);
      var i = name.toLowerCase().indexOf(q.toLowerCase());
      if (i < 0) return esc(name);
      return esc(name.slice(0, i)) + "<mark>" + esc(name.slice(i, i + q.length)) + "</mark>" + esc(name.slice(i + q.length));
    }

    function render() {
      var all = rows();
      el.count.innerHTML = "<b>" + fmt(all.length) + "</b> " + (all.length === 1 ? "file" : "files") +
        (all.length !== assets().length ? " of " + fmt(assets().length) : "");
      el.empty.hidden = all.length > 0;
      if (el.clear) el.clear.hidden = !(state.f1 || state.f2 || state.root || state.q);

      grid.innerHTML = all.slice(0, state.limit).map(function (a) {
        var meta = [];
        if (a.version) meta.push('<span class="v">' + esc(a.version) + "</span>");
        if (a.android) meta.push(esc(a.android));
        if (a.oneui) meta.push("One UI " + esc(a.oneui));
        if (a.device) meta.push(esc(a.device));
        if (a.channel) meta.push(esc(a.channel));
        if (a.susfs) meta.push(esc(a.susfs));
        if (a.kind === "manager") meta.push((a.spoofed ? "spoofed" : "normal") + " · " + esc(a.abi || ""));
        if (a.kind === "module") meta.push("meta module");
        meta.push('<span class="r">' + esc(a.root || a.kind) + "</span>");
        meta.push('<span class="s">' + size(a.size) + " · " + fmt(a.dl) + " ↓</span>");
        return '<article class="bitem">' +
          '<span class="fname">' + mark(a.name) + "</span>" +
          '<a class="get" href="' + esc(a.url) + '">download ↓</a>' +
          '<span class="fmeta">' + meta.join("") + "</span></article>";
      }).join("");

      el.more.hidden = all.length <= state.limit;
      if (!el.more.hidden) {
        $("button", el.more).textContent = "load " + Math.min(24, all.length - state.limit) + " more of " + fmt(all.length);
      }
    }

    $$(".tab", el.tabs).forEach(function (t) {
      t.addEventListener("click", function () {
        state.repo = t.dataset.repo;
        state.f1 = state.f2 = state.root = state.q = "";
        state.limit = 24;
        el.q.value = "";
        $$(".tab", el.tabs).forEach(function (x) {
          x.setAttribute("aria-selected", String(x === t));
        });
        sync(); render();
      });
    });

    [el.f1, el.f2, el.root].forEach(function (sel) {
      sel.addEventListener("change", function () {
        state[sel.id === "f1" ? "f1" : sel.id === "f2" ? "f2" : "root"] = sel.value;
        state.limit = 24; render();
      });
    });
    el.q.addEventListener("input", function () { state.q = el.q.value; state.limit = 24; render(); });
    el.sort.addEventListener("change", function () { state.sort = el.sort.value; render(); });
    if (el.clear) el.clear.addEventListener("click", function () {
      state.f1 = state.f2 = state.root = state.q = "";
      el.q.value = ""; state.limit = 24; sync(); render();
    });
    $("button", el.more).addEventListener("click", function () { state.limit += 24; render(); });

    // deep links: builds.html#line=6.1&android=android14&root=KernelSU
    function applyHash() {
      var h = new URLSearchParams(location.hash.replace(/^#/, ""));
      if (!h.toString()) return;
      if (h.get("repo") && D.repos[h.get("repo")]) state.repo = h.get("repo");
      state.f1 = h.get("line") || "";
      state.f2 = h.get("android") || "";
      state.root = h.get("root") || "";
      state.q = h.get("q") || "";
      el.q.value = state.q;
      state.limit = 24;
      $$(".tab", el.tabs).forEach(function (x) {
        x.setAttribute("aria-selected", String(x.dataset.repo === state.repo));
      });
      sync(); render();
    }
    applyHash();
    window.addEventListener("hashchange", applyHash);
    sync(); render();
  }

  /* ---------- docs: TOC highlight ---------- */
  var toc = $$(".toc a[href^='#']");
  if (toc.length && "IntersectionObserver" in window) {
    var heads = toc.map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        toc.forEach(function (a) { a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id); });
      });
    }, { rootMargin: "-15% 0px -70% 0px" });
    heads.forEach(function (h) { if (h) io.observe(h); });
  }

  /* ---------- copy buttons ---------- */
  $$("pre").forEach(function (pre) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "copy";
    btn.style.cssText = "position:absolute;top:8px;right:8px;font:500 9.5px var(--m);letter-spacing:.12em;text-transform:uppercase;" +
      "background:#0b1a14;color:#cfcabb;border:1px solid #2b4034;border-radius:6px;padding:5px 8px;opacity:0;transition:opacity .15s";
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
