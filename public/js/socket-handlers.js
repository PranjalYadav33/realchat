// Socket Event Handlers Module
class SocketManager {
  constructor() {
    this.socket = null;
    this.chatManager = null;
    this.webrtcManager = null;
    this.uiManager = null;
  }

  setManagers(chatManager, webrtcManager, uiManager, notificationManager = null) {
    this.chatManager = chatManager;
    this.webrtcManager = webrtcManager;
    this.uiManager = uiManager;
    this.notificationManager = notificationManager;
  }

  connect() {
    this.socket = io();
    
    // Set socket reference in other managers
    if (this.chatManager) {
      this.chatManager.setSocket(this.socket);
    }
    if (this.webrtcManager) {
      this.webrtcManager.setSocket(this.socket);
    }

    this.setupEventHandlers();
    return this.socket;
  }

  setupEventHandlers() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect_error', (error) => {
      console.error('Connection failed:', error);
      alert('Failed to connect to server. Please try again.');
      if (this.uiManager) {
        this.uiManager.showJoinModal();
        const nameInput = document.querySelector('#nameInput');
        if (nameInput) nameInput.focus();
      }
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
      // Connection established, ready to join room
    });

    // Chat events
    this.socket.on('chat:message', (message) => {
      if (this.chatManager) {
        this.chatManager.appendOrUpdateMessage(message);
        
        // Show notification for messages from others
        if (this.notificationManager && message.senderId !== this.chatManager.getSelfId()) {
          this.notificationManager.notifyNewMessage(
            message.username, 
            message.text || 'File attachment',
            !!message.file
          );
        }
      }
    });

    // DM notifications (for rooms you're not currently in)
    this.socket.on('dm:notify', ({ room, fromUsername, text, file, ts }) => {
      if (this.chatManager) {
        const preview = file ? `Attachment from ${fromUsername}` : `${fromUsername}: ${text || ''}`;
        this.chatManager.updateRecentWithMessage({ room, text: preview, ts });
      }
      if (this.notificationManager) {
        this.notificationManager.notifyNewMessage(fromUsername, text || (file ? 'Attachment' : ''), !!file);
      }
    });

    // Chat edits
    this.socket.on('chat:edited', ({ id, text, editedAt }) => {
      if (this.chatManager) {
        this.chatManager.applyMessageEdit({ id, text, editedAt });
      }
    });

    // Chat deletes
    this.socket.on('chat:deleted', ({ id }) => {
      if (this.chatManager) {
        this.chatManager.applyMessageDelete({ id });
      }
    });

    // User events
    this.socket.on('user:joined', (data) => {
      if (this.chatManager) {
        this.chatManager.handleUserJoined(data);
        
        // Show notification for new users
        if (this.notificationManager) {
          this.notificationManager.notifyUserJoined(data.username);
        }
      }
    });

    this.socket.on('user:left', (data) => {
      if (this.chatManager) {
        this.chatManager.handleUserLeft(data);
      }
      
      // Handle call partner disconnection
      if (this.webrtcManager && data.id === this.webrtcManager.getCallTargetId()) {
        if (this.chatManager) {
          this.chatManager.addSystemMessage('Call partner disconnected.');
        }
        this.webrtcManager.endCall(false);
      }
    });

    this.socket.on('room:count', (data) => {
      if (this.chatManager) {
        this.chatManager.handleRoomCount(data);
      }
    });

    this.socket.on('user:typing', (data) => {
      if (this.chatManager) {
        this.chatManager.handleTyping(data);
      }
    });

    // Call events
    this.socket.on('call:incoming', ({ fromId, fromUsername, callType }) => {
      console.log('📞 Incoming call from:', fromUsername, 'Type:', callType);
      
      if (this.webrtcManager && this.webrtcManager.getCallState() !== 'idle') {
        console.log('Auto-declining call - already busy');
        this.socket.emit('call:decline', { targetId: fromId });
        return;
      }
      
      console.log('Setting up incoming call state');
      if (this.webrtcManager) {
        this.webrtcManager.callTargetId = fromId;
        this.webrtcManager.callType = callType;
        this.webrtcManager.callState = 'receiving';
      }
      
      if (this.uiManager) {
        this.uiManager.showIncomingCallToast(fromUsername, callType);
        // Set call identity immediately
        try { this.uiManager.setCallIdentity?.(fromUsername); } catch {}
      }
      
      // Show browser notification for incoming call
      if (this.notificationManager) {
        this.notificationManager.notifyIncomingCall(fromUsername, callType);
      }
    });

    this.socket.on('call:accepted', async ({ fromId }) => {
      if (!this.webrtcManager || fromId !== this.webrtcManager.getCallTargetId()) {
        return;
      }
      
      console.log('Call accepted by:', this.chatManager?.getUsername(fromId));
      
      if (this.uiManager) {
        const name = this.chatManager?.getUsername(fromId) || 'User';
        try { this.uiManager.setCallIdentity?.(name); } catch {}
        this.uiManager.updateCallStatus('Call accepted. Connecting...');
        this.uiManager.showCallModal();
      }
      // Stop caller ringback tone
      try { window.realtimeChatApp?.stopRingback(); } catch {}
      
      // As the initiator, start the RTC flow and send the offer
      const callType = this.webrtcManager.getCallType() || 'video';
      await this.webrtcManager.initiateCall(fromId, callType);
    });

    this.socket.on('call:declined', ({ fromId }) => {
      const name = this.chatManager?.getUsername(fromId) || 'User';
      console.log('Call declined by:', name);
      if (this.webrtcManager && fromId === this.webrtcManager.getCallTargetId()) {
        if (this.uiManager) this.uiManager.showToast(`${name} declined the call`);
        this.webrtcManager.cleanup();
      }
      // Stop caller ringback tone
      try { window.realtimeChatApp?.stopRingback(); } catch {}
    });

    this.socket.on('rtc:signal', async ({ fromId, signal }) => {
      if (!this.webrtcManager || fromId !== this.webrtcManager.getCallTargetId()) {
        return;
      }
      
      await this.webrtcManager.handleSignal(signal);
    });

    this.socket.on('call:hangup', () => {
      // Determine a more specific message
      const state = this.webrtcManager?.getCallState();
      const msg = state === 'receiving' ? 'Caller canceled the call.' : 'Call ended.';
      if (this.chatManager) {
        this.chatManager.addSystemMessage(msg);
      }
      if (this.webrtcManager) {
        this.webrtcManager.cleanup();
      }
      // Stop any ringback
      try { window.realtimeChatApp?.stopRingback(); } catch {}
      if (this.notificationManager) {
        this.notificationManager.notifyCallEnded();
      }
    });
  }

  // Join room method
  joinRoom(username, room) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      console.log('Attempting to join room:', room);
      this.socket.emit('user:join', { username, room }, (response) => {
        console.log('Join response:', response);
        if (!response.ok) {
          reject(new Error(response.error || 'Join failed'));
          return;
        }
        
        // Initialize chat with room data
        if (this.chatManager) {
          this.chatManager.initializeRoom(response);
        }
        
        resolve(response);
      });
    });
  }

  // Call methods
  requestCall(targetId, callType) {
    if (this.socket) {
      this.socket.emit('call:request', { targetId, callType });
    }
  }

  acceptCall(targetId) {
    if (this.socket) {
      this.socket.emit('call:accept', { targetId });
    }
  }

  declineCall(targetId) {
    if (this.socket) {
      this.socket.emit('call:decline', { targetId });
    }
  }

  hangupCall(targetId) {
    if (this.socket) {
      this.socket.emit('call:hangup', { targetId });
    }
  }

  sendRTCSignal(targetId, signal) {
    if (this.socket) {
      this.socket.emit('rtc:signal', { targetId, signal });
    }
  }

  // Chat methods
  sendMessage(messageData, callback) {
    if (this.socket) {
      this.socket.emit('chat:message', messageData, callback);
    }
  }

  sendTyping(isTyping) {
    if (this.socket) {
      this.socket.emit('user:typing', isTyping);
    }
  }

  // Connection status
  isConnected() {
    return this.socket?.connected || false;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Get socket instance
  getSocket() {
    return this.socket;
  }
}

// Export for use in other modules
window.SocketManager = SocketManager;
