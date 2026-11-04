from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INTEROP_ROOT = ROOT / ".interop"
PYTHON_SITE = INTEROP_ROOT / "python-site"
JAVA_ROOT = INTEROP_ROOT / "java"
ADOPTIUM_API = (
    "https://api.adoptium.net/v3/assets/latest/21/hotspot"
    "?architecture=x64&image_type=jre&os=windows"
)
REQUEST_HEADERS = {
    "User-Agent": "Cheetah-Time-Interop/1.0",
    "Accept": "application/json, application/octet-stream;q=0.9, */*;q=0.8",
}


def open_url(url: str):
    request = urllib.request.Request(url, headers=REQUEST_HEADERS)
    return urllib.request.urlopen(request)


def ensure_python_packages() -> None:
    PYTHON_SITE.mkdir(parents=True, exist_ok=True)
    if str(PYTHON_SITE) not in sys.path:
        sys.path.insert(0, str(PYTHON_SITE))

    try:
        import jpype  # noqa: F401
        import mpxj  # noqa: F401
        return
    except Exception:
        pass

    subprocess.check_call(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "--no-input",
            "--target",
            str(PYTHON_SITE),
            "jpype1",
            "mpxj",
        ]
    )

    if str(PYTHON_SITE) not in sys.path:
        sys.path.insert(0, str(PYTHON_SITE))


def find_local_java_home() -> Path | None:
    env_java_home = os.environ.get("JAVA_HOME")
    if env_java_home:
        jvm = Path(env_java_home) / "bin" / "server" / "jvm.dll"
        if jvm.exists():
            return Path(env_java_home)

    if not JAVA_ROOT.exists():
        return None

    for child in JAVA_ROOT.iterdir():
        jvm = child / "bin" / "server" / "jvm.dll"
        if jvm.exists():
            return child

    return None


def download_java_home() -> Path:
    JAVA_ROOT.mkdir(parents=True, exist_ok=True)
    with open_url(ADOPTIUM_API) as response:
        payload = json.load(response)

    package_url = payload[0]["binary"]["package"]["link"]
    archive_path = JAVA_ROOT / "runtime.zip"
    with open_url(package_url) as response, archive_path.open("wb") as output:
        shutil.copyfileobj(response, output)

    with zipfile.ZipFile(archive_path) as archive:
        archive.extractall(JAVA_ROOT)

    archive_path.unlink(missing_ok=True)
    java_home = find_local_java_home()
    if not java_home:
        raise RuntimeError("Unable to provision a local Java runtime for MPXJ.")

    return java_home


def ensure_java_home() -> Path:
    java_home = find_local_java_home()
    return java_home if java_home else download_java_home()


def start_jvm():
    ensure_python_packages()
    java_home = ensure_java_home()

    import glob
    import jpype
    import mpxj  # noqa: F401

    if jpype.isJVMStarted():
        return

    classpath = [str(path) for path in glob.glob(str(PYTHON_SITE / "mpxj" / "lib" / "*.jar"))]
    jvm_path = java_home / "bin" / "server" / "jvm.dll"
    jpype.startJVM(str(jvm_path), "-ea", classpath=classpath)


def convert(mode: str, input_path: Path, output_path: Path) -> None:
    start_jvm()

    from org.mpxj.reader import UniversalProjectReader
    from org.mpxj.writer import FileFormat, UniversalProjectWriter

    project = UniversalProjectReader().read(str(input_path))

    if mode == "mpp-to-mspdi":
        UniversalProjectWriter(FileFormat.MSPDI).write(project, str(output_path))
        return

    raise RuntimeError(
        "Native MPP export is not available through MPXJ in this environment. "
        "Cheetah Time supports serious MSPDI XML round-tripping and native MPP import, "
        "but not native MPP write-back with the current open-source bridge."
    )


def main() -> int:
    if len(sys.argv) != 4 or sys.argv[1] not in {"mpp-to-mspdi", "mspdi-to-mpp"}:
        print(
            "Usage: project-file-bridge.py <mpp-to-mspdi|mspdi-to-mpp> <input> <output>",
            file=sys.stderr,
        )
        return 2

    _mode, input_path, output_path = sys.argv[1:]
    try:
        convert(_mode, Path(input_path), Path(output_path))
    except Exception as exc:  # pragma: no cover - bridge failures are runtime-specific
        print(str(exc), file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
