"""Desktop launcher for the BasketCompass installed app.

The app is a Progressive Web App, and a service worker only runs in a secure
context, so the files must be served over http on localhost rather than opened
from disk. This launcher serves the bundled dist/ folder on 127.0.0.1 at a free
port and opens the default browser. Nothing listens on an external interface and
nothing is uploaded; closing the window stops the server.

When frozen by PyInstaller the web files live under the bundle's temporary
extraction directory; in a source checkout they are the sibling dist/ folder.
"""
from __future__ import annotations

import http.server
import mimetypes
import socket
import sys
import threading
import webbrowser
from functools import partial
from pathlib import Path


def web_root() -> Path:
    """Locate the dist/ folder in both the frozen bundle and a source checkout."""
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS")) / "dist"
    return Path(__file__).resolve().parent.parent / "dist"


def free_port() -> int:
    """Ask the OS for an available loopback port, then release it for the server."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def main() -> int:
    root = web_root()
    if not (root / "index.html").exists():
        print(f"Could not find the app files under {root}.")
        return 1

    # The web manifest has no default mapping; register it so installation works.
    mimetypes.add_type("application/manifest+json", ".webmanifest")
    mimetypes.add_type("text/javascript", ".js")

    port = free_port()
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    url = f"http://127.0.0.1:{port}/"

    print(f"BasketCompass is running at {url}")
    print("Keep this window open while you use the app. Close it to stop.")
    threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping BasketCompass.")
    finally:
        server.shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
