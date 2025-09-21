// Notification System Module
class NotificationManager {
  constructor() {
    this.permission = 'default';
    this.isDocumentVisible = true;
    this.soundEnabled = this.getSoundEnabled();
    this.notificationQueue = [];
    this._ringbackTimer = null;
    
    this.initializeVisibilityAPI();
    this.requestPermission();
    this.createNotificationSounds();
  }

  async requestPermission() {
    if ('Notification' in window) {
      this.permission = await Notification.requestPermission();
      console.log('Notification permission:', this.permission);
    }
  }

  initializeVisibilityAPI() {
    document.addEventListener('visibilitychange', () => {
      this.isDocumentVisible = !document.hidden;
    });
  }

  createNotificationSounds() {
    // Create simple beep sounds using Web Audio API
    this.sounds = {
      message: this.createBeepSound(800, 0.1),
      call: this.createBeepSound(1000, 0.3)
    };
  }

  createBeepSound(frequency, duration) {
    return {
      play: () => {
        if (!this.soundEnabled) return;
        try {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.frequency.value = frequency;
          oscillator.type = 'sine';
          
          gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
          
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + duration);
        } catch (e) {
          console.log('Sound play failed:', e);
        }
      }
    };
  }

  playSound(type = 'message') {
    if (this.soundEnabled && this.sounds[type]) {
      this.sounds[type].play();
    }
  }

  // Ringback control for outgoing calls
  startRingback() {
    this.stopRingback();
    // Play call tone every 1.2 seconds
    this._ringbackTimer = setInterval(() => {
      this.playSound('call');
    }, 1200);
  }

  stopRingback() {
    if (this._ringbackTimer) {
      clearInterval(this._ringbackTimer);
      this._ringbackTimer = null;
    }
  }

  showNotification(title, options = {}) {
    // Don't show notification if document is visible and it's not a call
    if (this.isDocumentVisible && !options.forceShow) {
      return;
    }

    if (this.permission === 'granted') {
      const notification = new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...options
      });

      // Auto close after 5 seconds
      setTimeout(() => notification.close(), 5000);

      return notification;
    }
  }

  notifyNewMessage(username, message, isFile = false) {
    const title = `New message from ${username}`;
    const body = isFile ? '📎 Sent a file' : message.substring(0, 100);
    
    this.showNotification(title, {
      body,
      tag: 'new-message',
      icon: '/favicon.ico'
    });

    this.playSound('message');
    this.showInAppPopup({ username, message: body });
  }

  notifyIncomingCall(username, callType) {
    const title = `Incoming ${callType} call`;
    const body = `${username} is calling you`;
    
    const notification = this.showNotification(title, {
      body,
      tag: 'incoming-call',
      requireInteraction: true,
      forceShow: true,
      actions: [
        { action: 'accept', title: 'Accept' },
        { action: 'decline', title: 'Decline' }
      ]
    });

    this.playSound('call');
    
    // Bring the tab to front on click and show the incoming toast
    if (notification) {
      notification.onclick = (event) => {
        event.preventDefault();
        window.focus();
        if (window.uiManager) {
          window.uiManager.showIncomingCallToast(username, callType);
        }
        notification.close();
      };
    }
    return notification;
  }

  notifyUserJoined(username) {
    if (!this.isDocumentVisible) {
      this.showNotification('User joined', {
        body: `${username} joined the room`,
        tag: 'user-joined'
      });
    }
    // Optional: surface a subtle in-app popup
    this.showInAppPopup({ username, message: 'joined the room' , subtle: true});
  }

  notifyCallEnded() {
    this.showNotification('Call ended', {
      body: 'The call has been disconnected',
      tag: 'call-ended'
    });
    this.showInAppPopup({ username: 'Call', message: 'Call ended' , subtle: true});
  }

  // In-app WhatsApp-like popup
  showInAppPopup({ username, message, subtle = false }) {
    try {
      const host = document.getElementById('inAppNotifs');
      if (!host) return;
      const card = document.createElement('div');
      card.className = 'inapp-pop';
      const color = this.stringToGradient(username);
      const initials = (username || '?').trim().slice(0,1).toUpperCase();
      card.innerHTML = `
        <div class="avatar" style="background:${color}">${initials}</div>
        <div>
          <div class="title">${this.escapeHtml(username)}</div>
          <div class="preview">${this.escapeHtml(message || '')}</div>
        </div>
        <button class="close" title="Dismiss">✕</button>
      `;
      const closeBtn = card.querySelector('.close');
      closeBtn.addEventListener('click', () => host.removeChild(card));
      host.appendChild(card);
      // Auto dismiss
      setTimeout(() => {
        if (card.parentElement === host) host.removeChild(card);
      }, subtle ? 2500 : 5000);
    } catch (e) {
      console.log('In-app popup failed', e);
    }
  }

  // Small helpers from UI pieces
  stringToGradient(s) {
    let h = Math.abs(this.hashCode(s)) % 360;
    const h2 = (h + 50) % 360;
    return `linear-gradient(135deg, hsl(${h},70%,55%), hsl(${h2},70%,55%))`;
  }
  hashCode(str) {
    let h = 0; for (let i=0; i<str.length; i++) { h = (h<<5) - h + str.charCodeAt(i); h |= 0; }
    return h;
  }
  escapeHtml(s) {
    return (s||'').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }

  // Settings
  setSoundEnabled(enabled) {
    this.soundEnabled = enabled;
    localStorage.setItem('notifications:sound', enabled);
  }

  getSoundEnabled() {
    const saved = localStorage.getItem('notifications:sound');
    return saved !== null ? saved === 'true' : true;
  }
}

// Export for use in other modules
window.NotificationManager = NotificationManager;
