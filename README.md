# Architecture Portfolio

A dependency-light architecture portfolio prototype with a public marketing site and local admin panel.

## Run Locally

```powershell
C:\Users\semi_\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe .\server.cjs
```

Then open `http://127.0.0.1:4173`.

Use this Node server for normal development. It serves the site and saves admin uploads into `assets/uploads/`. A plain Python static server can display the website, but it cannot save uploaded files.

## Playwright Browser Checks

This project uses the Codex bundled Node + Playwright runtime, so it does not require global `npx`.

Run the full validation suite:

```powershell
C:\Users\semi_\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe .\tools\playwright-check.cjs
```

Take a screenshot that Codex can inspect:

```powershell
.\tools\playwright-view.ps1 http://127.0.0.1:4173/#home --out=output/playwright/manual-home.png --full
```

Capture a scrolled state:

```powershell
.\tools\playwright-view.ps1 http://127.0.0.1:4173/#home --scroll=3000 --out=output/playwright/manual-scroll.png
```

## Admin

Open `#/admin` and use:

- Email: `studio@example.com`
- Password: `architect2026`

The admin panel stores text/project records in the browser with `localStorage` and `sessionStorage`. Uploaded media files are saved into `assets/uploads/` by the local Node server, and the browser stores only the file path. For production, replace the local storage layer with real authentication and a database.

## What You Can Edit

- Projects: create, edit, delete, publish, unpublish, feature, reorder, upload cover images, and manage gallery media.
- Media: upload photos, videos, PDFs, and plan images into local browser storage.
- Content: hero text, introduction, philosophy, and service list.
- Settings: studio name, contact details, navigation labels, accent color, and SEO copy.
