// UI Utilities Module
class UIManager {
  constructor() {
    this.joinModal = document.querySelector('#joinModal');
    this.nameInput = document.querySelector('#nameInput');
    this.roomInput = document.querySelector('#roomInput');
    this.joinBtn = document.querySelector('#joinBtn');
    this.themeToggle = document.querySelector('#themeToggle');
    this.sidebarToggle = document.querySelector('#sidebarToggle');
    this.overlay = document.querySelector('#overlay');
    this.copyLinkBtn = document.querySelector('#copyLink');
    this.changeRoomBtn = document.querySelector('#changeRoom');
    this.notificationSettingsBtn = document.querySelector('#notificationSettings');
    this.connectionSettingsBtn = document.querySelector('#connectionSettings');
    this.openSettingsBtn = document.querySelector('#openSettings');
    this.userSearch = document.querySelector('#userSearch');
    
    // Notification settings modal
    this.notificationModal = document.querySelector('#notificationModal');
    this.enableNotificationsCheckbox = document.querySelector('#enableNotifications');
    this.enableSoundsCheckbox = document.querySelector('#enableSounds');
    this.closeNotificationSettingsBtn = document.querySelector('#closeNotificationSettings');
    this.testNotificationBtn = document.querySelector('#testNotification');

    // Connection Settings modal elements
    this.connectionModal = document.querySelector('#connectionModal');
    this.stunListInput = document.querySelector('#stunListInput');
    this.turnUrlInput = document.querySelector('#turnUrlInput');
    this.turnUserInput = document.querySelector('#turnUserInput');
    this.turnCredInput = document.querySelector('#turnCredInput');
    this.saveIceBtn = document.querySelector('#saveIceConfig');
    this.testIceBtn = document.querySelector('#testIceConfig');
    this.closeConnectionBtn = document.querySelector('#closeConnectionSettings');
    
    // Call UI elements
    this.userSelectModal = document.querySelector('#userSelectModal');
    this.userSelectList = document.querySelector('#userSelectList');
    this.incomingCallToast = document.querySelector('#incomingCallToast');
    this.incomingCallInfo = document.querySelector('#incomingCallInfo');
    this.acceptCallBtn = document.querySelector('#acceptCall');
    this.declineCallBtn = document.querySelector('#declineCall');
    this.callModal = document.querySelector('#callModal');
    this.callIdentity = document.querySelector('#callIdentity');
    this.callAvatar = document.querySelector('#callAvatar');
    this.callName = document.querySelector('#callName');
    // Audio call specific elements
    this.audioPanel = document.querySelector('#audioPanel');
    this.audioAvatar = document.querySelector('#audioAvatar');
    this.audioName = document.querySelector('#audioName');
    this.audioStatus = document.querySelector('#audioStatus');
    this.audioTimerEl = document.querySelector('#audioTimer');
    this.remoteAudioEl = document.querySelector('#remoteAudio');
    this._audioTimer = null;
    this._audioElapsed = 0;
    
    // Call control buttons
    this.audioCallBtn = document.querySelector('#audioCall');
    this.videoCallBtn = document.querySelector('#videoCall');
    this.toggleMuteBtn = document.querySelector('#toggleMute');
    this.toggleVideoBtn = document.querySelector('#toggleVideo');
    this.shareScreenBtn = document.querySelector('#shareScreen');
    this.togglePipBtn = document.querySelector('#togglePip');
    this.toggleFitBtn = document.querySelector('#toggleFit');
    this.toggleSpeakerBtn = document.querySelector('#toggleSpeaker');
    this.endCallBtn = document.querySelector('#endCall');

    // Settings modal elements
    this.settingsModal = document.querySelector('#settingsModal');
    this.settingsTabProfile = document.querySelector('#settingsTabProfile');
    this.settingsTabPrefs = document.querySelector('#settingsTabPrefs');
    this.settingsTabConn = document.querySelector('#settingsTabConn');
    this.settingsPanelProfile = document.querySelector('#settingsPanelProfile');
    this.settingsPanelPrefs = document.querySelector('#settingsPanelPrefs');
    this.settingsPanelConn = document.querySelector('#settingsPanelConn');
    this.settingsCloseBtn = document.querySelector('#settingsClose');
    this.settingsSaveProfileBtn = document.querySelector('#settingsSaveProfile');
    this.settingsAvatarPreview = document.querySelector('#settingsAvatarPreview');
    this.settingsAvatarInput = document.querySelector('#settingsAvatarInput');
    this.settingsAvatarChangeBtn = document.querySelector('#settingsAvatarChange');
    this.settingsAvatarClearBtn = document.querySelector('#settingsAvatarClear');
    this.settingsDisplayName = document.querySelector('#settingsDisplayName');
    this.settingsBio = document.querySelector('#settingsBio');

    // Prefs controls
    this.prefEnableNotifications = document.querySelector('#prefEnableNotifications');
    this.prefEnableSounds = document.querySelector('#prefEnableSounds');
    this.prefTestNotification = document.querySelector('#prefTestNotification');
    this.themeLightBtn = document.querySelector('#themeLight');
    this.themeDarkBtn = document.querySelector('#themeDark');
    this.prefStunList = document.querySelector('#prefStunList');
    this.prefTurnUrl = document.querySelector('#prefTurnUrl');
    this.prefTurnUser = document.querySelector('#prefTurnUser');
    this.prefTurnCred = document.querySelector('#prefTurnCred');
    this.prefConnTest = document.querySelector('#prefConnTest');
    this.prefConnSave = document.querySelector('#prefConnSave');

    // Profile view modal
    this.profileViewModal = document.querySelector('#profileViewModal');
    this.profileViewAvatar = document.querySelector('#profileViewAvatar');
    this.profileViewDisplay = document.querySelector('#profileViewDisplay');
    this.profileViewUsername = document.querySelector('#profileViewUsername');
    this.profileViewBio = document.querySelector('#profileViewBio');
    this.profileViewCloseBtn = document.querySelector('#profileViewClose');
    this.profileViewMessageBtn = document.querySelector('#profileViewMessage');

    // Now that all elements are referenced, set up listeners and theme
    this.initializeEventListeners();
    this.initializeTheme();
  }

