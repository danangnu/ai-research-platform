"""Run browser acceptance against local services and a disposable SQLite database.

Prerequisites: backend requirements, frontend npm ci, npx playwright install chromium.
Optional: PLAYWRIGHT_CHROMIUM_EXECUTABLE for an existing Chromium binary.
"""
from pathlib import Path
import os
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def main(test_script="tests/recruitment-demo.cjs"):
    api_port, web_port = port(), port()
    while web_port == api_port:
        web_port = port()
    with tempfile.TemporaryDirectory(prefix="recruitment-ui-") as directory:
        base = f"http://127.0.0.1:{web_port}"
        api_url = f"http://127.0.0.1:{api_port}"
        env = {**os.environ, "DATABASE_URL": f"sqlite:///{Path(directory) / 'demo.db'}",
               "DEMO_MODE": "true", "RECRUITMENT_OPEN": "true", "JWT_SECRET": secrets.token_hex(32),
               "ADMIN_EMAIL": "admin@example.com", "ADMIN_PASSWORD": secrets.token_urlsafe(24),
               "DEMO_PARTICIPANT_EMAIL": "", "DEMO_PARTICIPANT_PASSWORD": "",
               "CORS_ORIGINS": base, "VITE_API_URL": api_url, "VITE_DEMO_MODE": "true",
               "DEMO_UI_URL": base}
        env["DEMO_UI_PASSWORD"] = env["ADMIN_PASSWORD"]
        env.update(PREP_UI_URL=base, PREP_API_URL=api_url, PREP_ADMIN_EMAIL=env["ADMIN_EMAIL"], PREP_ADMIN_PASSWORD=env["ADMIN_PASSWORD"])
        subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=ROOT / "backend", env=env, check=True)
        with open(Path(directory) / "services.log", "w+") as log:
            processes = []
            try:
                processes.append(subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(api_port)], cwd=ROOT / "backend", env=env, stdout=log, stderr=log))
                processes.append(subprocess.Popen(["node", "node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", str(web_port), "--strictPort"], cwd=ROOT / "frontend", env=env, stdout=log, stderr=log))
                for url in (api_url + "/health/ready", base):
                    for _ in range(100):
                        if any(p.poll() is not None for p in processes):
                            raise RuntimeError("A local test service exited unexpectedly.")
                        try:
                            urllib.request.urlopen(url, timeout=1).close()
                            break
                        except Exception:
                            time.sleep(.2)
                    else:
                        raise RuntimeError("Local test service did not become ready.")
                subprocess.run(["node", test_script], cwd=ROOT / "frontend", env=env, check=True)
            finally:
                for process in processes:
                    process.terminate()
                for process in processes:
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()


if __name__ == "__main__":
    main()
