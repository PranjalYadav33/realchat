// Chat Functionality Module
class ChatManager {
  constructor() {
    this.socket = null;
    this.selfId = null;
    this.myName = localStorage.getItem('chat:name') || '';
    this.myRoom = this.parseRoomFromHash() || localStorage.getItem('chat:room') || 'general';
    this.nearBottom = true;
    this.msgIndex = new Map(); // id -> element
    this.online = new Map();   // id -> username
    this.typingUsers = new Map(); // id -> username, with timeout
    this.pendingFile = null;
    this.editingId = null;
    this.replyTo = null; // { id, username, text, hasFile }
    
    // Typing state
    this.typing = false;
    this.typingTO = null;
    
    // DOM elements
    this.chat = document.querySelector('#chat');
    this.userList = document.querySelector('#userList');
    this.roomNameEl = document.querySelector('#roomName');
    this.userCountEl = document.querySelector('#userCount');
    this.input = document.querySelector('#input');
    this.sendBtn = document.querySelector('#send');
    this.typingEl = document.querySelector('#typing');
    this.toBottomBtn = document.querySelector('#toBottom');
    this.attachmentPreviewEl = document.querySelector('#attachmentPreview');
    this.fileInput = document.querySelector('#fileInput');
    this.attachBtn = document.querySelector('#attach');
    this.replyPreviewEl = document.querySelector('#replyPreview');
    this.replyNameEl = document.querySelector('#replyName');
    this.replyTextEl = document.querySelector('#replyText');
    this.replyCancelBtn = document.querySelector('#replyCancel');
    this.chatList = document.querySelector('#chatList');
    this.recentChats = new Map(); // room -> { room, title, last, ts }
    this.profileCache = new Map(); // username(lower) -> { avatarDataUrl, displayName, ts }
    this.accounts = []; // directory of all registered users
    
    this.initializeEventListeners();
  }

