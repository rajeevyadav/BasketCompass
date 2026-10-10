"""Generate the BasketCompass brand assets from computed geometry.

The mark is an eight-point compass rose on a rounded tile: cardinal points are
long, diagonal points are short, and the north point carries a warm accent so the
"which way to the best basket" idea reads at a glance. Geometry is computed here,
never hand-tweaked, so every asset stays in proportion and can be regenerated:

    python brand/GenerateBrand.py

Outputs vector assets (Favicon.svg, Logo.svg, Banner.svg) plus the raster app
icons the web manifest needs (../dist/Icon.svg, Icon-192.png, Icon-512.png). PNGs
are supersampled 4x and downscaled with Lanczos for clean edges, so no external
SVG rasterizer is required.
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

# Palette — deep teal brand field, mint highlight, amber north accent, off-white ink.
DEEP_TEAL = "#075e4c"
MID_TEAL = "#0e8a6d"
MINT = "#8fd6c0"
AMBER = "#f4a01f"
INK = "#f7faf9"

BRAND_DIR = Path(__file__).resolve().parent
DIST_DIR = BRAND_DIR.parent / "dist"

# Compass-rose radii as fractions of the tile's usable half-width. Cardinal points
# reach the long radius, diagonal points the short radius, and the star's valleys
# sit at the inner radius between every pair of points.
LONG_RADIUS = 0.80
SHORT_RADIUS = 0.34
INNER_RADIUS = 0.15
HUB_RADIUS = 0.11


def rose_points(center_x: float, center_y: float, scale: float) -> list[tuple[float, float]]:
    """Return the 16 vertices of the eight-point star, clockwise from north."""
    vertices: list[tuple[float, float]] = []
    for point_index in range(8):
        # Point angle, measured clockwise from straight up (north).
        point_angle = math.radians(point_index * 45 - 90)
        tip_radius = LONG_RADIUS if point_index % 2 == 0 else SHORT_RADIUS
        vertices.append(
            (center_x + math.cos(point_angle) * tip_radius * scale,
             center_y + math.sin(point_angle) * tip_radius * scale)
        )
        valley_angle = math.radians(point_index * 45 - 90 + 22.5)
        vertices.append(
            (center_x + math.cos(valley_angle) * INNER_RADIUS * scale,
             center_y + math.sin(valley_angle) * INNER_RADIUS * scale)
        )
    return vertices


def north_triangle(center_x: float, center_y: float, scale: float) -> list[tuple[float, float]]:
    """The single north point, drawn over the rose in the accent colour."""
    tip = (center_x, center_y - LONG_RADIUS * scale)
    left_valley = (center_x + math.cos(math.radians(-90 - 22.5)) * INNER_RADIUS * scale,
                   center_y + math.sin(math.radians(-90 - 22.5)) * INNER_RADIUS * scale)
    right_valley = (center_x + math.cos(math.radians(-90 + 22.5)) * INNER_RADIUS * scale,
                    center_y + math.sin(math.radians(-90 + 22.5)) * INNER_RADIUS * scale)
    return [tip, left_valley, (center_x, center_y), right_valley]


def draw_icon(pixels: int) -> Image.Image:
    """Draw the rounded-tile app icon at the given pixel size, supersampled 4x."""
    supersample = 4
    size = pixels * supersample
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    corner = size * 0.22
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=corner, fill=DEEP_TEAL)

    center = size / 2
    scale = size / 2
    draw.polygon(rose_points(center, center, scale), fill=MINT)
    draw.polygon(north_triangle(center, center, scale), fill=AMBER)
    hub = HUB_RADIUS * scale
    draw.ellipse([center - hub, center - hub, center + hub, center + hub], fill=INK)

    return image.resize((pixels, pixels), Image.LANCZOS)


def svg_polygon(points: list[tuple[float, float]], fill: str) -> str:
    coordinates = " ".join(f"{x:.2f},{y:.2f}" for x, y in points)
    return f'<polygon points="{coordinates}" fill="{fill}"/>'


def write_icon_svg(path: Path, viewbox: int = 100) -> None:
    """Emit the scalable rounded-tile icon used as the crisp web/app icon."""
    center = viewbox / 2
    scale = viewbox / 2
    body = [
        f'<rect width="{viewbox}" height="{viewbox}" rx="{viewbox * 0.22:.1f}" fill="{DEEP_TEAL}"/>',
        svg_polygon(rose_points(center, center, scale), MINT),
        svg_polygon(north_triangle(center, center, scale), AMBER),
        f'<circle cx="{center}" cy="{center}" r="{HUB_RADIUS * scale:.2f}" fill="{INK}"/>',
    ]
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {viewbox} {viewbox}" '
           f'role="img" aria-label="BasketCompass">' + "".join(body) + "</svg>\n")
    path.write_text(svg, encoding="utf-8")


def write_banner(path: Path, width: int = 1200, height: int = 300) -> None:
    """Emit the wide repository hero: mark on the left, wordmark and tagline right."""
    mark_size = 200
    mark_x = 120
    mark_y = (height - mark_size) / 2
    inner_center_x = mark_x + mark_size / 2
    inner_center_y = mark_y + mark_size / 2
    inner_scale = mark_size / 2

    tile = (f'<rect x="{mark_x}" y="{mark_y}" width="{mark_size}" height="{mark_size}" '
            f'rx="{mark_size * 0.22:.1f}" fill="{DEEP_TEAL}"/>')
    rose = svg_polygon(rose_points(inner_center_x, inner_center_y, inner_scale), MINT)
    north = svg_polygon(north_triangle(inner_center_x, inner_center_y, inner_scale), AMBER)
    hub = (f'<circle cx="{inner_center_x}" cy="{inner_center_y}" '
           f'r="{HUB_RADIUS * inner_scale:.2f}" fill="{INK}"/>')
    text_x = mark_x + mark_size + 70
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'role="img" aria-label="BasketCompass">'
        f'<rect width="{width}" height="{height}" fill="{MID_TEAL}"/>'
        f'<rect width="{width}" height="{height}" fill="url(#fade)"/>'
        f'<defs><linearGradient id="fade" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="#0b6e58"/><stop offset="1" stop-color="#064636"/>'
        f'</linearGradient></defs>'
        f'{tile}{rose}{north}{hub}'
        f'<text x="{text_x}" y="155" font-family="Segoe UI, Helvetica, Arial, sans-serif" '
        f'font-size="78" font-weight="700" fill="{INK}">BasketCompass</text>'
        f'<text x="{text_x}" y="205" font-family="Segoe UI, Helvetica, Arial, sans-serif" '
        f'font-size="30" fill="{MINT}">Point your grocery run at the lowest total.</text>'
        f'</svg>\n'
    )
    path.write_text(svg, encoding="utf-8")


def main() -> None:
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    write_icon_svg(BRAND_DIR / "Favicon.svg")
    write_icon_svg(BRAND_DIR / "Logo.svg")
    write_icon_svg(DIST_DIR / "Icon.svg")
    write_banner(BRAND_DIR / "Banner.svg")
    draw_icon(192).save(DIST_DIR / "Icon-192.png")
    draw_icon(512).save(DIST_DIR / "Icon-512.png")
    # Multi-size Windows .ico for the frozen launcher exe and the Inno installer.
    draw_icon(256).save(BRAND_DIR / "Icon.ico",
                        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("Brand assets written to brand/, dist/, and brand/Icon.ico.")


if __name__ == "__main__":
    main()
