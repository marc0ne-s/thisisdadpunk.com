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

    const interruptHTML = '<div class="interrupt" data-reveal><p>Creative engineering practice. Music, hardware, local AI, and punk ethos — running on a Mac mini in Budgewoi. No cloud dependencies. No platform lock-in. No algorithm chasing. <span style="color:var(--color-orange);">Documented honestly. Sold directly. Shared openly.</span></p></div>';

    // Interrupt lands after the third card, not mid-markup: joining an array is
    // sturdier than splitting the rendered HTML on '</div>'.
    cards.splice(3, 0, interruptHTML);
    spreadEl.innerHTML = cards.join('');
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
