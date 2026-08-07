#!/bin/bash
# Script para rodar testes com cobertura.
# For 80% minimum coverage on domain + schemas, use run_tests_coverage_80.sh

set -e
cd "$(dirname "$0")/.."

echo "=== Instalando dependências (se necessário) ==="
pip install -q -r requirements.txt 2>/dev/null || true

echo ""
echo "=== Rodando todos os testes ==="
python -m pytest src/tests/ \
  --cov=src \
  --cov-report=term-missing \
  --cov-fail-under=0 \
  -q

echo ""
echo "=== Cobertura concluída ==="