  // ------- Profiles helper -------
  async fetchProfile(username) {
    const u = String(username || '').trim().toLowerCase();
    if (!u) return null;
    try {
      const res = await fetch(`/api/profile/${encodeURIComponent(u)}`);
      const data = await res.json();
      return data?.profile || null;
    } catch { return null; }
  }

  // Settings modal methods
  showSettings(defaultTab = 'profile') {
    this.showSettingsTab(defaultTab);
    this.loadSelfProfile();
    if (this.settingsModal) this.settingsModal.hidden = false;
  }
  hideSettings() {
    if (this.settingsModal) this.settingsModal.hidden = true;
  }
  showSettingsTab(tab) {
    const tabs = ['profile','prefs','conn'];
    tabs.forEach(t => {
      const btn = this[`settingsTab${t.charAt(0).toUpperCase()+t.slice(1)}`];
      const panel = this[`settingsPanel${t.charAt(0).toUpperCase()+t.slice(1)}`];
      if (btn) btn.classList.toggle('active', t === tab);
      if (panel) panel.style.display = t === tab ? 'grid' : 'none';
    });
  }

  async loadSelfProfile() {
    const username = window.authManager?.getAuthUsername();
    if (!username) return;
    try {
      const res = await fetch(`/api/profile/${encodeURIComponent(username)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed');
      const p = data.profile || {};
      if (this.settingsDisplayName) this.settingsDisplayName.value = p.displayName || '';
      if (this.settingsBio) this.settingsBio.value = p.bio || '';
      // Store current avatar dataUrl in preview via data attribute
      if (this.settingsAvatarPreview) {
        if (p.avatarDataUrl) {
          this.settingsAvatarPreview.setAttribute('data-img', p.avatarDataUrl);
        } else {
          this.settingsAvatarPreview.removeAttribute('data-img');
        }
        this.renderAvatarPreview(this.settingsAvatarPreview, username, p.avatarDataUrl || '');
      }
    } catch (e) {
      console.warn('Failed to load profile', e);
    }
  }

  async saveSelfProfile() {
    const username = window.authManager?.getAuthUsername();
    if (!username) return;
    const displayName = this.settingsDisplayName?.value?.trim() || '';
    const bio = this.settingsBio?.value?.trim() || '';
    const avatarDataUrl = this.settingsAvatarPreview?.getAttribute('data-img') || '';
    try {
      // Disable button to prevent double clicks
      if (this.settingsSaveProfileBtn) this.settingsSaveProfileBtn.disabled = true;
      const res = await fetch('/api/profile/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, displayName, bio, avatarDataUrl })
      });
      const data = await res.json().catch(() => ({ ok: false, error: 'Invalid server response' }));
      if (!data.ok) {
        this.showToast(data.error || 'Failed to save profile');
        return;
      }
      this.showToast('Profile saved');
      // Refresh avatars across the app
      try { window.chatApp?.onProfileUpdated?.(username); } catch {}
      // Update current user chip avatar
      try { await this.updateCurrentUserChip(username); } catch {}
      this.hideSettings();
    } catch (e) {
      console.error('Profile save failed', e);
      this.showToast(e?.message || 'Failed to save profile');
    } finally {
      if (this.settingsSaveProfileBtn) this.settingsSaveProfileBtn.disabled = false;
    }
  }

  savePrefConnection() {
    const stun = this.prefStunList?.value?.trim() || '';
    const turl = this.prefTurnUrl?.value?.trim() || '';
    const tuser = this.prefTurnUser?.value?.trim() || '';
    const tcred = this.prefTurnCred?.value?.trim() || '';
    localStorage.setItem('ice:stun', stun);
    localStorage.setItem('ice:turn:url', turl);
    localStorage.setItem('ice:turn:user', tuser);
    localStorage.setItem('ice:turn:cred', tcred);
    this.showToast('Connection prefs saved');
  }

  renderAvatarPreview(container, username, dataUrl = '') {
    if (!container) return;
    if (dataUrl) {
      container.style.background = 'transparent';
      container.innerHTML = `<img alt="avatar" src="${dataUrl}" style="width:100%;height:100%;object-fit:cover" />`;
    } else {
      container.innerHTML = this.initials(username || 'U');
      container.style.background = this.stringToGradient(username || 'U');
    }
  }

  async fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (err) => reject(err);
    });
  }

  // Image helpers: compress a data URL to fit byte and dimension limits
  async compressImageDataUrl(dataUrl, { maxBytes = 650 * 1024, maxDimension = 800, qualityStart = 0.9, qualityMin = 0.5 }) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const { width, height } = img;
          const scale = Math.min(1, maxDimension / Math.max(width, height));
          const w = Math.max(1, Math.round(width * scale));
          const h = Math.max(1, Math.round(height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          let q = qualityStart;
          let out = canvas.toDataURL('image/jpeg', q);
          // Loop to reduce quality until under maxBytes or qualityMin reached
          while (this.dataUrlSize(out) > maxBytes && q > qualityMin) {
            q = Math.max(qualityMin, q - 0.1);
            out = canvas.toDataURL('image/jpeg', q);
          }
          resolve(out);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = (e) => reject(e);
      img.src = dataUrl;
    });
  }

  dataUrlSize(dataUrl) {
    try {
      const base64 = String(dataUrl).split(',')[1] || '';
      // 4 base64 chars = 3 bytes
      return Math.floor((base64.length * 3) / 4);
    } catch { return dataUrl?.length || 0; }
  }

  // Onboarding prompt after auth
  async maybePromptProfileOnboarding(username) {
    try {
      const key = `profile:onboardingPrompted:${username}`;
      if (localStorage.getItem(key)) return;
      const res = await fetch(`/api/profile/${encodeURIComponent(username)}`);
      const data = await res.json();
      const p = data?.profile || {};
      const empty = !(p.displayName || p.bio || p.avatarDataUrl);
      if (empty) {
        this.showSettings('profile');
        localStorage.setItem(key, '1');
      }
    } catch {}
  }

  // Profile view modal methods
  async openProfileView(username, userId = null) {
    if (!username) return;
    try {
      const res = await fetch(`/api/profile/${encodeURIComponent(username)}`);
      const data = await res.json();
      const p = data?.profile || { username };
      if (this.profileViewUsername) this.profileViewUsername.textContent = `@${p.username}`;
      if (this.profileViewDisplay) this.profileViewDisplay.textContent = p.displayName || username;
      if (this.profileViewBio) this.profileViewBio.textContent = p.bio || '';
      this.renderAvatarPreview(this.profileViewAvatar, username, p.avatarDataUrl || '');
      if (this.profileViewMessageBtn) {
        const self = (window.authManager?.getAuthUsername() || '').toLowerCase();
        const isSelf = self && self === String(username).toLowerCase();
        this.profileViewMessageBtn.disabled = isSelf;
        this.profileViewMessageBtn.style.display = isSelf ? 'none' : '';
      }
      this._profileViewTarget = { username, userId };
      if (this.profileViewModal) this.profileViewModal.hidden = false;
    } catch (e) {
      console.warn('Failed to open profile view', e);
    }
  }
  hideProfileView() {
    if (this.profileViewModal) this.profileViewModal.hidden = true;
    this._profileViewTarget = null;
  }
  messageFromProfile() {
    if (!this._profileViewTarget) return;
    const other = this._profileViewTarget.username;
    const me = window.chatApp?.getMyName();
    if (!other || !me) return;
    const dm = this.computeDmRoom(me, other);
    this.hideProfileView();
    window.realtimeChatApp?.changeRoom(dm);
  }
  computeDmRoom(a, b) {
    const A = String(a).toLowerCase();
    const B = String(b).toLowerCase();
    const [x, y] = A < B ? [A, B] : [B, A];
    return `dm-${x}--${y}`.slice(0, 64);
  }

  // Connection settings methods
  showConnectionSettings() {
    this.loadIceSettings();
    if (this.connectionModal) this.connectionModal.hidden = false;
  }
  hideConnectionSettings() {
    if (this.connectionModal) this.connectionModal.hidden = true;
  }
  loadIceSettings() {
    if (this.stunListInput) this.stunListInput.value = localStorage.getItem('ice:stun') || '';
    if (this.turnUrlInput) this.turnUrlInput.value = localStorage.getItem('ice:turn:url') || '';
    if (this.turnUserInput) this.turnUserInput.value = localStorage.getItem('ice:turn:user') || '';
    if (this.turnCredInput) this.turnCredInput.value = localStorage.getItem('ice:turn:cred') || '';
  }
  saveIceSettings() {
    const stun = this.stunListInput?.value?.trim() || '';
    const turl = this.turnUrlInput?.value?.trim() || '';
    const tuser = this.turnUserInput?.value?.trim() || '';
    const tcred = this.turnCredInput?.value?.trim() || '';
    localStorage.setItem('ice:stun', stun);
    localStorage.setItem('ice:turn:url', turl);
    localStorage.setItem('ice:turn:user', tuser);
    localStorage.setItem('ice:turn:cred', tcred);
    this.showToast('Connection settings saved');
    this.hideConnectionSettings();
  }
  testIceSettings() {
    try {
      const stunList = (this.stunListInput?.value || '').split(',').map(s => s.trim()).filter(Boolean);
      const servers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        ...stunList.map(u => ({ urls: u }))
      ];
      const turl = this.turnUrlInput?.value?.trim();
      const tuser = this.turnUserInput?.value?.trim();
      const tcred = this.turnCredInput?.value?.trim();
      if (turl) {
        const turnEntry = { urls: turl };
        if (tuser) turnEntry.username = tuser;
        if (tcred) turnEntry.credential = tcred;
        servers.push(turnEntry);
      }
      const pc = new RTCPeerConnection({ iceServers: servers });
      let success = false;
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'checking') this.updateCallStatus('Testing ICE...');
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') success = true;
      };
      pc.createDataChannel('test');
      pc.createOffer().then(o => pc.setLocalDescription(o));
      setTimeout(() => {
        pc.close();
        this.showToast(success ? 'ICE test likely OK' : 'ICE test inconclusive');
      }, 2500);
    } catch (e) {
      console.error('ICE test failed', e);
      this.showToast('ICE test failed');
    }
  }

  initializeEventListeners() {
    // Theme toggle
    if (this.themeToggle) {
      this.themeToggle.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        this.setTheme(next);
      });
    }

    // Join modal
    if (this.joinBtn) {
      this.joinBtn.addEventListener('click', () => this.handleJoinClick());
    }

    if (this.nameInput) {
      this.nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.handleJoinKeyPress();
        }
      });
    }

    if (this.roomInput) {
      this.roomInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.handleJoinKeyPress();
        }
      });
    }

    if (this.changeRoomBtn) {
      this.changeRoomBtn.addEventListener('click', () => {
        this.showJoinModal();
        if (window.chatApp) {
          this.nameInput.value = window.chatApp.getMyName();
          this.roomInput.value = window.chatApp.getMyRoom();
        }
        this.nameInput.focus();
      });
    }

    // Mobile sidebar toggle
    if (this.sidebarToggle) {
      this.sidebarToggle.addEventListener('click', () => {
        const aside = document.querySelector('aside');
        if (aside) {
          aside.classList.toggle('show');
          this.overlay.classList.toggle('show');
          this.sidebarToggle.textContent = aside.classList.contains('show') ? 'Close' : 'Users';
        }
      });
    }
    
    // Close sidebar when clicking overlay
    if (this.overlay) {
      this.overlay.addEventListener('click', () => {
        const aside = document.querySelector('aside');
        if (aside) {
          aside.classList.remove('show');
          this.overlay.classList.remove('show');
          if (this.sidebarToggle) {
            this.sidebarToggle.textContent = 'Users';
          }
        }
      });
    }

    // Copy link
    if (this.copyLinkBtn) {
      this.copyLinkBtn.addEventListener('click', async () => {
        const room = window.chatApp?.getMyRoom() || 'general';
        const url = `${location.origin}${location.pathname}#room=${encodeURIComponent(room)}`;
        await navigator.clipboard.writeText(url);
        this.copyLinkBtn.textContent = 'Copied!';
        setTimeout(() => this.copyLinkBtn.textContent = 'Copy Link', 1200);
      });
    }

