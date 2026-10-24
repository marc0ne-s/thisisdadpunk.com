/**
 * DadPunk /work — Projects Section
 * Vanilla JS. Fetch JSON, render grid, filter, expand details.
 * thisisdadpunk.com — 2026-06-01
 */
(function () {
  'use strict';

  /* ── DOM refs ── */
  const grid   = document.getElementById('project-grid');
  const detail = document.getElementById('project-detail');
  const filterContainer = document.getElementById('filter-bar');
  if (!grid || !filterContainer) return; // section not on page

  /* ── State ── */
  let allProjects   = [];
  let renderedCards = [];
  let activeFilter  = 'ALL';
  let activeCardEl  = null;

  /* ── Status → badge class ── */
  const badgeClass = {
    SHIPPED:  'badge--shipped',
    BETA:     'badge--beta',
    ACTIVE:   'badge--active',
    RESEARCH: 'badge--research',
    PAUSED:   'badge--paused'
  };

  /* ── Fetch & init ── */
  fetch('/assets/data/projects.json')
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(data => {
      allProjects = data;
      renderFilters();
      renderGrid(allProjects);
      observeCards();
    })
    .catch(err => {
      grid.innerHTML =
        '<div style="grid-column:1/-1;text-align:center;padding:var(--space-lg);font-family:var(--font-mono);font-size:0.9rem;color:var(--color-olive-light);">' +
        '// Could not load project data.<br/>' +
        '<span style="color:var(--color-orange);">' + (err.message || 'Unknown error') + '</span>' +
        '</div>';
    });

  /* ── Filter bar ── */
  function renderFilters() {
    const statuses = ['ALL', 'SHIPPED', 'BETA', 'ACTIVE'];
    const html = statuses.map(s =>
      `<button class="filter-btn${s==='ALL'?' filter-btn--active':''}" data-filter="${s}">${s}</button>`
    ).join('');
    filterContainer.innerHTML = html;

    filterContainer.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        filterContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('filter-btn--active'));
        btn.classList.add('filter-btn--active');
        activeFilter = btn.dataset.filter;
        closeDetail();
        renderGrid(activeFilter === 'ALL' ? allProjects : allProjects.filter(p => p.status === activeFilter));
        observeCards();
      });
    });
  }

  /* ── Render grid ── */
  function renderGrid(projects) {
    renderedCards = [];
    grid.innerHTML = '';

    if (projects.length === 0) {
      grid.innerHTML =
        '<div style="grid-column:1/-1;text-align:center;padding:var(--space-lg);font-family:var(--font-mono);font-size:0.9rem;color:var(--color-olive-light);">' +
        '// No projects match this filter.' +
        '</div>';
      return;
    }

    projects.forEach(project => {
      const card = cardHTML(project);
      grid.appendChild(card);
      renderedCards.push(card);
    });
  }

  function cardHTML(p) {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.setAttribute('data-project-id', p.id);
    card.setAttribute('data-reveal', '');

    card.innerHTML =
      '<div class="project-card__header">' +
        '<span class="project-card__name">' + escHTML(p.name) + '</span>' +
        '<span class="badge ' + (badgeClass[p.status] || '') + '">' + escHTML(p.status) + '</span>' +
      '</div>' +
      '<p class="project-card__one-line">' + escHTML(p.one_line) + '</p>' +
      '<div class="project-card__tags">' +
        (p.tags || []).map(t => '<span class="project-card__tag">#' + escHTML(t) + '</span>').join('') +
      '</div>' +
      '<span class="project-card__link">MORE →</span>';

    card.addEventListener('click', (e) => {
      // Don't expand if user clicked the external link
      if (e.target.closest('.project-card__external-link')) return;
      toggleDetail(p, card);
    });

    return card;
  }

  /* ── Detail panel ── */
  function toggleDetail(project, cardEl) {
    // Close if same card clicked again
    if (activeCardEl === cardEl && detail.classList.contains('project-detail--open')) {
      closeDetail();
      return;
    }
    openDetail(project, cardEl);
  }

  function openDetail(project, cardEl) {
    // Reset previous active card style
    if (activeCardEl) activeCardEl.style.outline = '';

    activeCardEl = cardEl;
    cardEl.style.outline = '1px solid var(--color-orange)';

    const linkHTML = project.url
      ? '<a class="project-detail__link" href="' + escHTML(project.url) + '" target="_blank" rel="noopener">→ View project</a>'
      : '';

    detail.innerHTML =
      '<button class="project-detail__close" id="detail-close">× CLOSE</button>' +
      '<h3 class="project-detail__name">' + escHTML(project.name) + '</h3>' +
      '<span class="badge ' + (badgeClass[project.status] || '') + ' project-detail__status">' + escHTML(project.status) + '</span>' +
      '<div class="project-detail__desc">' +
        (project.description_long
          ? '<p>' + escHTML(project.description_long) + '</p>'
          : '<p>' + escHTML(project.description) + '</p>') +
      '</div>' +
      (project.visual
        ? '<div class="project-detail__visual">Visual direction: ' + escHTML(project.visual) + '</div>'
        : '') +
      linkHTML;

    detail.classList.add('project-detail--open');

    // Scroll detail into view
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Close button
    document.getElementById('detail-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeDetail();
    });

    // Click outside to close
    document.addEventListener('click', outsideClickHandler);
  }

  function closeDetail() {
    detail.classList.remove('project-detail--open');
    detail.innerHTML = '';
    if (activeCardEl) {
      activeCardEl.style.outline = '';
      activeCardEl = null;
    }
    document.removeEventListener('click', outsideClickHandler);
  }

  function outsideClickHandler(e) {
    if (!detail.contains(e.target) && !e.target.closest('.project-card')) {
      closeDetail();
    }
  }

  /* ── Scroll reveal (IntersectionObserver) ── */
  function observeCards() {
    const cards = grid.querySelectorAll('[data-reveal]');
    if (!cards.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    cards.forEach(card => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(40px)';
      card.style.transition = 'opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)';
      observer.observe(card);
    });
  }

  /* ── Helpers ── */
  function escHTML(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();