  // Start editing a message by id (own messages only)
  startEditMessage(id) {
    if (!this.msgIndex.has(id)) return;
    if (this.editingId && this.editingId !== id) {
      // cancel previous edit first
      this.cancelEditMessage(this.editingId);
    }
    const row = this.msgIndex.get(id);
    const bubble = row.querySelector('.bubble');
    if (!bubble) return;
    this.editingId = id;
    const originalHtml = bubble.innerHTML;
    const originalText = (bubble.textContent || '').trim();
    bubble.dataset._orig = originalHtml;
    // Build editor UI
    bubble.innerHTML = `
      <div class="edit-box">
        <textarea class="edit-input">${this.escapeHtml(originalText)}</textarea>
        <div class="edit-actions">
          <button class="btn" data-act="cancel">Cancel</button>
          <button class="btn primary" data-act="save">Save</button>
        </div>
      </div>
    `;
    const ta = bubble.querySelector('.edit-input');
    ta.focus();
    const onSave = () => {
      const newText = ta.value.trim();
      if (!newText) { this.cancelEditMessage(id); return; }
      this.socket?.emit('chat:edit', { id, text: newText }, (ack) => {
        if (ack?.ok) {
          // Update UI locally
          this.applyMessageEdit({ id, text: newText, editedAt: Date.now() });
        } else {
          alert(ack?.error || 'Edit failed');
          this.cancelEditMessage(id);
        }
      });
    };
    bubble.querySelector('[data-act="save"]').addEventListener('click', onSave);
    bubble.querySelector('[data-act="cancel"]').addEventListener('click', () => this.cancelEditMessage(id));
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSave(); }
      if (e.key === 'Escape') { e.preventDefault(); this.cancelEditMessage(id); }
    });
  }

  cancelEditMessage(id) {
    if (!this.msgIndex.has(id)) return;
    const row = this.msgIndex.get(id);
    const bubble = row.querySelector('.bubble');
    if (!bubble || !bubble.dataset._orig) return;
    bubble.innerHTML = bubble.dataset._orig;
    delete bubble.dataset._orig;
    this.editingId = null;
  }

  deleteMessage(id) {
    if (!this.msgIndex.has(id)) return;
    if (!confirm('Delete this message?')) return;
    this.socket?.emit('chat:delete', { id }, (ack) => {
      if (ack?.ok) {
        this.applyMessageDelete({ id });
      } else {
        alert(ack?.error || 'Delete failed');
      }
    });
  }

  // Apply edit broadcast from server
  applyMessageEdit({ id, text, editedAt }) {
    const row = this.msgIndex.get(id);
    if (!row) return;
    const bubble = row.querySelector('.bubble');
    const meta = row.querySelector('.meta');
    if (bubble) {
      bubble.innerHTML = text ? this.linkify(this.escapeHtml(text)) : '<span class="muted">(empty)</span>';
      // clear editor state
      if (bubble.dataset._orig) delete bubble.dataset._orig;
    }
    if (meta) {
      const timeEl = meta.querySelector('.time');
      if (timeEl) timeEl.insertAdjacentHTML('afterend', ' <span class="muted" style="font-size:12px">(edited)</span>');
    }
    this.editingId = null;
  }

  // Apply delete broadcast from server
  applyMessageDelete({ id }) {
    const row = this.msgIndex.get(id);
    if (!row) return;
    // Remove from DOM and index
    row.remove();
    this.msgIndex.delete(id);
  }

  initializeEventListeners() {
    // Send message
    if (this.sendBtn) {
      this.sendBtn.addEventListener('click', () => this.sendMessage());
    }
    
    if (this.input) {
      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
      
      // Typing handling
      this.input.addEventListener('input', () => {
        if (!this.typing) { 
          this.typing = true; 
          this.sendTyping(true); 
        }
        clearTimeout(this.typingTO);
        this.typingTO = setTimeout(() => this.stopTypingSoon(), 900);
        this.autoGrow(this.input);
        // Enable/disable send button
        const empty = !(this.input.value && this.input.value.trim().length) && !this.pendingFile;
        if (this.sendBtn) this.sendBtn.disabled = empty;
      });
    }
    
    // Scroll handling
    if (this.chat) {
      this.chat.addEventListener('scroll', () => {
        const threshold = 160;
        const delta = this.chat.scrollHeight - this.chat.scrollTop - this.chat.clientHeight;
        this.nearBottom = delta < threshold;
        if (this.toBottomBtn) {
          this.toBottomBtn.classList.toggle('show', !this.nearBottom);
        }
      });
    }
    
    if (this.toBottomBtn) {
      this.toBottomBtn.addEventListener('click', () => this.scrollToBottom());
    }
    
    // Attachments
    if (this.attachBtn) {
      this.attachBtn.addEventListener('click', () => {
        if (this.fileInput) this.fileInput.click();
      });
    }
    
    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => {
        const f = e.target.files?.[0];
        if (f) this.setAttachment(f);
      });
    }

    if (this.replyCancelBtn) {
      this.replyCancelBtn.addEventListener('click', () => this.cancelReply());
    }
    // Clicking reply preview content scrolls to original message if present
    const rpContent = document.querySelector('#replyPreview .rp-content');
    if (rpContent) {
      rpContent.addEventListener('click', () => {
        const tid = this.replyTo?.id;
        if (!tid) return;
        const row = this.msgIndex.get(tid);
        if (row && this.chat) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          row.classList.add('highlight');
          setTimeout(() => row.classList.remove('highlight'), 800);
        }
      });
    }
    
    // Drag & Drop files
    if (this.chat) {
      this.chat.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.chat.style.borderColor = 'var(--accent)';
      });
      
      this.chat.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.chat.style.borderColor = 'transparent';
      });
      
      this.chat.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.chat.style.borderColor = 'transparent';
        const file = e.dataTransfer?.files?.[0];
        if (file) this.setAttachment(file);
      });
    }
  }

  // ===== Avatars / Profiles =====
  async getProfile(username) {
    try {
      const key = String(username || '').toLowerCase();
      if (!key) return null;
      const cached = this.profileCache.get(key);
      if (cached && Date.now() - (cached.ts || 0) < 60_000) return cached; // 1 min cache
      const res = await fetch(`/api/profile/${encodeURIComponent(key)}`);
      const data = await res.json();
      const profile = data?.profile || {};
      const out = { avatarDataUrl: profile.avatarDataUrl || '', displayName: profile.displayName || '', ts: Date.now() };
      this.profileCache.set(key, out);
      return out;
    } catch { return null; }
  }
  async renderAvatar(el, username) {
    if (!el) return;
    const prof = await this.getProfile(username);
    if (prof && prof.avatarDataUrl) {
      el.style.background = 'transparent';
      el.innerHTML = `<img src="${prof.avatarDataUrl}" alt="${this.escapeHtml(username)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`;
    } else {
      el.style.background = this.stringToGradient(username);
      el.textContent = this.initials(username);
    }
  }
  async refreshAvatarsFor(username) {
    const key = String(username || '').toLowerCase();
    if (!key) return;
    const prof = await this.getProfile(key);
    // Update chat avatars
    document.querySelectorAll('.avatar[data-username]').forEach(el => {
      const u = String(el.getAttribute('data-username') || '').toLowerCase();
      if (u === key) this.renderAvatar(el, username);
    });
    // Update user list and chat list rendered avatars are covered by the same selector
  }
  onProfileUpdated(username) {
    const key = String(username || '').toLowerCase();
    this.profileCache.delete(key);
    this.refreshAvatarsFor(username);
  }

  setSocket(socket) {
    this.socket = socket;
  }

  parseRoomFromHash() {
    const m = location.hash.match(/room=([a-z0-9_\-]{1,64})/i);
    return m ? m[1].toLowerCase() : null;
  }

  async sendMessage() {
    const text = this.input?.value.trim();
    if ((!text && !this.pendingFile) || !this.socket?.connected) return;

    const fileInfo = this.pendingFile ? {
      name: this.pendingFile.name,
      type: this.pendingFile.type,
      size: this.pendingFile.size,
      dataUrl: await this.toBase64(this.pendingFile)
    } : undefined;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

    // Optimistic render (pending)
    const m = { 
      id, 
      text, 
      file: fileInfo, 
      senderId: this.selfId, 
      username: this.myName, 
      ts: Date.now(),
      room: this.myRoom,
      replyTo: this.replyTo ? { ...this.replyTo } : undefined,
    };
    this.appendOrUpdateMessage(m);
    const elMsg = this.msgIndex.get(id);
    
    // mark as pending (gray check)
    const meta = elMsg?.querySelector('.meta');
    if (meta && !meta.querySelector('.check')) {
      const span = document.createElement('span');
      span.className = 'check';
      span.style.color = 'var(--muted)';
      span.textContent = '…';
      meta.appendChild(span);
    }

    this.socket.emit('chat:message', { id, text, file: fileInfo, replyTo: this.replyTo?.id }, (ack) => {
      const row = this.msgIndex.get(id);
      if (!row) return;
      const check = row.querySelector('.check');
      if (ack?.ok) {
        if (check) { 
          check.style.color = 'var(--success)'; 
          check.textContent = '✓'; 
        }
      } else {
        if (check) { 
          check.classList.add('failed'); 
          check.textContent = '×'; 
          check.title = 'Failed'; 
        }
      }
    });

    if (this.input) this.input.value = '';
    this.clearAttachment();
    this.cancelReply();
    this.stopTypingSoon();
  }

  appendOrUpdateMessage(m) {
    if (this.msgIndex.has(m.id)) {
      const el = this.msgIndex.get(m.id);
      const meta = el.querySelector('.meta .time');
      if (meta) meta.textContent = this.formatTime(m.ts);
      el.dataset.status = 'delivered';
      const check = el.querySelector('.check');
      if (check) check.textContent = '✓';
      return;
    }
    
    const isMe = m.senderId === this.selfId;
    const wrap = document.createElement('div');
    wrap.className = 'msg' + (isMe ? ' me' : '');
    wrap.dataset.id = m.id;

    const av = document.createElement('div');
    av.className = 'avatar';
    av.dataset.username = m.username;
    this.renderAvatar(av, m.username);
    av.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.uiManager) window.uiManager.openProfileView(m.username, m.senderId);
    });

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    let html = '';
    // Render reply quote if present
    if (m.replyTo) {
      const rname = this.escapeHtml(m.replyTo.username || 'User');
      const rtext = this.escapeHtml(m.replyTo.text || (m.replyTo.hasFile ? 'Attachment' : ''));
      html += `<div class="reply-quote" data-target-id="${m.replyTo.id}">
        <div class="rq-name">${rname}</div>
        <div class="rq-text">${rtext}</div>
      </div>`;
    }
    if (m.text) html += this.linkify(this.escapeHtml(m.text));
    if (m.file) html += this.renderAttachment(m.file);
    bubble.innerHTML = html || '<span class="muted">Attachment</span>';

    const meta = document.createElement('div');
    meta.className = 'meta';
    const editedBadge = m.editedAt ? ' <span class="muted" style="font-size:12px">(edited)</span>' : '';
    meta.innerHTML = `<span class="who" style="cursor:pointer">${this.escapeHtml(m.username)}</span>
                      <span class="time">${this.formatTime(m.ts)}</span>${editedBadge}
                      ${isMe ? '<span class="check" title="Delivered">✓</span>' : ''}`;
    // Clicking the name opens profile
    meta.querySelector('.who')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.uiManager) window.uiManager.openProfileView(m.username, m.senderId);
    });

    const col = document.createElement('div');
    col.style.maxWidth = '100%';
    col.appendChild(bubble); 
    col.appendChild(meta);

    wrap.appendChild(av);
    wrap.appendChild(col);

    // Actions (reply for all, edit/delete for own)
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    actions.innerHTML = `
      <button class="action-btn reply" title="Reply">Reply</button>
      ${isMe ? '<button class="action-btn edit" title="Edit">Edit</button>' : ''}
      ${isMe ? '<button class="action-btn delete" title="Delete">Delete</button>' : ''}
    `;
    actions.querySelector('.reply')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.startReplyToMessage(m);
    });
    if (isMe) {
      actions.querySelector('.edit')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.startEditMessage(m.id);
      });
      actions.querySelector('.delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteMessage(m.id);
      });
    }
    wrap.appendChild(actions);

    this.msgIndex.set(m.id, wrap);
    if (this.chat) {
      this.chat.appendChild(wrap);
    }
    // Add swipe-to-reply handlers
    this.attachSwipeHandlers(wrap, m);
    // Clicking on reply quote scrolls to original
    bubble.querySelector('.reply-quote')?.addEventListener('click', (e) => {
      const tid = e.currentTarget.getAttribute('data-target-id');
      if (!tid) return;
      const row = this.msgIndex.get(tid);
      if (row && this.chat) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('highlight');
        setTimeout(() => row.classList.remove('highlight'), 800);
      }
    });
    this.maybeAutoScroll();
    // Update recent chat list
    this.updateRecentWithMessage(m);
  }

  // Reply helpers
  startReplyToMessage(m) {
    this.replyTo = {
      id: m.id,
      username: m.username,
      text: (m.text && m.text.slice(0, 200)) || (m.file ? `Attachment: ${m.file.name || 'file'}` : ''),
      hasFile: !!m.file
    };
    // Do not show the composer reply preview bar per user request
    if (this.replyPreviewEl) this.replyPreviewEl.hidden = true;
    if (this.input) this.input.focus();
  }

  cancelReply() {
    this.replyTo = null;
    if (this.replyPreviewEl) this.replyPreviewEl.hidden = true;
  }

  attachSwipeHandlers(wrap, m) {
    let startX = 0, startY = 0, dragging = false;
    const threshold = 36; // px to trigger reply
    wrap.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY; dragging = true;
      wrap.classList.add('swiping');
    }, { passive: true });
    wrap.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      const t = e.touches[0];
      const dx = t.clientX - startX; const dy = t.clientY - startY;
      if (Math.abs(dy) > 40) return; // vertical scroll cancels
      const translate = Math.max(0, Math.min(dx, 80));
      wrap.style.transform = `translateX(${translate}px)`;
    }, { passive: true });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      const current = parseFloat((wrap.style.transform.match(/translateX\(([-0-9.]+)px\)/)||[0,0])[1]);
      wrap.style.transition = 'transform .18s ease';
      wrap.style.transform = 'translateX(0px)';
      setTimeout(() => { wrap.style.transition = ''; wrap.classList.remove('swiping'); }, 200);
      if (current >= threshold) {
        this.startReplyToMessage(m);
      }
    };
    wrap.addEventListener('touchend', end, { passive: true });
    wrap.addEventListener('touchcancel', end, { passive: true });
  }

  renderAttachment(file) {
    try {
      const safeName = this.escapeHtml(file.name || 'file');
      const sizeKB = file.size ? ` (${Math.ceil(file.size/1024)} KB)` : '';
      if (file.type && file.type.startsWith('image/') && file.dataUrl) {
        return `<div style="margin-top:8px"><img src="${file.dataUrl}" alt="${safeName}" style="max-width:360px;width:100%;height:auto;border-radius:12px;border:1px solid var(--border);box-shadow:var(--shadow-light)"/></div>`;
      }
      const href = file.dataUrl || '#';
      return `<div style="margin-top:8px"><a href="${href}" download="${safeName}" target="_blank" rel="noopener" style="text-decoration:none;color:var(--accent)">Download ${safeName}${sizeKB}</a></div>`;
    } catch (e) {
      return '';
    }
  }

  addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'muted';
    div.style.textAlign = 'center';
    div.style.margin = '10px 0';
    div.textContent = text;
    if (this.chat) {
      this.chat.appendChild(div);
    }
    this.maybeAutoScroll();
  }

  renderUserList() {
    if (!this.userList) return;
    this.userList.innerHTML = '';
    const q = (document.querySelector('#userSearch')?.value || '').trim().toLowerCase();
    const onlineNames = new Set(Array.from(this.online.values()).map(u => String(u).toLowerCase()));
    const items = (this.accounts && this.accounts.length ? this.accounts.map(a => ({
      username: a.username,
      displayName: a.displayName || '',
      avatarDataUrl: a.avatarDataUrl || ''
    })) : Array.from(this.online.values()).map(u => ({ username: u, displayName: '', avatarDataUrl: '' })));
    items
      .filter(u => !q || u.username.toLowerCase().includes(q) || (u.displayName||'').toLowerCase().includes(q))
      .sort((a,b) => (a.displayName||a.username).localeCompare((b.displayName||b.username)))
      .forEach(u => {
        const div = document.createElement('div');
        div.className = 'user';
        const av = document.createElement('div');
        av.className = 'avatar';
        av.dataset.username = u.username;
        this.renderAvatar(av, u.username);
        const meta = document.createElement('div');
        const title = this.escapeHtml(u.displayName || u.username);
        const sub = u.username.toLowerCase() === (this.myName||'').toLowerCase() ? 'You' : (onlineNames.has(u.username.toLowerCase()) ? 'Online' : 'Offline');
        meta.innerHTML = `<div class="uname">${title}</div><div class="muted">@${this.escapeHtml(u.username)} · ${sub}</div>`;
        div.appendChild(av);
        div.appendChild(meta);
        div.addEventListener('click', () => {
          if (window.uiManager) window.uiManager.openProfileView(u.username, this.findUserIdByName(u.username));
        });
        this.userList.appendChild(div);
      });
  }

  findUserIdByName(username) {
    const key = String(username||'').toLowerCase();
    for (const [id, uname] of this.online) {
      if (String(uname).toLowerCase() === key) return id;
    }
    return null;
  }

  async fetchAccountsDirectory() {
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      if (data?.ok && Array.isArray(data.accounts)) {
        this.accounts = data.accounts;
        this.renderUserList();
      }
    } catch {}
  }

  // Attachment handling
  setAttachment(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      alert('File is too large. Max 5MB.');
      this.clearAttachment();
      return;
    }
    this.pendingFile = file;
    const isImage = file.type.startsWith('image/');
    const icon = isImage ?
      `<img src="${URL.createObjectURL(file)}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;" />` :
      this.fileIcon();
    
    if (this.attachmentPreviewEl) {
      this.attachmentPreviewEl.innerHTML = `${icon}
        <div class="attachment-info">
          <div>${this.escapeHtml(file.name)}</div>
          <div class="muted">${Math.ceil(file.size/1024)} KB</div>
        </div>
        <button class="btn icon-btn" id="clearAttachmentBtn" title="Remove attachment">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>`;
      this.attachmentPreviewEl.hidden = false;
      
      const clearBtn = document.querySelector('#clearAttachmentBtn');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => this.clearAttachment());
      }
    }
    // Mark attach button active
    const attachBtn = document.querySelector('#attach');
    if (attachBtn) attachBtn.classList.add('active');
    // Enable send button
    if (this.sendBtn) this.sendBtn.disabled = false;
  }

  clearAttachment() {
    this.pendingFile = null;
    if (this.fileInput) this.fileInput.value = '';
    if (this.attachmentPreviewEl) {
      this.attachmentPreviewEl.hidden = true;
      this.attachmentPreviewEl.innerHTML = '';
    }
    const attachBtn = document.querySelector('#attach');
    if (attachBtn) attachBtn.classList.remove('active');
    // Recompute send button state
    const empty = !(this.input?.value && this.input.value.trim().length) && !this.pendingFile;
    if (this.sendBtn) this.sendBtn.disabled = empty;
  }

  toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  }

  fileIcon() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="muted"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
  }

  // Typing handling
  sendTyping(v) {
    if (!this.socket) return;
    this.socket.emit('user:typing', v);
  }

  stopTypingSoon() {
    this.typing = false;
    clearTimeout(this.typingTO);
    this.sendTyping(false);
  }

  renderTyping() {
    if (!this.typingEl) return;
    
    const names = Array.from(this.typingUsers.values()).filter(v => typeof v === 'string');
    if (!names.length) { 
      this.typingEl.textContent = ''; 
      return; 
    }
    this.typingEl.textContent = names.length === 1
      ? `${names[0]} is typing…`
      : `${names[0]} and ${names.length - 1} other${names.length-1>1?'s':''} are typing…`;
  }

  // Scroll handling
  maybeAutoScroll() {
    if (this.nearBottom) this.scrollToBottom();
  }

  scrollToBottom(force = false) {
    if (!this.chat) return;
    if (force) {
      this.chat.scrollTop = this.chat.scrollHeight;
    } else {
      this.chat.scrollTo({ top: this.chat.scrollHeight, behavior: 'smooth' });
    }
  }

  autoGrow(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(180, textarea.scrollHeight) + 'px';
  }

  // Socket event handlers
  handleUserJoined({ id, username }) {
    this.online.set(id, username);
    this.renderUserList();

    // Load full accounts directory so you can message offline users
    this.fetchAccountsDirectory();
    this.addSystemMessage(`${username} joined`);
  }

  handleUserLeft({ id }) {
    const uname = this.online.get(id);
    this.online.delete(id);
    this.renderUserList();
    if (uname) this.addSystemMessage(`${uname} left`);
  }

  handleRoomCount({ count }) {
    if (this.userCountEl) {
      this.userCountEl.textContent = count + ' online';
    }
  }

  handleTyping({ id, username, isTyping }) {
    if (id === this.selfId) return;
    if (isTyping) {
      this.typingUsers.set(id, username);
      clearTimeout(this.typingUsers.get(id + ':t'));
      const t = setTimeout(() => { 
        this.typingUsers.delete(id); 
        this.typingUsers.delete(id + ':t'); 
        this.renderTyping(); 
      }, 1500);
      this.typingUsers.set(id + ':t', t);
    } else {
      this.typingUsers.delete(id);
      clearTimeout(this.typingUsers.get(id + ':t'));
      this.typingUsers.delete(id + ':t');
    }
    this.renderTyping();
  }

  // Initialize chat after joining room
  initializeRoom(data) {
    this.selfId = data.selfId;
    if (this.roomNameEl) {
      this.roomNameEl.textContent = '#' + data.room;
    }
    if (this.userCountEl) {
      this.userCountEl.textContent = (data.users?.length || 0) + ' online';
    }
    
    this.online.clear();
    (data.users || []).forEach(u => this.online.set(u.id, u.username));
    this.renderUserList();

    if (this.chat) {
      this.chat.innerHTML = '';
    }
    this.msgIndex.clear();
    (data.history || []).forEach(m => this.appendOrUpdateMessage(m));

    this.scrollToBottom(true);

    // Update recent chats from history tail or touch room
    const last = (data.history || []).length ? (data.history[data.history.length - 1]) : null;
    if (last) {
      this.updateRecentWithMessage(last);
    } else {
      this.touchRecentRoom(data.room, 'Joined room', Date.now());
    }

    // Save
    localStorage.setItem('chat:name', this.myName);
    localStorage.setItem('chat:room', this.myRoom);
    this.updateSubtitle();
  }

  updateSubtitle() {
    const subtitleEl = document.querySelector('#subtitle');
    if (subtitleEl) {
      subtitleEl.textContent = `Room #${this.myRoom} · You are ${this.myName}`;
    }
  }

  // Utility functions
  initials(name) {
    return name.trim().slice(0,1).toUpperCase();
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

  formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  linkify(s) {
    return s.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
  }

  // Getters
  getSelfId() {
    return this.selfId;
  }

  getMyName() {
    return this.myName;
  }

  getMyRoom() {
    return this.myRoom;
  }

  getOnlineUsers() {
    return this.online;
  }

  getUsername(id) {
    return this.online.get(id);
  }

  // Setters
  setMyName(name) {
    this.myName = name;
  }

  setMyRoom(room) {
    this.myRoom = room;
  }

  // ===== Recent Chats Sidebar =====
  isDmRoom(room) {
    return typeof room === 'string' && room.startsWith('dm-');
  }
  dmTitleFromRoom(room) {
    try {
      // dm-a--b
      const parts = String(room).slice(3).split('--');
      const me = (this.myName || '').toLowerCase();
      const a = (parts[0] || '').toLowerCase();
      const b = (parts[1] || '').toLowerCase();
      const other = me && a === me ? b : a;
      return other ? other : room;
    } catch { return room; }
  }
  updateRecentWithMessage(m) {
    const room = m.room || this.myRoom;
    if (!room) return;
    const isDm = this.isDmRoom(room);
    const title = isDm ? this.dmTitleFromRoom(room) : `#${room}`;
    const last = (m.text && m.text.trim()) || (m.file ? `Attachment: ${m.file?.name || 'file'}` : '');
    const ts = m.ts || Date.now();
    this.recentChats.set(room, { room, title, last, ts, isDm });
    this.renderChatList();
  }
  touchRecentRoom(room, placeholder = '', ts = Date.now()) {
    const isDm = this.isDmRoom(room);
    const title = isDm ? this.dmTitleFromRoom(room) : `#${room}`;
    const rc = this.recentChats.get(room) || { room, title, last: placeholder, ts, isDm };
    rc.title = title;
    if (placeholder) rc.last = placeholder;
    rc.ts = ts;
    this.recentChats.set(room, rc);
    this.renderChatList();
  }
  renderChatList() {
    if (!this.chatList) return;
    const q = (document.querySelector('#userSearch')?.value || '').trim().toLowerCase();
    const items = Array.from(this.recentChats.values())
      .sort((a,b) => (b.ts||0) - (a.ts||0))
      .filter(rc => !q || rc.title.toLowerCase().includes(q));
    this.chatList.innerHTML = '';
    for (const rc of items) {
      const div = document.createElement('div');
      div.className = 'chat-item' + (rc.room === this.myRoom ? ' active' : '');
      const av = document.createElement('div');
      av.className = 'avatar';
      const avLabel = rc.isDm ? rc.title : rc.title.replace(/^#/, '');
      if (rc.isDm) {
        av.dataset.username = rc.title;
        this.renderAvatar(av, rc.title);
      } else {
        av.style.background = this.stringToGradient(avLabel);
        av.textContent = this.initials(avLabel);
      }
      const meta = document.createElement('div');
      const time = new Date(rc.ts || Date.now());
      const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      meta.innerHTML = `<div class="uname">${this.escapeHtml(rc.title)}</div>
                        <div class="muted ellipsis">${this.escapeHtml(rc.last || '')}</div>`;
      const tdiv = document.createElement('div');
      tdiv.className = 'muted time-sm';
      tdiv.textContent = timeStr;
      div.appendChild(av);
      div.appendChild(meta);
      div.appendChild(tdiv);
      div.addEventListener('click', () => {
        if (rc.room !== this.myRoom) {
          window.realtimeChatApp?.changeRoom(rc.room);
        }
      });
      this.chatList.appendChild(div);
    }
  }
}

// Export for use in other modules
window.ChatManager = ChatManager;
