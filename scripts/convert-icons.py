#!/usr/bin/env python3
"""Convert SVG logo to PNG for Tauri icon generation."""
import cairosvg
from pathlib import Path


def main():
    project_root = Path(__file__).resolve().parent.parent
    svg_path = project_root / "src-tauri" / "icons" / "clotho-logo.svg"
    png_path = project_root / "src-tauri" / "icons" / "icon-1024.png"

    if not svg_path.exists():
        print(f"Error: SVG not found at {svg_path}")
        raise SystemExit(1)

    cairosvg.svg2png(
        url=str(svg_path),
        write_to=str(png_path),
        output_width=1024,
        output_height=1024,
    )
    print(f"Generated {png_path}")
    print("Run: pnpm tauri icon src-tauri/icons/icon-1024.png")


if __name__ == "__main__":
    main()
