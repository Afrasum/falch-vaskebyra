#!/usr/bin/env python3
"""Lokal utviklingsserver: serverer nettsiden og telleren på samme port,
slik at /api/teller virker akkurat som bak Caddy på rpi5.

    uv run python teller/dev.py     ->  http://localhost:8000

Bruker en egen database (teller/dev.db) så du ikke roter til produksjonstallet.
"""

import json
import os
import pathlib
import sqlite3
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROT = pathlib.Path(__file__).resolve().parent.parent
os.environ.setdefault("FALCH_DB", str(ROT / "teller" / "dev.db"))

sys.path.insert(0, str(ROT / "teller"))
import teller  # noqa: E402  (må importeres etter at FALCH_DB er satt)

PORT = int(os.environ.get("DEV_PORT", "8000"))


class Dev(SimpleHTTPRequestHandler):
    """Statiske filer, pluss /api/teller mot tellerens forretningslogikk.

    Vi kaller teller.registrer() direkte i stedet for å låne teller.Handler –
    de to klassene har ulik protocol_version og ville bare tilfeldigvis vært
    kompatible.
    """

    def do_GET(self):
        if self.path.split("?")[0] != "/api/teller":
            return super().do_GET()

        ua = self.headers.get("User-Agent", "")
        try:
            n, ny = teller.registrer(self.client_address[0], ua,
                                     tell=not teller.BOT.search(ua))
            kode, kropp = 200, {"n": n, "ny": ny}
        except sqlite3.Error as e:
            kode, kropp = 503, {"feil": str(e)}

        data = json.dumps(kropp).encode("utf-8")
        self.send_response(kode)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


def main():
    teller.klargjor()
    teller.SALT = teller.salt()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), partial(Dev, directory=str(ROT)))
    print(f"Falch Vaskebyrå på http://localhost:{PORT}  (db: {os.environ['FALCH_DB']})")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print()


if __name__ == "__main__":
    main()
