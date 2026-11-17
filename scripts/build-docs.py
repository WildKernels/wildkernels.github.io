#!/usr/bin/env python3
"""Render the GKI wiki markdown into the site's docs.html paper section.

Run: python3 scripts/build-docs.py   (clones/updates the GKI wiki into .wiki-cache)
"""
import os, re, subprocess, sys, pathlib

markdown = __import__("markdown")


WIKI = pathlib.Path(os.environ.get("WK_WIKI", "") or (pathlib.Path(__file__).resolve().parent.parent / ".wiki-cache"))
OUT = pathlib.Path(__file__).resolve().parent.parent / "docs.html"
# keep a local copy of the wiki next to the site
if not (WIKI / "Home.md").exists():
    subprocess.run(["git", "clone", "--depth", "1",
                    "https://github.com/WildKernels/GKI_KernelSU_SUSFS.wiki.git", str(WIKI)], check=True)
else:
    subprocess.run(["git", "-C", str(WIKI), "pull", "--ff-only"], check=False)

SECTIONS = [
    ("installation.md", "install", "01", "Installation", "Two paths: you already have root, or you patch boot.img yourself."),
    ("kernelflasher.md", "kernelflasher", "02", "Kernel Flasher", "Upgrade from the phone. No PC, no fastboot."),
    ("magiskboot.md", "magiskboot", "03", "magiskboot", "Repack a stock boot.img with a pre-patched kernel."),
    ("post-install.md", "postinstall", "04", "Post-install", "Matching manager, SUSFS module, metamodules, verification."),
    ("features.md", "features", "05", "Features", "What is actually compiled into a Wild kernel."),
    ("configure-build.md", "configure", "06", "Configure a build", "Every Build Kernels input and what it changes."),
]

LINKMAP = {
    "installation.md": "#install", "kernelflasher.md": "#kernelflasher",
    "magiskboot.md": "#magiskboot", "post-install.md": "#postinstall",
    "features.md": "#features", "configure-build.md": "#configure",
    "Home.md": "index.html",
}
for k, v in list(LINKMAP.items()):
    LINKMAP.setdefault("./" + k, v)

DETAILS_RE = re.compile(r"<details>(.*?)</details>", re.S)
SUMMARY_RE = re.compile(r"<summary>(.*?)</summary>", re.S)


def md(text):
    return markdown.markdown(
        text,
        extensions=["tables", "fenced_code", "toc", "attr_list", "sane_lists"],
        extension_configs={"toc": {"permalink": False}},
    )


def convert_details(text):
    """Pull <details> blocks out, convert their markdown body, put them back."""
    store = []

    def grab(m):
        inner = m.group(1)
        sm = SUMMARY_RE.search(inner)
        summary = sm.group(1).strip() if sm else "Details"
        body = inner[sm.end():] if sm else inner
        store.append((summary, body))
        return f"@@DETAILS{len(store) - 1}@@"

    text = DETAILS_RE.sub(grab, text)
    return text, store


def restore_details(html, store):
    for i, (summary, body) in enumerate(store):
        block = ('<details><summary>' + summary + "</summary>\n" + md(body.strip()) + "\n</details>")
        html = html.replace(f"<p>@@DETAILS{i}@@</p>", block).replace(f"@@DETAILS{i}@@", block)
    return html


def fix_callouts(html):
    """GitHub-style > [!NOTE] alerts become styled divs."""
    def repl(m):
        kind = m.group(1).upper()
        body = m.group(2)
        body = re.sub(r"<p>\s*", "<p>", body).strip()
        cls = {"CAUTION": "callout", "WARNING": "callout", "IMPORTANT": "callout note",
               "NOTE": "callout note", "TIP": "callout note"}.get(kind, "callout note")
        label = {"CAUTION": "Caution", "WARNING": "Warning", "IMPORTANT": "Important",
                 "NOTE": "Note", "TIP": "Tip"}.get(kind, kind.title())
        body = body.replace("[!" + kind + "]", "").strip()
        return f'<div class="{cls}"><p><strong>{label}.</strong> ' + body.lstrip("<p>") + "</div>"

    html = re.sub(r"<blockquote>\s*<p>\[!(CAUTION|WARNING|IMPORTANT|NOTE|TIP)\]</p>(.*?)</blockquote>",
                  lambda m: repl(m), html, flags=re.S)
    # variation with text on the same line
    html = re.sub(r"<blockquote>\s*<p>\[!(CAUTION|WARNING|IMPORTANT|NOTE|TIP)\]\s*(.*?)</blockquote>",
                  lambda m: repl(m), html, flags=re.S)
    return html


