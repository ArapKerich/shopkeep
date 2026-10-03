(() => {
  const config = window.SHOPKEEP_FIREBASE_CONFIG;
  const configured = config && Object.values(config).every(value => value && !value.startsWith('YOUR_'));
  window.shopkeepFirebaseConfigured = Boolean(configured);

  if (!configured) return;

  if (!firebase.apps.length) firebase.initializeApp(config);
  window.shopkeepAuth = firebase.auth();
  if (typeof firebase.firestore === 'function') window.shopkeepDb = firebase.firestore();
})();