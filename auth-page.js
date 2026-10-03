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
  showError('Add your Firebase web app settings to firebase-config.js before using authentication.');
  button.disabled = true;
  if (resetButton) resetButton.disabled = true;
} else {
  auth.onAuthStateChanged(user => {
    if (user && form.dataset.mode === 'signup') location.replace('index.html');
  });
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!window.shopkeepFirebaseConfigured) return;

  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  button.disabled = true;
  showError('');

  try {
    if (form.dataset.mode === 'signup') {
      await auth.createUserWithEmailAndPassword(email, password);
    } else {
      await auth.signInWithEmailAndPassword(email, password);
    }
    location.replace('index.html');
  } catch (error) {
    const messages = {
      'auth/email-already-in-use': 'An account already uses this email. Sign in instead.',
      'auth/invalid-credential': 'Email or password is incorrect.',
      'auth/weak-password': 'Use a password with at least 6 characters.',
      'auth/invalid-email': 'Enter a valid email address.'
    };
    showError(messages[error.code] || 'Could not authenticate. Check your Firebase setup and try again.');
    button.disabled = false;
  }
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