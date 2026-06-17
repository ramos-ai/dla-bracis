FROM python:3.12.10-slim
RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
RUN chmod +x scripts/entrypoint.sh 2>/dev/null || chmod +x /app/scripts/entrypoint.sh || true
USER appuser
EXPOSE 5000
ENV PYTHONUNBUFFERED=1
ENV FLASK_APP=app.py
# Production: Gunicorn with configurable workers
# workers = (2 x CPU cores) + 1; threads = 2-4
ENV GUNICORN_WORKERS=5
ENV GUNICORN_THREADS=3
ENV GUNICORN_TIMEOUT=600
ENV GUNICORN_BIND=0.0.0.0:5000
CMD ["sh", "-c", "gunicorn --workers ${GUNICORN_WORKERS} --threads ${GUNICORN_THREADS} --worker-class gthread --timeout ${GUNICORN_TIMEOUT} --keep-alive 5 --bind ${GUNICORN_BIND} --access-logfile - --error-logfile - --capture-output --enable-stdio-inheritance app:app"]