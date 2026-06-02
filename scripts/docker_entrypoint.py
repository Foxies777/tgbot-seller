#!/usr/bin/env python3
import os
import subprocess
import sys


def main() -> None:
    print("Running database migrations...", flush=True)
    subprocess.run(["alembic", "upgrade", "head"], check=True)
    print("Starting application...", flush=True)
    os.execvp(sys.argv[1], sys.argv[1:])


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("usage: docker_entrypoint.py <command> [args...]")
    main()
