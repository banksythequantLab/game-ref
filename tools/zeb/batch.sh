#!/bin/bash
# Run each pose edit one at a time from the 3D base (one heavy ComfyUI job at a time).
while IFS='|' read -r name prompt seed; do
  [ -z "$name" ] && continue
  /opt/banksy/ComfyUI/venv/bin/python /tmp/zeb_edit.py /tmp/zeb_out/zeb_3d_v1.png "$prompt" "$name" "$seed" 4 >> /tmp/zeb_batch.log 2>&1
done < /tmp/zeb_jobs.txt
echo BATCH_DONE >> /tmp/zeb_batch.log