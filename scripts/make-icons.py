"""Draws the Turnout mark (7x7 LED "T", same cells as components/brand/Logo.tsx) as favicon + PWA icons.
python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw

LIT = {(x, 0) for x in range(7)} | {(x, 1) for x in range(1, 6)} | {(3, y) for y in range(2, 7)} | {(2, 6), (4, 6)}

def mark(size, pad, radius_frac=0.22, bg=(0, 0, 0), dim=(38, 38, 38), lit=(255, 255, 255), rounded=True):
    s = size * 4  # supersample
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * radius_frac), fill=bg)
    else:
        d.rectangle([0, 0, s, s], fill=bg)
    inner = s - 2 * pad * 4
    cell = inner / 7
    r = cell * 0.36
    for y in range(7):
        for x in range(7):
            cx = pad * 4 + cell * (x + 0.5)
            cy = pad * 4 + cell * (y + 0.5)
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=lit if (x, y) in LIT else dim)
    return im.resize((size, size), Image.LANCZOS)

mark(192, 26).save("public/icons/icon-192.png")
mark(512, 70).save("public/icons/icon-512.png")
mark(512, 120, rounded=False).save("public/icons/maskable-512.png")  # safe zone for Android masks
mark(180, 24, rounded=False).convert("RGB").save("app/apple-icon.png")
ico = mark(256, 30)
ico.save("app/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

# Crisp vector favicon for modern browsers.
cells = []
for y in range(7):
    for x in range(7):
        on = (x, y) in LIT
        cells.append(f'<circle cx="{14 + x * 10}" cy="{14 + y * 10}" r="3.6" fill="{"#fff" if on else "#262626"}"/>')
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 98 98"><rect width="98" height="98" rx="22" fill="#000"/>{"".join(cells)}</svg>\n'
open("app/icon.svg", "w").write(svg)
print("icons written")
