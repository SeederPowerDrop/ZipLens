#!/usr/bin/env python3
"""Produce an offline, reproducible notice inventory from the release lockfiles.

Run after cargo fetch and npm ci. Missing upstream texts are deliberately errors;
reviewed supplements live in legal/third-party/supplements.json. No network access
or license guesses are performed by this build step.
"""
from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import io
import json
import pathlib
import re
import subprocess
import sys
import tarfile
import tomllib

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "legal" / "third-party"
TARGET = "aarch64-apple-darwin"
NOTICE_NAME = re.compile(r"^(licen[cs]e|copying|notice|copyright|patents)(?:$|[._-])", re.I)
REVIEWED_LICENSE_IDS = {"0BSD", "MIT", "Apache-2.0", "Unlicense", "BSD-3-Clause", "BSD-2-Clause",
                        "CC0-1.0", "MIT-0", "MPL-2.0", "Zlib", "Unicode-3.0", "bzip2-1.0.6",
                        "LLVM-exception", "LGPL-2.1-or-later"}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: pathlib.Path):
    return json.loads(path.read_text(encoding="utf-8"))


def validate_license_expression(component: str, expression: str | None):
    if not expression:
        raise RuntimeError(f"Missing license declaration: {component}")
    identifiers = set(re.findall(r"[A-Za-z0-9][A-Za-z0-9.+-]*", expression)) - {"AND", "OR", "WITH"}
    unknown = identifiers - REVIEWED_LICENSE_IDS
    if unknown:
        raise RuntimeError(f"Unreviewed license identifier for {component}: {', '.join(sorted(unknown))}")
    if "MPL-2.0" in identifiers and expression != "MPL-2.0":
        raise RuntimeError(f"Combined MPL source obligations need review: {component}: {expression}")


def license_documents(directory: pathlib.Path):
    return sorted(p for p in directory.rglob("*") if p.is_file()
                  and (NOTICE_NAME.match(p.name) or any(part.lower() in {"licenses", "licences", "license", "licence"}
                                                      for part in p.relative_to(directory).parts[:-1]))
                  and p.suffix.lower() not in {".rs", ".h", ".c", ".js", ".json"}
                  and "node_modules" not in p.relative_to(directory).parts)


def is_license_path(path: pathlib.PurePosixPath) -> bool:
    return (NOTICE_NAME.match(path.name) is not None
            or any(part.lower() in {"licenses", "licences", "license", "licence"} for part in path.parts[:-1])) \
        and path.suffix.lower() not in {".rs", ".h", ".c", ".js", ".json"}


