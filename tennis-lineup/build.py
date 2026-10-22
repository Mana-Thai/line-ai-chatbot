#!/usr/bin/env python3
"""tennis-lineup の配布用ファイルを作る。

  python3 tennis-lineup/build.py [出力先ディレクトリ]   (既定: tennis-lineup/dist)

- admin.html  : 管理者版(claude.ai のページとして公開する1ファイル版。
                skeletonが付くので doctype/head を含めない)
- viewer/index.html : メンバー用の閲覧専用ページ(GitHub Pages に置く)

  python3 tennis-lineup/build.py --cf   (Cloudflare版: tennis-lineup/cloudflare/public に出力)
- index.html      : LINEログイン+Cloudflare API でつなぐ管理者/メンバー共通ページ
- view/index.html : ログイン不要の閲覧専用ページ(閲覧リンク用)
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
VIEWER_URL = 'https://mana-thai.github.io/tennis-lineup/'


def read(name):
    with open(os.path.join(HERE, name), encoding='utf-8') as f:
        return f.read()


def bundle(pre_script, extra_css=''):
    html = read('index.html')
    body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
    scripts = f'<script>\n{pre_script}\n</script>\n<script>\n{read("rules.js")}\n</script>\n<script>\n{read("app.js")}\n</script>'
    body = body.replace('<script src="rules.js"></script>\n<script src="app.js"></script>', scripts)
    assert '<script src=' not in body
    return f'<style>\n{read("style.css")}\n{extra_css}\n</style>\n{body}'


def page(title, head_extra, body):
    return f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="第44回 チョンブリー県内クラブ・同好会対抗 伝統テニス大会 チームオーダー">
<meta property="og:title" content="{title}">
<meta property="og:description" content="2026/11/14 Greta Sport Club Pattaya ・ チームオーダーと参加費の分担">
<meta property="og:type" content="website">
<meta name="robots" content="noindex">
{head_extra}
</head>
<body>
{body}
</body>
</html>
"""


def build_cf():
    out = os.path.join(HERE, 'cloudflare', 'public')
    os.makedirs(os.path.join(out, 'view'), exist_ok=True)
    adapter = read('cloudflare/client/cf-adapter.js')
    liff = '<script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>'
    with open(os.path.join(out, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(page('伝統テニス大会 オーダー表', liff, bundle(adapter, read('cloudflare/client/cf.css'))))
    with open(os.path.join(out, 'view', 'index.html'), 'w', encoding='utf-8') as f:
        f.write(page('伝統テニス大会 オーダー', '', bundle('window.TENNIS_VIEWER_ONLY = true;')))
    print(out)


def main():
    if '--cf' in sys.argv:
        return build_cf()
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'dist')
    os.makedirs(os.path.join(out, 'viewer'), exist_ok=True)
    admin = '<title>伝統テニス大会 オーダー表</title>\n' + bundle(f'window.TENNIS_VIEWER_URL = {VIEWER_URL!r};')
    with open(os.path.join(out, 'admin.html'), 'w', encoding='utf-8') as f:
        f.write(admin)
    viewer = f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>伝統テニス大会 オーダー</title>
<meta name="description" content="第44回 チョンブリー県内クラブ・同好会対抗 伝統テニス大会 チームオーダーと出場回数・参加費">
<meta property="og:title" content="伝統テニス大会 オーダー">
<meta property="og:description" content="2026/11/14 Greta Sport Club Pattaya ・ チームオーダーと参加費の分担">
<meta property="og:type" content="website">
<meta name="robots" content="noindex">
</head>
<body>
{bundle('window.TENNIS_VIEWER_ONLY = true;')}
</body>
</html>
"""
    with open(os.path.join(out, 'viewer', 'index.html'), 'w', encoding='utf-8') as f:
        f.write(viewer)
    print(out)


if __name__ == '__main__':
    main()
