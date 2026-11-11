#!/usr/bin/env python3
"""Downloads the real product photos listed in scripts/product-image-picks.json (Unsplash) into data/seed/product-images/<CODE>.webp.

Usage: UNSPLASH_ACCESS_KEY=... python3 scripts/fetch-product-images.py [out-dir] [CODE ...]   (out-dir defaults to data/seed/product-images;
with no CODE it skips files that already exist, so use an empty out-dir to replace every image, or name the CODEs to overwrite)
Needs Python 3 and ImageMagick (`convert`). The committed WebP files are what `pnpm db:seed` imports, so this only runs again when the
picks change. Each photo goes through Unsplash's download endpoint (required by the API guidelines), so it spends API quota
(demo apps: 50 requests/hour) - the script stops before the quota runs out and can simply be re-run later: files that exist are skipped.
Credits for every photo are listed in THIRD_PARTY_NOTICES.md.
"""
import json, os, subprocess, sys, tempfile, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
KEY = os.environ.get('UNSPLASH_ACCESS_KEY') or sys.exit('Set UNSPLASH_ACCESS_KEY')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'data', 'seed', 'product-images')
ONLY = set(sys.argv[2:])
W, H = 800, 1000  # 4:5, like the storefront product cards

def api(path):
    req = urllib.request.Request('https://api.unsplash.com' + path, headers={'Authorization': f'Client-ID {KEY}', 'Accept-Version': 'v1'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r), int(r.headers.get('X-Ratelimit-Remaining', '1'))

picks = json.load(open(os.path.join(HERE, 'product-image-picks.json')))
os.makedirs(OUT, exist_ok=True)
for code, pick in picks.items():
    target = os.path.join(OUT, f'{code}.webp')
    if (ONLY and code not in ONLY) or (not ONLY and os.path.exists(target)):
        continue
    data, remaining = api(f"/photos/{pick['id']}/download")
    sep = '&' if '?' in data['url'] else '?'
    url = f"{data['url']}{sep}w={W}&h={H}&fit=crop&crop=faces,entropy&fm=jpg&q=90"
    with tempfile.NamedTemporaryFile(suffix='.jpg') as tmp:
        urllib.request.urlretrieve(url, tmp.name)
        subprocess.run(['convert', tmp.name, '-resize', f'{W}x{H}^', '-gravity', 'center', '-extent', f'{W}x{H}', '-strip', '-quality', '82', target], check=True)
    print(code, pick['id'], os.path.getsize(target) // 1024, 'KB', 'quota left', remaining, flush=True)
    if remaining <= 2:
        print('Quota nearly used up: wait an hour and re-run with the remaining codes.'); break
    time.sleep(1)
