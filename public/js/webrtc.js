// Completely Rewritten WebRTC Video Call Module
class WebRTCManager {
  constructor() {
    // Core WebRTC objects
    this.pc = null;
    this.localStream = null;
    this.remoteStream = null;
    
    // Call state
    this.callTargetId = null;
    this.callType = 'video'; // 'audio' or 'video'
    this.callState = 'idle'; // idle, calling, receiving, connecting, connected
    this.isInitiator = false;
    
    // Advanced features
    this.isScreenSharing = false;
    this.screenStream = null;
    this.originalVideoTrack = null;
    
    // Connection monitoring
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.connectionTimeout = null;
    this.iceGatheringTimeout = null;
    this.pendingCandidates = [];
    
    // DOM elements
    this.localVideo = document.querySelector('#localVideo');
    this.remoteVideo = document.querySelector('#remoteVideo');
    this.remoteAudio = document.querySelector('#remoteAudio');
    this.callStatus = document.querySelector('#callStatus');
    this._speakerOn = false;
    // Remote video fit mode: 'contain' (fit) or 'cover' (fill)
    this.remoteFit = localStorage.getItem('call:remoteFit') || 'contain';
    if (this.remoteVideo) this.applyRemoteFitMode();
    
    // Callbacks
    this.onCallStateChange = null;
    this.onCallStatusUpdate = null;
    this.socket = null;
    
    console.log('WebRTC Manager initialized');
  }

  setSocket(socket) {
    this.socket = socket;
  }

  setCallbacks(callbacks) {
    this.onCallStateChange = callbacks.onCallStateChange;
    this.onCallStatusUpdate = callbacks.onCallStatusUpdate;
  }

  // ==================== MEDIA SETUP ====================
  
