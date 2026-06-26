# DLA Web Client (Frontend)

Reference **web client** for the [Data Labelling App (DLA)](https://github.com/ramos-ai/dla-bracis): a React single-page application for image **classification**, **object detection**, and **segmentation**, supervisor dashboards, and export configuration.

Companion manuscript: *Image Annotation Tool for Dataset Generation and Export with Specialist Training* (BRACIS 2026). Backend API and evaluation logic live in the monorepo root; see the [main README](../README.md).

---

## Overview

The frontend implements the **presentation layer** described in the paper: authenticated supervisors and annotators interact with datasets and exercises through the browser; annotations are sent to the Flask API; scores and aggregates are displayed on the supervisor dashboard; long-running exports are triggered from the UI and polled by task id.

> **Roles:** *supervisor* ≈ teacher · *annotator* ≈ student (platform vs. classroom vocabulary).

> **UI language:** interface copy is largely Portuguese (deployment context at UNISINOS); this README is in English for international reviewers.

---

## Functional modules

| UI area | Location | Paper concept |
|---------|----------|---------------|
| Annotation (classification, boxes, polygons) | `components/Labeller`, `PolygonAnnotationEditor`, `SegmentationAnnotationEditor`, `pages/datasets/LabellerPage` | Assisted / free practice submissions |
| Exercise management | `pages/exercises/*` | Supervisor-configured exercises |
| Supervisor dashboard | `pages/exercises/Dashboard`, `components/Dashboard` | Completion, scores, alerts, confusion matrix |
| Dataset registration | `pages/datasets/*`, `components/Gallery`, `components/Uploader` | Dataset and media management |
| Export | `pages/Export`, `components/ExportConfigModal`, `components/KaggleExportModal` | COCO / YOLO ZIP and optional Kaggle |
| Auth & roles | `pages/Login`, `contexts/Authentication` | JWT-protected routes |

---

## Stack

| Layer | Technology |
|-------|------------|
| UI | React 19, TypeScript, SCSS |
| Build | Vite 6 |
| HTTP | Axios (JWT interceptors) |
| Routing | React Router 7 |
| Charts | Recharts (dashboard) |
| Production | Nginx (Docker image), SPA routing, `/api` reverse proxy |

---

## Code layout

```
frontend/src/
├── pages/           # Route-level views (datasets, exercises, export, settings)
├── components/      # Annotation editors, dashboard widgets, modals, layout
├── services/        # REST clients (Auth, Datasets, Exercises, Export, …)
├── contexts/        # Auth, layout, selected class, alerts
├── hooks/           # Shared React hooks
└── utils/           # Auth storage, API error mapping
```

API base URL resolution: `public/runtime-config.js` (runtime) → `VITE_API_URL` (build) → `/api` (default). See `src/services/api.ts`.

---

## Quick start

### Monorepo Docker (recommended)

From the **repository root** (backend + frontend):

```bash
cp .env.example .env    # set JWT_SECRET_KEY (required)
docker compose up -d
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:18080 |
| API | http://localhost:15050 |
| Swagger | http://localhost:15050/api-docs |

Nginx in the frontend container proxies `/api` to the Flask service.

### Local development

Requires a running backend (Docker `app` service or `python app.py` on port 5000).

```bash
cd frontend
cp .env.example .env    # optional; defaults work with Vite proxy
npm ci
npm run dev
```

Dev server: http://localhost:5173 — Vite proxies `/api` to `http://localhost:5000` (see `vite.config.ts`).

**Production build:**

```bash
npm run build    # output in frontend/dist/
npm run preview  # local preview of production bundle
```

---

## Configuration

| Variable / file | Purpose |
|-----------------|--------|
| `VITE_API_URL` | Build-time API base (e.g. `/api` or full URL) |
| `public/runtime-config.js` | Runtime override (`window.APP_CONFIG.apiUrl`) without rebuild |
| Docker build arg `VITE_API_URL` | Set in `docker-compose.yml` (default `/api`) |

---

## Backend dependency

This client is not standalone. It expects the DLA Flask API documented in the [root README](../README.md): `/api/auth`, `/api/dataset`, `/api/exercises`, `/api/export`, `/api/tasks`, `/api/health`.

---

## Authors

Pedro da Rosa · Augusto Reich · Felipe Zeiser · Gabriel Ramos  
Graduate Program in Applied Computing, Universidade do Vale do Rio dos Sinos (UNISINOS)

---

## Funding

Partial support from Conselho Nacional de Desenvolvimento Científico e Tecnológico (CNPq) — grants 313845/2023-9, 443184/2023-2, 445238/2024-0, and 404800/2025-4.

---

## Citing

If you use this software in academic work, please cite the companion BRACIS paper:

```bibtex
@inproceedings{darosa2026dla,
  author    = {da Rosa, Pedro and Reich, Augusto and Zeiser, Felipe and Ramos, Gabriel de O.},
  title     = {Image Annotation Tool for Dataset Generation and Export with Specialist Training},
  booktitle = {Brazilian Conference on Intelligent Systems (BRACIS)},
  year      = {2026},
  organization = {IEEE},
  note      = {Update venue pages and DOI when available}
}
```

---

## License

[MIT](LICENSE)
