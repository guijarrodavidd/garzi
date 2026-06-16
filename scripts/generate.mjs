// =============================================================================
// GARZI · Radar de tendencias VIRALES — generador diario
// -----------------------------------------------------------------------------
// Fuente principal: Google Trends "Trending Now" RSS (lo que la gente está
// BUSCANDO y se dispara ahora mismo: famosos, deportistas, polémicas, memes...),
// con el volumen de búsquedas y la noticia que lo provoca (el contexto del chiste).
// Fuente de reserva: titulares de Google News (entretenimiento/deportes) por si
// Trends fallara, para que nunca se quede sin datos.
//
// Para cada tema genera ideas de humor / POV / rap con enfoque VIRAL:
// ángulo, gancho, desarrollo y remate, más el "por qué" puede petar.
// Detecta temas sensibles (fallecimientos) y cambia el tono a homenaje.
//
// Robustez: cada fuente con timeout y try/catch; si todo falla, conserva el
// fichero anterior y sale con código 0 (nunca se cuelga).
// Salida: ../data/ideas.js  ->  window.GARZI_DATA = {...}
// =============================================================================

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../data/ideas.js');

const TIMEOUT_MS = 12000;
const TOPICS_PER_COUNTRY = 12;
const TYPES = ['humor', 'pov', 'rap'];

// --- red ---------------------------------------------------------------------

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

function field(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decode(m[1]) : '';
}

