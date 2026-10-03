const auth = window.shopkeepAuth;
const form = document.querySelector('#auth-form');
const errorEl = document.querySelector('#auth-error');
const button = form.querySelector('button[type="submit"]');
const resetButton = document.querySelector('[data-action="reset"]');
const showError = (message, success = false) => {
  errorEl.textContent = message;
  errorEl.classList.toggle('success', success);
};

if (!window.shopkeepFirebaseConfigured) {
  showError('Add your Firebase web app settings to backend/firebase-config.js before using authentication.');
  button.disabled = true;
  if (resetButton) resetButton.disabled = true;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!window.shopkeepFirebaseConfigured) return;

  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  button.disabled = true;
  showError('');

  let currentUser;
  try {
    if (form.dataset.mode === 'signup') await auth.createUserWithEmailAndPassword(email, password);
    else await auth.signInWithEmailAndPassword(email, password);
    currentUser = auth.currentUser;
  } catch (error) {
    const messages = {
      'auth/email-already-in-use': 'An account already uses this email. Sign in instead.',
      'auth/invalid-credential': 'Firebase rejected this email/password combination.',
      'auth/invalid-login-credentials': 'Firebase rejected this email/password combination.',
      'auth/wrong-password': 'Firebase rejected this email/password combination.',
      'auth/user-not-found': 'No Firebase Authentication account uses this email.',
      'auth/user-disabled': 'This Firebase Authentication account is disabled.',
      'auth/weak-password': 'Use a password with at least 6 characters.',
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/operation-not-allowed': 'Enable Email/Password under Firebase Authentication > Sign-in method.',
      'auth/unauthorized-domain': `Add ${location.hostname} under Firebase Authentication > Settings > Authorized domains.`,
      'auth/too-many-requests': 'Too many attempts. Wait a while before trying again.',
      'auth/network-request-failed': 'Firebase Authentication could not connect. Check your network and try again.'
    };
    console.error('Firebase Authentication failed:', error.code, error.message);
    showError(messages[error.code] || `Firebase Authentication failed${error.code ? ` (${error.code})` : ''}: ${error.message || 'Check your Firebase Auth settings.'}`);
    button.disabled = false;
    return;
  }

  let customer, membership, token;
  try {
    [customer, membership, token] = await Promise.all([
      window.shopkeepDb.collection('customers').doc(currentUser.uid).get(),
      window.shopkeepDb.collection('shop_memberships').doc(currentUser.uid).get(),
      currentUser.getIdTokenResult(),
    ]);
  } catch (error) {
    console.error('Firebase profile lookup failed after sign-in:', error.code, error.message);
    showError(`Firebase accepted your sign-in, but Firestore could not load your account profile${error.code ? ` (${error.code})` : ''}. Deploy backend/firestore.rules and check the user's store membership.`);
    button.disabled = false;
    return;
  }

  if (customer.exists) {
    location.replace(`store/?store=${encodeURIComponent(customer.get('storeId') || '')}`);
    return;
  }
  if (membership.exists && membership.get('status') !== 'active') {
    await auth.signOut();
    showError('This account has been removed from the store.');
    button.disabled = false;
    return;
  }

  const storeId = membership.exists ? membership.get('storeId') : (token.claims.storeId || currentUser.uid);
  const role = membership.exists ? membership.get('role') : (token.claims.role || 'owner');
  await window.shopkeepDb.collection('shops').doc(storeId).collection('activity_logs').add({
    action: 'signed_in', actorUid: currentUser.uid, actorEmail: currentUser.email || '', actorRole: role,
    subjectUid: currentUser.uid, subjectEmail: currentUser.email || '', details: '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  }).catch(error => console.warn('Could not record sign-in activity.', error));
  location.replace('admin/');
});

if (resetButton) resetButton.addEventListener('click', async () => {
  const emailField = form.elements.email;
  const email = emailField.value.trim();
  if (!email) return showError('Enter your email address first, then request a reset link.');
  if (!emailField.checkValidity()) return showError('Enter a valid email address.');

  resetButton.disabled = true;
  resetButton.textContent = 'Sending reset link...';
  showError('');
  try {
    await auth.sendPasswordResetEmail(email);
    showError('If an account exists for that email, Firebase will send a reset link.', true);
  } catch (error) {
    const messages = {
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/operation-not-allowed': 'Enable Email/Password under Firebase Authentication > Sign-in method.',
      'auth/unauthorized-domain': `Add ${location.hostname} under Firebase Authentication > Settings > Authorized domains.`,
      'auth/too-many-requests': 'Too many attempts. Wait a while before requesting another link.',
      'auth/network-request-failed': 'Network error. Check your connection and try again.'
    };
    showError(messages[error.code] || 'Could not send the reset link. Check Firebase Auth settings and try again.');
  } finally {
    resetButton.disabled = false;
    resetButton.textContent = 'Send password reset email';
  }
});