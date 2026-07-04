#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
日日好日商務中心 — 全站 SEO 健檢腳本
每兩週自動執行，逐頁檢查 SEO 關鍵指標並輸出待改清單。
用法：python3 seo-healthcheck.py
"""
import re, glob, urllib.parse

UTILITY = {'404.html', 'color-preview.html', 'seo-guide.html', 'thanks.html'}
TEL = '032759489'

def has(p, s): return bool(re.search(p, s, re.I | re.S))
def grab(p, s):
    m = re.search(p, s, re.I | re.S)
    return m.group(1).strip() if m else None

def normalize(href):
    """取檔名並解碼百分比編碼；根網址 / 視為 index.html。"""
    href = href.split('#')[0].split('?')[0]
    if href.startswith('http'):
        path = urllib.parse.urlparse(href).path
    else:
        path = href
    path = path.rstrip('/')
    name = path.split('/')[-1]
    name = urllib.parse.unquote(name)
    return name if name else 'index.html'

def main():
    existing = set(glob.glob('*.html'))
    files = [f for f in sorted(glob.glob('*.html')) if f not in UTILITY]

    issues = {}
    def add(f, sev, msg): issues.setdefault(f, []).append((sev, msg))

    for f in files:
        h = open(f, encoding='utf-8').read()

        # 基礎標籤
        if not has(r'<html[^>]*lang=', h): add(f, 'H', '缺 <html lang>')
        if not has(r'name=["\']viewport["\']', h): add(f, 'H', '缺 viewport')

        # title
        t = grab(r'<title>(.*?)</title>', h)
        if not t:
            add(f, 'H', '缺 title')
        else:
            n = len(t)
            if n > 33: add(f, 'L', f'title {n} 字（建議 ≤33 避免截斷）')
            elif n < 10: add(f, 'M', f'title 僅 {n} 字（過短）')

        # description
        d = (grab(r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']*)["\']', h)
             or grab(r'<meta[^>]*content=["\']([^"\']*)["\'][^>]*name=["\']description["\']', h))
        if not d:
            add(f, 'H', '缺 meta description')
        else:
            n = len(d)
            if n > 95: add(f, 'L', f'description {n} 字（建議 ≤95）')
            elif n < 50: add(f, 'M', f'description {n} 字（過短，浪費版位）')

        # canonical / OG
        if not has(r'rel=["\']canonical["\']', h): add(f, 'H', '缺 canonical')
        for og in ('og:title', 'og:description', 'og:image', 'og:url'):
            if not has(rf'property=["\']{og}["\']', h): add(f, 'M', f'缺 {og}')

        # H1 唯一性
        n_h1 = len(re.findall(r'<h1[ >]', h))
        if n_h1 == 0: add(f, 'H', '缺 H1')
        elif n_h1 > 1: add(f, 'M', f'多個 H1（{n_h1} 個）')

        # 圖片 alt（空 alt 視為合法裝飾圖，不報）
        imgs = re.findall(r'<img\b[^>]*>', h, re.I)
        noalt = [i for i in imgs if not re.search(r'\balt=', i)]
        if noalt: add(f, 'M', f'{len(noalt)}/{len(imgs)} 張圖完全缺 alt 屬性')

        # 結構化資料
        if not has(r'application/ld\+json', h): add(f, 'M', '缺 JSON-LD 結構化資料')

        # 站內死連結（解碼後比對；忽略完整網域絕對網址＝canonical/og）
        for href in re.findall(r'href=["\']([^"\']+\.html)[^"\']*["\']', h):
            if href.startswith('http'):  # 絕對網址（canonical/og:url）跳過
                continue
            name = normalize(href)
            if name and name not in existing:
                add(f, 'H', f'死連結 → {name}')

        # 電話一致性
        if 'tel:' in h and f'tel:{TEL}' not in h:
            add(f, 'M', '電話號碼與全站不一致')

    # sitemap 一致性
    try:
        sm = open('sitemap.xml', encoding='utf-8').read()
        sm_names = set()
        for loc in re.findall(r'<loc>(.*?)</loc>', sm):
            sm_names.add(normalize(loc))
        for f in files:
            if f not in sm_names:
                add(f, 'M', '未收錄於 sitemap.xml')
    except FileNotFoundError:
        pass

    # 輸出
    sev_name = {'H': '🔴 高', 'M': '🟡 中', 'L': '🟢 低'}
    n_articles = len([f for f in files if re.match(r'[0-9]{2}-', f)])
    print('=' * 56)
    print(f'SEO 健檢報告　受檢頁面：{len(files)}　文章數：{n_articles}')
    print('=' * 56)
    if not issues:
        print('\n🎉 全數通過，零待改項，已達最佳化狀態！')
        return 0
    counts = {'H': 0, 'M': 0, 'L': 0}
    for v in issues.values():
        for sev, _ in v: counts[sev] += 1
    print(f"\n待改項合計：{sum(counts.values())} 　"
          f"({sev_name['H']} {counts['H']} / {sev_name['M']} {counts['M']} / {sev_name['L']} {counts['L']})\n")
    for f in sorted(issues):
        # 高嚴重度優先排序
        items = sorted(issues[f], key=lambda x: 'HML'.index(x[0]))
        print(f'● {f}')
        for sev, msg in items:
            print(f'    {sev_name[sev]}  {msg}')
    print('\n說明：🔴高=務必修　🟡中=建議修　🟢低=可選優化')
    return counts['H']  # 回傳高嚴重度數量作為 exit code

if __name__ == '__main__':
    import sys
    sys.exit(min(main(), 255))
