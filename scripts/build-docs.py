#!/usr/bin/env python3
"""Render the GKI wiki markdown into docs.html in the site's showcase theme.

Run: python3 scripts/build-docs.py   (clones/updates the GKI wiki into .wiki-cache)
Needs python-markdown: use the Hermes venv python ($VENV/bin/python3) or pip install markdown.
"""
import os, re, subprocess, pathlib

markdown = __import__("markdown")

ROOT = pathlib.Path(__file__).resolve().parent.parent
WIKI = pathlib.Path(os.environ.get("WK_WIKI", "") or (ROOT / ".wiki-cache"))
OUT = ROOT / "docs.html"

if not (WIKI / "Home.md").exists():
    subprocess.run(["git", "clone", "--depth", "1",
                    "https://github.com/WildKernels/GKI_KernelSU_SUSFS.wiki.git", str(WIKI)], check=True)
else:
    subprocess.run(["git", "-C", str(WIKI), "pull", "--ff-only"], check=False)

SECTIONS = [
    ("installation.md", "install", "01", "Installation",
     "Two paths: you already have root, or you patch boot.img yourself."),
    ("kernelflasher.md", "kernelflasher", "02", "Kernel Flasher",
     "Upgrade from the phone. No PC, no fastboot."),
    ("magiskboot.md", "magiskboot", "03", "magiskboot",
     "Repack a stock boot.img with a pre-patched kernel."),
    ("post-install.md", "postinstall", "04", "Post-install",
     "Matching manager, SUSFS module, metamodules, verification."),
    ("features.md", "features", "05", "Features",
     "What is actually compiled into a Wild kernel."),
    ("configure-build.md", "configure", "06", "Configure a build",
     "Every Build Kernels input and what it changes."),
]

LINKMAP = {"installation.md": "#install", "kernelflasher.md": "#kernelflasher",
           "magiskboot.md": "#magiskboot", "post-install.md": "#postinstall",
           "features.md": "#features", "configure-build.md": "#configure",
           "Home.md": "index.html"}
for k, v in list(LINKMAP.items()):
    LINKMAP.setdefault("./" + k, v)

DETAILS_RE = re.compile(r"<details>(.*?)</details>", re.S)
SUMMARY_RE = re.compile(r"<summary>(.*?)</summary>", re.S)


def md(text):
    return markdown.markdown(text, extensions=["tables", "fenced_code", "toc", "attr_list", "sane_lists"],
                             extension_configs={"toc": {"permalink": False}})


def convert_details(text):
    store = []

    def grab(m):
        inner = m.group(1)
        sm = SUMMARY_RE.search(inner)
        summary = sm.group(1).strip() if sm else "Details"
        body = inner[sm.end():] if sm else inner
        store.append((summary, body))
        return f"@@DETAILS{len(store) - 1}@@"

    return DETAILS_RE.sub(grab, text), store


def restore_details(html, store):
    for i, (summary, body) in enumerate(store):
        block = "<details><summary>" + summary + "</summary>\n" + md(body.strip()) + "\n</details>"
        html = html.replace(f"<p>@@DETAILS{i}@@</p>", block).replace(f"@@DETAILS{i}@@", block)
    return html


CALL_LABEL = {"CAUTION": "Caution", "WARNING": "Warning", "IMPORTANT": "Important",
              "NOTE": "Note", "TIP": "Tip"}
CALL_CLASS = {"CAUTION": "callout", "WARNING": "callout", "IMPORTANT": "callout note",
              "NOTE": "callout note", "TIP": "callout note"}


def fix_callouts(html):
    def repl(m):
        kind = m.group(1).upper()
        body = m.group(2).replace("[!" + kind + "]", "").strip()
        body = re.sub(r"^<p>\s*", "<p>", body)
        cls = CALL_CLASS.get(kind, "callout note")
        label = CALL_LABEL.get(kind, kind.title())
        return f'<div class="{cls}"><p><strong>{label}.</strong> ' + body.lstrip("<p>") + "</div>"

    html = re.sub(r"<blockquote>\s*<p>\[!(CAUTION|WARNING|IMPORTANT|NOTE|TIP)\]</p>(.*?)</blockquote>",
                  repl, html, flags=re.S)
    html = re.sub(r"<blockquote>\s*<p>\[!(CAUTION|WARNING|IMPORTANT|NOTE|TIP)\]\s*(.*?)</blockquote>",
                  repl, html, flags=re.S)
    return html


def fix_tasks(html):
    return html.replace("<ul>\n<li>[ ]", '<ul class="chk">\n<li>').replace("<li>[ ] ", "<li>")


def fix_links(html):
    for src, dst in LINKMAP.items():
        html = html.replace(f'href="{src}"', f'href="{dst}"')
    return re.sub(r'href="https://github.com/WildKernels/GKI_KernelSU_SUSFS/wiki/[^"]*"',
                  'href="https://github.com/WildKernels/GKI_KernelSU_SUSFS/wiki"', html)


