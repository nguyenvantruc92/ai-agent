#!/usr/bin/env python3
"""Generates the flat illustration used as the main image of every demo product (data/seed/product-images/<CODE>.webp).

Usage: python3 scripts/generate-product-images.py data/seed/product-images
Needs Python 3 and ImageMagick (`convert`). The committed WebP files are what `pnpm db:seed` imports, so this only needs to
run again when the look of the images or the demo catalogue changes.
"""
import subprocess, sys, os, json
W, H = 600, 750

def shade(hexc, f):
    h = hexc.lstrip('#'); r, g, b = [int(h[i:i+2], 16) for i in (0, 2, 4)]
    if f >= 0: r, g, b = [round(c + (255 - c) * f) for c in (r, g, b)]
    else: r, g, b = [round(c * (1 + f)) for c in (r, g, b)]
    return '#%02x%02x%02x' % (r, g, b)

COLORS = {
 'den': '#2a2a30', 'trang': '#f6f5f2', 'xam than': '#4b5563', 'xam': '#9ca3af', 'xam dam': '#5b616b', 'xam melange': '#b9b9c4',
 'be': '#d9c7a1', 'nau': '#7a5a3a', 'navy': '#27334f', 'xanh nhat': '#bcd2e8', 'xanh dam': '#2b4a7a', 'xanh reu': '#56673d',
 'indigo': '#3f4f93', 'denim': '#5b7cab', 'trang nga': '#f0e8d3',
}
BGS = ['#ede9fe', '#fce7f3', '#dbeafe', '#ccfbf1', '#fef3c7', '#e0e7ff', '#fae8ff', '#ffedd5']

def ink(c):  # outline colour, visible for light garments too
    return shade(c, -0.28)

def defs(c):
    return ''

def body_short(c):
    return f'M205 120 L112 172 L62 292 L138 326 L178 252 L178 610 Q300 636 422 610 L422 252 L462 326 L538 292 L488 172 L395 120 Q300 188 205 120 Z'
def body_long(c, hem=620):
    return f'M205 118 L112 160 L52 560 L124 574 L182 300 L182 {hem} Q300 {hem+24} 418 {hem} L418 300 L476 574 L548 560 L488 160 L395 118 Q300 186 205 118 Z'

def g(c, d, extra=''):
    return (f'<path d="{d}" fill="{c}" stroke="{ink(c)}" stroke-width="3" stroke-linejoin="round"/>' + extra)

def sheen(d, clip_id=None):
    return f'<path d="{d}" fill="#000" opacity="0.05"/>'

def buttons(xs, c):
    return ''.join(f'<circle cx="{x}" cy="{y}" r="7" fill="{shade(c, 0.6 if sum(int(c.lstrip("#")[i:i+2],16) for i in (0,2,4))<420 else -0.35)}" stroke="{ink(c)}" stroke-width="1.5"/>' for x, y in xs)

PATTERN = {}
def stripes(c, body, color, step=34, thick=12, vertical=False, id='cl'):
    PATTERN.update(body=body, svg=None)
    lines = ''
    if vertical:
        for x in range(30, W, step): lines += f'<rect x="{x}" y="100" width="{thick}" height="560" fill="{color}"/>'
    else:
        for y in range(120, 660, step): lines += f'<rect x="40" y="{y}" width="520" height="{thick}" fill="{color}"/>'
    PATTERN['svg'] = lines
    return '<!--P-->'

def check(c, body, color, step=40, id='cc'):
    PATTERN.update(body=body, svg=None)
    lines = ''
    for x in range(30, W, step): lines += f'<rect x="{x}" y="100" width="8" height="560" fill="{color}" opacity=".55"/>'
    for y in range(120, 660, step): lines += f'<rect x="40" y="{y}" width="520" height="8" fill="{color}" opacity=".55"/>'
    PATTERN['svg'] = lines
    return '<!--P-->'

