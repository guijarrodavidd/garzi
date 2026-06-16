# GARZI · Radar de Tendencias

Web que cada día detecta los temas en tendencia en **España** y **EE.UU.** (por
separado) y propone **ideas de vídeo** de *humor*, *POV* y *rap*, con el **porqué
funciona** y un **guión base** editable. Pensada para publicarse en
`https://davidguijarro.com.es/garzi`.

## Cómo verla en tu ordenador (sin instalar nada)
Haz **doble clic en `index.html`**. Funciona tal cual (los datos están en
`data/ideas.js`, no hace falta servidor).

## Cómo se actualiza sola
`scripts/generate.mjs` recoge titulares de **Google News** (entretenimiento,
deportes y general) de ES y US, y reescribe `data/ideas.js`. Lo lanza
**GitHub Actions** todos los días a las 06:00 UTC (`.github/workflows/daily.yml`),
y luego sube los archivos a tu hosting por FTP. Si una fuente falla, el resto
sigue; si fallan todas, se conserva el último resultado (nunca se queda colgado).

Para generar manualmente:  `node scripts/generate.mjs`

## Estructura
```
index.html            La web
styles.css            Diseño (negro + azul royal, como el logo)
app.js                Filtros por tipo y país
data/ideas.js         Datos (se regeneran cada día)
assets/logo.png       <-- AQUÍ va tu logo (ver assets/PON-AQUI-EL-LOGO.txt)
scripts/generate.mjs  El recolector de tendencias
.github/workflows/daily.yml  La automatización diaria
```

## Para mejorar más adelante (opcional)
- Enchufar guiones escritos por IA (Claude API).
- Añadir datos reales de TikTok/Instagram con una API de pago.
