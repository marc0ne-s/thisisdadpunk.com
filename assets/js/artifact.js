/**
 * DADPUNK ARTIFACT — Living Machine Room
 * Fetches fleet, projects, fragments, traces. Renders asymmetric living composition.
 * thisisdadpunk.com — Cycle 002
 */
(function () {
  'use strict';

  /* ── DOM ── */
  const sysPulse    = document.getElementById('sys-pulse');
  const sysAgents   = document.getElementById('sys-agents');
  const sysBuild    = document.getElementById('sys-build');
  const spreadEl    = document.getElementById('project-spread');
  const feedEl      = document.getElementById('build-feed');
  const tracesEl    = document.getElementById('traces-panel');
  const footerPulse = document.getElementById('footer-pulse');
  const footerBuild = document.getElementById('footer-build');
  const footerAgents= document.getElementById('footer-agents');

  const rotationRail = document.getElementById('rotation-rail');
  const rotationNote = document.getElementById('rotation-note');
  const rotationSec  = document.getElementById('rotation');

  /* ── Fetch all data ── */
  Promise.all([
    fetch('assets/data/fleet.json').then(r => r.json()).catch(() => null),
    fetch('assets/data/projects.json').then(r => r.json()).catch(() => null),
    fetch('assets/data/build-fragments.json').then(r => r.json()).catch(() => null),
    fetch('assets/data/agent-traces.json').then(r => r.json()).catch(() => null),
  ]).then(([fleet, projects, fragments, traces]) => {
    if (fleet) renderSystemBar(fleet);
    if (projects) renderProjectSpread(projects);
    if (fragments) renderBuildFeed(fragments);
    if (traces) renderAgentTraces(traces);
    if (fleet) renderAmbientFooter(fleet);
    observeAll();
  });

  // Music is optional: if the library feed is missing or stale the strip hides
  // itself rather than standing there empty with a promise it can't keep.
  if (rotationRail) {
    fetch('assets/data/recent.json')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const albums = data && Array.isArray(data.albums) ? data.albums : [];
        if (!albums.length) { rotationSec.hidden = true; return; }

        const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
        const stamp = iso => {
          const d = new Date(iso);
          return isNaN(d) ? '' : d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
        };

        albums.slice(0, 8).forEach(a => {
          const link = document.createElement('a');
          link.className = 'rotation__item';
          link.href = 'music/';
          link.title = a.album + ' — ' + a.artist;

          if (a.artwork) {
            const img = document.createElement('img');
            img.src = a.artwork;
            img.alt = a.album + ' cover';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.className = 'rotation__art';
            link.appendChild(img);
          } else {
            const ph = document.createElement('span');
            ph.className = 'rotation__art rotation__art--none';
            ph.textContent = '—';
            link.appendChild(ph);
          }

          const name = document.createElement('span');
          name.className = 'rotation__album';
          name.textContent = a.album;
          link.appendChild(name);

          const who = document.createElement('span');
          who.className = 'rotation__artist';
          who.textContent = a.artist + (a.added ? ' · ' + stamp(a.added) : '');
          link.appendChild(who);

          rotationRail.appendChild(link);
        });

        if (rotationNote && albums[0] && albums[0].added) {
          rotationNote.textContent = 'latest ' + stamp(albums[0].added) + ' — ' + albums[0].album;
        }
      })
      .catch(() => { if (rotationSec) rotationSec.hidden = true; });
  }

  /* ── SYSTEM BAR ── */
  function renderSystemBar(fleet) {
    if (sysPulse) {
      sysPulse.textContent = fleet.router_healthy ? '● ONLINE' : '○ DEGRADED';
      sysPulse.style.color = fleet.router_healthy ? 'var(--color-orange)' : 'var(--color-olive-dark)';
    }
    if (sysAgents) sysAgents.textContent = fleet.active_agents + ' AGENTS';
    if (sysBuild) {
      const d = new Date(fleet.last_build);
      // HTML already carries the "BUILD " label — inject the value only.
      // A bare HH:MM implies "today"; show the date when the build is older.
      sysBuild.textContent = d.toDateString() === new Date().toDateString()
        ? hhmm(d)
        : d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' }).toUpperCase();
    }
  }

  /* ── BUILD FEED ── */
  function renderBuildFeed(fragments) {
    if (!feedEl) return;
    const html = (fragments || []).map(f =>
      '<div class="build-feed__item" data-reveal>' +
        '<span class="build-feed__date">' + esc(f.date) + '</span>' +
        '<div class="build-feed__title">' + esc(f.title) + '</div>' +
        '<div class="build-feed__text">' + esc(f.text) + '</div>' +
        '<div class="build-feed__tags">' + (f.tags || []).map(t => esc(t)).join(' ') + '</div>' +
      '</div>'
    ).join('');
    feedEl.innerHTML = html;
  }

  /* ── CONTAINED PLATES ──
     Opt-in and lazy. Cards render as documents first; when one scrolls near the
     viewport we import ./plate.js once and hand that card a canvas. If WebGL2 is
     missing or anything throws, the card stays exactly as it shipped — no
     class, no canvas, no dead space. The canvas is pointer-events:none so the
     card's own click target (often an <a>) keeps working. */
  const plateMounted = new Set();   // cards that have been handed to the observer
  let plateModule  = null;          // { createPlate } — imported at most once
  let plateImport  = null;          // in-flight import promise
  let plateObserver = null;         // one observer for the whole spread
  let plateIdle = null;

  const plateSupported = (() => {
    try {
      return !!(window.WebGL2RenderingContext &&
        document.createElement('canvas').getContext('webgl2'));
    } catch (e) { return false; }
  })();

  function mountPlate(card) {
    if (!plateModule || card._plate) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'plate';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.visibility = 'hidden';   // laid out (so it has size) but unseen
    card.prepend(canvas);
    try {
      const plate = plateModule.createPlate(canvas);
      card.classList.add('project-spread__card--plate');
      canvas.style.visibility = '';
      card._plate = plate;                // kept for teardown / debugging
    } catch (err) {
      canvas.remove();
      card.classList.remove('project-spread__card--plate');
      console.warn('[artifact] plate unavailable on this card', err);
    }
  }

  function hydratePlates() {
    if (!plateSupported || !spreadEl) return;
    if (plateObserver) { plateObserver.disconnect(); plateObserver = null; }

    // The first few cards are the ones above the fold and the ones a reader
    // actually looks at. Everything below stays a document — that's the budget.
    const targets = Array.from(spreadEl.querySelectorAll('.project-spread__card')).slice(0, 4);
    if (!targets.length) return;

    plateObserver = new IntersectionObserver((entries) => {
      let fresh = false;
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const card = entry.target;
        plateObserver.unobserve(card);
        plateMounted.add(card);
        if (plateModule) mountPlate(card); else fresh = true;
      });
      if (!fresh) return;

      // Import once; mount every card that came into view while it loaded.
      if (!plateImport) {
        plateImport = import('./plate.js').then(mod => {
          plateModule = mod;
          plateMounted.forEach(card => mountPlate(card));
          return mod;
        }).catch(err => {
          console.warn('[artifact] plate module unavailable', err);
          plateMounted.clear();
          if (plateObserver) plateObserver.disconnect();
          plateImport = null;
          return null;
        });
      }
    }, { rootMargin: '240px 0px', threshold: 0.01 });

    targets.forEach(card => plateObserver.observe(card));
  }

  function teardownPlates() {
    if (plateObserver) { plateObserver.disconnect(); plateObserver = null; }
    if (plateIdle) { cancelIdleCallback(plateIdle); plateIdle = null; }
    plateMounted.forEach(card => {
      if (card._plate && typeof card._plate.destroy === 'function') {
        try { card._plate.destroy(); } catch (e) {}
      }
      card._plate = null;
      card.classList.remove('project-spread__card--plate');
      const canvas = card.querySelector('canvas.plate');
      if (canvas) canvas.remove();
    });
    plateMounted.clear();
  }

  // GL contexts are a limited resource; give them back when the page is left.
  window.addEventListener('pagehide', teardownPlates);

  /* ── PROJECT SPREAD ── */
  function renderProjectSpread(projects) {
    if (!spreadEl) return;
    const badges = { SHIPPED: 'project-spread__badge--shipped', BETA: 'project-spread__badge--beta', ACTIVE: 'project-spread__badge--active' };

    const cards = (projects || []).map((p, i) => {
      const isFeatured = (p.status === 'ACTIVE' || p.status === 'SHIPPED') && i < 4;
      const cls = 'project-spread__card' +
        (isFeatured ? ' project-spread__card--featured' : '') +
        (p.url ? ' project-spread__card--link' : '');
      const inner =
        '<span class="project-spread__badge ' + (badges[p.status] || '') + '">' + esc(p.status) + '</span>' +
        '<div class="project-spread__name">' + esc(p.name) + '</div>' +
        '<div class="project-spread__one-line">' + esc(p.one_line) + '</div>' +
        '<div class="project-spread__tags">' + (p.tags || []).map(t => '# ' + esc(t)).join('  ') + '</div>' +
        (p.url ? '<span class="project-spread__link">' + esc(p.link_label || 'open') + ' →</span>' : '');

      // A card with a destination is a real link. The rest stay inert documents —
      // a card that looks clickable and does nothing is worse than no card.
      return p.url
        ? '<a class="' + cls + '" href="' + esc(p.url) + '" data-reveal>' + inner + '</a>'
        : '<div class="' + cls + '" data-reveal>' + inner + '</div>';
    });

    // Open-source, not "local-only": models run on this machine when they can and
    // through Ollama Cloud when they can't. Claiming otherwise would be the exact
    // dishonesty the rest of the site is built to avoid.
    const interruptHTML = '<div class="interrupt" data-reveal><p>Creative engineering practice. Music, hardware, open-source AI, and punk ethos — running on Apple Silicon in Budgewoi. Open models, own hardware, no platform lock-in, no algorithm chasing. <span style="color:var(--color-orange);">Documented honestly. Sold directly. Shared openly.</span></p></div>';

    // Interrupt lands after the third card, not mid-markup: joining an array is
    // sturdier than splitting the rendered HTML on '</div>'.
    cards.splice(3, 0, interruptHTML);
    spreadEl.innerHTML = cards.join('');

    // Cards are in the DOM with real sizes now; the observer only fires for the
    // first few that actually approach the viewport. The interrupt div is not a
    // .project-spread__card, so it is never a target.
    if (plateIdle) cancelIdleCallback(plateIdle);
    plateIdle = requestIdleCallback
      ? requestIdleCallback(hydratePlates, { timeout: 1200 })
      : setTimeout(hydratePlates, 300);
  }

  /* ── AGENT TRACES ── */
  function renderAgentTraces(traces) {
    if (!tracesEl) return;
    const html = (traces || []).map(t =>
      '<div class="traces-panel__item" data-reveal>' +
        '<span class="traces-panel__agent">' + esc(t.agent) + '</span>' +
        '<div class="traces-panel__text">' + esc(t.text) + '</div>' +
        '<span class="traces-panel__time">' + esc(t.ts ? traceStamp(t.ts) : t.time) + '</span>' +
      '</div>'
    ).join('');
    tracesEl.innerHTML = html;
  }

  /* ── TIME HELPERS ──
     Timestamps are absolute in the JSON; every relative label is computed here.
     A frozen "45m ago" string in the data files would stay frozen forever. */
  function relTime(iso) {
    const then = new Date(iso);
    if (isNaN(then.getTime())) return '';
    const s = Math.max(0, (Date.now() - then.getTime()) / 1000);
    if (s < 90) return 'just now';
    const m = s / 60;
    if (m < 60) return Math.round(m) + 'm ago';
    const h = m / 60;
    if (h < 24) return Math.round(h) + 'h ago';
    const d = h / 24;
    if (d < 60) return Math.round(d) + 'd ago';
    return Math.round(d / 30) + 'mo ago';
  }

  function hhmm(d) {
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  }

  // Trace stamps: relative while it's still "recent", absolute date once it's
  // history — an entry that only ever says "5mo ago" reads as a broken clock.
  function traceStamp(iso) {
    const then = new Date(iso);
    if (isNaN(then.getTime())) return '';
    const days = (Date.now() - then.getTime()) / 86400000;
    if (days < 14) return relTime(iso);
    return then.getFullYear() + '.' +
      (then.getMonth() + 1).toString().padStart(2, '0') + '.' +
      then.getDate().toString().padStart(2, '0');
  }

  /* ── AMBIENT FOOTER ── */
  function renderAmbientFooter(fleet) {
    if (footerPulse) footerPulse.textContent = fleet.router_healthy ? '●' : '○';
    if (footerBuild) {
      const paint = () => { footerBuild.textContent = relTime(fleet.last_build); };
      paint();
      // Age the label, never overwrite it with the current clock. "LAST BUILD"
      // showing the current time is a lie the reader can't detect.
      setInterval(paint, 60000);
    }
    if (footerAgents) footerAgents.textContent = fleet.active_agents + '/' + fleet.machines_online;
  }

  /* ── SCROLL REVEAL ── */
  function observeAll() {
    const els = document.querySelectorAll('[data-reveal]');
    if (!els.length) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });

    els.forEach(el => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(30px)';
      el.style.transition = 'opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)';
      observer.observe(el);
    });
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }
})();
