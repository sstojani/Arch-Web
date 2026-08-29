from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path("assets")
OUT.mkdir(exist_ok=True)

PALETTES = [
    ("project-courtyard.png", "#d9ddd3", "#8f998f", "#2f3732", "#c65c2e"),
    ("project-interior.png", "#e9e2d6", "#b19679", "#35302b", "#8b684d"),
    ("project-gallery.png", "#ececea", "#adb4af", "#1f2523", "#c65c2e"),
    ("project-harbor.png", "#dfe7e6", "#78919b", "#27363a", "#bd6b3a"),
    ("project-plan.png", "#f0f1ec", "#8c928a", "#202622", "#c65c2e"),
    ("project-facade.png", "#e4e6df", "#9a9d95", "#1b201d", "#b85a32"),
]


def hex_to_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def draw_grid(draw, w, h, color):
    for x in range(0, w, 80):
        draw.line((x, 0, x, h), fill=color, width=1)
    for y in range(0, h, 80):
        draw.line((0, y, w, y), fill=color, width=1)


def make_asset(name, bg, mid, dark, accent, index):
    w, h = 1600, 1200
    image = Image.new("RGB", (w, h), hex_to_rgb(bg))
    draw = ImageDraw.Draw(image, "RGBA")
    draw_grid(draw, w, h, (*hex_to_rgb(mid), 30))

    # soft daylight fields
    for i in range(10):
        alpha = 24 - i
        draw.rectangle((120 + i * 18, 120 + i * 12, 1480 - i * 10, 990 - i * 18), fill=(*hex_to_rgb("#ffffff"), alpha))

    if index == 0:
        draw.rectangle((220, 630, 1280, 880), fill=(*hex_to_rgb(dark), 220))
        draw.polygon([(340, 630), (750, 340), (1240, 630)], fill=(*hex_to_rgb(mid), 210))
        draw.rectangle((500, 650, 780, 880), fill=(*hex_to_rgb(bg), 210))
        draw.rectangle((860, 650, 1080, 790), fill=(*hex_to_rgb("#ffffff"), 120))
        draw.rectangle((170, 880, 1370, 930), fill=(*hex_to_rgb(accent), 210))
    elif index == 1:
        draw.rectangle((180, 180, 1420, 980), fill=(*hex_to_rgb("#ffffff"), 165))
        draw.rectangle((250, 260, 720, 960), fill=(*hex_to_rgb(mid), 170))
        draw.rectangle((790, 260, 1360, 580), fill=(*hex_to_rgb(dark), 210))
        draw.rectangle((820, 610, 1360, 960), fill=(*hex_to_rgb("#cab49a"), 170))
        draw.line((250, 600, 1360, 600), fill=(*hex_to_rgb(accent), 190), width=10)
    elif index == 2:
        draw.rectangle((240, 220, 1360, 900), fill=(*hex_to_rgb("#ffffff"), 210))
        for x in (360, 620, 880, 1140):
            draw.rectangle((x, 320, x + 130, 710), outline=(*hex_to_rgb(dark), 170), width=8)
        draw.rectangle((220, 900, 1380, 960), fill=(*hex_to_rgb(dark), 210))
        draw.arc((560, 640, 1040, 1120), 180, 360, fill=(*hex_to_rgb(accent), 210), width=18)
    elif index == 3:
        draw.polygon([(0, 760), (1600, 560), (1600, 1200), (0, 1200)], fill=(*hex_to_rgb(mid), 165))
        for x in range(180, 1500, 170):
            draw.line((x, 190, x + 220, 920), fill=(*hex_to_rgb(dark), 120), width=4)
        draw.rectangle((170, 760, 1420, 840), fill=(*hex_to_rgb(accent), 210))
        draw.ellipse((1060, 230, 1320, 490), fill=(*hex_to_rgb("#ffffff"), 120))
    elif index == 4:
        for offset in (0, 28, 56):
            draw.rectangle((260 + offset, 210 + offset, 1320 - offset, 920 - offset), outline=(*hex_to_rgb(dark), 150), width=5)
        draw.line((260, 560, 1320, 560), fill=(*hex_to_rgb(mid), 180), width=6)
        draw.line((790, 210, 790, 920), fill=(*hex_to_rgb(mid), 180), width=6)
        draw.rectangle((680, 450, 900, 670), outline=(*hex_to_rgb(accent), 220), width=10)
    else:
        draw.rectangle((260, 220, 1340, 950), fill=(*hex_to_rgb(dark), 220))
        for x in range(340, 1260, 150):
            draw.rectangle((x, 300, x + 76, 840), fill=(*hex_to_rgb(bg), 230))
        draw.rectangle((220, 920, 1380, 980), fill=(*hex_to_rgb(accent), 220))
        draw.line((260, 220, 1340, 950), fill=(*hex_to_rgb("#ffffff"), 80), width=4)

    image = image.filter(ImageFilter.UnsharpMask(radius=1.2, percent=115, threshold=3))
    image.save(OUT / name, optimize=True)


for idx, palette in enumerate(PALETTES):
    make_asset(*palette, idx)

print("Generated", len(PALETTES), "portfolio assets in", OUT.resolve())
