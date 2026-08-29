# Architecture Portfolio

A dependency-light architecture portfolio prototype with a public marketing site and local admin panel.

## Run Locally

```powershell
python -m http.server 4173
```

Then open `http://localhost:4173`.

## Admin

Open `#/admin` and use:

- Email: `studio@example.com`
- Password: `architect2026`

The admin panel stores edits in the browser with `localStorage` and `sessionStorage`. This is useful for a fast editable prototype. For production, replace the local storage layer with real authentication, a database, and durable media storage.

## What You Can Edit

- Projects: create, edit, delete, publish, unpublish, feature, reorder, and manage gallery URLs.
- Media: upload photos, videos, PDFs, and plan images into local browser storage.
- Content: hero text, introduction, philosophy, and service list.
- Settings: studio name, contact details, navigation labels, accent color, and SEO copy.
