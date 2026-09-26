# Stage 1 (build only, thrown away): download the FREE open-source watermark detector (prithivMLmods/Watermark-Detection-SigLIP2, Apache-2.0) and convert it to ONNX,
# so the final image needs only the small onnxruntime and no PyTorch. Needs internet access during the build (huggingface.co).
FROM python:3.12-slim AS wm-export
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir "transformers==5.17.0" onnx numpy pillow
COPY excel/wm_export.py /wm_export.py
RUN mkdir /out && python /wm_export.py /out/wm.onnx

# Playwright image already contains Chromium + all system libraries; version must match package.json.
FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app
COPY package.json ./
# browsers are pre-installed in the base image, so skip the download
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm install --omit=dev --no-audit --no-fund

# Python (+ openpyxl for the Excel, Pillow for the watermark photo sheets): the pipeline stages run the same scripts (excel/*.py) that were used by hand
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-openpyxl python3-pil python3-numpy python3-pip && rm -rf /var/lib/apt/lists/* \
 && pip3 install --no-cache-dir --break-system-packages onnxruntime

COPY worker.js dashboard.html targets.json ./
COPY lib ./lib
COPY excel ./excel
COPY --from=wm-export /out/wm.onnx ./excel/wm.onnx

# results + resume state live in /data: mount a persistent volume there (Coolify / Railway settings). No VOLUME instruction on purpose: Railway does not allow it.
ENV DATA_DIR=/data \
    PORT=3000 \
    WORKERS=2 \
    NODE_OPTIONS=--max-old-space-size=768
EXPOSE 3000

# Coolify uses this to know the app is alive
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "worker.js"]
