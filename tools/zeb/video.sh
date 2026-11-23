#!/bin/bash
# Zeb video clips with Wan 2.2 TI2V-5B (Apache-2.0), one job at a time, after the pose batch finishes.
while ! grep -q BATCH_DONE /tmp/zeb_batch.log 2>/dev/null; do sleep 10; done
cp /tmp/zeb_out/zeb_3d_v1.png /opt/banksy/ComfyUI/input/zebv_idle.png
cp /tmp/zeb_out/zeb_no.png /opt/banksy/ComfyUI/input/zebv_no.png
cp /tmp/zeb_out/zeb_yes.png /opt/banksy/ComfyUI/input/zebv_yes.png
unload() { for m in $(curl -s 127.0.0.1:11434/api/ps | python3 -c 'import json,sys; print(" ".join(x["name"] for x in json.load(sys.stdin)["models"]))'); do curl -s 127.0.0.1:11434/api/generate -d "{\"model\":\"$m\",\"keep_alive\":0}" >/dev/null; done; sleep 4; }
run() { unload; /opt/banksy/ComfyUI/venv/bin/python /tmp/wan_i2v.py "$1" 480 832 49 20 "video/$2" "$3" >> /tmp/zeb_video.log 2>&1; echo "DONE $2" >> /tmp/zeb_video.log; }
run zebv_idle.png zeb_wave "The cartoon zebra referee waves hello with his right hoof, smiles and nods his head, friendly, gentle motion, plain white background, static camera, high quality 3D animation"
run zebv_no.png zeb_whistle "The cartoon zebra referee blows his whistle hard with puffed cheeks and shakes the red card in the air, stern face, plain white background, static camera, high quality 3D animation"
run zebv_yes.png zeb_cheer "The cartoon zebra referee jumps with joy, pumping the green check card in the air, laughing, plain white background, static camera, high quality 3D animation"
echo VIDEO_DONE >> /tmp/zeb_video.log