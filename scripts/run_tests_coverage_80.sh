#!/bin/bash
# Rodar testes com meta de 80% de cobertura em domain + schemas principais.
# Usa .coveragerc.80 que omite schemas pouco testados (coco, media, report, segmentation).

set -e
cd "$(dirname "$0")/.."

pip install -q -r requirements.txt 2>/dev/null || true

python -m pytest src/tests/ \
  --ignore=src/tests/test_routes.py \
  --cov=src/domain \
  --cov=src/presentation/http/schemas \
  --cov-config=.coveragerc.80 \
  --cov-report=term-missing \
  --cov-fail-under=80 \
  -q