def tee(c, v):
    b = body_short(c); s = g(c, b) + sheen('M300 190 L422 252 L422 610 Q360 622 300 622 Z')
    s += f'<path d="M205 120 Q300 188 395 120" fill="none" stroke="{ink(c)}" stroke-width="3"/>'
    if v == 'graphic':
        s += f'<text x="300" y="400" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="54" text-anchor="middle" fill="#27334f">CITY</text><text x="300" y="456" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="54" text-anchor="middle" fill="#e11d74">RIDE</text><rect x="210" y="476" width="180" height="8" rx="4" fill="#27334f"/>'
        s += f'<path d="M232 130 Q300 196 368 130 L388 132 Q300 214 212 132 Z" fill="#27334f" opacity=".85"/>'
    elif v == 'henley':
        s += f'<path d="M205 120 Q300 192 395 120 L385 118 Q300 175 215 118Z" fill="{shade(c,-.15)}"/><rect x="288" y="168" width="24" height="170" rx="6" fill="{shade(c,-.12)}" stroke="{ink(c)}" stroke-width="2"/>' + buttons([(300, 200), (300, 252), (300, 304)], c)
    else:
        s += f'<path d="M232 126 Q300 192 368 126 L386 128 Q300 214 214 128 Z" fill="{shade(c,-.2)}" stroke="{ink(c)}" stroke-width="2"/>'
    return s

def polo(c, v):
    b = body_short(c); s = g(c, b) + sheen('M300 190 L422 252 L422 610 Q360 622 300 622 Z')
    if v == 'stripe': s += stripes(c, b, '#b9c6a3' if False else shade(c, 0.45), 40, 16)
    col = shade(c, 0.1 if sum(int(c.lstrip('#')[i:i+2], 16) for i in (0, 2, 4)) < 200 else -0.1)
    s += f'<path d="M205 120 L262 112 L300 186 L246 172 Z" fill="{col}" stroke="{ink(c)}" stroke-width="3" stroke-linejoin="round"/>'
    s += f'<path d="M395 120 L338 112 L300 186 L354 172 Z" fill="{col}" stroke="{ink(c)}" stroke-width="3" stroke-linejoin="round"/>'
    s += f'<rect x="288" y="186" width="24" height="120" rx="5" fill="{shade(c,-.1)}" stroke="{ink(c)}" stroke-width="2"/>' + buttons([(300, 218), (300, 264)], c)
    s += f'<path d="M62 292 L138 326" stroke="{ink(c)}" stroke-width="10" opacity=".25"/><path d="M538 292 L462 326" stroke="{ink(c)}" stroke-width="10" opacity=".25"/>'
    return s

def shirt(c, v):
    b = body_long(c, 640); s = g(c, b)
    if v == 'stripe': s += stripes(c, b, '#5b7cab', 36, 12, vertical=True)
    if v == 'check': s += check(c, b, '#8da2c7' if False else shade(c, 0.35), 44)
    s += sheen('M300 190 L418 300 L418 640 Q360 650 300 650 Z')
    s += f'<path d="M205 118 L255 104 L300 192 L236 166 Z" fill="{shade(c,0.08 if v not in ("black",) else .25)}" stroke="{ink(c)}" stroke-width="3" stroke-linejoin="round"/>'
    s += f'<path d="M395 118 L345 104 L300 192 L364 166 Z" fill="{shade(c,0.08)}" stroke="{ink(c)}" stroke-width="3" stroke-linejoin="round"/>'
    s += f'<line x1="300" y1="192" x2="300" y2="640" stroke="{ink(c)}" stroke-width="2.5"/>'
    s += buttons([(300, y) for y in (230, 300, 370, 440, 510, 580)], c)
    s += f'<rect x="212" y="330" width="72" height="80" rx="6" fill="none" stroke="{ink(c)}" stroke-width="2.5"/>' if v != 'plain' else ''
    s += f'<path d="M52 560 L124 574" stroke="{ink(c)}" stroke-width="5"/><path d="M548 560 L476 574" stroke="{ink(c)}" stroke-width="5"/>'
    return s

