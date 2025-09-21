// Main Application Module
class RealtimeChatApp {
  constructor() {
    this.chatManager = null;
    this.webrtcManager = null;
    this.uiManager = null;
    this.socketManager = null;
    this.notificationManager = null;
    this.isInitialized = false;
    this._callAttemptTimer = null;
  }

  async initialize() {
    if (this.isInitialized) return;

    console.log('Initializing Realtime Chat App...');

    // Initialize managers
    this.chatManager = new ChatManager();
    this.webrtcManager = new WebRTCManager();
    this.uiManager = new UIManager();
    this.socketManager = new SocketManager();
    this.notificationManager = new NotificationManager();

    // Set up manager relationships
    this.socketManager.setManagers(this.chatManager, this.webrtcManager, this.uiManager, this.notificationManager);
    
    // Set up WebRTC callbacks
    this.webrtcManager.setCallbacks({
      onCallStateChange: (state) => this.uiManager.onCallStateChange(state),
      onCallStatusUpdate: (status) => this.uiManager.updateCallStatus(status)
    });

    // Make managers globally available
    window.chatApp = this.chatManager;
    window.webrtcManager = this.webrtcManager;
    window.uiManager = this.uiManager;
    window.socketManager = this.socketManager;
    window.notificationManager = this.notificationManager;

    // Set up global start function
    window.startChat = () => this.startChat();

    this.isInitialized = true;
    console.log('App initialized successfully');

    // Require authentication first
    this.checkAutoStart();
  }

  checkAutoStart() {
    const authName = window.authManager?.getAuthUsername();
    if (!authName) {
      console.log('No authenticated user. Showing auth modal.');
      window.authManager?.show();
      return;
    }
    // Authenticated: set username and proceed
    this.chatManager.setMyName(authName);
    this.uiManager.setNameInputLocked?.(true, authName);
    this.uiManager.updateCurrentUserChip?.(authName);
    // Prompt profile onboarding if profile is empty (photo/bio)
    this.uiManager.maybePromptProfileOnboarding?.(authName);

    // Parse room from hash or use stored room
    const roomFromHash = this.chatManager.parseRoomFromHash();
    if (roomFromHash) {
      this.chatManager.setMyRoom(roomFromHash);
      this.startChat();
      return;
    }
    const storedRoom = localStorage.getItem('chat:room') || 'general';
    this.chatManager.setMyRoom(storedRoom);
    location.hash = `room=${encodeURIComponent(storedRoom)}`;
    this.startChat();
  }

  onAuthenticated(username) {
    console.log('Authenticated as', username);
    this.chatManager.setMyName(username);
    localStorage.setItem('chat:name', username);
    this.uiManager.setNameInputLocked?.(true, username);
    this.uiManager.updateCurrentUserChip?.(username);
    // Suggest updating profile on first login
    this.uiManager.maybePromptProfileOnboarding?.(username);
    // After login, either join the room from hash or auto-join stored/default room
    const roomFromHash = this.chatManager.parseRoomFromHash();
    if (roomFromHash) {
      this.chatManager.setMyRoom(roomFromHash);
      this.startChat();
      return;
    }
    const storedRoom = localStorage.getItem('chat:room') || 'general';
    this.chatManager.setMyRoom(storedRoom);
    location.hash = `room=${encodeURIComponent(storedRoom)}`;
    this.startChat();
  }

  async startChat() {
    try {
      console.log('Starting chat...');
      
      // Hide join modal
      this.uiManager.hideJoinModal();
      
      // Connect socket
      const socket = this.socketManager.connect();
      
      // Wait for connection
      await new Promise((resolve, reject) => {
        if (socket.connected) {
          resolve();
          return;
        }
        
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
        
        // Timeout after 10 seconds
        setTimeout(() => reject(new Error('Connection timeout')), 10000);
      });

      console.log('Socket connected, joining room...');
      
      // Join room
      const response = await this.socketManager.joinRoom(
        this.chatManager.getMyName(),
        this.chatManager.getMyRoom()
      );
      
      console.log('Successfully joined room:', response.room);
      
    } catch (error) {
      console.error('Failed to start chat:', error);
      alert('Failed to connect to chat. Please try again.');
      this.uiManager.showJoinModal();
      const nameInput = document.querySelector('#nameInput');
      if (nameInput) nameInput.focus();
    }
  }

