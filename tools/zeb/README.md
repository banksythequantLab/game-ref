# Zeb the Ref art pipeline

Zeb was generated locally on the Banksy box (AMD Strix Halo, ComfyUI on ROCm):

1. The original flat vector Zeb (rendered from an earlier SVG) went into **Qwen-Image-Edit 2511** (int8, Apache-2.0) with the 4-step Lightning LoRA, using `base_prompt.txt` -> the 3D base character (~95 s).
2. Each reaction pose = the 3D base + one line from `pose_prompts.txt` (`name|prompt|seed`), one job at a time (`batch.sh`, `zeb_edit.py`, ~90 s each).
3. `cutout.py` removes the white background (rembg/u2net) and writes 640 px transparent WebPs to `public/zeb/`.
4. `brand.py` builds the logo, the header head crop, the favicon and the YouTube thumbnail.
5. `video.sh` animates three poses with **Wan 2.2 TI2V-5B** (Apache-2.0), 480x832, 49 frames, ~3.5 min each.
