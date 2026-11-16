# Calculo Consultoria

Simulador estático (GitHub Pages) para consultores independientes con **AB en Suecia**.

Estética consola blanco/negro (inspirada en [zunigajp.com](https://zunigajp.com)).

## Qué calcula

- Timpris × dedicación (omfattning) → facturación anual
- Viajes / traslado no facturable
- Gastos por categoría (transporte, estadía, educación, HW, telefonía, etc.)
- Salario hasta **brytpunkt** (toggle)
- **Tjänstepension** máxima 35% / tope 10 PBB (toggle)
- Arbetsgivaravgifter, särskild löneskatt, bolagsskatt, utdelning K10
- Vista ASCII de a dónde va cada corona + bolsillo personal

## Datos actualizables (sin backend)

| Archivo | Contenido |
|---------|-----------|
| `data/tax.json` | Límites fiscales del año (brytpunkt, PBB, avgifter) |
| `data/rates.json` | Bandas de hourly rate + escenarios preset |

El front hace `fetch` de esos JSON al cargar. En GitHub Pages eso funciona; en `file://` cae a valores embebidos.

Más adelante puedes:

1. Editar los JSON a mano cuando Skatteverket publique cifras nuevas
2. Añadir un GitHub Action que regenere `data/*.json` desde fuentes públicas
3. Apuntar a un gist/raw URL si quieres centralizar datos entre forks

> No hay API pública estable y CORS-friendly de Skatteverket para brytpunkt/PBB en el browser. El patrón correcto en Pages es **JSON versionado en el repo** (+ CI opcional).

## Local

Necesitas un server estático (ES modules):

```bash
npx --yes serve .
```

Abre la URL que imprima (ej. `http://localhost:3000`).

## GitHub Pages

1. Crea el repo en GitHub y haz push de esta carpeta
2. Settings → Pages → Source: **Deploy from a branch** → `main` / root
3. Sitio en `https://<user>.github.io/konsult-kalkyl/`

Si el repo no se llama exactamente igual que la carpeta raíz del site, los paths relativos (`./css`, `./data`) siguen funcionando.

## Precisión

Modelo alineado a parámetros oficiales Skatteverket 2026 (brytpunkt 660 400, PBB 59 200, avgifter, bolagsskatt 20,6 %), festivos suecos, calendario lun–vie y kommunalskatt Göteborg.

## Análisis de oferta con AI

Sección **4. Análisis de la oferta con AI**:

1. Lee tu CV **live** desde [zunigajp.com/english/cv](https://zunigajp.com/english/cv/) (vía Jina Reader; cache local 24h)
2. Pegas la oferta (inglés u otro idioma)
3. Cruza con el snapshot del simulador + bandas de `data/rates.json`
4. Gemini Flash responde en **español** (veredicto, precio, contraoferta)

### API key gratis (Gemini)

1. Entra a [Google AI Studio](https://aistudio.google.com/apikey)
2. Crea una API key

**Opción A — local (recomendado al desarrollar)**  
```bash
copy js\config.example.js js\config.local.js
```
Edita `js/config.local.js` y pega la key. Ese archivo está en `.gitignore` (no se sube).

**Opción B — GitHub Pages (key en la página, no en el historial git)**  
1. Repo → **Settings → Secrets and variables → Actions**  
2. New secret: nombre `GEMINI_API_KEY`, valor = tu key  
3. El workflow de Pages genera `config.local.js` en el **deploy** (no queda committed)

También puedes pegar la key en la UI (fallback `localStorage`).

> Aviso: en un sitio estático público la key es visible en el JS del navegador.  
> En Google AI Studio restringe la key por referrer HTTP a tu dominio de Pages.
