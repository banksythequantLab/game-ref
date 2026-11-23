import sys, os
from rembg import remove, new_session
from PIL import Image
sess = new_session("u2net")
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for f in sys.argv[3:]:
    im = Image.open(os.path.join(src, f)).convert("RGB")
    cut = remove(im, session=sess, post_process_mask=True)
    bbox = cut.getchannel("A").point(lambda a: 255 if a > 20 else 0).getbbox()
    cut = cut.crop(bbox)
    pad = int(max(cut.size) * 0.04)
    canvas = Image.new("RGBA", (cut.width + 2 * pad, cut.height + 2 * pad), (0, 0, 0, 0))
    canvas.paste(cut, (pad, pad))
    h = 640
    canvas = canvas.resize((round(canvas.width * h / canvas.height), h), Image.LANCZOS)
    name = f.replace("zeb_3d_v1", "zeb_idle").replace("zeb_", "").replace(".png", ".webp")
    canvas.save(os.path.join(dst, name), "WEBP", quality=88, method=6)
    print(name, canvas.size, os.path.getsize(os.path.join(dst, name)))