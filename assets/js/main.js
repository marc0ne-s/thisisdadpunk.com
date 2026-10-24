// DADPUNK v3 — 2D Interactions (Tilt + Scroll Reveal)
// Three.js handles the hero 3D scene. This handles CSS-level stuff.

document.addEventListener('DOMContentLoaded', () => {

  // === SCROLL REVEAL ===
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.creed__block, .mixtape__card, .outro__content, .statement__content').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
    observer.observe(el);
  });

  // Stagger delays
  document.querySelectorAll('.creed__block').forEach((el, i) => {
    el.style.transitionDelay = `${i * 0.1}s`;
  });
  document.querySelectorAll('.mixtape__card').forEach((el, i) => {
    el.style.transitionDelay = `${i * 0.15}s`;
  });

  // Inject reveal styles
  const style = document.createElement('style');
  style.textContent = `.revealed { opacity: 1 !important; transform: translateY(0) !important; }`;
  document.head.appendChild(style);


  // === 3D TILT ON HOVER ===
  const tiltElements = document.querySelectorAll('[data-tilt]');

  tiltElements.forEach(el => {
    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -8;
      const rotateY = ((x - centerX) / centerX) * 8;

      el.style.transform = `perspective(600px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(20px)`;
    });

    el.addEventListener('mouseleave', () => {
      el.style.transform = 'perspective(600px) rotateX(0) rotateY(0) translateZ(0)';
      el.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
    });

    el.addEventListener('mouseenter', () => {
      el.style.transition = 'transform 0.1s ease-out';
    });
  });

});