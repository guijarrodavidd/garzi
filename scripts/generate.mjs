// =============================================================================
// GARZI · Radar de tendencias — generador diario
// -----------------------------------------------------------------------------
// Recoge temas en tendencia (gratis, sin API keys) de España y EE.UU. por
// separado, y genera ideas de vídeo (humor / POV / rap) con un "por qué" y un
// guión base editable.
//
// Robustez ("nunca se queda colgado"):
//   - Cada fuente lleva timeout y try/catch propio. Si una falla, se ignora.
//   - Si TODO falla, mantiene el fichero anterior y sale con código 0.
//   - Siempre que haya algún dato, escribe un data/ideas.js válido.
//
// Salida: ../data/ideas.js  ->  window.GARZI_DATA = {...}
// (Usamos un .js en vez de .json para que la web funcione también abriendo
//  el index.html directamente, sin servidor, sin problemas de CORS.)
// =============================================================================

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../data/ideas.js');

const TIMEOUT_MS = 12000;          // corta cualquier fuente lenta
const TOPICS_PER_COUNTRY = 7;      // nº de temas por país
const TYPES = ['humor', 'pov', 'rap'];

// --- utilidades de red -------------------------------------------------------

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (GarziRadar/1.0)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function decode(s) {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, ' ')
    .trim();
}

// --- fuente: Google News RSS (titulares = temas calientes del momento) --------

function parseRss(xml, limit) {
  const items = [];
  const blocks = xml.split(/<item>/i).slice(1);
  for (const b of blocks.slice(0, limit)) {
    const rawTitle = decode((b.match(/<title>(.*?)<\/title>/is) || [])[1] || '');
    const link = decode((b.match(/<link>(.*?)<\/link>/is) || [])[1] || '');
    const source = decode((b.match(/<source[^>]*>(.*?)<\/source>/is) || [])[1] || '');
    if (!rawTitle) continue;
    // Los titulares de Google News vienen como "Titular - Fuente"
    let topic = rawTitle, srcName = source;
    const dash = rawTitle.lastIndexOf(' - ');
    if (dash > 0) {
      topic = rawTitle.slice(0, dash).trim();
      if (!srcName) srcName = rawTitle.slice(dash + 3).trim();
    }
    if (topic.length < 6) continue;
    items.push({ topic, url: link, source: srcName || 'Google News' });
  }
  return items;
}

// Para un creador de humor/POV/rap interesan más entretenimiento y deportes
// que la política general. Mezclamos varios feeds por país (con prioridad) y
// nos quedamos con un surtido. Cada feed falla por separado sin romper el resto.
function feedsFor(country) {
  const loc = country === 'ES'
    ? 'hl=es&gl=ES&ceid=ES:es'
    : 'hl=en-US&gl=US&ceid=US:en';
  const sec = (topic) =>
    `https://news.google.com/rss/headlines/section/topic/${topic}?${loc}`;
  // Orden = prioridad de mezcla.
  return [
    { tag: 'entretenimiento', url: sec('ENTERTAINMENT') },
    { tag: 'deportes',        url: sec('SPORTS') },
    { tag: 'general',         url: `https://news.google.com/rss?${loc}` },
  ];
}