function titleCase(s) {
  return s.split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// "100+", "2K+", "1M+" -> número para ordenar por cuánto está petando
function trafficScore(s) {
  const m = (s || '').match(/([\d.,]+)\s*([KkMm])?/);
  if (!m) return 0;
  let n = parseFloat(m[1].replace(/[.,]/g, '')) || 0;
  if (/k/i.test(m[2] || '')) n *= 1000;
  if (/m/i.test(m[2] || '')) n *= 1000000;
  return n;
}

// --- FUENTE PRINCIPAL: Google Trends "Trending Now" --------------------------

async function getTrends(country) {
  const url = `https://trends.google.com/trending/rss?geo=${country}`;
  try {
    const xml = await fetchText(url);
    const blocks = xml.split(/<item>/i).slice(1);
    const items = [];
    for (const b of blocks) {
      const query = field(b, 'title');
      if (!query || query.length < 2) continue;
      const traffic = field(b, 'ht:approx_traffic');
      // primera noticia asociada = contexto del tema
      const newsTitle = field(b, 'ht:news_item_title');
      const newsUrl = field(b, 'ht:news_item_url');
      const newsSource = field(b, 'ht:news_item_source');
      items.push({
        topic: titleCase(query),
        context: newsTitle || '',
        traffic: traffic || '',
        score: trafficScore(traffic),
        url: newsUrl || `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        source: newsSource || 'Google Trends',
      });
    }
    items.sort((a, b) => b.score - a.score);
    return items.slice(0, TOPICS_PER_COUNTRY);
  } catch (e) {
    console.error(`[trends ${country}] fallo: ${e.message}`);
    return [];
  }
}

// --- FUENTE DE RESERVA: Google News (entretenimiento/deportes) ---------------

async function getNewsFallback(country) {
  const loc = country === 'ES' ? 'hl=es&gl=ES&ceid=ES:es' : 'hl=en-US&gl=US&ceid=US:en';
  const feeds = [
    `https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?${loc}`,
    `https://news.google.com/rss/headlines/section/topic/SPORTS?${loc}`,
  ];
  const items = [];
  for (const url of feeds) {
    try {
      const xml = await fetchText(url);
      const blocks = xml.split(/<item>/i).slice(1, 6);
      for (const b of blocks) {
        const t = field(b, 'title');
        if (!t) continue;
        const dash = t.lastIndexOf(' - ');
        const topic = dash > 0 ? t.slice(0, dash) : t;
        items.push({
          topic, context: '', traffic: '', score: 0,
          url: field(b, 'link'),
          source: dash > 0 ? t.slice(dash + 3) : 'Google News',
        });
      }
    } catch (e) {
      console.error(`[news ${country}] ${e.message}`);
    }
  }
  return items.slice(0, TOPICS_PER_COUNTRY);
}

// --- clasificación de tono (para no meter humor en una tragedia) -------------

const SENSITIVE = /\b(fallec|muerte|muere|murió|murio|falleci|luto|accidente mortal|asesina|r\.?i\.?p\.?|dies|death|passed away|tragedi)\b/i;

function isSensitive(t) {
  return SENSITIVE.test(t.topic + ' ' + t.context);
}

// --- clasificación por gremio (cada noticia va a UN solo tipo) ---------------
// Palabras clave que delatan a qué gremio pega mejor cada tema.
const KW = {
  rap: ['música', 'musica', 'music', 'canción', 'cancion', 'song', 'álbum', 'album',
    'disco', 'rapero', 'rapper', 'rap', 'trap', 'drill', 'freestyle', 'beef', 'diss',
    'gira', 'tour', 'concierto', 'concert', 'festival', 'grammy', 'hit', 'single',
    'remix', 'feat', 'beat', 'artista', 'cantante', 'letra', 'estrena', 'lanza',
    'reggaeton', 'reggaetón', 'bizarrap', 'sesión', 'sesion'],
  humor: ['polémica', 'polemica', 'controvers', 'viral', 'meme', 'ridícul', 'ridicul',
    'absurd', 'insólit', 'insolit', 'increíble', 'increible', 'broma', 'fail', 'pillad',
    'cachondeo', 'gaffe', 'embarrass', 'awkward', 'bizarre', 'weird', 'reality', 'boda',
    'wedding', 'sálvame', 'salvame', 'supervivientes', 'gran hermano', 'eurovisión',
    'eurovision', 'se lía', 'lío', 'escándalo', 'escandalo', 'dimite', 'niega', 'miente',
    'mentira', 'acusa', 'cachond', 'troll'],
  pov: ['fallec', 'muerte', 'muere', 'accidente', 'despedida', 'deja', 'ruptura',
    'breakup', 'embaraz', 'pregnan', 'sorpresa', 'reencuentro', 'historia', 'debut',
    'lágrim', 'lagrim', 'emocion', 'adiós', 'adios', 'retira', 'retires', 'homenaje',
    'rescat', 'salva', 'héroe', 'heroe', 'perdió', 'perdio', 'derrota', 'elimina',
    'final', 'remontada', 'milagro'],
};

function score(text, genre) {
  let n = 0;
  for (const k of KW[genre]) if (text.includes(k)) n += 1;
  return n;
}

// Asigna cada tema a un gremio, equilibrando para que ninguno se quede vacío.
function assignGenres(items) {
  const counts = { humor: 0, pov: 0, rap: 0 };
  const order = ['humor', 'pov', 'rap'];
  const leastUsed = (cands) =>
    cands.reduce((a, b) => (counts[a] <= counts[b] ? a : b));

  return items.map((t) => {
    let genre;
    if (isSensitive(t)) {
      genre = 'pov'; // las tragedias van a homenaje (POV emotivo), nunca a humor
    } else {
      const text = (t.topic + ' ' + t.context).toLowerCase();
      const sc = { humor: score(text, 'humor'), pov: score(text, 'pov'), rap: score(text, 'rap') };
      const max = Math.max(sc.humor, sc.pov, sc.rap);
      // Sin señal clara -> al gremio con menos temas (para repartir variedad).
      genre = max === 0
        ? leastUsed(order)
        : leastUsed(order.filter((g) => sc[g] === max));
    }
    counts[genre] += 1;
    return { t, genre };
  });
}

// --- generación de ideas con enfoque VIRAL -----------------------------------

function titleFor(type, topic, sensitive) {
  if (sensitive) return `🕊️ Homenaje: ${topic}`;
  const label = { humor: '😂 Humor', pov: '🎭 POV', rap: '🎤 Rap' }[type];
  return `${label}: ${topic}`;
}

function whyFor(type, t, countryName, sensitive) {
  const vol = t.score ? ` (${t.traffic} búsquedas y subiendo)` : '';
  const ctx = t.context ? ` Lo que ha pasado: «${t.context}».` : '';
  if (sensitive) {
    return `Tema muy sensible que está estallando en ${countryName}${vol}.${ctx} ` +
      `Aquí el humor NO funciona y puede quemarte: tira de homenaje o de un POV ` +
      `emotivo y respetuoso. La gente comparte lo que emociona, no solo lo que hace gracia.`;
  }
  const t2 = { humor: 'humor', pov: 'POV', rap: 'rap' }[type];
  return `Se está disparando en búsquedas en ${countryName} AHORA${vol}.${ctx} ` +
    `La gente ya lo está comentando, así que un vídeo de ${t2} se sube a la ola justo ` +
    `cuando el algoritmo más empuja. Cuanta más polémica o sorpresa, más se comparte. ` +
    `Súbelo hoy, mañana ya estará frío.`;
}

function scriptFor(type, t, sensitive) {
  const topic = t.topic;
  const ctx = t.context || `el tema de ${topic}`;

  if (sensitive) {
    return [
      `🕊️ TONO: respeto total. Nada de chistes.`,
      `🎬 GANCHO (0-3s): a cámara, serio — «Tenemos que hablar de ${topic}.»`,
      `💬 DESARROLLO: qué ha pasado y por qué importaba a la gente. Una anécdota o recuerdo.`,
      `🤍 REMATE: mensaje bonito o reflexión. Texto en pantalla: «DEP».`,
      `📌 CTA: «Déjale un mensaje en comentarios».`,
    ].join('\n');
  }

  if (type === 'humor') {
    return [
      `🎯 ÁNGULO VIRAL: «${ctx}». Busca aquí la incoherencia, la exageración o lo absurdo.`,
      `🎬 GANCHO (0-3s): suelta el dato más fuerte a bocajarro — «Resulta que ${topic}… y aún no me lo creo.»`,
      `😂 DESARROLLO (3-12s): tu reacción exagerada + imita a los típicos comentarios de redes sobre esto.`,
      `🔥 REMATE (último seg): punchline o giro que invite a discutir (la polémica = más alcance).`,
      `📌 CTA: pregunta que obligue a comentar — «¿Estoy yo solo o…?»`,
    ].join('\n');
  }
  if (type === 'pov') {
    return [
      `🎯 ÁNGULO VIRAL: ponte EN la situación de «${ctx}».`,
      `🎬 TEXTO EN PANTALLA: «POV: te enteras de que ${topic}…»`,
      `🎭 ACTUACIÓN (0-10s): solo gestos y reacción, música in crescendo.`,
      `🔄 GIRO (10-18s): cambia el punto de vista — resulta que tú eras parte de la historia.`,
      `🔥 REMATE: frase final a cámara. Texto: «y así fue como…».`,
    ].join('\n');
  }
  // rap
  return [
    `🎯 ÁNGULO VIRAL: convierte «${ctx}» en barras con punchlines.`,
    `🎤 ESTRIBILLO (2 líneas pegadizas) sobre ${topic}.`,
    `🎶 ESTROFA (6-8 barras): cuenta la movida con rimas internas y nombres propios.`,
    `🔥 PUNCHLINE final: el remate más fuerte en el último segundo (que haga loop).`,
    `🎚️ BEAT: tempo medio-alto, deja huecos para los gestos.`,
  ].join('\n');
}

function buildIdeas(items, country, countryName, startId) {
  let id = startId;
  return assignGenres(items).map(({ t, genre }) => {
    const sensitive = isSensitive(t);
    return {
      id: `${country}-${genre}-${id++}`,
      country,
      type: genre,
      topic: t.topic,
      context: t.context,
      traffic: t.traffic,
      title: titleFor(genre, t.topic, sensitive),
      why: whyFor(genre, t, countryName, sensitive),
      script: scriptFor(genre, t, sensitive),
      source: { name: t.source, url: t.url },
    };
  });
}

// --- main --------------------------------------------------------------------

async function main() {
  const countries = { ES: 'España', US: 'Estados Unidos' };
  const ideas = [];
  let id = 0;

  for (const [code, name] of Object.entries(countries)) {
    let items = await getTrends(code);
    if (items.length < 3) {
      console.error(`[${code}] Trends flojo (${items.length}), uso reserva de noticias`);
      items = await getNewsFallback(code);
    }
    console.log(`[${code}] ${items.length} temas virales`);
    ideas.push(...buildIdeas(items, code, name, id));
    id += items.length;
  }

  if (ideas.length === 0) {
    console.error('Sin datos de ninguna fuente. Mantengo el fichero anterior.');
    process.exit(0);
  }

  const payload = { updatedAt: new Date().toISOString(), countries, ideas };
  const js = `// Generado automáticamente cada día. No editar a mano.\n` +
    `window.GARZI_DATA = ${JSON.stringify(payload, null, 2)};\n`;

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, js, 'utf8');
  console.log(`OK · ${ideas.length} ideas escritas en data/ideas.js`);
}

main().catch((e) => {
  console.error('Fallo general (se mantiene el fichero anterior):', e);
  process.exit(0);
});
