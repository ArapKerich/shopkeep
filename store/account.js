(() => {
  const form = document.querySelector('#account-form');
  const message = document.querySelector('#account-message');
  const submit = form.querySelector('button[type="submit"]');
  const mode = document.body.dataset.mode;
  const storeId = new URLSearchParams(location.search).get('store') || '';
  const params = new URLSearchParams();
  if (storeId) params.set('store', storeId);
  const query = params.toString() ? `?${params}` : '';
  document.querySelector('#switch-account').href = `${mode === 'signup' ? 'login.html' : 'signup.html'}${query}`;
  document.querySelector('#back-to-shop').href = `./${query}`;
  document.querySelector('.brand').href = `./${query}`;

  const showMessage = (text, success = false) => {
    message.textContent = text;
    message.classList.toggle('success', success);
  };
  const explainError = error => ({
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/email-already-in-use': 'An account already uses that email. Sign in instead.',
    'auth/weak-password': 'Use a password with at least 6 characters.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/too-many-requests': 'Too many attempts. Wait a little and try again.'
  })[error.code] || error.message || 'Could not complete this request.';

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!window.shopkeepFirebaseConfigured || !window.shopkeepAuth || !window.shopkeepDb) {
      showMessage('Firebase is not configured. Please contact the shop.');
      return;
    }
    if (!storeId) {
      showMessage('Open this page from your local shop’s storefront link.');
      return;
    }
    submit.disabled = true;
    showMessage(mode === 'signup' ? 'Creating your account…' : 'Signing you in…');
    const email = form.elements.email.value.trim().toLowerCase();
    const password = form.elements.password.value;
    try {
      if (mode === 'signup') {
        const name = form.elements.name.value.trim();
        const phone = form.elements.phone.value.trim();
        const credential = await window.shopkeepAuth.createUserWithEmailAndPassword(email, password);
        try {
          await window.shopkeepDb.collection('customers').doc(credential.user.uid).set({
            uid: credential.user.uid,
            email,
            displayName: name,
            phone,
            storeId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
        } catch (error) {
          await credential.user.delete().catch(() => {});
          throw error;
        }
        await window.shopkeepDb.collection('shops').doc(storeId).collection('activity_logs').add({
          action: 'customer_registered', actorUid: credential.user.uid, actorEmail: email, actorRole: 'customer',
          subjectUid: credential.user.uid, subjectEmail: email, details: 'Customer account created',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        }).catch(error => console.warn('Could not record customer registration.', error));
        location.replace(`./?store=${encodeURIComponent(storeId)}`);
        return;
      } else {
        const credential = await window.shopkeepAuth.signInWithEmailAndPassword(email, password);
        const profile = await window.shopkeepDb.collection('customers').doc(credential.user.uid).get();
        if (!profile.exists) {
          await window.shopkeepAuth.signOut();
          throw new Error('This email belongs to a store team account. Use a customer account to continue.');
        }
        await window.shopkeepDb.collection('shops').doc(profile.get('storeId')).collection('activity_logs').add({
          action: 'signed_in', actorUid: credential.user.uid, actorEmail: email, actorRole: 'customer',
          subjectUid: credential.user.uid, subjectEmail: email, details: '',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        }).catch(error => console.warn('Could not record customer sign-in.', error));
      }
      location.replace(`./?store=${encodeURIComponent(storeId)}`);
    } catch (error) {
      showMessage(explainError(error));
      submit.disabled = false;
    }
  });

  const resetButton = document.querySelector('#reset-password');
  if (resetButton) resetButton.addEventListener('click', async () => {
    const email = form.elements.email.value.trim();
    if (!email) return showMessage('Enter your email address first.');
    try {
      await window.shopkeepAuth.sendPasswordResetEmail(email);
      showMessage('If that account exists, a password reset email has been sent.', true);
    } catch (error) {
      showMessage(explainError(error));
    }
  });
})();