def render(target: str) -> dict[str, bytes]:
    packages = {}
    reachable = set()
    lock_packages = {}
    package_builds = {}
    # The native application and separately launched legacy helper are compiled
    # from different locks. Include both graphs, even when versions diverge.
    for project in ("src-tauri", "astra-core"):
        metadata = json.loads(subprocess.check_output([
            "cargo", "metadata", "--manifest-path", str(ROOT / project / "Cargo.toml"),
            "--format-version", "1", "--locked", "--offline", "--filter-platform", target,
        ], text=True))
        graph = {node["id"]: node for node in metadata["resolve"]["nodes"]}
        packages.update((p["id"], p) for p in metadata["packages"])
        pending = [metadata["resolve"]["root"]]
        current = set()
        while pending:
            ident = pending.pop()
            if ident in current:
                continue
            current.add(ident)
            package_builds.setdefault(ident, []).append(project)
            for dep in graph[ident]["deps"]:
                if any(kind["kind"] != "dev" for kind in dep["dep_kinds"]):
                    pending.append(dep["pkg"])
        reachable.update(current)
        lock = tomllib.loads((ROOT / project / "Cargo.lock").read_text())
        for p in lock["package"]:
            key = (p["name"], p["version"])
            if key in lock_packages and lock_packages[key].get("checksum") != p.get("checksum"):
                raise RuntimeError(f"Source checksum disagreement between lockfiles: {key}")
            lock_packages[key] = p
    supplements_path = OUT / "supplements.json"
    supplements = read_json(supplements_path) if supplements_path.exists() else {}
    files: dict[str, bytes] = {}
    texts = {}
    inventory = []
    missing = []

    def add_text(data: bytes, source: str):
        # Preserve exact published bytes in the file; the consolidated view is UTF-8.
        sha = digest(data)
        filename = f"license-texts/{sha}.txt"
        files[filename] = data
        texts[sha] = data
        return {"file": filename, "sha256": sha, "origin": source}

    for ident in sorted(reachable, key=lambda i: (packages[i]["name"], packages[i]["version"])):
        p = packages[ident]
        if p["source"] is None:  # The application and its local core are not third parties.
            continue
        if not p["source"].startswith("registry+"):
            raise RuntimeError(f"Unreviewed non-registry dependency: {ident}")
        name, version = p["name"], p["version"]
        key = f"cargo:{name}@{version}"
        validate_license_expression(key, p["license"])
        directory = pathlib.Path(p["manifest_path"]).parent
        entry = {
            "component": key, "declared_license": p["license"],
            "package_authors": p["authors"], "build_graphs": sorted(package_builds[ident]),
            "repository": p["repository"],
            "source": f"https://crates.io/api/v1/crates/{name}/{version}/download",
            "source_sha256": lock_packages[(name, version)]["checksum"],
            "notice_files": [],
        }
        cache = directory.parents[1].parent / "cache" / directory.parent.name / f"{name}-{version}.crate"
        package_data = cache.read_bytes()
        if digest(package_data) != entry["source_sha256"]:
            raise RuntimeError(f"Published source checksum mismatch: {key}")
        # Read notice bytes from the lock-verified published archive, not a
        # potentially locally modified registry checkout. No tar paths are written.
        with tarfile.open(fileobj=io.BytesIO(package_data), mode="r:gz") as archive:
            for member in sorted(archive.getmembers(), key=lambda m: m.name):
                relative = pathlib.PurePosixPath(*pathlib.PurePosixPath(member.name).parts[1:])
                if member.isfile() and is_license_path(relative):
                    stream = archive.extractfile(member)
                    if stream is None:
                        raise RuntimeError(f"Cannot read license file: {key}/{relative}")
                    entry["notice_files"].append(add_text(stream.read(), f"{key}/{relative}"))
        for supplement in supplements.get(key, []):
            data = (OUT / supplement["file"]).read_bytes()
            if digest(data) != supplement["sha256"]:
                raise RuntimeError(f"Supplement checksum mismatch: {supplement['file']}")
            notice = add_text(data, supplement["url"])
            notice["provenance_note"] = supplement.get("note", "")
            entry["notice_files"].append(notice)
        if not entry["notice_files"]:
            missing.append(key)
        # MPL requires covered source availability. Preserve the exact upstream
        # crate (unchanged), its published checksum, and the complete license.
        if p["license"] == "MPL-2.0":
            source_file = f"sources/{name}-{version}.crate"
            files[source_file] = package_data
            entry["bundled_source"] = source_file
            entry["source_status"] = "Unmodified published crate; complete corresponding covered source is included."
        elif p["license"] and "LGPL" in p["license"]:
            if " OR " in p["license"] and "MIT" in p["license"]:
                entry["license_election"] = "MIT"
            else:
                raise RuntimeError(f"Copyleft source handling needs review: {key}: {p['license']}")
        if name == "zstd-sys":
            entry["native_license_election"] = "The bundled Zstandard C library is used under BSD-3-Clause, " \
                                                "as allowed by its source-file headers. Its alternative GPLv2 COPYING " \
                                                "document is retained for completeness, not selected for this distribution."
        inventory.append(entry)

    npm_lock = read_json(ROOT / "package-lock.json")
    for relative, package in sorted(npm_lock["packages"].items()):
        if not relative or package.get("dev"):
            continue
        directory = ROOT / relative
        manifest = read_json(directory / "package.json")
        if manifest["version"] != package["version"]:
            raise RuntimeError(f"Installed npm package does not match lock: {relative}")
        key = f"npm:{manifest['name']}@{package['version']}"
        entry = {
            "component": key, "declared_license": manifest.get("license", package.get("license")),
            "repository": manifest.get("repository"), "source": package.get("resolved"),
            "integrity": package.get("integrity"), "notice_files": [],
        }
        validate_license_expression(key, entry["declared_license"])
        for path in license_documents(directory):
            entry["notice_files"].append(add_text(path.read_bytes(), f"{key}/{path.relative_to(directory).as_posix()}"))
        if not entry["notice_files"]:
            missing.append(key)
        inventory.append(entry)
    rust_version = subprocess.check_output(["rustc", "--version", "--verbose"], text=True).strip()
    rust_fields = dict(line.split(": ", 1) for line in rust_version.splitlines()[1:] if ": " in line)
    rust_docs = pathlib.Path(subprocess.check_output(["rustc", "--print", "sysroot"], text=True).strip()) / "share/doc/rust"
    copyright_html = (rust_docs / "COPYRIGHT-library.html").read_bytes()
    runtime_path = "runtime/rust-COPYRIGHT-library.html"
    files[runtime_path] = copyright_html

    class TextView(HTMLParser):
        def __init__(self):
            super().__init__()
            self.parts = []

        def handle_data(self, data):
            if data.strip():
                self.parts.append(data.strip())

    view = TextView()
    view.feed(copyright_html.decode("utf-8"))
    runtime = {
        "component": f"toolchain:rust-std@{rust_fields['release']} ({target})",
        "declared_license": "Apache-2.0 OR MIT; additional file-level licenses listed in the upstream notice",
        "source": f"https://github.com/rust-lang/rust/tree/{rust_fields['commit-hash']}/library",
        "toolchain": rust_version,
        "original_notice": {"file": runtime_path, "sha256": digest(copyright_html)},
        "notice_files": [add_text(("\n\n".join(view.parts) + "\n").encode(),
                                   f"Rust {rust_fields['release']} installed COPYRIGHT-library.html (plain text view; original HTML included)")],
        "scope_note": "The upstream standard-library notice is preserved in full, including other-platform components. "
                      "For example, Fortanix SGX is not linked on macOS. Compiler and documentation assets are not shipped.",
    }
    for pattern in ("LICENSE-MIT-*.txt", "LICENSE-APACHE-*.txt"):
        matching = sorted((rust_docs / "html/static.files").glob(pattern))
        if len(matching) != 1:
            raise RuntimeError(f"Cannot identify toolchain license text: {pattern}")
        path = matching[0]
        runtime["notice_files"].append(add_text(path.read_bytes(), f"Rust {rust_fields['release']} installed {path.name}"))
    inventory.append(runtime)
    if missing:
        raise RuntimeError("Missing published license documents (add verified upstream supplements):\n" + "\n".join(missing))

    scope = (
        f"This inventory covers the {target} native application and legacy helper's target-filtered normal and build Rust dependency graphs "
        "(including proc macros/build tools, conservatively), plus frontend production npm packages. "
        "Development-only Rust dependencies and frontend build tools are excluded. A dependency's inclusion does not imply "
        "that every source file or optional native backend is compiled. License documents nested in published source crates "
        "are retained, including bundled native-library notices. The linked Rust standard library's upstream copyright notice "
        "is also included. 7-Zip is documented separately in ../7zip. "
        "These notices license their respective third-party components, not the ZipLens application as a whole."
    )
    result = {"schema_version": 1, "target": target, "scope": scope, "rustc": rust_version,
              "inputs": {name: digest((ROOT / name).read_bytes()) for name in
                         ["src-tauri/Cargo.lock", "astra-core/Cargo.lock", "package-lock.json"]},
              "components": inventory}
    files["inventory.json"] = (json.dumps(result, ensure_ascii=False, indent=2) + "\n").encode()
    lines = ["ZipLens — Third-party software notices", "", scope, "",
             "The source archives for MPL-2.0 components are included in the sources folder alongside this document. "
             "They contain the unmodified upstream covered source at the versions listed below. "
             "The source URLs and SHA-256 checksums also identify exact published source copies.", "",
             "A dual license expressed with OR offers a choice; AND requires the combined notices. "
             "All supplied license documents are preserved here. For LGPL alternatives explicitly offering MIT, "
             "this distribution chooses MIT. See the separate 7-Zip notices for its LGPL and unRAR terms.", ""]
    for entry in inventory:
        lines += ["=" * 78, entry["component"], f"Declared license: {entry['declared_license']}",
                  f"Source: {entry['source']}"]
        if entry.get("repository"):
            lines.append(f"Repository: {entry['repository']}")
        if entry.get("package_authors"):
            lines.append("Package authors (as declared upstream): " + "; ".join(entry["package_authors"]))
        if entry.get("scope_note"):
            lines.append(entry["scope_note"])
        if entry.get("native_license_election"):
            lines.append(entry["native_license_election"])
        if entry.get("source_sha256"):
            lines.append(f"Source SHA-256: {entry['source_sha256']}")
        if entry.get("bundled_source"):
            lines.append(f"Included corresponding source: {entry['bundled_source']} (unchanged)")
        for notice in entry["notice_files"]:
            lines += [f"Notice origin: {notice['origin']}", f"License text ID: {notice['sha256']}"]
            if notice.get("provenance_note"):
                lines.append(f"Provenance: {notice['provenance_note']}")
        lines.append("")
    lines += ["=" * 78, "COMPLETE LICENSE AND COPYRIGHT TEXTS", ""]
    for sha, data in sorted(texts.items()):
        lines += ["-" * 78, f"License text ID: {sha}", "", data.decode("utf-8", errors="replace"), ""]
    files["NOTICES.txt"] = "\n".join(lines).encode("utf-8")
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if generated files differ or are missing")
    parser.add_argument("--target", default=TARGET)
    args = parser.parse_args()
    files = render(args.target)
    if args.check:
        stale = [name for name, data in files.items() if not (OUT / name).is_file() or (OUT / name).read_bytes() != data]
        for folder in ("license-texts", "sources"):
            stale += [p.relative_to(OUT).as_posix() for p in (OUT / folder).glob("*") if p.is_file() and p.relative_to(OUT).as_posix() not in files]
        if stale:
            raise RuntimeError("Missing or stale third-party notices: " + ", ".join(stale))
    else:
        for name, data in files.items():
            path = OUT / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        for folder in ("license-texts", "sources"):
            for path in (OUT / folder).glob("*"):
                if path.is_file() and path.relative_to(OUT).as_posix() not in files:
                    path.unlink()
    components = len(json.loads(files["inventory.json"])["components"])
    print(f"{'Verified' if args.check else 'Generated'} notices for {components} components ({len(files)} files).")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, subprocess.CalledProcessError) as exc:
        print(f"License inventory error: {exc}", file=sys.stderr)
        sys.exit(1)
