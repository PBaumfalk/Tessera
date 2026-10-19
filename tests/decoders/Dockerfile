# Unabhängige Decoder für die Prüfung exportierter Dateien: ZBar und OpenCV.
# PDF wird mit Poppler, SVG mit librsvg gerastert (unabhängig von Tessera).
FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends zbar-tools poppler-utils librsvg2-bin \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir opencv-python-headless==4.10.0.84
COPY decode.py /decode.py
ENTRYPOINT ["python3", "/decode.py"]
