/* Live release check — keeps the numbers honest without a rebuild.
 *
 * Fetch the newest GitHub release once per session (cached 15 min in localStorage),
 * recompute the counts from the asset names, and hand them to the page. Falls back
 * silently to stats.js (the build-time snapshot) when offline or rate-limited.
 */
(function () {
  "use strict";
  var REPO = "WildKernels/GKI_KernelSU_SUSFS";
  var CACHE_KEY = "wk-live-v1";
  var TTL = 15 * 60 * 1000;

  function emit(stats) {
    window.WK_STATS = stats;
    document.dispatchEvent(new CustomEvent("wk:stats", { detail: stats }));
  }

  function parse(rel) {
    var per = {}, targets = {}, newest = {}, managers = 0, roots = {};
    var re = /^(\d+\.\d+)\.(\d+)-(android\d+)(-lts)?-(.+?)-AnyKernel3\.zip$/;

    (rel.assets || []).forEach(function (a) {
      if (/\.apk$/i.test(a.name)) { managers++; return; }
      var m = a.name.match(re);
      if (!m) return;
      var line = m[1], version = m[1] + "." + m[2] + (m[4] ? "-lts" : ""), and = m[3], root = m[5];
      per[line] = (per[line] || 0) + 1;
      roots[root] = 1;
      targets[line] = targets[line] || {};
      targets[line][and] = 1;
      if (!newest[line] || cmp(version, newest[line]) > 0) newest[line] = version;
    });

    var order = Object.keys(per).sort(cmpLine);
    var targetsOut = {};
    order.forEach(function (l) {
      targetsOut[l] = Object.keys(targets[l]).sort(function (a, b) {
        return parseInt(a.replace(/\D/g, ""), 10) - parseInt(b.replace(/\D/g, ""), 10);
      });
    });

    function cmp(a, b) {
      var pa = a.split("-")[0].split(".").map(Number), pb = b.split("-")[0].split(".").map(Number);
      for (var i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
      return 0;
    }
    function cmpLine(a, b) {
      var pa = a.split(".").map(Number), pb = b.split(".").map(Number);
      return pa[0] - pb[0] || pa[1] - pb[1];
    }

    var total = order.reduce(function (n, l) { return n + per[l]; }, 0);
    var numbers = [];
    order.forEach(function (l) {
      targetsOut[l].forEach(function (a) { numbers.push(parseInt(a.replace(/\D/g, ""), 10)); });
    });
    var pub = (rel.published_at || "").slice(0, 10);
    var months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    var d = new Date(rel.published_at || Date.now());

    return {
      tag: rel.tag_name,
      published: pub,
      date_text: d.getUTCDate() + " " + months[d.getUTCMonth()] + " " + d.getUTCFullYear(),
      kernel_builds: total,
      lines: order.length,
      assets: (rel.assets || []).length,
      managers: managers,
      roots: Object.keys(roots).length,
      line_counts: per,
      line_targets: targetsOut,
      line_newest: newest,
      line_order: order,
      android_range: numbers.length ? Math.min.apply(null, numbers) + "–" + Math.max.apply(null, numbers) : "",
      generated: new Date().toISOString().slice(0, 10),
      live: true
    };
  }

  function fromCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (!c || !c.stats || Date.now() - c.at > TTL) return null;
      return c.stats;
    } catch (e) { return null; }
  }

  function toCache(stats) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), stats: stats })); } catch (e) {}
  }

  var cached = fromCache();
  if (cached) {
    // even a cached fetch is fresher than the build-time snapshot
    if (!window.WK_STATS || cached.tag !== window.WK_STATS.tag) emit(cached);
  }

  fetch("https://api.github.com/repos/" + REPO + "/releases/latest", {
    headers: { Accept: "application/vnd.github+json" },
    cache: "no-store"
  }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }).then(function (rel) {
    var stats = parse(rel);
    if (!stats.kernel_builds) throw new Error("no kernel assets parsed");
    toCache(stats);
    var current = window.WK_STATS || {};
    if (stats.tag !== current.tag || stats.kernel_builds !== current.kernel_builds) emit(stats);
    document.documentElement.dataset.live = stats.tag;
  }).catch(function () {
    document.documentElement.dataset.live = "offline";
  });
})();
