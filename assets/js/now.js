/**
 * DadPunk — Living /now Dashboard
 * Fetches now.json, renders dynamic status grid with timestamps.
 * Replaces hardcoded /now content with live, agent-updatable state.
 * thisisdadpunk.com — Cycle 001, Prototype A
 */
(function () {
  'use strict';

  const grid = document.getElementById('now-grid');
  if (!grid) return;

  fetch('/assets/data/now.json')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(data => {
      renderNow(data);
    })
    .catch(err => {
      grid.innerHTML =
        '<div style="grid-column:1/-1;text-align:center;padding:var(--space-md);font-family:var(--font-mono);font-size:0.85rem;color:var(--color-olive-light);">' +
        '// Could not load current state.<br/>' +
        '<span style="color:var(--color-orange);">' + escHTML(err.message || 'Unknown') + '</span>' +
        '</div>';
    });

  function renderNow(data) {
    const items = (data.sections || []).map(s => {
      const timeAgo = formatTimeAgo(s.updated);
      return '' +
        '<div class="now__item">' +
          '<span class="now__label">' + escHTML(s.label) + '</span>' +
          '<p>' + escHTML(s.text) + '</p>' +
          '<span class="now__timestamp">' + timeAgo + '</span>' +
        '</div>';
    }).join('');

    grid.innerHTML = items;

    // Scroll-reveal the now items
    observeNowItems();
  }

  function formatTimeAgo(iso) {
    if (!iso) return '';
    const then = new Date(iso);
    const now = new Date();
    const mins = Math.floor((now - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    return days + 'd ago';
  }

  function observeNowItems() {
    const items = grid.querySelectorAll('.now__item');
    if (!items.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    items.forEach((item, i) => {
      item.style.opacity = '0';
      item.style.transform = 'translateY(30px)';
      item.style.transition = 'opacity 0.5s cubic-bezier(0.16,1,0.3,1) ' + (i * 0.08) + 's, transform 0.5s cubic-bezier(0.16,1,0.3,1) ' + (i * 0.08) + 's';
      observer.observe(item);
    });
  }

  function escHTML(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();
