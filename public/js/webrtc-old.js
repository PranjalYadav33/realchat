// WebRTC Video Call Module
class WebRTCManager {
  constructor() {
    this.pc = null;
    this.localStream = null;
    this.remoteStream = null;
    this.callTargetId = null;
    this.callType = 'audio'; // 'audio' or 'video'
    this.callState = 'idle'; // idle, calling, receiving, connected
    this.isScreenSharing = false;
    this.screenStream = null;
    this.originalVideoTrack = null;
    this.callStats = { packetsLost: 0, bytesReceived: 0, bytesSent: 0 };
    this.statsInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.debugInterval = null;
    this.pendingCandidates = [];
    
    // DOM elements
    this.localVideo = document.querySelector('#localVideo');
    this.remoteVideo = document.querySelector('#remoteVideo');
    this.callStatus = document.querySelector('#callStatus');
    this.callQuality = document.querySelector('#callQuality');
    this.qualityText = document.querySelector('#qualityText');
    this.statsText = document.querySelector('#statsText');
    
    // Callbacks
    this.onCallStateChange = null;
    this.onCallStatusUpdate = null;
    this.socket = null;
  }

  setSocket(socket) {
    this.socket = socket;
  }

  setCallbacks(callbacks) {
    this.onCallStateChange = callbacks.onCallStateChange;
    this.onCallStatusUpdate = callbacks.onCallStatusUpdate;
  }