def knit(c, v):
    b = body_long(c, 600 if v == 'crew' else 640)
    s = g(c, b) + sheen('M300 190 L418 300 L418 620 Q360 628 300 628 Z')
    rib = shade(c, -0.12)
    s += ''.join(f'<line x1="{x}" y1="560" x2="{x}" y2="612" stroke="{ink(c)}" stroke-width="2" opacity=".5"/>' for x in range(186, 416, 12))
    s += f'<path d="M182 560 L418 560" stroke="{ink(c)}" stroke-width="3"/>'
    if v == 'crew':
        s += f'<ellipse cx="300" cy="140" rx="86" ry="34" fill="{rib}" stroke="{ink(c)}" stroke-width="3"/><ellipse cx="300" cy="136" rx="62" ry="22" fill="{shade(c,-.45)}" opacity=".35"/>'
    else:
        s += f'<path d="M205 118 L300 300 L395 118 L350 112 L300 205 L250 112 Z" fill="{rib}" stroke="{ink(c)}" stroke-width="3" stroke-linejoin="round"/>' + f'<line x1="300" y1="300" x2="300" y2="640" stroke="{ink(c)}" stroke-width="3"/>' + buttons([(300, y) for y in (350, 420, 490, 560)], c)
    return s

def jacket(c, v):
    b = body_long(c, 600)
    s = g(c, b) + sheen('M300 190 L418 300 L418 600 Q360 612 300 612 Z')
    if v == 'bomber':
        s += f'<rect x="170" y="565" width="260" height="52" rx="10" fill="{shade(c,-.1)}" stroke="{ink(c)}" stroke-width="3"/>' + ''.join(f'<line x1="{x}" y1="568" x2="{x}" y2="614" stroke="{ink(c)}" stroke-width="2" opacity=".5"/>' for x in range(184, 426, 14))
        s += f'<path d="M205 118 Q300 180 395 118 L408 150 Q300 210 192 150 Z" fill="{shade(c,-.1)}" stroke="{ink(c)}" stroke-width="3"/>'
        s += f'<line x1="300" y1="196" x2="300" y2="566" stroke="{shade(c,.5)}" stroke-width="4"/><rect x="293" y="200" width="14" height="26" rx="4" fill="{shade(c,.6)}"/>'
        s += f'<path d="M205 360 L250 360" stroke="{ink(c)}" stroke-width="3"/><path d="M350 360 L395 360" stroke="{ink(c)}" stroke-width="3"/>'
    elif v == 'coach':
        s += f'<path d="M205 118 L255 106 L300 188 L240 170 Z M395 118 L345 106 L300 188 L360 170 Z" fill="{shade(c,-.1)}" stroke="{ink(c)}" stroke-width="3"/>'
        s += f'<line x1="300" y1="188" x2="300" y2="600" stroke="{ink(c)}" stroke-width="3"/>' + buttons([(300, y) for y in (240, 320, 400, 480, 560)], c)
        s += f'<rect x="212" y="420" width="66" height="8" rx="3" fill="{shade(c,.4)}"/><rect x="322" y="420" width="66" height="8" rx="3" fill="{shade(c,.4)}"/>'
    elif v == 'denim':
        s += f'<path d="M205 118 L255 104 L300 190 L236 168 Z M395 118 L345 104 L300 190 L364 168 Z" fill="{shade(c,.1)}" stroke="{ink(c)}" stroke-width="3"/>'
        s += f'<line x1="300" y1="190" x2="300" y2="610" stroke="{ink(c)}" stroke-width="3"/>' + buttons([(300, y) for y in (232, 310, 388, 466, 544)], c)
        s += f'<rect x="206" y="280" width="76" height="90" rx="6" fill="none" stroke="{shade(c,.5)}" stroke-width="3" stroke-dasharray="8 5"/><rect x="318" y="280" width="76" height="90" rx="6" fill="none" stroke="{shade(c,.5)}" stroke-width="3" stroke-dasharray="8 5"/>'
    else:  # blazer
        s += f'<path d="M205 118 L300 400 L395 118 L350 108 L300 230 L250 108 Z" fill="{shade(c,-.12)}" stroke="{ink(c)}" stroke-width="3" stroke-linejoin="round"/>'
        s += f'<path d="M300 400 L330 470 M300 400 L270 470" stroke="{ink(c)}" stroke-width="3"/>' + buttons([(300, 440), (300, 505)], c)
        s += f'<rect x="206" y="470" width="70" height="10" rx="4" fill="{ink(c)}" opacity=".5"/><rect x="324" y="470" width="70" height="10" rx="4" fill="{ink(c)}" opacity=".5"/>'
    return s

