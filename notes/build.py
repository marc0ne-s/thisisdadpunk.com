#!/usr/bin/env python3
"""Build a NOTES article from markdown into the site's article template.

    python3 notes/build.py                     # build every src/*.md
    python3 notes/build.py the-now-playing-rig # build one

Source lives at notes/src/<slug>.md and starts with a small front-matter block:

    ---
    title: The now-playing rig
    dek: One sentence under the headline.
    when: 2026.11.28
    tags: TOUCHDESIGNER · STREAMDIFFUSION
    kicker: // NOTE 002 · BUILD GUIDE
    image: /assets/img/rig.png        (optional, path from site root)
    image_alt: What the picture shows.
    stamp: optional line over the hero image
    tryit: optional HTML for the box under the dek
    ---

Supported markdown: ## h2, ### h3, paragraphs, - / 1. lists, ``` fences,
> blockquotes, | tables |, --- rules, **bold**, *italic*, `code`, [text](url),
and ![alt](src) on its own line for a figure.

Deliberately small: it covers exactly what the NOTES pages use, and it refuses
to guess. Anything it does not recognise passes through as a paragraph so a
mistake shows up on the page rather than vanishing.
"""
import html
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DOCROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, 'src')

TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} — DADPUNK NOTES</title>
  <meta name="description" content="{dek_plain}">
  <meta name="theme-color" content="#0a0a0a">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{dek_plain}">
  <meta property="og:type" content="article">
  <link rel="icon" href="../../favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../../assets/css/notes.css">
</head>
<body>
  <div class="grain"></div>

  <div class="bar">
    <span class="bar__brand">THIS IS <i>DAD</i>PUNK</span>
    <span class="bar__tag">// NOTES</span>
    <span class="bar__spacer"></span>
    <a href="../../index.html">&larr; index</a>
  </div>
{hero}
  <article class="wrap">
    <p class="kicker">{kicker}</p>
    <h1>{title}</h1>
    <p class="dek">{dek}</p>
{tryit}
    <div class="meta">
      <span><b>{when}</b></span>
      <span>{read} MIN READ</span>
      <span>{tags}</span>
    </div>
<hr />
{body}
  </article>

  <footer class="foot">
    <span>© 2026 // BUDGEWOI, NSW</span>
    <a href="../../index.html">/index</a>
    <a href="../../notes/">/notes</a>
    <a href="../../lab/print/">/lab</a>
    <a href="https://github.com/marc0ne-s">GITHUB</a>
  </footer>
