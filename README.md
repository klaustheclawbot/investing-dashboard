# Investing Dashboard

Static deployable dashboard for the investing signal engine.

## What it does
- generates `public/data.json` from the live portfolio analyst engine
- renders a clean static dashboard from `public/index.html`
- deployable to Netlify or Cloudflare Pages

## Local usage

```bash
cd /Users/alex/.openclaw/workspace/investing-dashboard
npm run build
python3 -m http.server 4174 -d public
```

## Deploy

- Netlify: deploy `public/`
- Cloudflare Pages: deploy this repo with `npm run build`, output dir `public`