def pants(c, v):
    if v == 'short': leg = 420; split = 300
    else: leg = 650
    if v == 'jogger':
        b = 'M178 118 L422 118 L440 330 L420 590 L405 640 L318 640 L300 280 L282 640 L195 640 L180 590 L160 330 Z'
    elif v == 'short':
        b = 'M176 118 L424 118 L448 440 L316 440 L300 270 L284 440 L152 440 Z'
    else:
        b = 'M178 118 L422 118 L444 650 L320 650 L300 290 L280 650 L156 650 Z'
    sh = {'short': 'M300 118 L424 118 L448 440 L316 440 L300 270 Z', 'jogger': 'M300 118 L422 118 L440 330 L420 590 L405 640 L318 640 L300 280 Z'}.get(v, 'M300 120 L422 118 L444 650 L320 650 L300 290 Z')
    s = g(c, b) + sheen(sh)
    s += f'<rect x="174" y="108" width="252" height="34" rx="6" fill="{shade(c,-.1)}" stroke="{ink(c)}" stroke-width="3"/>'
    s += ''.join(f'<rect x="{x}" y="100" width="12" height="52" rx="4" fill="{shade(c,-.18)}" stroke="{ink(c)}" stroke-width="1.5"/>' for x in (210, 300, 378)) if v in ('chino', 'tay', 'jeans') else ''
    s += f'<path d="M300 142 L300 290" stroke="{ink(c)}" stroke-width="3"/><path d="M300 200 Q330 200 332 150" fill="none" stroke="{ink(c)}" stroke-width="3"/>'
    s += f'<path d="M184 150 Q226 168 242 226" fill="none" stroke="{ink(c)}" stroke-width="3"/><path d="M416 150 Q374 168 358 226" fill="none" stroke="{ink(c)}" stroke-width="3"/>'
    if v == 'jeans': s += f'<path d="M184 150 Q222 166 236 214" fill="none" stroke="{shade(c,.5)}" stroke-width="2.5" stroke-dasharray="7 5"/><path d="M416 150 Q378 166 364 214" fill="none" stroke="{shade(c,.5)}" stroke-width="2.5" stroke-dasharray="7 5"/>'
    if v == 'tay': s += f'<line x1="228" y1="190" x2="212" y2="640" stroke="{ink(c)}" stroke-width="2" opacity=".5"/><line x1="372" y1="190" x2="388" y2="640" stroke="{ink(c)}" stroke-width="2" opacity=".5"/>'
    if v == 'jogger':
        s += f'<path d="M160 330 L195 640 L180 590" stroke="none"/><rect x="195" y="610" width="123" height="30" fill="{shade(c,-.12)}" stroke="{ink(c)}" stroke-width="3"/><rect x="282" y="610" width="123" height="30" fill="{shade(c,-.12)}" stroke="{ink(c)}" stroke-width="3"/>'
        s += f'<path d="M270 128 Q300 170 330 128" fill="none" stroke="{shade(c,.5)}" stroke-width="4"/>'
    if v == 'short' and False: pass
    return s

def belt(c, v):
    s = f'<rect x="40" y="320" width="520" height="70" rx="14" fill="{c}" stroke="{ink(c)}" stroke-width="3"/>'
    s += f'<rect x="40" y="320" width="520" height="14" rx="7" fill="#fff" opacity=".12"/>'
    s += ''.join(f'<circle cx="{x}" cy="355" r="6" fill="{shade(c,-.45)}"/>' for x in (330, 372, 414, 456, 498))
    s += f'<line x1="60" y1="338" x2="540" y2="338" stroke="{shade(c,.35)}" stroke-width="2" stroke-dasharray="10 6"/><line x1="60" y1="372" x2="540" y2="372" stroke="{shade(c,.35)}" stroke-width="2" stroke-dasharray="10 6"/>'
    s += f'<rect x="96" y="296" width="112" height="118" rx="14" fill="none" stroke="#b8bcc4" stroke-width="14"/><rect x="96" y="296" width="112" height="118" rx="14" fill="none" stroke="#e4e6ea" stroke-width="4"/><rect x="146" y="340" width="82" height="12" rx="6" fill="#b8bcc4" stroke="#8d929b" stroke-width="2"/>'
    return s