</body>
</html>
"""


def split_front(text):
    m = re.match(r'^---\n(.*?)\n---\n', text, re.S)
    if not m:
        raise SystemExit('missing front-matter block')
    meta = {}
    for line in m.group(1).splitlines():
        if ':' in line:
            k, v = line.split(':', 1)
            meta[k.strip()] = v.strip()
    return meta, text[m.end():]


def inline(s):
    """Inline markdown -> html. Code spans are protected first so their contents
    are not re-processed for bold/italic."""
    spans = []

    def stash(m):
        spans.append('<code>%s</code>' % html.escape(m.group(1)))
        return '\x00%d\x00' % (len(spans) - 1)

    s = re.sub(r'`([^`]+)`', stash, s)
    s = html.escape(s)
    s = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', r'<img alt="\1" src="\2">', s)
    s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', s)
    s = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'(?<![\w*])\*([^*\n]+)\*(?![\w*])', r'<em>\1</em>', s)
    for i, sp in enumerate(spans):
        s = s.replace('\x00%d\x00' % i, sp)
    return s


def table(rows):
    """| a | b |  with a |---| separator row."""
    head = [c.strip() for c in rows[0].strip().strip('|').split('|')]
    body = [[c.strip() for c in r.strip().strip('|').split('|')] for r in rows[2:]]
    out = ['<div class="tw"><table>', '<thead>', '<tr>']
    out += ['<th>%s</th>' % inline(c) for c in head]
    out += ['</tr>', '</thead>', '<tbody>']
    for r in body:
        out.append('<tr>' + ''.join('<td>%s</td>' % inline(c) for c in r) + '</tr>')
    out += ['</tbody>', '</table></div>']
    return '\n'.join(out)


def blocks(text):
    lines = text.split('\n')
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        s = line.strip()

        if not s:
            i += 1
            continue

        if s.startswith('```'):
            lang = s[3:].strip()
            i += 1
            buf = []
            while i < len(lines) and not lines[i].strip().startswith('```'):
                buf.append(lines[i])
                i += 1
            i += 1
            cls = ' class="lang-%s"' % lang if lang else ''
            out.append('<pre%s><code>%s</code></pre>' % (cls, html.escape('\n'.join(buf))))
            continue

        if s.startswith('|') and i + 1 < len(lines) and re.match(r'^\|[\s:|-]+\|$', lines[i + 1].strip()):
            rows = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                rows.append(lines[i])
                i += 1
            out.append(table(rows))
            continue

        if re.match(r'^---+$', s):
            out.append('<hr />')
            i += 1
            continue

        if s.startswith('### '):
            out.append('<h3>%s</h3>' % inline(s[4:]))
            i += 1
            continue

        if s.startswith('## '):
            out.append('<h2>%s</h2>' % inline(s[3:]))
            i += 1
            continue

        if s.startswith('> '):
            buf = []
            while i < len(lines) and lines[i].strip().startswith('>'):
                buf.append(lines[i].strip().lstrip('>').strip())
                i += 1
            out.append('<blockquote><p>%s</p></blockquote>' % inline(' '.join(buf)))
            continue

        m = re.match(r'^!\[([^\]]*)\]\(([^)]+)\)$', s)
        if m:
            out.append('<figure><img src="%s" alt="%s"><figcaption>%s</figcaption></figure>'
                       % (m.group(2), html.escape(m.group(1)), html.escape(m.group(1))))
            i += 1
            continue

        if re.match(r'^[-*] ', s):
            items = []
            while i < len(lines) and re.match(r'^[-*] ', lines[i].strip()):
                items.append('<li>%s</li>' % inline(lines[i].strip()[2:]))
                i += 1
            out.append('<ul>\n%s\n</ul>' % '\n'.join(items))
            continue

        if re.match(r'^\d+\. ', s):
            items = []
            while i < len(lines) and re.match(r'^\d+\. ', lines[i].strip()):
                items.append('<li>%s</li>' % inline(re.sub(r'^\d+\. ', '', lines[i].strip())))
                i += 1
            out.append('<ol>\n%s\n</ol>' % '\n'.join(items))
            continue

        buf = []
        while i < len(lines) and lines[i].strip() and not re.match(
                r'^(##|###|```|\||-{3,}|[-*] |\d+\. |> |!\[)', lines[i].strip()):
            buf.append(lines[i].strip())
            i += 1
        out.append('<p>%s</p>' % inline(' '.join(buf)))

    return '\n'.join(out)


def build(slug):
    src = os.path.join(SRC, slug + '.md')
    text = open(src, encoding='utf-8').read()
    meta, body_md = split_front(text)
    body = blocks(body_md)

    words = len(re.sub(r'<[^>]+>', ' ', body).split())
    read = max(1, round(words / 220))

    hero = ''
    if meta.get('image'):
        # A diagram hero must not be cropped: object-fit:cover eats the ends of a
        # wide figure. image_fit: contain keeps the whole thing visible.
        fit_cls = ' hero--contain' if str(meta.get('image_fit', '')).strip() == 'contain' else ''
        hero = ('  <div class="hero%s">\n'
                '    <img src="../../%s" alt="%s">\n'
                '%s'
                '  </div>\n') % (
            fit_cls,
            meta['image'].lstrip('/'),
            html.escape(meta.get('image_alt', '')),
            ('    <span class="hero__stamp">%s</span>\n' % html.escape(meta['stamp'])
             if meta.get('stamp') else ''))

    tryit = ''
    if meta.get('tryit'):
        tryit = '    <p class="tryit">%s</p>\n' % meta['tryit']

    page = TEMPLATE.format(
        title=html.escape(meta.get('title', slug)),
        dek=meta.get('dek', ''),
        dek_plain=html.escape(re.sub(r'<[^>]+>', '', meta.get('dek', ''))),
        kicker=meta.get('kicker', '// NOTE'),
        when=meta.get('when', ''),
        tags=meta.get('tags', ''),
        read=read,
        hero=hero,
        tryit=tryit,
        body=body,
    )

    outdir = os.path.join(HERE, slug)
    os.makedirs(outdir, exist_ok=True)
    outfile = os.path.join(outdir, 'index.html')
    with open(outfile, 'w', encoding='utf-8') as f:
        f.write(page)
    print('%-34s %5d words  ~%d min  -> %s' % (slug, words, read,
                                               os.path.relpath(outfile, DOCROOT)))


def main():
    args = sys.argv[1:]
    slugs = args or sorted(f[:-3] for f in os.listdir(SRC) if f.endswith('.md'))
    for s in slugs:
        build(s)


if __name__ == '__main__':
    main()
