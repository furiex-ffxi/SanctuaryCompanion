from __future__ import annotations

import argparse
import os
import struct
from pathlib import Path
from PIL import Image

DEFAULT_GAME = Path(r"C:\Program Files (x86)\Diablo II Resurrected")

def decode_dc6(path: Path, palette: bytes):
    raw = path.read_bytes()
    if len(raw) < 24:
        raise ValueError(f"Invalid DC6 file: {path}")
    directions, frames_per_direction = struct.unpack_from("<II", raw, 16)
    count = directions * frames_per_direction
    pointers = struct.unpack_from(f"<{count}I", raw, 24)
    for index, pointer in enumerate(pointers):
        if pointer + 32 > len(raw):
            raise ValueError(f"Invalid DC6 frame pointer in {path}")
        _, width, height, _, _, _, _, length = struct.unpack_from("<8I", raw, pointer)
        if width <= 0 or height <= 0 or pointer + 32 + length > len(raw):
            raise ValueError(f"Invalid DC6 frame dimensions in {path}")
        pixels = bytearray(width * height * 4)
        x, y = 0, height - 1
        cursor = pointer + 32
        end = cursor + length
        while cursor < end and y >= 0:
            command = raw[cursor]
            cursor += 1
            if command == 0x80:
                x = 0
                y -= 1
            elif command >= 0x80:
                x += command - 0x80
            else:
                run_end = min(x + command, width)
                for px in range(x, run_end):
                    palette_index = raw[cursor]
                    cursor += 1
                    r, g, b = palette[palette_index * 3:palette_index * 3 + 3]
                    offset = (y * width + px) * 4
                    pixels[offset:offset + 4] = bytes((r, g, b, 255))
                x = run_end
        yield index // frames_per_direction, index % frames_per_direction, Image.frombytes("RGBA", (width, height), bytes(pixels))

def main():
    parser = argparse.ArgumentParser(description="Extract private D2R DC6 item sprites into browser-readable PNGs.")
    parser.add_argument("--game-dir", type=Path, default=Path(os.environ.get("D2R_GAME_DIR", DEFAULT_GAME)))
    parser.add_argument("--output-dir", type=Path, default=Path(os.environ.get("D2R_ITEM_ASSET_DIR", Path(__file__).resolve().parents[1] / ".d2r-item-assets")))
    args = parser.parse_args()
    item_dir = args.game_dir / "Data" / "global" / "items"
    palette_path = args.game_dir / "Data" / "global" / "palette" / "act1" / "pal.dat"
    if not item_dir.is_dir():
        raise SystemExit(f"D2R item directory not found: {item_dir}")
    if not palette_path.is_file():
        raise SystemExit(f"D2R palette not found: {palette_path}")
    palette = palette_path.read_bytes()
    if len(palette) < 768:
        raise SystemExit(f"Invalid D2R palette: {palette_path}")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    for source in sorted(item_dir.glob("*.dc6")):
        frames = list(decode_dc6(source, palette))
        if len(frames) == 1:
            frames[0][2].save(args.output_dir / f"{source.stem}.png")
            written += 1
        else:
            for direction, frame, image in frames:
                image.save(args.output_dir / f"{source.stem}_{direction}_{frame}.png")
                written += 1
    print(f"Extracted {written} private D2R item frames to {args.output_dir}")

if __name__ == "__main__":
    main()