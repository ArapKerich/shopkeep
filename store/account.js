(() => {
  const form = document.querySelector('#account-form');
  const message = document.querySelector('#account-message');
  const submit = form.querySelector('button[type="submit"]');
  const mode = document.body.dataset.mode;
  const storeId = new URLSearchParams(location.search).get('store') || '';
  // 'redirect' param reserved for future use — not yet wired up.
  const params = new URLSearchParams();
  if (storeId) params.set('store', storeId);
  const query = params.toString() ? `?${params}` : '';
  // Destination after a successful login/signup — return to store so the
  // customer can complete their order without having to start over.
  const successUrl = `./${query}`;
  // On signup page → 'Sign in' goes to the unified root login (handles both customers & staff).
  // On login page → 'Create account' goes to the customer signup.
  document.querySelector('#switch-account').href = `${mode === 'signup' ? '../login.html' : 'signup.html'}${query}`;
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
      showMessage('Open this page from your local shop\'s storefront link.');
      return;
    }
    // All validation passed — disable submit before any async work begins.
    submit.disabled = true;
    showMessage(mode === 'signup' ? 'Creating your account…' : 'Signing you in…');
    const email = form.elements.email.value.trim().toLowerCase();
    const password = form.elements.password.value;
    try {
      if (mode === 'signup') {
        const name = form.elements.name.value.trim();
        const phone = form.elements.phone.value.trim();

        let uid;
        try {
          // Try creating a new Firebase Auth account first.
          const credential = await window.shopkeepAuth.createUserWithEmailAndPassword(email, password);
          uid = credential.user.uid;
        } catch (createError) {
          // If the account already exists (e.g. a staff/admin account), sign them
          // in with those credentials and create a customer profile for them instead.
          if (createError.code === 'auth/email-already-in-use') {
            showMessage('Account found — signing you in to link your customer profile…');
            const credential = await window.shopkeepAuth.signInWithEmailAndPassword(email, password);
            uid = credential.user.uid;
            // Check if they already have a customer profile for this store.
            const existing = await window.shopkeepDb.collection('customers').doc(uid).get();
            if (existing.exists) {
              // Customer profile already exists — just send them to the store.
              location.replace(successUrl);
              return;
            }
          } else {
            throw createError;
          }
        }

        // Create the Firestore customer profile.
        try {
          await window.shopkeepDb.collection('customers').doc(uid).set({
            uid,
            email,
            displayName: name,
            phone,
            storeId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
        } catch (firestoreError) {
          // If Firestore write fails for a brand-new account, delete the auth
          // account to keep things consistent. Skip this for existing accounts.
          const currentUser = window.shopkeepAuth.currentUser;
          if (currentUser && currentUser.uid === uid) {
            const isNewAccount = !await window.shopkeepDb.collection('shop_memberships').doc(uid).get()
              .then(d => d.exists).catch(() => false);
            if (isNewAccount) await currentUser.delete().catch(() => {});
          }
          throw firestoreError;
        }

        await window.shopkeepDb.collection('shops').doc(storeId).collection('activity_logs').add({
          action: 'customer_registered', actorUid: uid, actorEmail: email, actorRole: 'customer',
          subjectUid: uid, subjectEmail: email, details: 'Customer account created',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        }).catch(error => console.error('Could not record customer registration.', error));

        location.replace(successUrl);
        return;

      } else {
        // ── Login flow ──────────────────────────────────────────────────────
        const credential = await window.shopkeepAuth.signInWithEmailAndPassword(email, password);
        const profile = await window.shopkeepDb.collection('customers').doc(credential.user.uid).get();

        if (!profile.exists) {
          // No customer profile yet (e.g. a staff member signing in here for the
          // first time as a customer). Send them to signup to create one.
          await window.shopkeepAuth.signOut();
          showMessage('No customer account found for this email. Create one below.');
          document.querySelector('#switch-account')?.click();
          submit.disabled = false;
          return;
        }

        // Ensure this customer belongs to the current store.
        if (profile.get('storeId') !== storeId) {
          await window.shopkeepAuth.signOut();
          showMessage('This account is not registered with this store.');
          submit.disabled = false;
          return;
        }

        await window.shopkeepDb.collection('shops').doc(profile.get('storeId')).collection('activity_logs').add({
          action: 'signed_in', actorUid: credential.user.uid, actorEmail: email, actorRole: 'customer',
          subjectUid: credential.user.uid, subjectEmail: email, details: '',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        }).catch(error => console.error('Could not record customer sign-in.', error));
      }

      location.replace(successUrl);
    } catch (error) {
      showMessage(explainError(error));
      submit.disabled = false;
    }
  });

  const resetButton = document.querySelector('#reset-password');
  if (resetButton) resetButton.addEventListener('click', async () => {
    const email = form.elements.email.value.trim();
    if (!email) return showMessage('Enter your email address first.');
    if (!form.elements.email.checkValidity()) return showMessage('Enter a valid email address.');
    try {
      await window.shopkeepAuth.sendPasswordResetEmail(email);
      showMessage('If that account exists, a password reset email has been sent.', true);
    } catch (error) {
      showMessage(explainError(error));
    }
  });
})();