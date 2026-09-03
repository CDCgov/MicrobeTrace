(() => {
  const productionMeasurementId = 'G-0MWHB1NG2M';
  const testingMeasurementId = 'G-J7STWPNKC0';

  // update this when testing google analytics specifically
  const analyticsDisabledForLocalHost = false;

  const hostname = window.location.hostname.toLowerCase();
  const isLocalDevelopmentHost = hostname === ''
    || hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '::1'
    || hostname === '[::1]'
    || /^127(?:\.\d{1,3}){3}$/.test(hostname);
  const isEnabledLocalTest = isLocalDevelopmentHost && !analyticsDisabledForLocalHost;
  const analyticsDisabled = isLocalDevelopmentHost && !isEnabledLocalTest;

  window.microbeTraceAnalyticsDisabled = analyticsDisabled;
  if (analyticsDisabled) return;
  
  const measurementId = isEnabledLocalTest ? testingMeasurementId : productionMeasurementId;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function() { window.dataLayer.push(arguments); };

  const scriptUrl = document.currentScript?.src;
  const googleTag = document.createElement('script');
  googleTag.async = true;
  googleTag.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(googleTag);

  const deploymentLocation = new URL(
    scriptUrl ? '../' : (document.baseURI || window.location.href),
    scriptUrl || window.location.href
  );
  deploymentLocation.search = '';
  deploymentLocation.hash = '';
  if (deploymentLocation.pathname !== '/') {
    deploymentLocation.pathname = deploymentLocation.pathname.replace(/\/+$/, '');
  }

  let sanitizedReferrer = '';
  if (document.referrer) {
    try {
      sanitizedReferrer = new URL(document.referrer).origin;
    } catch {
      sanitizedReferrer = '';
    }
  }

  const tagConfiguration = {
    send_page_view: false,
    page_location: deploymentLocation.href
  };
  if (sanitizedReferrer) {
    tagConfiguration.page_referrer = sanitizedReferrer;
  }

  window.gtag('js', new Date());
  window.gtag('config', measurementId, tagConfiguration);
})();
