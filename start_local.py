from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent
BACKEND_URL = "http://127.0.0.1:8000/health"
FRONTEND_URL = "http://127.0.0.1:5173/"
API_TOKEN = os.environ.get("VITE_API_SECURITY_TOKEN") or os.environ.get("API_SECURITY_TOKEN") or "study_hub_local_default_secret_key"
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


def request_ok(url: str) -> bool:
    request = urllib.request.Request(url, headers={"X-API-Key": API_TOKEN})
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            return 200 <= response.status < 300
    except (urllib.error.URLError, TimeoutError):
        return False


def services_ok() -> bool:
    backend_ok = request_ok(BACKEND_URL)
    frontend_ok = request_ok(FRONTEND_URL)
    print(f"backend: {'ok' if backend_ok else 'falhou'} ({BACKEND_URL})")
    print(f"frontend: {'ok' if frontend_ok else 'falhou'} ({FRONTEND_URL})")
    return backend_ok and frontend_ok


def stop_matching_processes() -> None:
    if os.name != "nt":
        return
    patterns = [
        "uvicorn app.main:app",
        "npm --prefix frontend run dev",
        "vite --host 127.0.0.1 --port 5173",
    ]
    for pattern in patterns:
        command = (
            "Get-CimInstance Win32_Process | "
            f"Where-Object {{ $_.CommandLine -like '*{pattern}*' -and $_.CommandLine -like '*study-hub*' }} | "
            "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
        )
        subprocess.run(["powershell", "-NoProfile", "-Command", command], cwd=ROOT, check=False)


def start_backend() -> subprocess.Popen:
    env = os.environ.copy()
    env["PYTHONPATH"] = "backend"
    env["DATABASE_URL"] = f"sqlite:///{(ROOT / 'backend' / 'data' / 'study_hub.db').as_posix()}"
    env.setdefault("STUDY_HUB_MACHINE_PROFILE", "local")
    env.setdefault("STUDY_HUB_AUTO_SYNC_STRUCTURAL_ON_STARTUP", "false")
    python_exe = ROOT / "backend" / ".venv" / "Scripts" / "python.exe"
    if not python_exe.exists():
        python_exe = Path(sys.executable)
    out = open(ROOT / ".dev-backend.out.log", "a", encoding="utf-8")
    err = open(ROOT / ".dev-backend.err.log", "a", encoding="utf-8")
    return subprocess.Popen(
        [str(python_exe), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=ROOT,
        env=env,
        stdout=out,
        stderr=err,
        creationflags=CREATE_NO_WINDOW,
    )


def start_frontend() -> subprocess.Popen:
    out = open(ROOT / ".dev-frontend.out.log", "a", encoding="utf-8")
    err = open(ROOT / ".dev-frontend.err.log", "a", encoding="utf-8")
    npm_exe = shutil.which("npm.cmd") or shutil.which("npm") or "npm"
    return subprocess.Popen(
        [npm_exe, "--prefix", "frontend", "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"],
        cwd=ROOT,
        stdout=out,
        stderr=err,
        creationflags=CREATE_NO_WINDOW,
    )


def wait_for_services() -> bool:
    for attempt in range(1, 7):
        print(f"healthcheck {attempt}/6")
        if services_ok():
            return True
        time.sleep(3)
    return False


def main() -> int:
    print("Study Hub local launcher")
    if services_ok():
        print("Servicos ja estavam ativos e saudaveis.")
        return 0

    print("Conectividade falhou. Reiniciando frontend/backend locais...")
    stop_matching_processes()
    time.sleep(2)
    start_backend()
    start_frontend()

    if wait_for_services():
        print("Tudo ativo.")
        print("Frontend: http://127.0.0.1:5173/")
        print("Backend:  http://127.0.0.1:8000/health")
        return 0

    print("Nao foi possivel validar os servicos. Veja .dev-backend.err.log e .dev-frontend.out.log.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