    // User search -> filter user list
    if (this.userSearch) {
      this.userSearch.addEventListener('input', () => {
        try { window.chatApp?.renderUserList?.(); } catch {}
        try { window.chatApp?.renderChatList?.(); } catch {}
      });
    }

    // Call buttons
    if (this.audioCallBtn) {
      this.audioCallBtn.addEventListener('click', () => this.showUserSelect('audio'));
    }
    if (this.videoCallBtn) {
      this.videoCallBtn.addEventListener('click', () => this.showUserSelect('video'));
    }

    // Call controls
    if (this.toggleMuteBtn) {
      this.toggleMuteBtn.addEventListener('click', () => {
        if (window.webrtcManager) {
          window.webrtcManager.toggleMute();
        }
      });
    }
    if (this.toggleVideoBtn) {
      this.toggleVideoBtn.addEventListener('click', () => {
        if (window.webrtcManager) {
          window.webrtcManager.toggleVideo();
        }
      });
    }
    if (this.shareScreenBtn) {
      this.shareScreenBtn.addEventListener('click', () => {
        if (window.webrtcManager) {
          window.webrtcManager.toggleScreenShare();
        }
      });
    }
    if (this.togglePipBtn) {
      this.togglePipBtn.addEventListener('click', () => {
        if (window.webrtcManager) {
          window.webrtcManager.togglePictureInPicture();
        }
      });
    }
    if (this.toggleFitBtn) {
      this.toggleFitBtn.addEventListener('click', () => {
        if (window.webrtcManager) {
          window.webrtcManager.toggleRemoteFitMode();
        }
      });
    }
    if (this.toggleSpeakerBtn) {
      this.toggleSpeakerBtn.addEventListener('click', () => {
        if (window.webrtcManager) {
          window.webrtcManager.toggleSpeaker();
        }
      });
    }
    if (this.endCallBtn) {
      this.endCallBtn.addEventListener('click', () => {
        if (window.webrtcManager) {
          window.webrtcManager.endCall(true);
        }
      });
    }