def slug(s):
    s = re.sub(r"<[^>]+>", "", s).lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def build_section(path, sid, num, title, dek):
    raw = (WIKI / path).read_text()
    raw = re.sub(r"^# .*\n", "", raw, count=1)
    raw, store = convert_details(raw)
    html = md(raw)
    html = restore_details(html, store)
    html = fix_callouts(html)
    html = fix_tasks(html)
    html = fix_links(html)
    html = re.sub(r"<h2[^>]*>(.*?)</h2>", r"<h3>\1</h3>", html, flags=re.S)
    html = html.replace("<h2>", "<h3>").replace("</h2>", "</h3>")

    subs = []

    def tag(m):
        text = m.group(1)
        hid = f"{sid}-{slug(text)}"
        subs.append((hid, re.sub(r"<[^>]+>", "", text)))
        return f'<h3 id="{hid}">{text}</h3>'

    html = re.sub(r"<h3>(.*?)</h3>", tag, html, flags=re.S)
    head = (f'<section id="{sid}">\n<h2>{title}</h2>\n'
            f'<p class="dek">{num} / {dek}</p>\n')
    return head + html + "\n</section>\n", subs


sections, toc = [], []
for path, sid, num, title, dek in SECTIONS:
    body, subs = build_section(path, sid, num, title, dek)
    sections.append(body)
    toc.append((sid, title, subs))

toc_html = ['<h4>On this page</h4><ol>',
            '<li><a href="#before">Before anything</a></li>']
for sid, title, subs in toc:
    toc_html.append(f'<li><a href="#{sid}">{title}</a></li>')
    if subs:
        toc_html.append("<ol>")
        for hid, text in subs:
            toc_html.append(f'<li><a class="sub" href="#{hid}">{text}</a></li>')
        toc_html.append("</ol>")
toc_html.append("</ol>")

HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Docs — Wild Kernels</title>
<meta name="description" content="How to install a Wild Kernels build: Kernel Flasher or magiskboot, post-install checks, every feature in the image, and every Build Kernels option.">
<meta name="theme-color" content="#04100d">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/showcase.css">
</head>
<body>

<header>
  <div class="wrap bar">
    <a class="logo" href="index.html"><img src="logo.jpg" alt="">Wild Kernels</a>
    <nav>
      <a href="builds.html">Builds</a>
      <a href="docs.html" aria-current="page">Docs</a>
      <a href="projects.html">Projects</a>
      <a href="https://t.me/WildKernels" target="_blank" rel="noopener">Telegram</a>
    </nav>
    <a class="btn primary sm" href="builds.html">Downloads</a>
  </div>
</header>

<div class="wrap page-head">
  <p class="kicker">Documentation</p>
  <h1>Read this before you flash.</h1>
  <p>The same guides that live in the wiki, in one place: how to pick the right image, how to flash it with or without a PC, what to check afterwards, and what every build option does.</p>
</div>

<div class="wrap docs-layout">
  <nav class="toc" aria-label="Contents">
"""

TAIL = """  </nav>
  <div class="doc-body">
    <section id="before">
      <h2>Before anything</h2>
      <p class="dek">00 / the one paragraph everybody skips</p>
      <div class="callout">
        <p><strong>Flashing a kernel can brick your device.</strong> Back up your data and keep an untouched <code>boot.img</code> you can fastboot back. Everything here is provided as-is — Wild Kernels is not responsible for damage, data loss or voided warranties.</p>
      </div>
      <p>Two things decide whether a build boots: the <strong>kernel version</strong> your phone currently runs, and the <strong>root flavour</strong> your manager speaks. Get either wrong and the phone bootloops or the manager reports a version mismatch. Both are covered below.</p>
    </section>
__SECTIONS__
    <section id="more">
      <h2>Elsewhere</h2>
      <p class="dek">07 / source, builds, support</p>
      <ul>
        <li><a href="builds.html">Build browser</a> — every image, filterable.</li>
        <li><a href="https://github.com/WildKernels/GKI_KernelSU_SUSFS/releases">GitHub releases</a> — the canonical download page.</li>
        <li><a href="https://github.com/WildKernels/GKI_KernelSU_SUSFS/wiki">Upstream wiki</a> — same guides, GitHub-rendered.</li>
        <li><a href="https://t.me/WildKernels">Telegram group</a> — support, in public.</li>
      </ul>
      <p style="color:var(--dim-2);font-size:13px;margin-top:18px">Portions of this documentation are adapted from the official KernelSU documentation.</p>
    </section>
  </div>
</div>

<footer>
  <div class="wrap foot">
    <span>Wild Kernels · GPL-3.0 · built in public</span>
    <span class="links">
      <a href="https://t.me/WildKernels" target="_blank" rel="noopener">Telegram</a>
      <a href="https://github.com/WildKernels" target="_blank" rel="noopener">GitHub</a>
      <a href="builds.html">Builds</a>
      <a href="projects.html">Projects</a>
    </span>
  </div>
</footer>

<script src="stats.js"></script>
<script src="assets/showcase.js"></script>
</body>
</html>
"""

html = HEAD + "\n".join(toc_html) + "\n      " + TAIL.replace("__SECTIONS__", "\n".join(sections))
OUT.write_text(html)
print("wrote", OUT, len(html), "bytes;", len(sections), "sections,", sum(len(t[2]) for t in toc), "subsections")
