# Logo, header head-crop and YouTube thumbnail for Game Ref, built from the ComfyUI Zeb cutouts.
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
CUT = r"D:\game-ref\.mascot\cut"; OUT = r"D:\game-ref\public\zeb"; BR = r"D:\game-ref\.mascot\brand"
os.makedirs(OUT, exist_ok=True); os.makedirs(BR, exist_ok=True)
BLACK = r"C:\Windows\Fonts\ariblk.ttf"; BOLD = r"C:\Windows\Fonts\arialbd.ttf"
YEL = (245, 197, 24)

from rembg import remove, new_session
_s = new_session("u2net")
def fullcut(name):
    im = remove(Image.open(os.path.join(r"D:\game-ref\.mascot", name)).convert("RGB"), session=_s, post_process_mask=True)
    return im.crop(im.getchannel("A").point(lambda a: 255 if a > 20 else 0).getbbox())
idle = fullcut("zeb_3d_v1.png")
# head = top 50% of the idle cutout (cap, ears, face, muzzle)
head = idle.crop((0, 0, idle.width, int(idle.height * 0.50)))
head = head.crop(head.getchannel("A").getbbox())
head_small = head.resize((round(head.width * 160 / head.height), 160), Image.LANCZOS); head_small.save(os.path.join(OUT, "head.webp"), "WEBP", quality=90)
fav = Image.new("RGBA", (256, 256), (0, 0, 0, 0)); h2 = head.copy(); h2.thumbnail((240, 240), Image.LANCZOS)
fav.alpha_composite(h2, ((256 - h2.width) // 2, (256 - h2.height) // 2)); fav.save(os.path.join(OUT, "favicon.png"))

def stripes(size, alpha=22):
    w, h = size; im = Image.new("RGBA", size, (14, 15, 18, 255))
    lay = Image.new("RGBA", size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    for x in range(-h, w + h, 60):
        d.polygon([(x, 0), (x + 30, 0), (x + 30 - h * 0.58, h), (x - h * 0.58, h)], fill=(255, 255, 255, alpha))
    im.alpha_composite(lay); return im

def shadowed(img, blur=18, off=(0, 14)):
    sh = Image.new("RGBA", (img.width + 80, img.height + 80), (0, 0, 0, 0))
    a = img.getchannel("A").point(lambda v: int(v * 0.6))
    blk = Image.new("RGBA", img.size, (0, 0, 0, 255)); blk.putalpha(a)
    sh.alpha_composite(blk, (40 + off[0], 40 + off[1])); sh = sh.filter(ImageFilter.GaussianBlur(blur))
    sh.alpha_composite(img, (40, 40)); return sh

# ---- logo 1024x1024
L = stripes((1024, 1024)); d = ImageDraw.Draw(L)
d.ellipse((112, 40, 912, 840), fill=(23, 25, 30, 255), outline=YEL, width=18)
hh = head.resize((round(head.width * 600 / head.height), 600), Image.LANCZOS); hs = shadowed(hh)
L.alpha_composite(hs, ((1024 - hs.width) // 2, 440 - hs.height // 2))
f = ImageFont.truetype(BLACK, 150); t = "GAME REF"; tw = d.textlength(t, font=f)
d.text(((1024 - tw) / 2 + 4, 838), t, font=f, fill=(0, 0, 0, 255)); d.text(((1024 - tw) / 2, 832), t, font=f, fill=YEL)
L.convert("RGB").save(os.path.join(BR, "game-ref-logo.png"))

# ---- thumbnail 1280x720
T = stripes((1280, 720), 26); d = ImageDraw.Draw(T)
no = fullcut("zeb_no.png")
z = no.resize((round(no.width * 690 / no.height), 690), Image.LANCZOS); zs = shadowed(z)
T.alpha_composite(zs, (1280 - zs.width + 10, 720 - zs.height + 70))
big = ImageFont.truetype(BLACK, 128)
for i, line in enumerate(["IS THAT", "LEGAL?"]):
    y = 70 + i * 140
    d.text((66, y + 7), line, font=big, fill=(0, 0, 0, 255)); d.text((60, y), line, font=big, fill=YEL if i else (255, 255, 255, 255))
sub = ImageFont.truetype(BOLD, 44)
d.rounded_rectangle((60, 400, 700, 470), 14, fill=(23, 25, 30, 235))
d.text((84, 410), "Ask Zeb the Ref", font=sub, fill=(255, 255, 255, 255))
small = ImageFont.truetype(BOLD, 36)
d.text((64, 500), "AI game referee - runs on your device", font=small, fill=(210, 214, 222, 255))
d.text((64, 548), "Gemini Nano + Firebase AI Logic", font=small, fill=(154, 160, 171, 255))
T.convert("RGB").save(os.path.join(BR, "game-ref-thumbnail.png"))
print("ok", head.size)