    // Call toast buttons
    if (this.acceptCallBtn) {
      this.acceptCallBtn.addEventListener('click', () => this.acceptCall());
    }
    if (this.declineCallBtn) {
      this.declineCallBtn.addEventListener('click', () => this.declineCall());
    }

    // Notification settings
    if (this.notificationSettingsBtn) {
      this.notificationSettingsBtn.addEventListener('click', () => this.showNotificationSettings());
    }
    if (this.closeNotificationSettingsBtn) {
      this.closeNotificationSettingsBtn.addEventListener('click', () => this.hideNotificationSettings());
    }
    if (this.testNotificationBtn) {
      this.testNotificationBtn.addEventListener('click', () => this.testNotification());
    }
    if (this.enableNotificationsCheckbox) {
      this.enableNotificationsCheckbox.addEventListener('change', (e) => {
        if (e.target.checked && window.notificationManager) {
          window.notificationManager.requestPermission();
        }
      });
    }
    if (this.enableSoundsCheckbox) {
      this.enableSoundsCheckbox.addEventListener('change', (e) => {
        if (window.notificationManager) {
          window.notificationManager.setSoundEnabled(e.target.checked);
        }
      });
    }

    // Connection settings events
    if (this.connectionSettingsBtn) {
      this.connectionSettingsBtn.addEventListener('click', () => this.showConnectionSettings());
    }
    if (this.saveIceBtn) {
      this.saveIceBtn.addEventListener('click', () => this.saveIceSettings());
    }
    if (this.testIceBtn) {
      this.testIceBtn.addEventListener('click', () => this.testIceSettings());
    }
    if (this.closeConnectionBtn) {
      this.closeConnectionBtn.addEventListener('click', () => this.hideConnectionSettings());
    }