  async setupLocalMedia(callType = 'video') {
    console.log(`🎥 Setting up local media for ${callType} call`);
    
    try {
      // Stop existing streams
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          track.stop();
          console.log(`Stopped ${track.kind} track`);
        });
      }
      
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: callType === 'video' ? {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30 }
        } : false
      };
      
      console.log('Requesting user media with constraints:', constraints);
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      console.log('✅ Got local stream with tracks:', 
        this.localStream.getTracks().map(t => `${t.kind}:${t.enabled}`));
      
      // Display local video
      if (this.localVideo) {
        this.localVideo.srcObject = this.localStream;
        this.localVideo.muted = true; // Always mute local video to prevent feedback
        await this.localVideo.play();
        console.log('Local video playing');
      }
      
      this.updateMediaControls();
      return this.localStream;
      
    } catch (error) {
      console.error('❌ Failed to get user media:', error);
      this.updateCallStatus('Failed to access camera/microphone');
      throw error;
    }
  }

  // ==================== PEER CONNECTION SETUP ====================
  
  async createPeerConnection() {
    console.log('🔗 Creating peer connection');
    
    // Close existing connection
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    
    // ICE servers configuration
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ];
    // Optional: user-specified additional STUN list (comma-separated)
    try {
      const extraStuns = (localStorage.getItem('ice:stun') || '').split(',').map(s => s.trim()).filter(Boolean);
      extraStuns.forEach(u => iceServers.push({ urls: u }));
    } catch {}
    
    // Add TURN server if configured
    const turnUrl = localStorage.getItem('ice:turn:url');
    const turnUser = localStorage.getItem('ice:turn:user');
    const turnCred = localStorage.getItem('ice:turn:cred');
    
    if (turnUrl) {
      const turnServer = { urls: turnUrl };
      if (turnUser) turnServer.username = turnUser;
      if (turnCred) turnServer.credential = turnCred;
      iceServers.push(turnServer);
      console.log('Added TURN server:', turnUrl);
    }
    
    const config = {
      iceServers,
      iceCandidatePoolSize: 10
    };
    
    console.log('RTCPeerConnection config:', config);
    this.pc = new RTCPeerConnection(config);
    
    // Set up event handlers
    this.setupPeerConnectionHandlers();
    
    // Add local tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        console.log(`Adding local ${track.kind} track to peer connection`);
        this.pc.addTrack(track, this.localStream);
      });
    }
    
    return this.pc;
  }
  
  setupPeerConnectionHandlers() {
    if (!this.pc) return;
    
    // ICE candidate handler
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('🧊 Sending ICE candidate');
        if (this.socket && this.callTargetId) {
          this.socket.emit('rtc:signal', {
            targetId: this.callTargetId,
            signal: {
              type: 'ice-candidate',
              candidate: event.candidate
            }
          });
        }
      } else {
        console.log('🧊 ICE gathering complete');
      }
    };
    
    // Remote stream handler
    this.pc.ontrack = (event) => {
      console.log('🎬 RECEIVED REMOTE TRACK:', event.track.kind);
      
      if (event.streams && event.streams[0]) {
        console.log('📺 Setting remote stream to video element');
        this.remoteStream = event.streams[0];
        
        if (this.remoteVideo) {
          this.remoteVideo.srcObject = this.remoteStream;
          // Apply preferred fit mode whenever we attach a new stream
          this.applyRemoteFitMode();
          
          // Ensure remote video plays
          this.remoteVideo.play().then(() => {
            console.log('✅ Remote video is playing');
            this.updateCallStatus('Connected');
          }).catch(error => {
            console.error('❌ Remote video play failed:', error);
            this.updateCallStatus('Tap to play video');
            
            // Add click handler to play video
            this.remoteVideo.onclick = () => {
              this.remoteVideo.play().then(() => {
                console.log('✅ Remote video playing after user interaction');
                this.remoteVideo.onclick = null;
              });
            };
          });
        }

        // Also bind audio element for audio calls or when audio track present
        if (this.remoteAudio) {
          try {
            this.remoteAudio.srcObject = this.remoteStream;
            this.remoteAudio.play().catch(err => console.warn('Remote audio autoplay blocked, will require user gesture.', err));
          } catch (e) {
            console.warn('Failed to attach remote audio stream', e);
          }
        }
      }
    };
    
    // Connection state handlers
    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      console.log(`🔗 Connection state: ${state}`);
      
      switch (state) {
        case 'connected':
          console.log('✅ Peer connection established');
          this.callState = 'connected';
          this.reconnectAttempts = 0;
          this.clearConnectionTimeout();
          try { window.realtimeChatApp?.stopRingback(); } catch {}
          if (this.callType === 'audio') {
            try {
              window.uiManager?.updateAudioStatus('Connected');
              window.uiManager?.startAudioTimer();
              window.uiManager?.setAudioRinging(false);
            } catch {}
          }
          if (this.onCallStateChange) this.onCallStateChange('connected');
          break;
          
        case 'disconnected':
          console.log('⚠️ Peer connection disconnected');
          this.updateCallStatus('Connection lost');
          break;
          
        case 'failed':
          console.log('❌ Peer connection failed');
          this.handleConnectionFailure();
          break;
          
        case 'closed':
          console.log('🔒 Peer connection closed');
          break;
      }
    };
    
    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc.iceConnectionState;
      console.log(`🧊 ICE connection state: ${state}`);
      
      switch (state) {
        case 'checking':
          this.updateCallStatus('Connecting...');
          if (this.callType === 'audio') {
            try { window.uiManager?.updateAudioStatus('Connecting...'); } catch {}
          }
          break;
          
        case 'connected':
        case 'completed':
          console.log('✅ ICE connection established');
          break;
          
        case 'failed':
          console.log('❌ ICE connection failed - TURN server may be needed');
          this.updateCallStatus('Connection failed - check network');
          if (this.callType === 'audio') {
            try { window.uiManager?.updateAudioStatus('Connection failed'); } catch {}
          }
          break;
          
        case 'disconnected':
          console.log('⚠️ ICE connection disconnected');
          break;
      }
    };
    
    this.pc.onsignalingstatechange = () => {
      console.log(`📡 Signaling state: ${this.pc.signalingState}`);
    };
  }

  // ==================== CALL INITIATION ====================
  
  async initiateCall(targetId, callType = 'video') {
    console.log(`📞 Initiating ${callType} call to ${targetId}`);
    console.log('Current WebRTC state:', {
      callTargetId: this.callTargetId,
      callType: this.callType,
      callState: this.callState
    });
    
    this.callTargetId = targetId;
    this.callType = callType;
    this.callState = 'calling';
    this.isInitiator = true;
    if (this.onCallStateChange) this.onCallStateChange('calling');
    
    try {
      this.updateCallStatus('Setting up media...');
      await this.setupLocalMedia(callType);
      
      this.updateCallStatus('Creating connection...');
      await this.createPeerConnection();
      
      this.updateCallStatus('Creating offer...');
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === 'video'
      });
      
      await this.pc.setLocalDescription(offer);
      console.log('📤 Sending offer');
      
      if (this.socket) {
        this.socket.emit('rtc:signal', {
          targetId: this.callTargetId,
          signal: {
            type: 'offer',
            sdp: offer
          }
        });
      }
      
      this.callState = 'connecting';
      this.updateCallStatus('Waiting for answer...');
      this.setConnectionTimeout();
      
    } catch (error) {
      console.error('❌ Failed to initiate call:', error);
      this.updateCallStatus('Failed to start call');
      this.endCall(false);
    }
  }
  
  async acceptCall(targetId, callType = 'video') {
    console.log(`✅ Accepting ${callType} call from ${targetId}`);
    console.log('Current WebRTC state before accept:', {
      callTargetId: this.callTargetId,
      callType: this.callType,
      callState: this.callState
    });
    
    this.callTargetId = targetId;
    this.callType = callType;
    this.callState = 'connecting';
    this.isInitiator = false;
    if (this.onCallStateChange) this.onCallStateChange('connecting');
    
    try {
      this.updateCallStatus('Setting up media...');
      await this.setupLocalMedia(callType);
      
      this.updateCallStatus('Preparing connection...');
      await this.createPeerConnection();
      
      this.updateCallStatus('Waiting for offer...');
      
    } catch (error) {
      console.error('❌ Failed to accept call:', error);
      this.updateCallStatus('Failed to accept call');
      this.endCall(false);
    }
  }

  // ==================== SIGNALING ====================
  
  async handleSignal(signal) {
    // Ensure we have a peer connection when processing signals
    if (!this.pc) {
      console.warn('⚠️ No peer connection yet. Creating now before processing signal.');
      await this.createPeerConnection();
    }
    
    try {
      // Normalize legacy candidate type
      const type = signal.type === 'candidate' ? 'ice-candidate' : signal.type;
      switch (type) {
        case 'offer':
          console.log('📥 Received offer');
          await this.handleOffer(signal.sdp);
          break;
          
        case 'answer':
          console.log('📥 Received answer');
          await this.handleAnswer(signal.sdp);
          break;
          
        case 'ice-candidate':
          console.log('📥 Received ICE candidate');
          await this.handleIceCandidate(signal.candidate);
          break;
          
        default:
          console.warn('Unknown signal type:', signal.type);
      }
    } catch (error) {
      console.error('❌ Error handling signal:', error);
    }
  }
  
  async handleOffer(sdp) {
    if (this.pc.signalingState !== 'stable') {
      console.warn('⚠️ Received offer in wrong signaling state:', this.pc.signalingState);
    }
    // If local media isn't ready (race), prepare it now so we answer with tracks
    if (!this.localStream) {
      try {
        console.log('🎥 Local media not ready on offer; acquiring now...');
        await this.setupLocalMedia(this.callType || 'video');
        // Add tracks if not already added
        this.localStream.getTracks().forEach(track => {
          if (!this.pc.getSenders().some(s => s.track === track)) {
            this.pc.addTrack(track, this.localStream);
          }
        });
      } catch (e) {
        console.error('Failed to obtain local media before answering offer:', e);
      }
    }

    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log('📥 Set remote description (offer)');
    
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    console.log('📤 Sending answer');
    
    if (this.socket) {
      this.socket.emit('rtc:signal', {
        targetId: this.callTargetId,
        signal: {
          type: 'answer',
          sdp: answer
        }
      });
    }
    
    this.updateCallStatus('Connecting...');
    // Flush any buffered ICE candidates now that remoteDescription is set
    await this.flushPendingCandidates();
  }
  
  async handleAnswer(sdp) {
    if (this.pc.signalingState !== 'have-local-offer') {
      console.warn('⚠️ Received answer in wrong signaling state:', this.pc.signalingState);
    }
    
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log('📥 Set remote description (answer)');
    
    this.updateCallStatus('Connecting...');
    await this.flushPendingCandidates();
  }
  
  async handleIceCandidate(candidate) {
    if (this.pc.remoteDescription) {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('🧊 Added ICE candidate');
    } else {
      console.log('🧊 Queuing ICE candidate (no remote description yet)');
      this.pendingCandidates.push(candidate);
    }
  }

  async flushPendingCandidates() {
    if (!this.pc || !this.pc.remoteDescription) return;
    if (!this.pendingCandidates.length) return;
    console.log(`🧊 Flushing ${this.pendingCandidates.length} buffered ICE candidates`);
    for (const c of this.pendingCandidates) {
      try { await this.pc.addIceCandidate(new RTCIceCandidate(c)); }
      catch (e) { console.warn('Failed to add buffered ICE candidate', e); }
    }
    this.pendingCandidates = [];
  }

  // ==================== CALL CONTROL ====================
  
  toggleMute() {
    if (!this.localStream) return;
    
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      console.log(`🔊 Audio ${audioTrack.enabled ? 'unmuted' : 'muted'}`);
      this.updateMediaControls();
    }
  }
  
  toggleVideo() {
    if (!this.localStream) return;
    
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      console.log(`📹 Video ${videoTrack.enabled ? 'enabled' : 'disabled'}`);
      this.updateMediaControls();
    }
  }
  
  async toggleScreenShare() {
    try {
      if (!this.isScreenSharing) {
        console.log('🖥️ Starting screen share');
        
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: 1920, height: 1080 },
          audio: true
        });
        
        const videoTrack = this.screenStream.getVideoTracks()[0];
        this.originalVideoTrack = this.localStream.getVideoTracks()[0];
        
        // Replace video track in peer connection
        if (this.pc && this.originalVideoTrack) {
          const sender = this.pc.getSenders().find(s => s.track === this.originalVideoTrack);
          if (sender) {
            await sender.replaceTrack(videoTrack);
          }
        }
        
        // Update local video display
        this.localVideo.srcObject = this.screenStream;
        
        // Handle screen share end
        videoTrack.onended = () => {
          this.stopScreenShare();
        };
        
        this.isScreenSharing = true;
        this.updateCallStatus('Screen sharing');
        
      } else {
        this.stopScreenShare();
      }
    } catch (error) {
      console.error('❌ Screen sharing failed:', error);
      this.updateCallStatus('Screen sharing failed');
    }
  }
  
  stopScreenShare() {
    if (!this.isScreenSharing) return;
    
    console.log('🖥️ Stopping screen share');
    
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }
    
    // Restore original video track
    if (this.pc && this.originalVideoTrack && this.localStream) {
      const sender = this.pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(this.originalVideoTrack);
      }
      this.localVideo.srcObject = this.localStream;
    }
    
    this.isScreenSharing = false;
    this.updateCallStatus('Connected');
  }
  
  async togglePictureInPicture() {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (this.remoteVideo && this.remoteVideo.requestPictureInPicture) {
        await this.remoteVideo.requestPictureInPicture();
      }
    } catch (error) {
      console.error('❌ Picture-in-Picture failed:', error);
    }
  }

  // ==================== CALL TERMINATION ====================
  
  endCall(notifyPeer = true) {
    console.log('📞 Ending call, notify peer:', notifyPeer);
    
    if (notifyPeer && this.callTargetId && this.socket) {
      this.socket.emit('call:hangup', { targetId: this.callTargetId });
    }
    
    this.cleanup();
  }
  
  cleanup() {
    console.log('🧹 Cleaning up call resources');
    
    // Clear timeouts
    this.clearConnectionTimeout();
    
    // Stop screen sharing
    if (this.isScreenSharing) {
      this.stopScreenShare();
    }
    
    // Exit picture-in-picture
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
    
    // Close peer connection
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    
    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        console.log(`Stopped ${track.kind} track`);
      });
      this.localStream = null;
    }
    
    // Stop screen stream
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }
    
    // Clear video elements
    if (this.localVideo) this.localVideo.srcObject = null;
    if (this.remoteVideo) this.remoteVideo.srcObject = null;
    
    // Reset state
    this.callTargetId = null;
    this.callState = 'idle';
    this.isInitiator = false;
    this.isScreenSharing = false;
    this.originalVideoTrack = null;
    this.remoteStream = null;
    this.reconnectAttempts = 0;
    
    console.log('✅ Call cleanup complete');
    
    if (this.onCallStateChange) {
      this.onCallStateChange('idle');
    }
  }

  // ==================== UTILITIES ====================
  
  updateMediaControls() {
    const audioEnabled = this.localStream?.getAudioTracks()[0]?.enabled ?? false;
    const videoEnabled = this.localStream?.getVideoTracks()[0]?.enabled ?? false;
    
    // Update mute button
    const muteBtn = document.querySelector('#toggleMute');
    if (muteBtn) {
      muteBtn.classList.toggle('active', !audioEnabled);
      muteBtn.classList.toggle('slashed', !audioEnabled);
      const mutedIcon = muteBtn.querySelector('.muted-icon');
      const unmutedIcon = muteBtn.querySelector('.unmuted-icon');
      if (mutedIcon) mutedIcon.hidden = audioEnabled;
      if (unmutedIcon) unmutedIcon.hidden = !audioEnabled;
    }
    
    // Update video button
    const videoBtn = document.querySelector('#toggleVideo');
    if (videoBtn) {
      videoBtn.classList.toggle('active', !videoEnabled);
      videoBtn.classList.toggle('slashed', !videoEnabled);
      const videoOffIcon = videoBtn.querySelector('.video-off-icon');
      const videoOnIcon = videoBtn.querySelector('.video-on-icon');
      if (videoOffIcon) videoOffIcon.hidden = videoEnabled;
      if (videoOnIcon) videoOnIcon.hidden = !videoEnabled;
      videoBtn.style.display = this.callType === 'video' ? 'inline-flex' : 'none';
    }
    
    // Update screen share button
    const shareBtn = document.querySelector('#shareScreen');
    if (shareBtn) {
      shareBtn.style.display = this.callType === 'video' ? 'inline-flex' : 'none';
      shareBtn.classList.toggle('screen-sharing', this.isScreenSharing);
    }
    
    // Update PiP button
    const pipBtn = document.querySelector('#togglePip');
    if (pipBtn) {
      pipBtn.style.display = this.callType === 'video' ? 'inline-flex' : 'none';
    }
    // Update Fit/Fill toggle visibility
    const fitBtn = document.querySelector('#toggleFit');
    if (fitBtn) {
      fitBtn.style.display = this.callType === 'video' ? 'inline-flex' : 'none';
      fitBtn.classList.toggle('active', this.remoteFit === 'cover');
      fitBtn.title = this.remoteFit === 'cover' ? 'Switch to Fit' : 'Switch to Fill';
    }
    // Update speaker button (only in audio mode)
    const spkBtn = document.querySelector('#toggleSpeaker');
    if (spkBtn) {
      spkBtn.style.display = this.callType === 'audio' ? 'inline-flex' : 'none';
    }
  }

  // Apply current remote video fit mode to the remote video element
  applyRemoteFitMode() {
    if (!this.remoteVideo) return;
    const mode = this.remoteFit === 'cover' ? 'cover' : 'contain';
    try {
      this.remoteVideo.style.objectFit = mode;
    } catch {}
    // Reflect state in controls
    this.updateMediaControls();
  }

  // Toggle between 'contain' (fit) and 'cover' (fill) for remote video
  toggleRemoteFitMode() {
    this.remoteFit = this.remoteFit === 'cover' ? 'contain' : 'cover';
    try { localStorage.setItem('call:remoteFit', this.remoteFit); } catch {}
    this.applyRemoteFitMode();
  }
  
  updateCallStatus(status) {
    if (this.callStatus) {
      this.callStatus.textContent = status;
    }
    console.log(`📱 Status: ${status}`);
    
    if (this.onCallStatusUpdate) {
      this.onCallStatusUpdate(status);
    }
    // Mirror status into audio panel when in audio mode
    if (this.callType === 'audio') {
      try { window.uiManager?.updateAudioStatus(status); } catch {}
    }
  }
  
  setConnectionTimeout() {
    this.clearConnectionTimeout();
    this.connectionTimeout = setTimeout(() => {
      if (this.callState === 'connecting') {
        console.log('⏰ Connection timeout');
        this.updateCallStatus('Connection timeout');
        this.endCall(false);
      }
    }, 30000); // 30 second timeout
  }
  
  clearConnectionTimeout() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }
  
  handleConnectionFailure() {
    this.reconnectAttempts++;
    
    if (this.reconnectAttempts <= this.maxReconnectAttempts) {
      console.log(`🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      this.updateCallStatus(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        if (this.isInitiator) {
          this.initiateCall(this.callTargetId, this.callType);
        }
      }, 2000);
    } else {
      console.log('❌ Max reconnection attempts reached');
      this.updateCallStatus('Connection failed');
      this.endCall(false);
    }
  }

  // ==================== GETTERS ====================
  
  getCallState() {
    return this.callState;
  }
  
  getCallTargetId() {
    return this.callTargetId;
  }
  
  getCallType() {
    return this.callType;
  }
  
  isInCall() {
    return this.callState !== 'idle';
  }

  // ==================== AUDIO OUTPUT ====================
  async toggleSpeaker() {
    if (!this.remoteAudio) return;
    // Try to use setSinkId when available to route to a likely speaker device
    if (typeof this.remoteAudio.setSinkId === 'function' && navigator.mediaDevices?.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter(d => d.kind === 'audiooutput');
        let target = null;
        if (!this._speakerOn) {
          target = outputs.find(d => /speaker/i.test(d.label)) || outputs.find(d => /external|default/i.test(d.label));
        } else {
          // Toggle back to default
          target = outputs.find(d => d.deviceId === 'default') || outputs[0];
        }
        if (target) {
          await this.remoteAudio.setSinkId(target.deviceId);
          this._speakerOn = !this._speakerOn;
          document.querySelector('#toggleSpeaker')?.classList.toggle('active', this._speakerOn);
          console.log('Audio output set to:', target.label || target.deviceId);
          return;
        }
      } catch (e) {
        console.warn('setSinkId not available or failed, falling back to volume toggle', e);
      }
    }
    // Fallback: toggle volume boost as a pseudo-speaker mode
    this._speakerOn = !this._speakerOn;
    this.remoteAudio.volume = this._speakerOn ? 1.0 : 0.6;
    document.querySelector('#toggleSpeaker')?.classList.toggle('active', this._speakerOn);
  }
}

// Export for use in other modules
window.WebRTCManager = WebRTCManager;
