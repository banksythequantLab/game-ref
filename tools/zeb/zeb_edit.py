#!/usr/bin/env python3
"""Zeb the Ref - Qwen-Image-Edit-2511 (Apache-2.0) via the box's ComfyUI API.
usage: zeb_edit.py IN.png "prompt" PREFIX [seed] [steps] [IN2.png]"""
import json, sys, time, uuid, urllib.request, shutil, os
B = "http://127.0.0.1:8188"
def memavail():
    for l in open("/proc/meminfo"):
        if l.startswith("MemAvailable"): return int(l.split()[1]) // 1024 // 1024
def upload(path):
    bd = uuid.uuid4().hex
    data = open(path, "rb").read()
    body = (f"--{bd}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{os.path.basename(path)}\"\r\nContent-Type: image/png\r\n\r\n").encode() + data + f"\r\n--{bd}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n--{bd}--\r\n".encode()
    r = urllib.request.Request(B + "/upload/image", data=body, headers={"Content-Type": f"multipart/form-data; boundary={bd}"})
    return json.load(urllib.request.urlopen(r))["name"]
inp, prompt, prefix = sys.argv[1], sys.argv[2], sys.argv[3]
seed = int(sys.argv[4]) if len(sys.argv) > 4 else 7
steps = int(sys.argv[5]) if len(sys.argv) > 5 else 4
inp2 = sys.argv[6] if len(sys.argv) > 6 else None
def unload_ollama():
    # The kiosk assistant's Ollama model reloads on its next request; free its ~23 GB for this job.
    try:
        ps = json.load(urllib.request.urlopen("http://127.0.0.1:11434/api/ps", timeout=5))
        for m in ps.get("models", []):
            urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:11434/api/generate", data=json.dumps({"model": m["name"], "keep_alive": 0}).encode(), headers={"Content-Type": "application/json"}), timeout=30).read()
    except Exception as e:
        print("ollama unload skipped:", e)
if memavail() < 30:
    unload_ollama(); time.sleep(4)
if memavail() < 25: sys.exit(f"refusing: MemAvailable {memavail()} GB < 25")
img = upload(inp)
g = {
 "1": {"class_type": "LoadImage", "inputs": {"image": img}},
 "2": {"class_type": "FluxKontextImageScale", "inputs": {"image": ["1", 0]}},
 "3": {"class_type": "UNETLoader", "inputs": {"unet_name": "qwen_image_edit_2511_int8_convrot.safetensors", "weight_dtype": "default"}},
 "4": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["3", 0], "shift": 3.1}},
 "5": {"class_type": "CFGNorm", "inputs": {"model": ["4", 0], "strength": 1.0}},
 "6": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["5", 0], "lora_name": "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors", "strength_model": 1.0}},
 "7": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_2.5_vl_7b_fp8_scaled.safetensors", "type": "qwen_image", "device": "cpu"}},
 "8": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_vae.safetensors"}},
 "9": {"class_type": "TextEncodeQwenImageEditPlus", "inputs": {"clip": ["7", 0], "vae": ["8", 0], "image1": ["2", 0], "prompt": prompt}},
 "10": {"class_type": "TextEncodeQwenImageEditPlus", "inputs": {"clip": ["7", 0], "vae": ["8", 0], "image1": ["2", 0], "prompt": ""}},
 "11": {"class_type": "FluxKontextMultiReferenceLatentMethod", "inputs": {"conditioning": ["9", 0], "reference_latents_method": "index_timestep_zero"}},
 "12": {"class_type": "FluxKontextMultiReferenceLatentMethod", "inputs": {"conditioning": ["10", 0], "reference_latents_method": "index_timestep_zero"}},
 "13": {"class_type": "VAEEncode", "inputs": {"pixels": ["2", 0], "vae": ["8", 0]}},
 "14": {"class_type": "KSampler", "inputs": {"model": ["6", 0] if steps <= 8 else ["5", 0], "positive": ["11", 0], "negative": ["12", 0], "latent_image": ["13", 0], "seed": seed, "steps": steps, "cfg": 1.0 if steps <= 8 else 4.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
 "15": {"class_type": "VAEDecode", "inputs": {"samples": ["14", 0], "vae": ["8", 0]}},
 "16": {"class_type": "SaveImage", "inputs": {"images": ["15", 0], "filename_prefix": prefix}},
}
if inp2:
    g["17"] = {"class_type": "LoadImage", "inputs": {"image": upload(inp2)}}
    g["18"] = {"class_type": "FluxKontextImageScale", "inputs": {"image": ["17", 0]}}
    g["9"]["inputs"]["image2"] = ["18", 0]; g["10"]["inputs"]["image2"] = ["18", 0]
t0 = time.time()
pid = json.load(urllib.request.urlopen(urllib.request.Request(B + "/prompt", data=json.dumps({"prompt": g}).encode(), headers={"Content-Type": "application/json"})))["prompt_id"]
while True:
    time.sleep(3)
    h = json.load(urllib.request.urlopen(f"{B}/history/{pid}"))
    if pid in h:
        st = h[pid].get("status", {})
        if st.get("status_str") == "error":
            sys.exit("ERROR " + json.dumps(st.get("messages", []))[-1500:])
        outs = [i for o in h[pid]["outputs"].values() for i in o.get("images", [])]
        if outs:
            os.makedirs("/tmp/zeb_out", exist_ok=True)
            for i in outs:
                src = f"/opt/banksy/ComfyUI/output/{i.get('subfolder','')}/{i['filename']}".replace("//", "/")
                shutil.copy(src, f"/tmp/zeb_out/{prefix}.png")
            print(f"OK {prefix} {time.time()-t0:.0f}s -> /tmp/zeb_out/{prefix}.png")
            break
    if time.time() - t0 > 1500: sys.exit("timeout")