def fix_tasks(html):
    return html.replace("<ul>\n<li>[ ]", '<ul class="chk">\n<li>').replace("<li>[ ] ", '<li>')


def fix_links(html):
    for src, dst in LINKMAP.items():
        html = html.replace(f'href="{src}"', f'href="{dst}"')
    html = re.sub(r'href="https://github.com/WildKernels/GKI_KernelSU_SUSFS/wiki/[^"]*"', 'href="https://github.com/WildKernels/GKI_KernelSU_SUSFS/wiki"', html)
    return html


def slug(s):
    s = re.sub(r"<[^>]+>", "", s).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def build_section(path, sid, num, title, dek):
    raw = (WIKI / path).read_text()
    raw = re.sub(r"^# .*\n", "", raw, count=1)          # drop the page H1
    raw, store = convert_details(raw)
    html = md(raw)
    html = restore_details(html, store)
    html = fix_callouts(html)
    html = fix_tasks(html)
    html = fix_links(html)
    # wiki H2s become H3 subsections (drop their generated ids; tag() re-ids them)
    html = re.sub(r"<h2[^>]*>(.*?)</h2>", r"<h3>\1</h3>", html, flags=re.S)
    html = html.replace("<h2>", "<h3>").replace("</h2>", "</h3>")

    subs = []
    def tag(m):
        text = m.group(1)
        hid = f"{sid}-{slug(text)}"
        subs.append((hid, re.sub(r"<[^>]+>", "", text)))
        return f'<h3 id="{hid}">{text}</h3>'
    html = re.sub(r"<h3>(.*?)</h3>", tag, html, flags=re.S)

    head = (f'<section id="{sid}">\n'
            f'<h2>{title}</h2>\n<p class="dek">{num} / {dek}</p>\n')
    return head + html + "\n</section>\n", subs


sections, toc = [], []
for path, sid, num, title, dek in SECTIONS:
    body, subs = build_section(path, sid, num, title, dek)
    sections.append(body)
    toc.append((sid, title, subs))

toc_html = ['<h4>On this page</h4><ol>', '<li><a href="#risk">Before anything</a></li>']
for sid, title, subs in toc:
    toc_html.append(f'<li><a href="#{sid}">{title}</a>')
    if subs:
        toc_html.append("<ol>")
        for hid, text in subs:
            toc_html.append(f'<li><a class="sub" href="#{hid}">{text}</a></li>')
        toc_html.append("</ol>")
    toc_html.append("</li>")
toc_html.append('<li><a href="#more">Elsewhere</a></li>')
toc_html.append("</ol>")

HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Docs — Wild Kernels</title>
<meta name="description" content="Wild Kernels documentation: install a GKI kernel with Kernel Flasher or magiskboot, post-install checks, every feature in the build, and every Build Kernels option.">
<meta name="theme-color" content="#0c0e0c">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<meta property="og:title" content="Wild Kernels — documentation">
<meta property="og:image" content="https://wildkernels.dev/assets/og.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..125,400..900&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/site.css?v=2">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>

<header class="site-head">
  <div class="wrap head-in">
    <a class="brand" href="index.html" aria-label="Wild Kernels home">
      <img src="logo.jpg" alt="" width="34" height="34">
      <span><b>Wild Kernels</b><span>wildkernels.dev</span></span>
    </a>
    <nav class="nav" aria-label="Sections">
      <a href="builds.html">Builds</a>
      <a href="docs.html" aria-current="page">Docs</a>
      <a href="projects.html">Projects</a>
      <a href="contact.html">Community</a>
    </nav>
    <div class="head-cta">
      <a class="btn btn-sm" href="https://github.com/WildKernels" target="_blank" rel="noopener">GitHub</a>
      <a class="btn btn-sm btn-gold" href="https://t.me/WildKernels" target="_blank" rel="noopener">Telegram</a>
    </div>
    <button class="menu-btn" aria-label="Menu" aria-expanded="false" aria-controls="sheet"><span></span><span></span><span></span></button>
  </div>
</header>
<div class="sheet" id="sheet">
  <a href="builds.html">Builds <small>629 files</small></a>
  <a href="docs.html">Docs <small>install</small></a>
  <a href="projects.html">Projects <small>19 repos</small></a>
  <a href="contact.html">Community <small>telegram</small></a>
  <a href="https://github.com/WildKernels" target="_blank" rel="noopener">GitHub <small>source</small></a>
