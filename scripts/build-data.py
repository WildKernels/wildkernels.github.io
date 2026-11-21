#!/usr/bin/env python3
"""Regenerate data.js for the Wild Kernels site from live GitHub release assets.

Run: python3 scripts/build-data.py   (needs the gh CLI, authenticated)
"""
import json, re, subprocess, datetime, os, pathlib

OUT = str(pathlib.Path(__file__).resolve().parent.parent / "data.js")

# repo -> key. The tag is always whatever GitHub reports as the latest release,
# so a new release is picked up by simply re-running this script.
REPOS = [
    ("gki", "WildKernels/GKI_KernelSU_SUSFS"),
    ("oneplus", "WildKernels/OnePlus_KernelSU_SUSFS"),
    ("samsung", "WildKernels/Samsung_KernelSU_SUSFS"),
    ("sultan", "WildKernels/Sultan_KernelSU_SUSFS"),
]

def gh(path):
    out = subprocess.run(["gh", "api", path], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)

def classify(repo, name):
    """-> dict(kind, line, android, version, root, extra)"""
    n = name
    if repo == "gki":
        m = re.match(r"^(\d+\.\d+\.\d+)-(android\d+)-(\d{4}-\d{2})(-lts)?-(.+?)-AnyKernel3\.zip$", n)
        if m:
            ver, andr, date, lts, root = m.group(1), m.group(2), m.group(3), m.group(4), m.group(5)
            return dict(kind="kernel", line=".".join(ver.split(".")[:2]), android=andr,
                        version=ver + ("-lts" if lts else ""), root=root, date=date,
                        channel="LTS" if lts else "Sublevel")
        if n.endswith(".apk"):
            root = ("KernelSU-Next" if "KernelSU_Next" in n or "KernelSU-Next" in n
                    else "BakaSU" if "BakaSU" in n else "KernelSU")
            return dict(kind="manager", root=root,
                        spoofed="spoofed" in n, abi=("arm64-v8a" if "arm64" in n else "universal"))
        if "NoMount" in n:
            return dict(kind="module", root="NoMount")
        return dict(kind="other")
    if repo == "oneplus":
        m = re.match(r"^AK3_(.+)_A(\d+)_(android\d+)-(\d+\.\d+\.\d+)_(\w+)_(\d+)_SuSFS_(v[\d.]+)\.zip$", n)
        if m:
            return dict(kind="kernel", device=m.group(1), os="Android " + m.group(2),
                        android=m.group(3), version=m.group(4), root=m.group(5),
                        build=m.group(6), susfs=m.group(7))
        return dict(kind="other")
    if repo == "samsung":
        m = re.match(r"^(SM-\w+)-Oneui([\d.]+)-KSUN(\d+)-SUSFS(.*)-AnyKernel3\.zip$", n)
        if m:
            return dict(kind="kernel", device=m.group(1), oneui=m.group(2), root="KSUN " + m.group(3))
        return dict(kind="other")
    if repo == "sultan":
        m = re.match(r"^(.+)-a(\d+)-(stock|wksu-susfs)-anykernel3-(v[\d.]+-r\d+)\.zip$", n)
        if m:
            return dict(kind="kernel", device=m.group(1), os="Android " + m.group(2),
                        root=("Wild KSU + SUSFS" if m.group(3) == "wksu-susfs" else "Stock"),
                        version=m.group(4))
        return dict(kind="other")
    return dict(kind="other")

data = {"generated": datetime.date.today().isoformat(), "repos": {}}

for key, repo in REPOS:
    rel = gh(f"repos/{repo}/releases/latest")
    tag = rel["tag_name"]
    meta = gh(f"repos/{repo}")
    assets = []
    for a in rel["assets"]:
        c = classify(key, a["name"])
        entry = dict(name=a["name"], size=round(a["size"] / 1048576, 1),
                     dl=a["download_count"], url=a["browser_download_url"],
                     at=(a.get("updated_at") or "")[:10])
        entry.update(c)
        assets.append(entry)
    assets.sort(key=lambda x: (-x["dl"], x["name"]))
    data["repos"][key] = dict(
        repo=repo, tag=tag, title=rel["name"], published=rel["published_at"][:10],
        url=rel["html_url"], stars=meta["stargazers_count"], forks=meta["forks_count"],
        assets=assets,
    )

