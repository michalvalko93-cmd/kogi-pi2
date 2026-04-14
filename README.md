# Kogi PI 2.0 — Batch Analyzer

Standalone webová aplikace pro automatickou analýzu firem z target listu.  
Volá Claude API (s web searchem), generuje HTML reporty, stahuje ZIP.

---

## Deployment na Netlify (5 minut)

### 1. Příprava

```bash
git init
git add .
git commit -m "init"
git remote add origin https://github.com/YOUR_ORG/kogi-pi2.git
git push -u origin main
```

### 2. Netlify

1. Jdi na [app.netlify.com](https://app.netlify.com) → **Add new site → Import from Git**
2. Vyber repozitář `kogi-pi2`
3. Build settings (vyplní se automaticky z `netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Klikni **Deploy site**

### 3. API klíč (povinné)

V Netlify jdi na:  
**Site settings → Environment variables → Add variable**

```
Key:   ANTHROPIC_API_KEY
Value: sk-ant-xxxxxxxxxxxx
```

Po přidání env variable klikni **Trigger deploy** pro rebuild.

---

## Lokální vývoj

```bash
npm install
npm run dev        # frontend na http://localhost:5173
netlify dev        # frontend + functions na http://localhost:8888 (doporučeno)
```

Pro `netlify dev` potřebuješ [Netlify CLI](https://docs.netlify.com/cli/get-started/):
```bash
npm install -g netlify-cli
netlify link       # propoj s projektem
netlify dev        # spustí vše najednou
```

---

## Struktura projektu

```
kogi-pi2/
├── netlify.toml              # konfigurace buildování
├── package.json
├── vite.config.js
├── index.html
├── src/
│   ├── main.jsx              # entry point
│   ├── App.jsx               # hlavní komponenta
│   ├── constants.js          # PI_PROMPT, barvy, konfigurace
│   └── utils.js              # buildWeeks, generateHTML, parseJSON, ...
└── netlify/
    └── functions/
        └── analyze.js        # proxy pro Anthropic API (schovává API klíč)
```

---

## Jak to funguje

1. Nahraješ XLSX target list (ICO, Firma, Status, NACE, Kraj, PI_Vykonnost, PI_Fluktuace)
2. Firmy se automaticky rozdělí do 6 týdnů (~300/týden, HOT → WARM → NOVÝ → COLD)
3. Vyber týden → klikni **Spustit analýzu**
4. App volá Netlify Function → Function volá Claude API s web searchem
5. Progress se ukládá do localStorage (přerušení = pokračuj odkud jsi skončil)
6. Na konci klikni **ZIP** → stáhneš archiv s HTML reporty + summary.csv

---

## Konfigurace

V `src/constants.js`:
- `DELAY_MS` — prodleva mezi API voláními (default 3500ms, min. doporučeno 2000ms)
- `WEEKS_COUNT` — počet týdnů (default 6)
- `PI_PROMPT` — analytický prompt pro Claude

---

## Technologie

- React 18 + Vite
- Netlify Functions (Node.js serverless)
- xlsx — parsování XLSX
- jszip — generování ZIP
- Claude API (claude-sonnet-4) + web_search_20250305