def cap(c, v):
    d = 'M120 440 Q120 190 300 190 Q480 190 480 440 Z'
    s = g(c, d) + sheen('M300 190 Q480 190 480 440 L300 440 Z')
    s += f'<path d="M300 190 L300 440" stroke="{ink(c)}" stroke-width="3"/><path d="M210 205 Q230 330 232 440 M390 205 Q370 330 368 440" fill="none" stroke="{ink(c)}" stroke-width="3"/>'
    s += f'<path d="M92 452 Q300 392 508 452 Q540 482 470 498 Q300 470 130 498 Q60 482 92 452 Z" fill="{shade(c,-.12)}" stroke="{ink(c)}" stroke-width="3" stroke-linejoin="round"/>'
    s += f'<circle cx="300" cy="188" r="12" fill="{shade(c,-.15)}" stroke="{ink(c)}" stroke-width="3"/><circle cx="300" cy="320" r="26" fill="none" stroke="#fff" stroke-width="5" opacity=".85"/>'
    return s

def socks(c, v):
    cols = ['#2a2a30', '#f6f5f2', '#9ca3af']; s = ''
    for i, col in enumerate(cols):
        x = 70 + i * 170
        d = f'M{x} 150 L{x+110} 150 L{x+110} 440 Q{x+112} 510 {x+170-70} 540 Q{x+120} 596 {x+40} 590 Q{x-20} 588 {x-10} 540 Q{x} 500 {x+10} 470 Z'
        s += f'<path d="{d}" fill="{col}" stroke="{ink(col)}" stroke-width="3" stroke-linejoin="round"/>'
        s += f'<rect x="{x}" y="150" width="110" height="44" fill="{shade(col,-.12) if col!="#2a2a30" else shade(col,.2)}" stroke="{ink(col)}" stroke-width="3"/>' + ''.join(f'<line x1="{xx}" y1="154" x2="{xx}" y2="190" stroke="{ink(col)}" stroke-width="2" opacity=".5"/>' for xx in range(x+12, x+108, 12))
        s += f'<path d="M{x+10} 470 Q{x+50} 560 {x+60} 580" fill="none" stroke="{shade(col,.25)}" stroke-width="3" opacity=".6"/>'
    return s

SPEC = {
 'JK-001': ('jacket', 'den', 'bomber'), 'JK-002': ('jacket', 'navy', 'coach'), 'JK-003': ('jacket', 'indigo', 'denim'), 'JK-004': ('jacket', 'xam', 'blazer'),
 'KN-001': ('knit', 'xam than', 'crew'), 'KN-002': ('knit', 'navy', 'cardigan'),
 'PK-001': ('belt', 'nau', ''), 'PK-002': ('belt', 'den', ''), 'PK-003': ('cap', 'navy', ''), 'PK-004': ('socks', 'den', ''),
 'PL-001': ('polo', 'den', ''), 'PL-002': ('polo', 'trang', ''), 'PL-003': ('polo', 'navy', ''), 'PL-004': ('polo', 'be', ''), 'PL-005': ('polo', 'xam', ''), 'PL-006': ('polo', 'xanh reu', 'stripe'),
 'QT-001': ('pants', 'be', 'chino'), 'QT-002': ('pants', 'navy', 'chino'), 'QT-003': ('pants', 'den', 'tay'), 'QT-004': ('pants', 'xam dam', 'tay'),
 'QT-005': ('pants', 'xanh dam', 'jeans'), 'QT-006': ('pants', 'xanh nhat', 'jeans'), 'QT-007': ('pants', 'den', 'jogger'), 'QT-008': ('pants', 'be', 'short'), 'QT-009': ('pants', 'den', 'short'),
 'SM-001': ('shirt', 'trang', 'plain'), 'SM-002': ('shirt', 'xanh nhat', 'plain'), 'SM-003': ('shirt', 'be', 'plain'), 'SM-004': ('shirt', 'xanh reu', 'plain'),
 'SM-005': ('shirt', 'navy', 'check'), 'SM-006': ('shirt', 'denim', 'plain'), 'SM-007': ('shirt', 'trang', 'stripe'), 'SM-008': ('shirt', 'den', 'plain'),
 'TS-001': ('tee', 'trang', ''), 'TS-002': ('tee', 'den', ''), 'TS-003': ('tee', 'xam melange', ''), 'TS-004': ('tee', 'trang nga', 'graphic'), 'TS-005': ('tee', 'navy', 'henley'),
}
KIND = {'tee': tee, 'polo': polo, 'shirt': shirt, 'knit': knit, 'jacket': jacket, 'pants': pants, 'belt': belt, 'cap': cap, 'socks': socks}
BG = {'tee': 0, 'polo': 5, 'shirt': 2, 'knit': 7, 'jacket': 3, 'pants': 4, 'belt': 1, 'cap': 6, 'socks': 1}

