"""Build the wide tablet hero from the owner's original cumin wings poster.

The food area is only cropped and resized. No image generation, retouching, or
painting is applied to the visible food. Copy stays in HTML for localization.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/featured/zziran-wings.jpg"
OUTPUT = ROOT / "assets/featured/zziran-wings-banner.jpg"
WIDTH, HEIGHT = 1980, 600
PHOTO_LEFT = 800


def main() -> None:
    original = Image.open(SOURCE).convert("RGB")
    if original.size != (1122, 1402):
        raise ValueError(f"Unexpected source size: {original.size}")

    # Keep the original food pixels intact apart from the resize needed for the
    # tablet banner. The crop omits the poster's large headline and body copy.
    food = original.crop((250, 470, 1122, 1080))
    food = ImageOps.fit(
        food,
        (WIDTH - PHOTO_LEFT, HEIGHT),
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.40),
    )

    banner = Image.new("RGB", (WIDTH, HEIGHT))
    pixels = banner.load()
    for x in range(WIDTH):
        t = min(1.0, x / 1250)
        color = (int(22 + 26 * t), int(10 + 9 * t), int(7 + 3 * t))
        for y in range(HEIGHT):
            pixels[x, y] = color

    glow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    draw.ellipse((190, 360, 1050, 1030), fill=(194, 58, 17, 58))
    glow = glow.filter(ImageFilter.GaussianBlur(145))
    background = Image.alpha_composite(banner.convert("RGBA"), glow).convert("RGB")
    foreground = background.copy()
    foreground.paste(food, (PHOTO_LEFT, 0))

    # Feather only the photograph's left seam into the copy area. The wings on
    # the right are unchanged after their uniform resize.
    mask = Image.new("L", (WIDTH, HEIGHT), 0)
    mask_pixels = mask.load()
    for x in range(1040, WIDTH):
        t = min(1.0, (x - 1040) / (1210 - 1040))
        alpha = int(255 * t * t * (3 - 2 * t))
        for y in range(HEIGHT):
            mask_pixels[x, y] = alpha
    banner = Image.composite(foreground, background, mask)
    banner.save(OUTPUT, "JPEG", quality=91, subsampling=0, optimize=True)
    print(f"Created {OUTPUT} ({WIDTH}x{HEIGHT})")


if __name__ == "__main__":
    main()
