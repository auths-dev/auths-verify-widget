#!/usr/bin/env python3
"""
Build and publish auths-verify to npm.

Usage:
    python scripts/release/npm.py          # dry-run (shows what would happen)
    python scripts/release/npm.py --push   # build, test, and publish to npm

What it does:
    1. Reads the version from package.json
    2. Checks npm registry to make sure the version has been bumped
    3. Checks that the git working tree is clean
    4. Rebuilds WASM, runs tests, and builds the dist
    5. Publishes to npm with --access public
    6. Creates and pushes a git tag v{version}

Requires:
    - python3 (no external dependencies)
    - node/npm on PATH
    - wasm-pack on PATH (for WASM build)
    - git on PATH
    - npm authentication (npm login or NPM_TOKEN)
"""

import json
import subprocess
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PACKAGE_JSON = REPO_ROOT / "package.json"
NPM_REGISTRY_URL = "https://registry.npmjs.org/auths-verify"


def get_version() -> str:
    data = json.loads(PACKAGE_JSON.read_text())
    version = data.get("version")
    if not version:
        print("ERROR: No version found in package.json", file=sys.stderr)
        sys.exit(1)
    return version


def get_npm_version() -> str | None:
    req = urllib.request.Request(NPM_REGISTRY_URL, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            return data.get("dist-tags", {}).get("latest")
    except Exception:
        return None


def git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )
    if result.returncode != 0:
        print(f"ERROR: git {' '.join(args)} failed:\n{result.stderr.strip()}", file=sys.stderr)
        sys.exit(1)
    return result.stdout.strip()


def local_tag_exists(tag: str) -> bool:
    result = subprocess.run(
        ["git", "tag", "-l", tag],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )
    return bool(result.stdout.strip())


def remote_tag_exists(tag: str) -> bool:
    result = subprocess.run(
        ["git", "ls-remote", "--tags", "origin", f"refs/tags/{tag}"],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )
    return bool(result.stdout.strip())


def delete_local_tag(tag: str) -> None:
    subprocess.run(
        ["git", "tag", "-d", tag],
        capture_output=True,
        cwd=REPO_ROOT,
    )


def check_tool(name: str) -> None:
    result = subprocess.run(["which", name], capture_output=True)
    if result.returncode != 0:
        print(f"ERROR: {name} not found on PATH", file=sys.stderr)
        sys.exit(1)


def run_step(description: str, args: list[str]) -> None:
    print(f"\n{description}...", flush=True)
    result = subprocess.run(args, cwd=REPO_ROOT)
    if result.returncode != 0:
        print(f"\nERROR: {description} failed (exit {result.returncode})", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    push = "--push" in sys.argv

    version = get_version()
    tag = f"v{version}"
    print(f"package.json version: {version}")
    print(f"Git tag:              {tag}")

    # Check npm for version bump
    published = get_npm_version()
    if published:
        print(f"npm latest version:   {published}")
        if published == version:
            print(f"\nERROR: Version {version} is already published on npm.", file=sys.stderr)
            print("Bump the version in package.json before releasing.", file=sys.stderr)
            sys.exit(1)
    else:
        print("npm latest version:   (not found or not published yet)")

    # Check git tag doesn't already exist
    if remote_tag_exists(tag):
        print(f"\nERROR: Git tag {tag} already exists on origin.", file=sys.stderr)
        print("Bump the version in package.json or delete the remote tag first.", file=sys.stderr)
        sys.exit(1)

    if local_tag_exists(tag):
        print(f"Local tag {tag} exists but not on origin — deleting stale local tag.")
        delete_local_tag(tag)

    # Check working tree is clean
    status = git("status", "--porcelain")
    if status:
        print(f"\nERROR: Working tree is not clean:\n{status}", file=sys.stderr)
        print("Commit or stash changes before releasing.", file=sys.stderr)
        sys.exit(1)

    # Check required tools
    check_tool("node")
    check_tool("npm")
    check_tool("wasm-pack")

    if not push:
        print(f"\nDry run: would build, test, and publish {version} to npm")
        print(f"         would create and push tag {tag}")
        print("Run with --push to execute.")
        return

    # Build WASM
    run_step("Building WASM", ["npm", "run", "build:wasm"])

    # Run tests
    run_step("Running tests", ["npm", "test"])

    # Build dist
    run_step("Building dist", ["npm", "run", "build"])

    # Publish to npm
    print("\nPublishing to npm...", flush=True)
    result = subprocess.run(
        ["npm", "publish", "--access", "public"],
        cwd=REPO_ROOT,
    )
    if result.returncode != 0:
        print(f"\nERROR: npm publish failed (exit {result.returncode})", file=sys.stderr)
        sys.exit(1)

    # Create and push git tag
    print(f"\nCreating tag {tag}...", flush=True)
    result = subprocess.run(
        ["git", "tag", "-a", tag, "-m", f"release: {version}"],
        cwd=REPO_ROOT,
        env={**__import__("os").environ, "GIT_EDITOR": "true"},
    )
    if result.returncode != 0:
        print(f"\nWARNING: git tag failed (exit {result.returncode})", file=sys.stderr)
    else:
        print(f"Pushing tag {tag} to origin...", flush=True)
        result = subprocess.run(
            ["git", "push", "--no-verify", "origin", tag],
            cwd=REPO_ROOT,
        )
        if result.returncode != 0:
            print(f"\nWARNING: Failed to push tag {tag}", file=sys.stderr)

    print(f"\nDone. Published auths-verify@{version} to npm.")
    print(f"  https://www.npmjs.com/package/auths-verify")


if __name__ == "__main__":
    main()
