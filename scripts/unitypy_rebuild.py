#!/usr/bin/env python3
"""Rebuild a Unity AssetBundle by replacing a bundled TextAsset using UnityPy."""

import argparse
import sys
from pathlib import Path
from typing import Optional

try:
    import UnityPy  # type: ignore
except ImportError as exc:
    print("UnityPy module not found. Install it with 'pip install UnityPy'.", file=sys.stderr)
    sys.exit(2)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Rebuild an AssetBundle with UnityPy.')
    parser.add_argument('--bundle', required=True, help='Path to the source AssetBundle')
    parser.add_argument('--asset', required=True, help='Path to the encrypted asset to inject')
    parser.add_argument('--container', help='Container path inside the bundle that hosts the target asset')
    parser.add_argument('--object', help='Unity object name to replace inside the container')
    parser.add_argument('--output', required=True, help='Destination path for the rebuilt bundle')
    return parser.parse_args()


def apply_payload(
    bundle_path: Path,
    asset_path: Path,
    output_path: Path,
    container_name: Optional[str],
    object_name: Optional[str],
) -> None:
    env = UnityPy.load(str(bundle_path))
    payload = asset_path.read_bytes()
    replaced = False

    for obj in env.objects:
        if container_name and obj.container != container_name:
            continue

        try:
            data = obj.read()
        except Exception:
            continue

        current_name = getattr(data, 'name', None)
        if object_name and current_name != object_name:
            continue

        text_payload = payload.decode('utf-8', 'surrogateescape')

        if hasattr(data, 'm_Script'):
            data.m_Script = text_payload
        elif hasattr(data, 'script'):
            data.script = text_payload
        elif hasattr(data, 'data'):  # fallback for older Unity versions
            data.data = text_payload
        else:
            obj.set_raw_data(payload)
            replaced = True
            break

        if hasattr(data, 'save') and callable(data.save):
            data.save()

        replaced = True
        break

    if not replaced:
        descriptor = container_name or '<any container>'
        raise RuntimeError(f'Could not locate target payload for container {descriptor}.')

    output_path.parent.mkdir(parents=True, exist_ok=True)
    rebuilt_bytes = env.file.save(packer="original")
    output_path.write_bytes(rebuilt_bytes)


def main() -> int:
    args = parse_args()
    bundle_path = Path(args.bundle).expanduser().resolve()
    asset_path = Path(args.asset).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()

    if not bundle_path.exists():
        print(f'Source bundle not found: {bundle_path}', file=sys.stderr)
        return 3

    if not asset_path.exists():
        print(f'New asset file not found: {asset_path}', file=sys.stderr)
        return 4

    try:
        apply_payload(bundle_path, asset_path, output_path, args.container, args.object)
    except Exception as exc:  # noqa: BLE001
        print(f'UnityPy rebuild error: {exc}', file=sys.stderr)
        return 5

    print(f'UnityPy rebuild completed: {output_path}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