    // Settings modal wiring
    if (this.openSettingsBtn) {
      this.openSettingsBtn.addEventListener('click', () => this.showSettings('profile'));
    }
    const currentUserChip = document.querySelector('#currentUserChip');
    if (currentUserChip) {
      currentUserChip.addEventListener('click', () => this.showSettings('profile'));
      currentUserChip.style.cursor = 'pointer';
      currentUserChip.title = 'Open Settings';
    }
    if (this.settingsTabProfile) this.settingsTabProfile.addEventListener('click', () => this.showSettingsTab('profile'));
    if (this.settingsTabPrefs) this.settingsTabPrefs.addEventListener('click', () => this.showSettingsTab('prefs'));
    if (this.settingsTabConn) this.settingsTabConn.addEventListener('click', () => this.showSettingsTab('conn'));
    if (this.settingsCloseBtn) this.settingsCloseBtn.addEventListener('click', () => this.hideSettings());
    if (this.settingsSaveProfileBtn) this.settingsSaveProfileBtn.addEventListener('click', () => this.saveSelfProfile());
    if (this.settingsAvatarChangeBtn && this.settingsAvatarInput) {
      this.settingsAvatarChangeBtn.addEventListener('click', () => this.settingsAvatarInput.click());
      this.settingsAvatarInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const raw = await this.fileToDataUrl(file);
          const dataUrl = await this.compressImageDataUrl(raw, { maxBytes: 650 * 1024, maxDimension: 800 });
          this.settingsAvatarPreview.setAttribute('data-img', dataUrl);
          this.renderAvatarPreview(this.settingsAvatarPreview, window.authManager?.getAuthUsername() || 'U', dataUrl);
        } catch (err) {
          console.warn('Avatar processing failed', err);
          this.showToast('Could not process image. Please choose a smaller image.');
        }
      });
    }
    if (this.settingsAvatarClearBtn) {
      this.settingsAvatarClearBtn.addEventListener('click', () => {
        this.settingsAvatarPreview.removeAttribute('data-img');
        this.renderAvatarPreview(this.settingsAvatarPreview, window.authManager?.getAuthUsername() || 'U', '');
      });
    }

    // Profile view modal actions
    if (this.profileViewCloseBtn) this.profileViewCloseBtn.addEventListener('click', () => this.hideProfileView());
    if (this.profileViewMessageBtn) this.profileViewMessageBtn.addEventListener('click', () => this.messageFromProfile());

    // Make local video draggable
    const localVideo = document.querySelector('#localVideo');
    if (localVideo) {
      this.makeDraggable(localVideo);
    }

    // Call overlay auto-hide
    if (this.callModal) {
      let overlayTimeout;
      this.callModal.addEventListener('mousemove', () => {
        const overlay = this.callModal.querySelector('.call-overlay');
        if (overlay) {
          overlay.style.opacity = 1;
          clearTimeout(overlayTimeout);
          overlayTimeout = setTimeout(() => {
            overlay.style.opacity = 0;
          }, 3000);
        }
      });
    }
  }

  initializeTheme() {
    const savedTheme = localStorage.getItem('chat:theme') || 'dark';
    this.setTheme(savedTheme);
    this.loadNotificationSettings();
    this.loadIceSettings();
    // Preload prefs panel values
    if (this.prefEnableNotifications && window.notificationManager) {
      this.prefEnableNotifications.checked = Notification.permission === 'granted';
    }
    if (this.prefEnableSounds && window.notificationManager) {
      this.prefEnableSounds.checked = window.notificationManager.getSoundEnabled();
    }
    if (this.prefStunList) this.prefStunList.value = localStorage.getItem('ice:stun') || '';
    if (this.prefTurnUrl) this.prefTurnUrl.value = localStorage.getItem('ice:turn:url') || '';
    if (this.prefTurnUser) this.prefTurnUser.value = localStorage.getItem('ice:turn:user') || '';
    if (this.prefTurnCred) this.prefTurnCred.value = localStorage.getItem('ice:turn:cred') || '';
  }

  loadNotificationSettings() {
    // Load notification settings
    if (this.enableSoundsCheckbox && window.notificationManager) {
      this.enableSoundsCheckbox.checked = window.notificationManager.getSoundEnabled();
    }
    if (this.enableNotificationsCheckbox) {
      this.enableNotificationsCheckbox.checked = Notification.permission === 'granted';
    }
  }

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('chat:theme', theme);
  }

  // Join modal methods
  showJoinModal() {
    if (this.joinModal) {
      this.joinModal.hidden = false;
    }
  }

  hideJoinModal() {
    if (this.joinModal) {
      this.joinModal.hidden = true;
    }
  }

  // Lock or unlock the name input in the Join modal
  setNameInputLocked(locked, username = '') {
    if (!this.nameInput) return;
    if (locked) {
      this.nameInput.value = username || this.nameInput.value;
      this.nameInput.setAttribute('disabled', 'true');
      this.nameInput.classList.add('input-disabled');
    } else {
      this.nameInput.removeAttribute('disabled');
      this.nameInput.classList.remove('input-disabled');
    }
  }

  handleJoinClick() {
    const name = this.nameInput?.value.trim();
    const room = this.roomInput?.value.trim().toLowerCase() || 'general';
    
    if (!name) {
      if (this.nameInput) this.nameInput.focus();
      return;
    }

    if (window.chatApp) {
      window.chatApp.setMyName(name);
      window.chatApp.setMyRoom(room);
    }

    this.hideJoinModal();
    location.hash = `room=${encodeURIComponent(room)}`;
    
    // Trigger app start
    if (window.startChat) {
      window.startChat();
    }
  }

  handleJoinKeyPress() {
    const name = this.nameInput?.value.trim();
    const room = this.roomInput?.value.trim();
    
    if (name && room) {
      this.joinBtn?.click();
    } else if (!name) {
      this.nameInput?.focus();
    } else {
      this.roomInput?.focus();
    }
  }

  // Call UI methods
  showUserSelect(callType) {
    if (!window.chatApp) return;
    
    const online = window.chatApp.getOnlineUsers();
    const selfId = window.chatApp.getSelfId();
    
    if (online.size <= 1) { 
      alert('No one else is online.'); 
      return; 
    }

    if (this.userSelectList) {
      this.userSelectList.innerHTML = '';
      for (const [id, username] of online) {
        if (id === selfId) continue;
        const div = document.createElement('div');
        div.className = 'user callable';
        div.innerHTML = `
          <div class="avatar" style="background:${this.stringToGradient(username)}">
            ${this.initials(username)}
          </div> 
          <div class="uname">${this.escapeHtml(username)}</div>
        `;
        div.onclick = () => {
          this.hideUserSelectModal();
          this.initiateCall(id, callType);
        };
        this.userSelectList.appendChild(div);
      }
    }
    
    if (this.userSelectModal) {
      this.userSelectModal.hidden = false;
    }
  }

  hideUserSelectModal() {
    if (this.userSelectModal) {
      this.userSelectModal.hidden = true;
    }
  }

  initiateCall(targetId, callType) {
    // Use app controller to initiate a call request; the RTC offer
    // will only be created after the callee accepts.
    if (window.realtimeChatApp) {
      window.realtimeChatApp.startCall(targetId, callType);
      this.showCallModal();
      // If audio call, immediately show audio UI while ringing
      if (callType === 'audio') {
        const uname = window.chatApp?.getUsername(targetId) || 'User';
        this.enterAudioMode(uname);
        this.setAudioRinging(true);
        this.updateAudioStatus('Ringing…');
        // Set call identity for audio calls
        this.setCallIdentity(uname);
      } else {
        // Set call identity for video calls as well
        const uname = window.chatApp?.getUsername(targetId) || 'User';
        this.setCallIdentity(uname);
      }
    }
  }

  showIncomingCallToast(fromUsername, callType) {
    if (this.incomingCallInfo) {
      this.incomingCallInfo.innerHTML = `<strong>${this.escapeHtml(fromUsername)}</strong> is starting a ${callType} call.`;
    }
    if (this.incomingCallToast) {
      this.incomingCallToast.hidden = false;
    }
  }

  hideIncomingCallToast() {
    if (this.incomingCallToast) {
      this.incomingCallToast.hidden = true;
    }
  }

  // Topbar current user chip
  async updateCurrentUserChip(username) {
    const chip = document.querySelector('#currentUserChip');
    const av = document.querySelector('#currentUserAvatar');
    const nm = document.querySelector('#currentUserName');
    if (!chip || !av || !nm) return;
    const name = (username || '').trim();
    if (!name) {
      chip.hidden = true;
      return;
    }
    chip.hidden = false;
    nm.textContent = name;
    try {
      const res = await fetch(`/api/profile/${encodeURIComponent(name.toLowerCase())}`);
      const data = await res.json();
      const p = data?.profile || {};
      this.renderAvatarPreview(av, name, p.avatarDataUrl || '');
    } catch {
      // Fallback
      av.textContent = this.initials(name);
      av.style.background = this.stringToGradient(name);
    }
  }

  acceptCall() {
    this.hideIncomingCallToast();
    const targetId = window.webrtcManager?.getCallTargetId();
    const callType = window.webrtcManager?.getCallType() || 'video';
    if (targetId && window.socketManager && window.webrtcManager) {
      console.log(`Accepting ${callType} call from ${targetId}`);
      // Inform caller that we accept; caller will create offer.
      window.socketManager.acceptCall(targetId);
      // Prepare local media while waiting for offer
      window.webrtcManager.acceptCall(targetId, callType);
      this.showCallModal();
    }
  }

  declineCall() {
    this.hideIncomingCallToast();
    const targetId = window.webrtcManager?.getCallTargetId();
    if (targetId && window.socketManager) {
      // Notify caller that we decline before any RTC starts
      window.socketManager.declineCall(targetId);
    }
    // Reset any local pending state without sending hangup
    if (window.webrtcManager) {
      window.webrtcManager.cleanup();
    }
  }

  showCallModal() {
    if (this.callModal) {
      this.callModal.hidden = false;
    }
  }

  hideCallModal() {
    if (this.callModal) {
      this.callModal.hidden = true;
    }
    this.hideUserSelectModal();
    this.hideIncomingCallToast();
    this.exitAudioMode();
  }

  // --- Audio mode helpers ---
  setCallUIMode(mode) {
    if (!this.callModal) return;
    if (mode === 'audio') {
      this.callModal.classList.add('audio-mode');
      if (this.audioPanel) this.audioPanel.hidden = false;
    } else {
      this.exitAudioMode();
    }
  }

  async enterAudioMode(username = 'User') {
    this.setCallUIMode('audio');
    try {
      const prof = await this.fetchProfile(username);
      const display = (prof?.displayName && prof.displayName.trim()) || username;
      if (this.audioName) this.audioName.textContent = display;
      if (this.audioAvatar) {
        if (prof?.avatarDataUrl) {
          this.audioAvatar.style.background = 'transparent';
          this.audioAvatar.innerHTML = `<img alt="avatar" src="${prof.avatarDataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />`;
        } else {
          this.audioAvatar.innerHTML = (username || 'U').slice(0,1).toUpperCase();
          this.audioAvatar.style.background = this.stringToGradient(username);
        }
      }
    } catch {
      if (this.audioName) this.audioName.textContent = username;
      if (this.audioAvatar) {
        this.audioAvatar.innerHTML = (username || 'U').slice(0,1).toUpperCase();
        this.audioAvatar.style.background = this.stringToGradient(username);
      }
    }
    // Also set the shared call identity chip
    this.setCallIdentity(username);
    if (this.audioStatus) this.audioStatus.textContent = 'Ringing…';
    if (this.audioTimerEl) this.audioTimerEl.hidden = true;
    this.setAudioRinging(true);
  }

  exitAudioMode() {
    if (!this.callModal) return;
    this.callModal.classList.remove('audio-mode');
    if (this.audioPanel) this.audioPanel.hidden = true;
    this.stopAudioTimer();
  }

  updateAudioStatus(text) {
    if (this.audioStatus) this.audioStatus.textContent = text;
  }

  setAudioRinging(isRinging) {
    if (this.audioAvatar) {
      this.audioAvatar.classList.toggle('ringing', !!isRinging);
    }
  }

  startAudioTimer() {
    if (!this.audioTimerEl) return;
    this._audioElapsed = 0;
    this.audioTimerEl.hidden = false;
    this._audioTimer = setInterval(() => {
      this._audioElapsed++;
      const m = String(Math.floor(this._audioElapsed / 60)).padStart(2,'0');
      const s = String(this._audioElapsed % 60).padStart(2,'0');
      this.audioTimerEl.textContent = `${m}:${s}`;
    }, 1000);
  }

  stopAudioTimer() {
    if (this._audioTimer) {
      clearInterval(this._audioTimer);
      this._audioTimer = null;
    }
    if (this.audioTimerEl) this.audioTimerEl.hidden = true;
  }

  // Utility methods
  makeDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    element.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e = e || window.event;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      
      const newTop = element.offsetTop - pos2;
      const newLeft = element.offsetLeft - pos1;

      element.style.top = newTop + 'px';
      element.style.left = newLeft + 'px';
      element.style.bottom = 'auto';
      element.style.right = 'auto';
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  stringToGradient(s) {
    const h1 = Math.abs(this.hashCode(s)) % 360;
    const h2 = (h1 + 50) % 360;
    return `linear-gradient(135deg, hsl(${h1},70%,55%), hsl(${h2},70%,55%))`;
  }

  hashCode(str) {
    let h = 0; 
    for (let i=0; i<str.length; i++) { 
      h = (h<<5) - h + str.charCodeAt(i); 
      h |= 0; 
    }
    return h;
  }

  initials(name) {
    return name.trim().slice(0,1).toUpperCase();
  }

  escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // Show/hide methods for external use
  showModal(modalId) {
    const modal = document.querySelector(`#${modalId}`);
    if (modal) modal.hidden = false;
  }

  hideModal(modalId) {
    const modal = document.querySelector(`#${modalId}`);
    if (modal) modal.hidden = true;
  }

  showToast(message, duration = 3000) {
    // Create a temporary toast
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<div>${this.escapeHtml(message)}</div>`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.hidden = true;
      setTimeout(() => document.body.removeChild(toast), 300);
    }, duration);
  }

  updateCallStatus(status) {
    const callStatus = document.querySelector('#callStatus');
    if (callStatus) {
      callStatus.textContent = status;
    }
  }

  // Notification settings methods
  showNotificationSettings() {
    this.loadNotificationSettings();
    if (this.notificationModal) {
      this.notificationModal.hidden = false;
    }
  }

  hideNotificationSettings() {
    if (this.notificationModal) {
      this.notificationModal.hidden = true;
    }
  }

  testNotification() {
    if (window.notificationManager) {
      window.notificationManager.showNotification('Test Notification', {
        body: 'This is a test notification from your chat app!',
        forceShow: true
      });
      window.notificationManager.playSound('message');
    }
  }

  // Call state management
  onCallStateChange(state) {
    switch (state) {
      case 'idle':
        this.hideCallModal();
        break;
      case 'calling': {
        // Caller side (ringing)
        if (window.webrtcManager?.getCallType() === 'audio') {
          const name = window.chatApp?.getUsername(window.webrtcManager?.getCallTargetId()) || 'User';
          this.enterAudioMode(name);
          this.updateAudioStatus('Ringing…');
          this.setAudioRinging(true);
        } else {
          this.exitAudioMode();
        }
        break;
      }
      case 'receiving': {
        // Callee side (incoming)
        if (window.webrtcManager?.getCallType() === 'audio') {
          const name = window.chatApp?.getUsername(window.webrtcManager?.getCallTargetId()) || 'User';
          this.enterAudioMode(name);
          this.updateAudioStatus('Ringing…');
          this.setAudioRinging(true);
        } else {
          this.exitAudioMode();
        }
        break;
      }
      case 'connecting': {
        if (window.webrtcManager?.getCallType() === 'audio') {
          this.updateAudioStatus('Connecting…');
          this.setAudioRinging(false);
        } else {
          this.exitAudioMode();
        }
        // Modal should already be shown
        break;
      }
      case 'connected': {
        if (window.webrtcManager?.getCallType() === 'audio') {
          this.updateAudioStatus('Connected');
          this.setAudioRinging(false);
          this.startAudioTimer();
        } else {
          this.exitAudioMode();
        }
        break;
      }
      default:
        break;
    }
  }
}

// Export for use in other modules
window.UIManager = UIManager;
