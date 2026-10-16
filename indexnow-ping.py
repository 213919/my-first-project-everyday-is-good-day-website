#!/usr/bin/env python3
"""IndexNow 主動通知腳本。

網站內容更新時，主動 POST 給 IndexNow API（Bing、Yandex 等採用此協定的
搜尋引擎共用同一個端點），讓它們立即重新抓取，不必等待被動排程爬取。

用法：
  python3 indexnow-ping.py changed   # 只提交本次 git push 變動的 .html 頁面
                                      # （從環境變數 CHANGED_FILES 讀取，換行分隔）
  python3 indexnow-ping.py all       # 提交 sitemap.xml 裡的全部網址（第一次設定
                                      # 或想請搜尋引擎整站重新抓取時使用）
"""
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

HOST = "edgd2619.com"
KEY = "551e921a718f8e4dee4802294a9e6ab1"
KEY_LOCATION = f"https://{HOST}/{KEY}.txt"
ENDPOINT = "https://api.indexnow.org/indexnow"


def submit(urls):
    urls = sorted(set(u for u in urls if u))
    if not urls:
        print("沒有要提交的網址，略過。")
        return
    payload = {
        "host": HOST,
        "key": KEY,
        "keyLocation": KEY_LOCATION,
        "urlList": urls,
    }
    print(f"提交 {len(urls)} 個網址給 IndexNow：")
    for u in urls:
        print("  -", u)
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        ENDPOINT,
        data=data,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            print(f"IndexNow 回應狀態碼：{resp.status}（200/202 代表成功收到）")
    except urllib.error.HTTPError as e:
        print(f"IndexNow 回應錯誤：{e.code} {e.read().decode(errors='ignore')}")
        sys.exit(1)
    except Exception as e:
        print(f"IndexNow 提交失敗：{e}")
        sys.exit(1)


def urls_from_sitemap():
    with open("sitemap.xml", encoding="utf-8") as f:
        s = f.read()
    return re.findall(r"<loc>([^<]+)</loc>", s)


def urls_from_changed_files(files):
    urls = []
    for f in files:
        f = f.strip()
        if not f or not f.endswith(".html"):
            continue
        if f == "index.html":
            urls.append(f"https://{HOST}/")
        else:
            urls.append(f"https://{HOST}/{urllib.parse.quote(f)}")
    return urls


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "changed"
    if mode == "all":
        submit(urls_from_sitemap())
    else:
        changed = os.environ.get("CHANGED_FILES", "")
        submit(urls_from_changed_files(changed.splitlines()))
