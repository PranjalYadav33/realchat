// Auth Manager handles registration, login, and session state
class AuthManager {
  constructor() {
    // Modal elements
    this.modal = document.querySelector('#authModal');
    this.usernameInput = document.querySelector('#authUsername');
    this.passwordInput = document.querySelector('#authPassword');
    this.modeRegisterBtn = document.querySelector('#authModeRegister');
    this.modeLoginBtn = document.querySelector('#authModeLogin');
    this.submitBtn = document.querySelector('#authSubmit');
    this.cancelBtn = document.querySelector('#authCancel');
    this.errorEl = document.querySelector('#authError');
    this.usernameHint = document.querySelector('#usernameHint');
    this.logoutBtn = document.querySelector('#logoutBtn');

    this.mode = 'register'; // or 'login'
    this.availabilityTO = null;
    this.loading = false;

    this.initEvents();
    this.updateMode('register');
  }

  initEvents() {
    if (this.modeRegisterBtn) this.modeRegisterBtn.addEventListener('click', () => this.updateMode('register'));
    if (this.modeLoginBtn) this.modeLoginBtn.addEventListener('click', () => this.updateMode('login'));

    if (this.submitBtn) this.submitBtn.addEventListener('click', () => this.handleSubmit());
    if (this.cancelBtn) this.cancelBtn.addEventListener('click', () => this.hide());

    if (this.usernameInput) {
      this.usernameInput.addEventListener('input', () => {
        // Debounce availability check in register mode
        if (this.mode !== 'register') return;
        clearTimeout(this.availabilityTO);
        this.availabilityTO = setTimeout(() => this.checkUsername(), 400);
        this.clearError();
      });
      this.usernameInput.addEventListener('blur', () => {
        if (this.mode === 'register') this.checkUsername();
      });
    }

    const toggleEye = document.querySelector('#togglePasswordVisibility');
    if (toggleEye) {
      toggleEye.addEventListener('click', () => this.togglePasswordVisibility());
    }
    if (this.passwordInput) {
      this.passwordInput.addEventListener('input', () => {
        this.updateStrength(this.passwordInput.value);
        this.clearError();
      });
    }

    if (this.logoutBtn) {
      this.logoutBtn.addEventListener('click', () => this.logout());
    }

    // Enter to submit
    const onEnter = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleSubmit();
      }
    };
    this.usernameInput?.addEventListener('keydown', onEnter);
    this.passwordInput?.addEventListener('keydown', onEnter);
  }

  updateMode(mode) {
    this.mode = mode;
    if (this.submitBtn) this.submitBtn.textContent = mode === 'register' ? 'Create account' : 'Log in';
    if (this.errorEl) this.errorEl.textContent = '';
    if (this.usernameInput) this.usernameInput.classList.remove('input-success', 'input-error');
    if (this.usernameHint) {
      this.usernameHint.style.color = 'var(--muted)';
      this.usernameHint.textContent = mode === 'register'
        ? 'Allowed: a-z, 0-9, _ . - (3-24 chars)'
        : 'Enter your account username';
    }
    if (this.passwordInput) {
      this.passwordInput.value = '';
      this.updateStrength('');
    }
    // Show strength only for register
    const strength = document.querySelector('#passwordStrength');
    if (strength) {
      strength.style.display = mode === 'register' ? 'block' : 'none';
    }
    // Toggle segmented button visuals
    this.modeRegisterBtn?.classList.toggle('active', mode === 'register');
    this.modeLoginBtn?.classList.toggle('active', mode === 'login');
  }

  async checkUsername() {
    const u = this.usernameInput?.value?.trim();
    if (!u) return;
    try {
      const res = await fetch('/api/auth/check-username', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Check failed');
      if (this.usernameHint) this.usernameHint.textContent = data.available ? 'Available' : 'Already taken';
      this.usernameHint.style.color = data.available ? 'var(--success)' : 'var(--danger)';
      if (this.usernameInput) {
        this.usernameInput.classList.toggle('input-success', !!data.available);
        this.usernameInput.classList.toggle('input-error', !data.available);
      }
    } catch (e) {
      if (this.usernameHint) {
        this.usernameHint.textContent = 'Cannot check username now';
        this.usernameHint.style.color = 'var(--danger)';
      }
    }
  }

  async handleSubmit() {
    const username = this.usernameInput?.value?.trim();
    const password = this.passwordInput?.value || '';
    if (!username || !password) return this.showError('Enter username and password');
    const uok = /^[a-z0-9_\.\-]{3,24}$/i.test(username);
    if (!uok) {
      if (this.usernameInput) {
        this.usernameInput.classList.add('input-error');
      }
      return this.showError('Username must be 3-24 chars: a-z, 0-9, _ . -');
    }
    if (this.loading) return;
    this.setLoading(true);

    try {
      if (this.mode === 'register') {
        const res = await fetch('/api/auth/register', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!data.ok) return this.showError(data.error || 'Registration failed');
        this.onAuthSuccess(data.username);
      } else {
        const res = await fetch('/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!data.ok) return this.showError(data.error || 'Login failed');
        this.onAuthSuccess(data.username);
      }
    } catch (e) {
      this.showError('Network error');
    } finally {
      this.setLoading(false);
    }
  }

  onAuthSuccess(username) {
    localStorage.setItem('auth:username', username);
    // Also set chat:name for current code paths expecting this
    localStorage.setItem('chat:name', username);
    if (window.realtimeChatApp) {
      try {
        window.realtimeChatApp.onAuthenticated(username);
      } catch {}
    }
    try { window.uiManager?.updateCurrentUserChip(username); } catch {}
    this.hide();
  }

  show() {
    if (this.modal) this.modal.hidden = false;
    if (this.usernameInput) {
      this.usernameInput.value = '';
      this.usernameInput.focus();
    }
    if (this.passwordInput) this.passwordInput.value = '';
    if (this.errorEl) this.errorEl.textContent = '';
    this.updateMode('register');
  }

  hide() {
    if (this.modal) this.modal.hidden = true;
  }

  logout() {
    try { localStorage.removeItem('auth:username'); } catch {}
    try { localStorage.removeItem('chat:name'); } catch {}
    try { window.webrtcManager?.endCall(false); } catch {}
    try { window.socketManager?.disconnect(); } catch {}
    if (window.chatApp) {
      window.chatApp.setMyName('');
    }
    try { window.uiManager?.updateCurrentUserChip(''); } catch {}
    this.show();
  }

  isAuthenticated() {
    return !!localStorage.getItem('auth:username');
  }

  getAuthUsername() {
    return localStorage.getItem('auth:username') || '';
  }

  togglePasswordVisibility() {
    if (!this.passwordInput) return;
    const isPwd = this.passwordInput.getAttribute('type') === 'password';
    this.passwordInput.setAttribute('type', isPwd ? 'text' : 'password');
  }

  updateStrength(pwd) {
    const barWrap = document.querySelector('#passwordStrength');
    const barText = document.querySelector('#passwordStrengthText');
    if (!barWrap || !barText) return;
    const { level, label } = this.computeStrength(pwd || '');
    barWrap.setAttribute('data-level', String(level));
    barText.textContent = `Strength: ${label}`;
  }

  computeStrength(pwd) {
    let score = 0;
    if (pwd.length >= 6) score++;
    if (pwd.length >= 10) score++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++;
    const level = Math.min(4, score);
    const label = ['weak', 'weak', 'fair', 'good', 'strong'][level];
    return { level, label };
  }

  setLoading(v) {
    this.loading = !!v;
    if (this.submitBtn) {
      this.submitBtn.setAttribute('aria-busy', this.loading ? 'true' : 'false');
      this.submitBtn.classList.toggle('loading', this.loading);
      this.submitBtn.disabled = this.loading;
    }
    if (this.usernameInput) this.usernameInput.disabled = this.loading;
    if (this.passwordInput) this.passwordInput.disabled = this.loading;
  }

  showError(text) {
    if (this.errorEl) this.errorEl.textContent = text;
    this.setLoading(false);
    // Subtle shake on error
    if (this.modal) {
      const card = this.modal.querySelector('.card');
      if (card) {
        card.classList.remove('shake');
        // force reflow
        void card.offsetWidth;
        card.classList.add('shake');
        setTimeout(() => card.classList.remove('shake'), 400);
      }
    }
  }

  clearError() {
    if (this.errorEl) this.errorEl.textContent = '';
  }
}

// Export
window.AuthManager = AuthManager;
window.authManager = new AuthManager();
