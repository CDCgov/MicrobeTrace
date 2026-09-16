(() => {
  const hash = window.location.hash.replace(/^#/, '');
  const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : hash;
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(hashQuery);
  const analyticsExplicitlyEnabled = searchParams.get('enableAnalytics') === '1'
    || hashParams.get('enableAnalytics') === '1';
  const analyticsDisabledForLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    && !analyticsExplicitlyEnabled;
  const analyticsDisabled = analyticsDisabledForLocalHost
    || searchParams.has('handoff')
    || hashParams.has('handoff');

  window.microbeTraceAnalyticsDisabled = analyticsDisabled;
  if (analyticsDisabled) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function() { window.dataLayer.push(arguments); };

  const googleTag = document.createElement('script');
  googleTag.async = true;
  googleTag.src = 'https://www.googletagmanager.com/gtag/js?id=G-0MWHB1NG2M';
  document.head.appendChild(googleTag);

  window.gtag('js', new Date());
  window.gtag('config', 'G-0MWHB1NG2M', { send_page_view: false });
})();