def svg(code):
    kind, color, v = SPEC[code]
    c = COLORS[color]; bg = BGS[BG[kind]]
    art = KIND[kind](c, v)
    lift = 110 if (kind == 'pants' and v == 'short') else 0
    if lift: art = f'<g transform="translate(0,{lift})">{art}</g>'
    if kind in ('belt', 'socks', 'cap'): shadow_y = 640 if kind != 'belt' else 470
    else: shadow_y = 690
    if lift: shadow_y = 570
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
            f'<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{shade(bg,.45)}"/><stop offset="1" stop-color="{bg}"/></linearGradient></defs>'
            f'<rect width="{W}" height="{H}" fill="url(#bg)"/>'
            f'<circle cx="300" cy="380" r="270" fill="#fff" opacity=".35"/>'
            f'<ellipse cx="300" cy="{shadow_y}" rx="190" ry="16" fill="#000" opacity=".10"/>'
            f'{art}</svg>')

def finish(p):
    """PNG -> lossless WebP (flat colours compress to ~15 KB); drops the intermediate files."""
    subprocess.run(['convert', p + '.png', '-define', 'webp:lossless=true', '-strip', p + '.webp'], check=True)
    for ext in ('.png', '.svg'):
        if os.path.exists(p + ext): os.remove(p + ext)

def render(code, out):
    PATTERN.clear()
    full = svg(code)
    p = os.path.join(out, code)
    if '<!--P-->' not in full:
        open(p + '.svg', 'w').write(full)
        subprocess.run(['convert', '-background', 'none', p + '.svg', '-strip', p + '.png'], check=True)
        finish(p); return
    head, rest = full.split('<!--P-->')
    open(p + '_a.svg', 'w').write(head + '</svg>')
    open(p + '_m.svg', 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}"><path d="{PATTERN["body"]}" fill="#000"/></svg>')
    open(p + '_p.svg', 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}">{PATTERN["svg"]}</svg>')
    open(p + '_c.svg', 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}">{rest}')
    for part in 'ampc': subprocess.run(['convert', '-background', 'none', f'{p}_{part}.svg', f'{p}_{part}.png'], check=True)
    subprocess.run(['convert', f'{p}_p.png', f'{p}_m.png', '-alpha', 'set', '-compose', 'DstIn', '-composite', f'{p}_pm.png'], check=True)
    subprocess.run(['convert', f'{p}_a.png', f'{p}_pm.png', '-composite', f'{p}_c.png', '-composite', '-strip', p + '.png'], check=True)
    for part in ('a_svg', 'm_svg', 'p_svg', 'c_svg'): pass
    for ext in ('a.svg', 'm.svg', 'p.svg', 'c.svg', 'a.png', 'm.png', 'p.png', 'c.png', 'pm.png'): os.remove(f'{p}_{ext}')
    finish(p)

if __name__ == '__main__':
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    for code in SPEC: render(code, out)
    print(len(SPEC), 'images')
