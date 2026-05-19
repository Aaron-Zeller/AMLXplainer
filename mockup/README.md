## Mockup

This folder contains the standalone AML dashboard mockup prepared for merge into `main`
without replacing the existing frontend implementations in the repository.

Contents:
- `frontend/`: self-contained Vite React mockup
- `scripts/`: mockup-local dataset preparation script
- `data_sources/`: source CSV files used to generate the frontend dataset

Run locally:

```bash
cd mockup/frontend
npm install
npm run dev
```

Build:

```bash
cd mockup/frontend
npm run build
```

Rebuild the mockup dataset:

```bash
cd mockup
python3 scripts/build_ibm_frontend_dataset.py
```

Notes:
- This is a mockup/prototype package.
- It is intentionally isolated under `mockup/` so it can be be deployed in a self-contained manner.
