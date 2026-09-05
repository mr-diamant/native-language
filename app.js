(function () {
  'use strict';

  const routes = ['home', 'learn', 'profile'];

  function navigate(route) {
    if (!routes.includes(route)) route = 'home';

    document.querySelectorAll('.route').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));

    const target = document.getElementById('route-' + route);
    if (target) target.classList.add('active');

    const navBtn = document.querySelector(`.nav-link[data-route="${route}"]`);
    if (navBtn) navBtn.classList.add('active');

    history.replaceState({ route }, '', '#' + route);
  }

  document.body.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-route]');
    if (trigger) {
      e.preventDefault();
      navigate(trigger.dataset.route);
    }
  });

  function initRoute() {
    const hash = window.location.hash.replace('#', '');
    navigate(hash || 'home');
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('SW registered:', reg.scope))
        .catch(err => console.error('SW failed:', err));
    });
  }

  window.addEventListener('popstate', initRoute);
  initRoute();
})();