async function getNews(country) {
  const buckets = [];
  for (const feed of feedsFor(country)) {
    try {
      const xml = await fetchText(feed.url);
      buckets.push(parseRss(xml, 6));
    } catch (e) {
      console.error(`[news ${country}/${feed.tag}] fallo: ${e.message}`);
      buckets.push([]);
    }
  }
  // Intercala los feeds (1º de cada uno, 2º de cada uno…) para variar temas.
  const mixed = [];
  for (let r = 0; r < 6; r++) {
    for (const b of buckets) if (b[r]) mixed.push(b[r]);
  }
  return dedupe(mixed).slice(0, TOPICS_PER_COUNTRY);
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((i) => {
    const k = i.topic.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// --- generación de ideas (plantillas, sin IA) --------------------------------

function titleFor(type, topic) {
  const label = { humor: '😂 Humor', pov: '🎭 POV', rap: '🎤 Rap' }[type];
  return `${label}: ${topic}`;
}

function whyFor(type, topic, countryName) {
  const t = { humor: 'humor', pov: 'POV', rap: 'rap' }[type];
  return `Tema en tendencia ahora mismo en ${countryName}: la gente ya lo está ` +
    `buscando y comentando. Un vídeo de ${t} sobre «${topic}» se sube a la ola ` +
    `cuando todavía está caliente, que es justo cuando el algoritmo más empuja. ` +
    `Te da un contexto fresco para conectar y encaja con tu estilo.`;
}

function scriptFor(type, topic) {
  if (type === 'humor') {
    return [
      `🎬 GANCHO (0-3s): A cámara, cara de incredulidad — «¿En serio nadie va a hablar de esto? ${topic}…»`,
      `😂 DESARROLLO (3-15s): Exagera la situación al máximo. Mete 2 reacciones imposibles y un personaje secundario (tú haciendo de «el típico que…»).`,
      `🔥 REMATE (15-25s): Giro absurdo o conclusión que nadie ve venir.`,
      `📌 CTA: «Comenta tu opinión 👇 y sígueme para más».`,
      `🏷️ HASHTAGS: relacionados con el tema + #humor #parati`,
    ].join('\n');
  }
  if (type === 'pov') {
    return [
      `🎬 TEXTO EN PANTALLA: «POV: te enteras de que ${topic}»`,
      `🎭 ACTUACIÓN (0-10s): Reacción muda, solo gestos. Música de tensión de fondo.`,
      `🔄 GIRO (10-18s): Cambia el contexto — resulta que tú eras el protagonista de la historia.`,
      `🔥 REMATE: Frase final mirando a cámara. Texto en pantalla: «y así fue como…».`,
      `🏷️ HASHTAGS: relacionados con el tema + #pov #fyp`,
    ].join('\n');
  }
  // rap
  return [
    `🎤 ESTRIBILLO (pegadizo, 2 líneas) sobre «${topic}».`,
    `🎶 ESTROFA (6-8 barras): cuenta la historia con punchlines y rimas internas.`,
    `🔥 PUNCHLINE final: el remate más fuerte para el último segundo (que haga loop).`,
    `🎚️ BEAT: tempo medio-alto, deja huecos para los gestos a cámara.`,
    `🏷️ HASHTAGS: relacionados con el tema + #rap #freestyle`,
  ].join('\n');
}

function buildIdeas(news, country, countryName, startId) {
  const ideas = [];
  let id = startId;
  for (const item of news) {
    for (const type of TYPES) {
      ideas.push({
        id: `${country}-${type}-${id++}`,
        country,
        type,
        topic: item.topic,
        title: titleFor(type, item.topic),
        why: whyFor(type, item.topic, countryName),
        script: scriptFor(type, item.topic),
        source: { name: item.source, url: item.url },
      });
    }
  }
  return ideas;
}

// --- main --------------------------------------------------------------------

async function main() {
  const countries = { ES: 'España', US: 'Estados Unidos' };
  const ideas = [];
  let id = 0;

  for (const [code, name] of Object.entries(countries)) {
    const news = await getNews(code);
    console.log(`[${code}] ${news.length} temas`);
    ideas.push(...buildIdeas(news, code, name, id));
    id += news.length * TYPES.length;
  }

  if (ideas.length === 0) {
    // Ninguna fuente respondió: no toques el fichero existente.
    console.error('Sin datos de ninguna fuente. Mantengo el fichero anterior.');
    process.exit(0);
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    countries,
    ideas,
  };
  const js = `// Generado automáticamente cada día. No editar a mano.\n` +
    `window.GARZI_DATA = ${JSON.stringify(payload, null, 2)};\n`;

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, js, 'utf8');
  console.log(`OK · ${ideas.length} ideas escritas en data/ideas.js`);
}

main().catch((e) => {
  // Pase lo que pase, no rompemos el deploy: se conserva el último ideas.js.
  console.error('Fallo general (se mantiene el fichero anterior):', e);
  process.exit(0);
});