</div>

<main id="main">
  <div class="wrap page-head">
    <p class="kicker"><span class="num">04</span> Documentation</p>
    <h1>Read this before you flash.</h1>
    <p class="lead">The same guides that live in the wiki, kept in one place: how to pick the right image, how to flash it with or without a PC, what to check afterwards, and what every build option actually does.</p>
  </div>

  <section class="paper">
    <div class="wrap docs-layout">
      <nav class="toc" aria-label="Contents">
"""

TAIL = """      </nav>
      <div class="doc-body">
        <section id="risk">
          <h2>Before anything</h2>
          <p class="dek">00 / the one paragraph everybody skips</p>
          <div class="callout">
            <p><strong>Flashing a kernel can brick your device.</strong> Back up your data and at minimum keep an untouched <code>boot.img</code> you can fastboot back. Everything here is provided as-is, with no warranty — Wild Kernels is not responsible for damage, data loss or voided warranties.</p>
          </div>
          <p>Two things decide whether a build boots: the <strong>kernel version</strong> your phone currently runs, and the <strong>root flavor</strong> your manager speaks. Get either wrong and the phone will bootloop or the manager will report a version mismatch. Both are checked in the guides below.</p>
        </section>
        __SECTIONS__
        <section id="more">
          <h2>Elsewhere</h2>
          <p class="dek">07 / source, builds, support</p>
          <ul>
            <li><a href="builds.html">Build browser</a> — every image, filterable.</li>
            <li><a href="https://github.com/WildKernels/GKI_KernelSU_SUSFS/releases">GitHub releases</a> — the canonical download page.</li>
            <li><a href="https://github.com/WildKernels/GKI_KernelSU_SUSFS/wiki">Upstream wiki</a> — same guides, GitHub-rendered.</li>
            <li><a href="contact.html">Community</a> — the Telegram group for support.</li>
          </ul>
          <p class="muted" style="font-size:13px;margin-top:18px">Portions of this documentation are adapted from the official KernelSU documentation.</p>
        </section>
      </div>
    </div>
  </section>
</main>

<footer>
  <div class="wrap">
    <div class="foot-mark" aria-hidden="true">Wild Kernels</div>
    <div class="foot-cols">
      <div>
        <h4>Wild Kernels</h4>
        <p>Custom Android kernels with KernelSU &amp; SUSFS. Built from AOSP, OnePlus, Samsung and Sultan sources. Everything is GPL-3.0 and built in public GitHub Actions.</p>
      </div>
      <div>
        <h4>Docs</h4>
        <a href="#install">Installation</a>
        <a href="#magiskboot">magiskboot</a>
        <a href="#postinstall">Post-install</a>
        <a href="#configure">Build options</a>
      </div>
      <div>
        <h4>Projects</h4>
        <a href="https://github.com/WildKernels/GKI_KernelSU_SUSFS">GKI</a>
        <a href="https://github.com/WildKernels/OnePlus_KernelSU_SUSFS">OnePlus</a>
        <a href="https://github.com/WildKernels/Samsung_KernelSU_SUSFS">Samsung</a>
        <a href="https://github.com/WildKernels/Sultan_KernelSU_SUSFS">Sultan / Pixel</a>
      </div>
      <div>
        <h4>Elsewhere</h4>
        <a href="https://t.me/WildKernels">Telegram group</a>
        <a href="https://t.me/TheWildJames">@TheWildJames</a>
        <a href="https://github.com/WildKernels">GitHub</a>
        <a href="contact.html">Contact &amp; support</a>
      </div>
    </div>
    <div class="foot-bottom">
      <span>GPL-3.0 · upstream credits to KernelSU, susfs4ksu, AnyKernel3, DroidSpaces, Baseband Guard and Sultan.</span>
      <span>Not responsible for bricked devices. Back up first.</span>
    </div>
  </div>
</footer>

<a class="to-top" href="#main" aria-label="Back to top">↑</a>
<script src="data.js"></script>
<script src="assets/site.js"></script>
</body>
</html>
"""

html = HEAD + "\n".join(toc_html) + "\n" + TAIL.replace("__SECTIONS__", "\n".join(sections))
OUT.write_text(html)
print("wrote", OUT, len(html), "bytes;", len(sections), "sections,", sum(len(t[2]) for t in toc), "subsections")
