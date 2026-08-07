# Observability (Prometheus + Grafana)

Optional metrics stack. Enable with the `observability` profile.

## Start the stack

```bash
docker compose --profile observability up -d
```

This starts, in addition to the default services (app, frontend, mongodb):

- **Prometheus** — http://localhost:19090
- **Grafana** — http://localhost:13000 (login: `admin` / password from `GRAFANA_ADMIN_PASSWORD` in `.env`)
- **MongoDB Exporter** — MongoDB metrics for Prometheus

## Pre-provisioned dashboard

A dashboard is loaded automatically in Grafana:

- **Folder:** DLA
- **Dashboard:** "Data Labelling App - Overview"

Includes API request rate, latency (p50/p95), error counts, and MongoDB connection/memory metrics.

Source: `monitoring/grafana/dashboards/dla-overview.json`.

**Note:** This stack collects metrics only, not application log lines. For log aggregation, integrate Loki or similar.

## Configuration

- Set `GRAFANA_ADMIN_PASSWORD` in `.env` for production.
- Prometheus is pre-configured as the Grafana datasource (`uid: prometheus`).

## Without observability

```bash
docker compose up -d
```
