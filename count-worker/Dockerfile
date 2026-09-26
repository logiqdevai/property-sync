# Playwright image already contains Chromium + all system libraries; version must match package.json.
FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app
COPY package.json ./
# browsers are pre-installed in the base image, so skip the download
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm install --omit=dev --no-audit --no-fund

COPY worker.js dashboard.html targets.json ./

# results + resume state live in /data: mount a persistent volume there (Coolify / Railway settings). No VOLUME instruction on purpose: Railway does not allow it.
ENV DATA_DIR=/data \
    PORT=3000 \
    WORKERS=2 \
    NODE_OPTIONS=--max-old-space-size=768
EXPOSE 3000

# Coolify uses this to know the app is alive
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "worker.js"]
