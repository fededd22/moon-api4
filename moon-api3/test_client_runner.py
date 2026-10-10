# -*- coding: utf-8 -*-
"""scraper_test.py — Encrypted by Moon
The original source code stays encrypted on the server and executes remotely.
This client stub contains zero business logic and automatically manages dependencies.

Usage:
    python scraper_test.py                       # Run as script
    python scraper_test.py function_name arg1 arg2 ...  # Call function
"""
import json
import os
import sys
import subprocess
import importlib
import site
import urllib.error
import urllib.request


class StrictPostRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Preserves POST method and payload on 301/302 redirects."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        new_req = urllib.request.Request(
            newurl,
            data=req.data,
            headers=dict(req.headers),
            origin_req_host=req.origin_req_host,
            unverifiable=True,
        )
        new_req.get_method = lambda: "POST"
        return new_req


API_URL = "http://127.0.0.1:3000"
API_KEY = "moon_YOUR_KEY_HERE"
REQUIRED_PACKAGES = ["requests","bs4"]

PKG_MAP = {
    "bs4": "beautifulsoup4",
    "PIL": "Pillow",
    "cv2": "opencv-python",
    "yaml": "pyyaml",
    "telebot": "pyTelegramBotAPI",
    "telegram": "python-telegram-bot",
    "dotenv": "python-dotenv",
    "jwt": "pyjwt",
    "dateutil": "python-dateutil",
    "sklearn": "scikit-learn",
    "Crypto": "pycryptodome",
    "crypto": "pycryptodome",
    "websocket": "websocket-client",
    "googleapiclient": "google-api-python-client",
    "dns": "dnspython",
    "OpenSSL": "pyOpenSSL",
    "serial": "pyserial",
    "docx": "python-docx",
    "pptx": "python-pptx",
    "fitz": "PyMuPDF",
    "magic": "python-magic",
    "discord": "discord.py",
    "attr": "attrs",
    "pg": "psycopg2-binary",
    "psycopg2": "psycopg2-binary",
    "MySQLdb": "mysqlclient",
    "fake_useragent": "fake-useragent",
    "requests": "requests",
    "urllib3": "urllib3",
    "aiohttp": "aiohttp",
}


def ensure_packages(packages=None):
    """Auto-detects and installs missing libraries on any Python version (3.6+ to 3.14).
    Works on Linux, Render, VPS, Windows, macOS, and Android Pydroid 3.
    """
    if packages is None:
        packages = REQUIRED_PACKAGES
    if not packages:
        return

    env = os.environ.copy()
    env["PIP_BREAK_SYSTEM_PACKAGES"] = "1"
    env["PYTHONUNBUFFERED"] = "1"

    for mod in packages:
        mod = str(mod).strip()
        if not mod:
            continue
        try:
            __import__(mod)
            continue
        except ImportError:
            pass

        target = PKG_MAP.get(mod, mod)
        sys.stderr.write(f"[*] [Moon] مكتبة ناقصة: '{mod}' -> جارٍ التثبيت التلقائي لـ '{target}'...\n")
        sys.stderr.flush()

        commands = [
            [sys.executable, "-m", "pip", "install", "--quiet", "--no-warn-script-location", target],
            [sys.executable, "-m", "pip", "install", "--quiet", "--break-system-packages", target],
            [sys.executable, "-m", "pip", "install", "--user", "--quiet", target],
            [sys.executable, "-m", "pip", "install", "--user", "--quiet", "--break-system-packages", target],
        ]

        installed = False
        for cmd in commands:
            try:
                res = subprocess.run(
                    cmd,
                    env=env,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=60,
                )
                if res.returncode == 0:
                    installed = True
                    break
            except Exception:
                continue

        if not installed:
            try:
                subprocess.run(
                    [sys.executable, "-m", "ensurepip", "--default-pip"],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=30,
                )
                res = subprocess.run(
                    commands[0],
                    env=env,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=60,
                )
                if res.returncode == 0:
                    installed = True
            except Exception:
                pass

        try:
            user_site = site.getusersitepackages()
            if user_site and user_site not in sys.path:
                sys.path.insert(0, user_site)
        except Exception:
            pass
        try:
            for sp in site.getsitepackages():
                if sp not in sys.path:
                    sys.path.append(sp)
        except Exception:
            pass
        importlib.invalidate_caches()

        try:
            __import__(mod)
            sys.stderr.write(f"[+] [Moon] تم تثبيت '{target}' بنجاح!\n")
            sys.stderr.flush()
        except ImportError:
            sys.stderr.write(f"[!] [Moon] تنبيه: تم تثبيت '{target}' وجارٍ المتابعة.\n")
            sys.stderr.flush()