  async setupLocalMedia(callType = 'audio') {
    try {
      if (this.localStream) {
        this.localStream.getTracks().forEach(t => t.stop());
      }
      
      const constraints = { 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        }, 
        video: callType === 'video' ? {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: 'user'
        } : false
      };
      
      console.log('Requesting media with constraints:', constraints);
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Local stream tracks:', this.localStream.getTracks().map(t => `${t.kind}: ${t.enabled}`));
      
      this.localVideo.srcObject = this.localStream;
      this.localVideo.play().catch(e => {
        console.log('Local video play error:', e);
        this.localVideo.onclick = () => this.localVideo.play();
      });
      
      this.updateMediaControls();
    } catch (error) {
      console.error('Error setting up local media:', error);
      throw error;
    }
  }

  async createPeerConnection() {
    if (this.pc) this.pc.close();
    
    const cfg = { iceServers: this.getConfiguredIceServers() };
    try {
      this.pc = new RTCPeerConnection(cfg);
    } catch (e) {
      console.error('Failed to create RTCPeerConnection with cfg', cfg, e);
      // Fallback to default STUN only
      this.pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
    }
    
    // Setup remote stream
    this.remoteStream = new MediaStream();
    this.remoteVideo.srcObject = this.remoteStream;
    
    // Add local tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        console.log(`Adding track: ${track.kind}, enabled: ${track.enabled}`);
        this.pc.addTrack(track, this.localStream);
      });
    }
    
    // Handle ICE candidates
    this.pc.onicecandidate = (e) => {
      if (e.candidate && this.socket) {
        console.log('Sending ICE candidate');
        this.socket.emit('rtc:signal', { 
          targetId: this.callTargetId, 
          signal: { type: 'candidate', candidate: e.candidate } 
        });
      }
    };
    
    // Handle incoming tracks
    this.pc.ontrack = (e) => {
      console.log('%cONTRACK EVENT FIRED', 'color: white; background-color: blue; padding: 2px 5px; border-radius: 3px;', e);
      if (e.track) {
        console.log(`Received remote track: ${e.track.kind}, ID: ${e.track.id}`);
        if (this.remoteStream) {
          this.remoteStream.addTrack(e.track);
          console.log('Added track to remoteStream. Current remote tracks:', this.remoteStream.getTracks().map(t => `${t.kind}:${t.id}`));
        }
      }

      if (this.remoteVideo.srcObject !== this.remoteStream) {
        console.log('Assigning remoteStream to remoteVideo element.');
        this.remoteVideo.srcObject = this.remoteStream;
      }

      // Attempt to play, catching errors for browsers that block autoplay
      this.remoteVideo.play().catch(err => {
        console.error('Remote video autoplay failed. User may need to interact with the page.', err);
        this.updateCallStatus('Tap video to play');
      });

      this.updateCallStatus(`Connected to ${window.chatApp?.getUsername(this.callTargetId) || 'User'}`);
      this.startDebugInterval();
    };
    
    // Handle connection state changes
    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      console.log(`%cConnection state: %c${state}`, 'font-weight:bold; color:blue;', 'color:blue; font-weight:normal;');
      if (['disconnected', 'failed', 'closed'].includes(state)) {
        this.updateCallStatus('Connection lost');
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnection();
        } else {
          this.endCall(false);
        }
      } else if (state === 'connected') {
        this.updateCallStatus(`Connected to ${window.chatApp?.getUsername(this.callTargetId) || 'User'}`);
        this.reconnectAttempts = 0;
        this.startCallQualityMonitoring();
      }
    };
    
    // Handle ICE connection state
    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc.iceConnectionState;
      console.log(`%cICE connection state: %c${state}`, 'font-weight:bold; color:green;', 'color:green; font-weight:normal;');
      if (state === 'failed') {
        this.updateCallStatus('Connection failed. A TURN server may be required.');
        console.error('ICE connection failed. This often happens on restrictive networks (like mobile or some Wi-Fi) without a TURN server. Please configure one in the settings.');
      } else if (['disconnected', 'closed'].includes(state)) {
        this.updateCallStatus('Connection lost.');
      }
    };

    // Add signaling state logging
    this.pc.onsignalingstatechange = () => {
      if (!this.pc) return;
      console.log(`%cSignaling state: %c${this.pc.signalingState}`, 'font-weight:bold; color:orange;', 'color:orange; font-weight:normal;');
    };
  }

  async startCall(targetId, callType) {
    this.callTargetId = targetId;
    this.callType = callType;
    this.callState = 'calling';
    
    try {
      this.updateCallStatus('Setting up media...');
      await this.setupLocalMedia(callType);
      await this.createPeerConnection();
      
      this.updateCallStatus('Creating offer...');
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      
      if (this.socket) {
        this.socket.emit('rtc:signal', { 
          targetId: this.callTargetId, 
          signal: { type: 'offer', sdp: offer } 
        });
      }
      
      this.updateCallStatus('Waiting for answer...');
      this.callState = 'connecting';
    } catch (error) {
      console.error('Error starting call:', error);
      this.updateCallStatus('Failed to start call');
      this.endCall(false);
    }
  }

  async acceptCall(targetId, callType) {
    this.callTargetId = targetId;
    this.callType = callType;
    this.callState = 'connecting';
    
    try {
      this.updateCallStatus('Setting up media...');
      await this.setupLocalMedia(callType);
      // Prepare a peer connection in advance so we can immediately
      // set the remote offer when it arrives.
      await this.createPeerConnection();
      this.updateCallStatus('Waiting for offer...');
    } catch (error) {
      console.error('Error accepting call:', error);
      this.updateCallStatus('Failed to accept call');
      this.endCall(false);
    }
  }

  async handleSignal(signal) {
    try {
      if (signal.type === 'offer' && this.callState === 'connecting') {
        console.log('Callee: Received offer');
        if (!this.pc) {
          console.log('No PC yet, creating now before setting remote offer');
          await this.createPeerConnection();
        }
        await this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        
        if (this.socket) {
          this.socket.emit('rtc:signal', { 
            targetId: this.callTargetId, 
            signal: { type: 'answer', sdp: answer } 
          });
        }
        
        this.callState = 'connected';
        this.updateCallStatus('Answering call...');
        // Flush any ICE candidates received before remoteDescription
        if (this.pendingCandidates.length) {
          for (const c of this.pendingCandidates) {
            try { await this.pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { console.warn('Pending candidate add failed', e); }
          }
          this.pendingCandidates = [];
        }
      } else if (signal.type === 'answer' && this.callState === 'connecting') {
        console.log('Caller: Received answer');
        await this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        this.callState = 'connected';
        this.updateCallStatus('Call answered, connecting...');
      } else if (signal.type === 'candidate') {
        console.log('Received ICE candidate');
        if (this.pc && this.pc.remoteDescription) {
          await this.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else {
          // Buffer until remote description is set
          this.pendingCandidates.push(signal.candidate);
        }
      }
    } catch (error) {
      console.error('Error handling signal:', error);
    }
  }

  // Screen sharing functionality
  async toggleScreenShare() {
    try {
      if (!this.isScreenSharing) {
        // Start screen sharing
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 }
          },
          audio: true
        });
        
        // Store original video track
        this.originalVideoTrack = this.localStream?.getVideoTracks()[0];
        
        // Replace video track in peer connection
        const videoTrack = this.screenStream.getVideoTracks()[0];
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
        this.updateCallStatus('Screen sharing active');
        
      } else {
        this.stopScreenShare();
      }
    } catch (error) {
      console.error('Screen sharing error:', error);
      this.updateCallStatus('Screen sharing failed');
    }
  }
  
  stopScreenShare() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }
    
    // Restore original video track
    if (this.pc && this.originalVideoTrack && this.localStream) {
      const sender = this.pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(this.originalVideoTrack).catch(console.error);
      }
      this.localVideo.srcObject = this.localStream;
    }
    
    this.isScreenSharing = false;
    this.updateCallStatus(`Connected to ${window.chatApp?.getUsername(this.callTargetId) || 'User'}`);
  }

  // Picture-in-Picture functionality
  async togglePictureInPicture() {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (this.remoteVideo.requestPictureInPicture) {
        await this.remoteVideo.requestPictureInPicture();
      }
    } catch (error) {
      console.error('Picture-in-Picture error:', error);
    }
  }

  // Call quality monitoring
  startCallQualityMonitoring() {
    if (this.statsInterval) clearInterval(this.statsInterval);
    
    this.statsInterval = setInterval(async () => {
      if (!this.pc) return;
      
      try {
        const stats = await this.pc.getStats();
        let packetsLost = 0;
        let packetsReceived = 0;
        let bytesReceived = 0;
        let bytesSent = 0;
        let jitter = 0;
        let rtt = 0;
        
        stats.forEach(report => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            packetsLost += report.packetsLost || 0;
            packetsReceived += report.packetsReceived || 0;
            bytesReceived += report.bytesReceived || 0;
            jitter = report.jitter || 0;
          }
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            bytesSent += report.bytesSent || 0;
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = report.currentRoundTripTime || 0;
          }
        });
        
        // Calculate quality
        const lossRate = packetsReceived > 0 ? (packetsLost / packetsReceived) * 100 : 0;
        let quality = 'Good';
        let qualityClass = 'quality-good';
        
        if (lossRate > 5 || rtt > 300 || jitter > 50) {
          quality = 'Poor';
          qualityClass = 'quality-poor';
        } else if (lossRate > 2 || rtt > 150 || jitter > 30) {
          quality = 'Fair';
          qualityClass = 'quality-fair';
        }
        
        // Update UI
        if (this.qualityText && this.statsText && this.callQuality) {
          this.qualityText.textContent = `Connection: ${quality}`;
          this.qualityText.className = qualityClass;
          this.statsText.textContent = `RTT: ${Math.round(rtt)}ms | Loss: ${lossRate.toFixed(1)}%`;
          this.callQuality.classList.add('show');
          
          // Hide after 3 seconds of good quality
          if (quality === 'Good') {
            setTimeout(() => {
              if (quality === 'Good') this.callQuality.classList.remove('show');
            }, 3000);
          }
        }
        
      } catch (error) {
        console.error('Stats error:', error);
      }
    }, 2000);
  }
  
  stopCallQualityMonitoring() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    if (this.callQuality) {
      this.callQuality.classList.remove('show');
    }
  }

  // Connection recovery
  async attemptReconnection() {
    this.reconnectAttempts++;
    this.updateCallStatus(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    try {
      // Close existing connection
      if (this.pc) {
        this.pc.close();
        this.pc = null;
      }
      
      // Wait a bit before reconnecting
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Restart call
      await this.startCall(this.callTargetId, this.callType);
      
    } catch (error) {
      console.error('Reconnection failed:', error);
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.updateCallStatus('Connection failed. Call ended.');
        this.endCall(false);
      }
    }
  }

  toggleMute() {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach(t => t.enabled = !t.enabled);
    this.updateMediaControls();
  }

  toggleVideo() {
    if (!this.localStream) return;
    this.localStream.getVideoTracks().forEach(t => t.enabled = !t.enabled);
    this.updateMediaControls();
  }

  updateMediaControls() {
    const audioEnabled = this.localStream?.getAudioTracks()[0]?.enabled ?? false;
    const videoEnabled = this.localStream?.getVideoTracks()[0]?.enabled ?? false;
    
    const toggleMuteBtn = document.querySelector('#toggleMute');
    const toggleVideoBtn = document.querySelector('#toggleVideo');
    const shareScreenBtn = document.querySelector('#shareScreen');
    const togglePipBtn = document.querySelector('#togglePip');
    
    if (toggleMuteBtn) {
      toggleMuteBtn.classList.toggle('active', !audioEnabled);
      const mutedIcon = toggleMuteBtn.querySelector('.muted-icon');
      const unmutedIcon = toggleMuteBtn.querySelector('.unmuted-icon');
      if (mutedIcon) mutedIcon.hidden = audioEnabled;
      if (unmutedIcon) unmutedIcon.hidden = !audioEnabled;
    }
    
    if (toggleVideoBtn) {
      toggleVideoBtn.classList.toggle('active', videoEnabled);
      const videoOffIcon = toggleVideoBtn.querySelector('.video-off-icon');
      const videoOnIcon = toggleVideoBtn.querySelector('.video-on-icon');
      if (videoOffIcon) videoOffIcon.hidden = videoEnabled;
      if (videoOnIcon) videoOnIcon.hidden = !videoEnabled;
      toggleVideoBtn.style.display = this.callType === 'video' ? 'inline-flex' : 'none';
    }
    
    // Show/hide screen share and PiP buttons for video calls
    if (shareScreenBtn) {
      shareScreenBtn.style.display = this.callType === 'video' ? 'inline-flex' : 'none';
      shareScreenBtn.classList.toggle('screen-sharing', this.isScreenSharing);
    }
    if (togglePipBtn) {
      togglePipBtn.style.display = this.callType === 'video' ? 'inline-flex' : 'none';
    }
  }

  endCall(notifyPeer = true) {
    if (notifyPeer && this.callTargetId && this.socket) {
      this.socket.emit('call:hangup', { targetId: this.callTargetId });
    }
    this.resetCallState();
  }

  resetCallState() {
    console.log('Resetting call state from:', this.callState);
    
    // Stop screen sharing if active
    if (this.isScreenSharing) {
      this.stopScreenShare();
    }
    
    // Exit picture-in-picture if active
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(console.error);
    }
    
    // Clean up connections and streams
    if (this.pc) { 
      this.pc.close(); 
      this.pc = null; 
    }
    if (this.localStream) { 
      this.localStream.getTracks().forEach(t => t.stop()); 
      this.localStream = null; 
    }
    if (this.screenStream) { 
      this.screenStream.getTracks().forEach(t => t.stop()); 
      this.screenStream = null; 
    }
    
    if (this.localVideo) this.localVideo.srcObject = null;
    if (this.remoteVideo) this.remoteVideo.srcObject = null;
    
    this.callTargetId = null;
    this.callState = 'idle';
    this.isScreenSharing = false;
    this.originalVideoTrack = null;
    this.reconnectAttempts = 0;
    
    // Stop monitoring
    this.stopDebugInterval();
    this.stopCallQualityMonitoring();
    
    // Reset button states
    const shareScreenBtn = document.querySelector('#shareScreen');
    if (shareScreenBtn) {
      shareScreenBtn.classList.remove('screen-sharing');
      shareScreenBtn.title = 'Share Screen';
    }
    
    console.log('Call state reset to: idle');
    
    if (this.onCallStateChange) {
      this.onCallStateChange('idle');
    }
  }

  updateCallStatus(text) {
    if (this.callStatus) {
      this.callStatus.textContent = text;
    }
    console.log('Call status:', text);
    
    if (this.onCallStatusUpdate) {
      this.onCallStatusUpdate(text);
    }
  }

  // Debug function to check video streams
  debugVideoStreams() {
    console.log('=== VIDEO STREAM DEBUG ===');
    console.log('Local video element:', this.localVideo);
    console.log('Local video srcObject:', this.localVideo?.srcObject);
    console.log('Local stream tracks:', this.localStream?.getTracks().map(t => `${t.kind}: ${t.enabled}`));
    
    console.log('Remote video element:', this.remoteVideo);
    console.log('Remote video srcObject:', this.remoteVideo?.srcObject);
    console.log('Remote stream tracks:', this.remoteStream?.getTracks().map(t => `${t.kind}: ${t.enabled}`));
    
    if (this.pc) {
      console.log('PC connection state:', this.pc.connectionState);
      console.log('PC ICE connection state:', this.pc.iceConnectionState);
      console.log('PC signaling state:', this.pc.signalingState);
    }
    console.log('========================');
  }

  startDebugInterval() {
    this.debugInterval = setInterval(() => {
      if (this.callState === 'connected') this.debugVideoStreams();
    }, 3000);
  }

  stopDebugInterval() {
    if (this.debugInterval) {
      clearInterval(this.debugInterval);
      this.debugInterval = null;
    }
  }

  // Getters
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

  // ICE configuration from localStorage
  getConfiguredIceServers() {
    try {
      const stunList = (localStorage.getItem('ice:stun') || '').split(',').map(s => s.trim()).filter(Boolean);
      const turnUrl = (localStorage.getItem('ice:turn:url') || '').trim();
      const turnUser = (localStorage.getItem('ice:turn:user') || '').trim();
      const turnCred = (localStorage.getItem('ice:turn:cred') || '').trim();
      const servers = [];
      // Default STUNs
      servers.push({ urls: 'stun:stun.l.google.com:19302' });
      servers.push({ urls: 'stun:stun1.l.google.com:19302' });
      // Custom STUNs
      stunList.forEach(u => servers.push({ urls: u }));
      // TURN server
      if (turnUrl) {
        const turnEntry = { urls: turnUrl };
        if (turnUser) turnEntry.username = turnUser;
        if (turnCred) turnEntry.credential = turnCred;
        servers.push(turnEntry);
      }
      console.log('Using ICE servers:', servers);
      return servers;
    } catch (e) {
      console.warn('Failed to load ICE config from storage, using defaults', e);
      return [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ];
    }
  }
}

// Export for use in other modules
window.WebRTCManager = WebRTCManager;
