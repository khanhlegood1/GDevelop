#!/usr/bin/env python3
"""Build favicon.ico (16/32/48) from the rendered small-size PNG."""
import pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = ROOT / "01-Logo" / "png" / "gon-favicon@64.png"
out = ROOT / "01-Logo" / "favicon.ico"
Image.open(src).convert("RGBA").save(out, sizes=[(16, 16), (32, 32), (48, 48)])
print(f"Wrote {out}")