def call(function=None, *args, stdin="", **kwargs):
    # Ensure required packages exist
    try:
        ensure_packages()
    except Exception:
        pass

    # Normalize base endpoint URL and enforce HTTPS for remote servers
    base_url = API_URL.strip().rstrip("/")
    if base_url.startswith("http://") and not ("localhost" in base_url or "127.0.0.1" in base_url):
        base_url = "https://" + base_url[7:]
    endpoint = base_url + "/api/run"

    payload = {
        "function": function,
        "args": list(args),
        "kwargs": kwargs,
        "stdin": stdin,
    }
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
        "User-Agent": "Mozilla/5.0 (compatible; MoonClient/2.0; Linux; Android)",
        "Accept": "application/json",
    }
    req = urllib.request.Request(endpoint, data=body, method="POST", headers=headers)
    opener = urllib.request.build_opener(StrictPostRedirectHandler)

    try:
        with opener.open(req, timeout=90) as resp:
            status_code = getattr(resp, "status", 200)
            raw_body = resp.read()
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="replace").strip()
        raise SystemExit(f"[{e.code}] Error from {endpoint}: {err_msg}")
    except urllib.error.URLError as e:
        raise SystemExit(
            f"Server connection failed to {endpoint}:\n"
            f"Reason: {e.reason}\n"
            f"Please check your internet connection and verify that API_URL is reachable."
        )

    text_resp = raw_body.decode("utf-8", errors="replace").strip()
    if not text_resp:
        raise SystemExit(
            f"Error: Server at {endpoint} returned an empty response.\n"
            f"Please verify that the Moon API server is online and API_KEY is correct."
        )

    if text_resp.startswith("<!DOCTYPE") or "<html" in text_resp[:100].lower():
        raise SystemExit(
            f"Error: Server returned an HTML web page instead of JSON API response from {endpoint}.\n"
            f"Please ensure API_URL uses https:// (not http://), e.g. https://remix-moon-ap.ai.studio"
        )

    try:
        data = json.loads(text_resp)
    except Exception:
        raise SystemExit(
            f"Error: Non-JSON response received from {endpoint} (HTTP {status_code}):\n"
            f"{text_resp[:500]}\n\n"
            f"Tip: If this is an authentication or 404 page, verify the PUBLIC_API_URL."
        )

    if data.get("output"):
        print(data["output"], end="")
    if not data.get("success"):
        err = data.get("error", "Remote execution failed")
        if "ModuleNotFoundError" in err or "No module named" in err:
            import re
            m = re.search(r"No module named ['"]([^'"]+)['"]", err)
            if m:
                missing = m.group(1).split('.')[0]
                try:
                    ensure_packages([missing])
                except Exception:
                    pass
        raise RuntimeError(err)
    return data.get("result")


def _parse(v):
    try:
        return json.loads(v)
    except (ValueError, TypeError):
        return v


if __name__ == "__main__":
    ensure_packages()
    if len(sys.argv) > 1:
        res = call(sys.argv[1], *[_parse(a) for a in sys.argv[2:]])
        if res is not None:
            print(res)
    else:
        call(None, stdin="" if sys.stdin.isatty() else sys.stdin.read())