# all public repos for the projects page
all_repos = gh("users/WildKernels/repos?per_page=100&sort=pushed")
data["org"] = [dict(
    name=r["name"], desc=r["description"] or "", stars=r["stargazers_count"],
    forks=r["forks_count"], lang=r["language"] or "", archived=r["archived"],
    fork=r["fork"], pushed=r["pushed_at"][:10], url=r["html_url"],
    topics=r.get("topics", [])[:4],
) for r in sorted(all_repos, key=lambda r: -r["stargazers_count"])]

# derived stats
gki = data["repos"]["gki"]["assets"]
kernels = [a for a in gki if a["kind"] == "kernel"]
lines = sorted({a["line"] for a in kernels}, key=lambda v: tuple(map(int, v.split("."))))
andrs = sorted({a["android"] for a in kernels})
roots = sorted({a["root"] for a in kernels if a.get("root")})
total_dl = sum(a["dl"] for r in data["repos"].values() for a in r["assets"])
stars = sum(r["stars"] for r in data["repos"].values())

matrix = {}
for a in kernels:
    matrix.setdefault(a["line"], {}).setdefault(a["android"], []).append(a["version"])
matrix = {k: {ak: sorted(v, key=lambda s: tuple(map(int, s.split("-")[0].split("."))), reverse=True)
              for ak, v in sorted(av.items())} for k, av in matrix.items()}

data["stats"] = dict(
    release_tag=data["repos"]["gki"]["tag"],
    release_date=data["repos"]["gki"]["published"],
    gki_assets=len(gki), kernel_builds=len(kernels),
    managers=len([a for a in gki if a["kind"] == "manager"]),
    lines=lines, androids=andrs, roots=roots,
    total_assets=sum(len(r["assets"]) for r in data["repos"].values()),
    total_downloads=total_dl, stars_tracked=stars,
    matrix=matrix,
)

# ---- tiny stats file for page headers (a few hundred bytes) ----
import datetime as _dt
_pub = data["repos"]["gki"]["published"]
_d = _dt.date.fromisoformat(_pub)
per_line = {k: sum(len(v) for v in av.values()) for k, av in matrix.items()}
line_targets = {k: sorted(av.keys(), key=lambda a: int(a.replace("android", ""))) for k, av in matrix.items()}
line_newest = {}
for k, av in matrix.items():
    vers = [v for lst in av.values() for v in lst]
    line_newest[k] = max(vers, key=lambda v: tuple(map(int, v.split("-")[0].split("."))))
line_order = sorted(matrix.keys(), key=lambda v: tuple(map(int, v.split("."))))
stats = {
    "tag": data["repos"]["gki"]["tag"],
    "published": _pub,
    "date_text": f"{_d.day} {_d.strftime('%B %Y')}",
    "kernel_builds": len(kernels),
    "lines": len(lines),
    "assets": len(gki),
    "roots": len(roots),
    "line_counts": dict(sorted(per_line.items(), key=lambda kv: tuple(map(int, kv[0].split("."))))),
    "line_targets": dict(sorted(line_targets.items(), key=lambda kv: tuple(map(int, kv[0].split("."))))),
    "line_newest": dict(sorted(line_newest.items(), key=lambda kv: tuple(map(int, kv[0].split("."))))),
    "line_order": line_order,
    "android_range": (f"{min(int(a.replace('android', '')) for a in andrs)}–"
                      f"{max(int(a.replace('android', '')) for a in andrs)}"),
    "generated": data["generated"],
}
STATS = pathlib.Path(OUT).parent / "stats.js"
STATS.write_text(
    "/* Generated " + data["generated"] + " from live GitHub release data. */\n"
    "window.WK_STATS = " + json.dumps(stats, separators=(",", ":")) + ";\n")
print("wrote", STATS, STATS.stat().st_size, "bytes")

with open(OUT, "w") as f:
    f.write("/* Generated " + data["generated"] + " from live GitHub release data. */\n")
    f.write("window.WK = ")
    json.dump(data, f, separators=(",", ":"))
    f.write(";\n")

print("wrote", OUT, os.path.getsize(OUT), "bytes")
print("lines:", lines, "androids:", andrs)
print("kernel builds:", len(kernels), "managers:", data["stats"]["managers"], "total dl:", total_dl)
for k, r in data["repos"].items():
    print(f"  {k}: {len(r['assets'])} assets, {r['stars']} stars, {r['tag']} {r['published']}")
print("matrix:", {k: {a: len(v) for a, v in av.items()} for k, av in matrix.items()})