  // Public API methods
  sendMessage(text, file = null) {
    return this.chatManager.sendMessage(text, file);
  }

  startCall(targetId, callType = 'video') {
    if (this.webrtcManager.isInCall()) {
      alert('You are already in a call');
      return;
    }
    
    // Set WebRTC manager state for the caller
    this.webrtcManager.callTargetId = targetId;
    this.webrtcManager.callType = callType;
    this.webrtcManager.callState = 'calling';
    
    this.socketManager.requestCall(targetId, callType);
    // Show call modal with Ringing… and start ringback
    const targetName = this.chatManager.getUsername(targetId) || 'User';
    this.uiManager.showCallModal();
    this.uiManager.updateCallStatus(`Ringing… ${targetName}`);
    this.startRingback();
    // Auto-cancel after 30s if no answer
    this.clearCallAttemptTimer();
    this._callAttemptTimer = setTimeout(() => {
      if (this.webrtcManager.getCallState() === 'calling') {
        this.uiManager.showToast('No answer');
        this.endCall();
      }
    }, 30000);
  }

  endCall() {
    if (this.webrtcManager.isInCall()) {
      this.webrtcManager.endCall(true);
    }
    this.stopRingback();
    this.clearCallAttemptTimer();
  }

  toggleMute() {
    this.webrtcManager.toggleMute();
  }

  toggleVideo() {
    this.webrtcManager.toggleVideo();
  }

  toggleScreenShare() {
    this.webrtcManager.toggleScreenShare();
  }

  togglePictureInPicture() {
    this.webrtcManager.togglePictureInPicture();
  }

  changeRoom(newRoom) {
    if (this.socketManager.isConnected()) {
      this.socketManager.disconnect();
    }
    
    this.chatManager.setMyRoom(newRoom);
    location.hash = `room=${encodeURIComponent(newRoom)}`;
    this.startChat();
  }

  changeName(newName) {
    this.chatManager.setMyName(newName);
    localStorage.setItem('chat:name', newName);
  }

  // Ringback helpers
  startRingback() {
    try { window.notificationManager?.startRingback(); } catch {}
  }
  stopRingback() {
    try { window.notificationManager?.stopRingback(); } catch {}
  }
  clearCallAttemptTimer() {
    if (this._callAttemptTimer) { clearTimeout(this._callAttemptTimer); this._callAttemptTimer = null; }
  }

  // Getters
  isConnected() {
    return this.socketManager.isConnected();
  }

  isInCall() {
    return this.webrtcManager.isInCall();
  }

  getCallState() {
    return this.webrtcManager.getCallState();
  }

  getOnlineUsers() {
    return this.chatManager.getOnlineUsers();
  }

  getCurrentRoom() {
    return this.chatManager.getMyRoom();
  }

  getCurrentUser() {
    return {
      id: this.chatManager.getSelfId(),
      name: this.chatManager.getMyName(),
      room: this.chatManager.getMyRoom()
    };
  }

  // Theme management
  setTheme(theme) {
    this.uiManager.setTheme(theme);
  }

  getTheme() {
    return document.documentElement.getAttribute('data-theme');
  }

  // Utility methods
  showToast(message, duration = 3000) {
    this.uiManager.showToast(message, duration);
  }

  copyRoomLink() {
    const room = this.chatManager.getMyRoom();
    const url = `${location.origin}${location.pathname}#room=${encodeURIComponent(room)}`;
    navigator.clipboard.writeText(url).then(() => {
      this.showToast('Room link copied to clipboard!');
    });
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing app...');
  const app = new RealtimeChatApp();
  window.realtimeChatApp = app;
  app.initialize();
});

// Export for use in other modules
window.RealtimeChatApp = RealtimeChatApp;
