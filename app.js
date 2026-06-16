// =============================================================================
// GARZI · Radar de tendencias — lógica de la web (sin dependencias)
// Carga window.GARZI_DATA (de data/ideas.js) y pinta tarjetas filtrables.
// Diseñado para no "colgarse": si no hay datos, muestra un mensaje y ya está.
// =============================================================================

(function () {
  'use strict';

  var DATA = window.GARZI_DATA || { ideas: [], countries: {}, updatedAt: null };
  var state = { type: 'all', country: 'all' };

  var FLAGS = { ES: '🇪🇸', US: '🇺🇸' };
  var TYPE_LABEL = { humor: '😂 Humor', pov: '🎭 POV', rap: '🎤 Rap' };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function timeAgo(iso) {
    if (!iso) return { text: 'sin datos todavía', stale: true };
    var then = new Date(iso).getTime();
    if (isNaN(then)) return { text: 'fecha desconocida', stale: true };
    var mins = Math.round((Date.now() - then) / 60000);
    var stale = mins > 60 * 36; // más de 36h = posiblemente parado
    if (mins < 60) return { text: 'actualizado hace ' + mins + ' min', stale: stale };
    var hrs = Math.round(mins / 60);
    if (hrs < 48) return { text: 'actualizado hace ' + hrs + ' h', stale: stale };
    var days = Math.round(hrs / 24);
    return { text: 'actualizado hace ' + days + ' días', stale: stale };
  }

  function cardHtml(i) {
    var flag = FLAGS[i.country] || '🌍';
    var cname = (DATA.countries && DATA.countries[i.country]) || i.country;
    var src = i.source || {};
    var srcHtml = src.url
      ? '<a href="' + esc(src.url) + '" target="_blank" rel="noopener">📰 ' + esc(src.name || 'fuente') + ' ↗</a>'
      : '<span>' + esc(src.name || '') + '</span>';

    var trafficBadge = i.traffic
      ? '<span class="badge fire">🔥 ' + esc(i.traffic) + ' búsquedas</span>'
      : '';

    return '' +
      '<article class="card">' +
        '<div class="badges">' +
          '<span class="badge country">' + flag + ' ' + esc(cname) + '</span>' +
          '<span class="badge ' + esc(i.type) + '">' + (TYPE_LABEL[i.type] || esc(i.type)) + '</span>' +
          trafficBadge +
        '</div>' +
        '<h3>' + esc(i.topic) + '</h3>' +
        '<p class="why"><strong>Por qué funciona:</strong> ' + esc(i.why) + '</p>' +
        '<details class="script">' +
          '<summary>📝 Ver guión base</summary>' +
          '<pre>' + esc(i.script) + '</pre>' +
        '</details>' +
        '<div class="source">' + srcHtml + '</div>' +
      '</article>';
  }

  function render() {
    var grid = document.getElementById('grid');
    var empty = document.getElementById('empty');
    var ideas = (DATA.ideas || []).filter(function (i) {
      return (state.type === 'all' || i.type === state.type) &&
             (state.country === 'all' || i.country === state.country);
    });
    grid.innerHTML = ideas.map(cardHtml).join('');
    empty.hidden = ideas.length > 0;
  }

  function wire(containerId, key) {
    var box = document.getElementById(containerId);
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      state[key] = btn.getAttribute('data-' + key);
      box.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
      btn.classList.add('active');
      render();
    });
  }

  function init() {
    var u = timeAgo(DATA.updatedAt);
    var el = document.getElementById('updated');
    el.textContent = u.text;
    if (u.stale) el.classList.add('stale');

    wire('typeFilters', 'type');
    wire('countryFilters', 'country');
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
