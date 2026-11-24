FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libegl1 libgles2 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 appuser
COPY requirements.txt .
RUN python -m pip install --no-cache-dir -r requirements.txt
COPY --chown=appuser:appuser app ./app
COPY --chown=appuser:appuser scripts ./scripts
RUN mkdir -p /app/models && chown appuser:appuser /app/models
USER appuser
ENV MPLCONFIGDIR=/tmp/nonverbal-mpl
ENV XDG_CACHE_HOME=/tmp/nonverbal-cache
RUN python -m scripts.download_model
ENV POSE_MODEL_PATH=/app/models/pose_landmarker_lite.task
EXPOSE 7860
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1"]
