const http = require('http');
const fs = require('fs');
const express = require('express');
const path = require('path');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();

// Create HTTP server (Vercel handles HTTPS)
const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: '*',
    methods: ['GET', 'POST']
  },
});

// List all registered accounts (public fields only)
app.get('/api/accounts', (req, res) => {
  try {
    const arr = Array.from(accounts.values()).map(acc => ({
      username: acc.username,
      displayName: acc.displayName || '',
      avatarDataUrl: acc.avatarDataUrl || '',
      updatedAt: acc.updatedAt || acc.createdAt || Date.now(),
    }));
    res.json({ ok: true, accounts: arr });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory state (no DB)
const rooms = new Map(); // roomName -> { users: Map(socketId -> {username}), history: [] }
const users = new Map(); // socketId -> { username, room }

// Minimal auth storage (JSON file)
const dataDir = path.join(__dirname, 'data');
const usersFile = path.join(dataDir, 'users.json');
/**
 * accounts: Map of username -> { username, saltHex, hashHex, createdAt }
 */
const accounts = new Map();

function ensureDataDir() {
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
}
function loadAccounts() {
  try {
    ensureDataDir();
    if (fs.existsSync(usersFile)) {
      const raw = fs.readFileSync(usersFile, 'utf8');
      if (raw.trim().length) {
        const arr = JSON.parse(raw);
        arr.forEach(u => accounts.set(u.username, u));
      }
    }
  } catch (e) {
    console.error('Failed to load users.json', e);
  }
}
function saveAccounts() {
  try {
    ensureDataDir();
    const arr = Array.from(accounts.values());
    fs.writeFileSync(usersFile, JSON.stringify(arr, null, 2));
  } catch (e) {
    console.error('Failed to save users.json', e);
  }
}

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const saltHex = salt.toString('hex');
  const hashHex = crypto.scryptSync(password, salt, 64).toString('hex');
  return { saltHex, hashHex };
}
function verifyPassword(password, saltHex, hashHex) {
  const salt = Buffer.from(saltHex, 'hex');
  const computed = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hashHex, 'hex'), Buffer.from(computed, 'hex'));
}

loadAccounts();

// ---------- Auth Endpoints ----------
app.post('/api/auth/check-username', (req, res) => {
  try {
    let { username } = req.body || {};
    if (!username || typeof username !== 'string') return res.status(400).json({ ok: false, error: 'Username required' });
    username = String(username).trim().toLowerCase();
    const valid = /^[a-z0-9_\.\-]{3,24}$/.test(username);
    if (!valid) return res.json({ ok: true, available: false, reason: 'Invalid format' });
    const available = !accounts.has(username);
    return res.json({ ok: true, available });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// ---------- Profile Endpoints (simple, no auth layer) ----------
// Get public profile by username
app.get('/api/profile/:username', (req, res) => {
  try {
    let username = String(req.params.username || '').trim().toLowerCase();
    if (!username || !/^[a-z0-9_\.\-]{3,24}$/.test(username)) {
      return res.status(400).json({ ok: false, error: 'Invalid username' });
    }
    const acc = accounts.get(username);
    const profile = acc ? {
      username,
      displayName: acc.displayName || '',
      bio: acc.bio || '',
      avatarDataUrl: acc.avatarDataUrl || '',
      updatedAt: acc.updatedAt || acc.createdAt || Date.now(),
    } : { username, displayName: '', bio: '', avatarDataUrl: '' };
    return res.json({ ok: true, profile });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// Save profile for an existing user
app.post('/api/profile/save', (req, res) => {
  try {
    let { username, displayName, bio, avatarDataUrl } = req.body || {};
    if (!username) return res.status(400).json({ ok: false, error: 'Username required' });
    username = String(username).trim().toLowerCase();
    const acc = accounts.get(username);
    if (!acc) return res.status(404).json({ ok: false, error: 'User not found' });

    // Sanitize inputs
    displayName = (displayName ? String(displayName) : '').trim().slice(0, 40);
    bio = (bio ? String(bio) : '').trim().slice(0, 240);
    avatarDataUrl = (avatarDataUrl ? String(avatarDataUrl) : '').trim();

    // Basic validation for data URL size (~700KB max in JSON)
    if (avatarDataUrl && avatarDataUrl.length > 700 * 1024) {
      return res.status(400).json({ ok: false, error: 'Avatar too large' });
    }
    // Only allow images
    if (avatarDataUrl && !/^data:image\/(png|jpeg|jpg|webp);base64,/.test(avatarDataUrl)) {
      return res.status(400).json({ ok: false, error: 'Invalid avatar format' });
    }

    acc.displayName = displayName;
    acc.bio = bio;
    if (avatarDataUrl || avatarDataUrl === '') {
      acc.avatarDataUrl = avatarDataUrl; // allow clearing
    }
    acc.updatedAt = Date.now();
    accounts.set(username, acc);
    saveAccounts();
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

app.post('/api/auth/register', (req, res) => {
  try {
    let { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ ok: false, error: 'Missing fields' });
    username = String(username).trim().toLowerCase();
    const valid = /^[a-z0-9_\.\-]{3,24}$/.test(username);
    if (!valid) return res.status(400).json({ ok: false, error: 'Invalid username' });
    if (String(password).length < 6) return res.status(400).json({ ok: false, error: 'Password too short' });
    if (accounts.has(username)) return res.status(409).json({ ok: false, error: 'Username taken' });
    const { saltHex, hashHex } = hashPassword(String(password));
    const user = { username, saltHex, hashHex, createdAt: Date.now() };
    accounts.set(username, user);
    saveAccounts();
    return res.json({ ok: true, username });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    let { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ ok: false, error: 'Missing fields' });
    username = String(username).trim().toLowerCase();
    const acc = accounts.get(username);
    if (!acc) return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    const ok = verifyPassword(String(password), acc.saltHex, acc.hashHex);
    if (!ok) return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    return res.json({ ok: true, username });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

function getOrCreateRoom(room) {
  let r = rooms.get(room);
  if (!r) {
    r = { users: new Map(), history: [] };
    rooms.set(room, r);
  }
  return r;
}

function pruneHistory(history, limit = 100) {
  if (history.length > limit) history.splice(0, history.length - limit);
}

io.on('connection', (socket) => {
  // Join a room with a username
  socket.on('user:join', ({ username, room }, cb) => {
    try {
      if (!username || !room) {
        cb?.({ ok: false, error: 'Username and room required' });
        return;
      }
      username = String(username).trim().slice(0, 24);
      room = String(room).trim().slice(0, 64).toLowerCase();
      const r = getOrCreateRoom(room);

      // Enforce uniqueness within room
      for (const [id, u] of r.users.entries()) {
        if (u.username.toLowerCase() === username.toLowerCase()) {
          cb?.({ ok: false, error: 'Username already in use in this room' });
          return;
        }
      }

      users.set(socket.id, { username, room });
      r.users.set(socket.id, { username });

      socket.join(room);

      cb?.({
        ok: true,
        selfId: socket.id,
        room,
        users: Array.from(r.users.entries()).map(([id, u]) => ({
          id,
          username: u.username,
        })),
        history: r.history,
      });

      socket.to(room).emit('user:joined', { id: socket.id, username });
      io.to(room).emit('room:count', { count: r.users.size });
    } catch (e) {
      cb?.({ ok: false, error: 'Join failed' });
    }
  });

  // Incoming message (text or attachment)
  socket.on('chat:message', (msg, ack) => {
    const u = users.get(socket.id);
    if (!u) {
      ack?.({ ok: false, error: 'Join a room first' });
      return;
    }
    const hasText = typeof msg?.text === 'string' && msg.text.trim().length > 0;
    const hasFile = !!msg?.file && typeof msg.file === 'object';
    if (!hasText && !hasFile) {
      ack?.({ ok: false, error: 'Empty message' });
      return;
    }
    let text = hasText ? String(msg.text).trim().slice(0, 2000) : '';
    // Build replyTo object if provided
    let replyObj = undefined;
    try {
      const r = getOrCreateRoom(u.room);
      const replyId = typeof msg?.replyTo === 'string' ? msg.replyTo : null;
      if (replyId) {
        const orig = r.history.find(m => m.id === replyId);
        if (orig) {
          let preview = (orig.text && String(orig.text)) || '';
          if (!preview && orig.file) {
            const fname = orig.file?.name ? String(orig.file.name) : 'Attachment';
            preview = `Attachment: ${fname}`;
          }
          preview = preview.slice(0, 200);
          replyObj = {
            id: orig.id,
            username: orig.username,
            text: preview,
            hasFile: !!orig.file,
          };
        }
      }
    } catch {}

    const payload = {
      id: msg?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      file: hasFile ? {
        name: String(msg.file.name || 'file'),
        type: String(msg.file.type || 'application/octet-stream'),
        size: Number(msg.file.size || 0),
        dataUrl: String(msg.file.dataUrl || ''),
      } : undefined,
      replyTo: replyObj,
      senderId: socket.id,
      username: u.username,
      room: u.room,
      ts: Date.now(),
    };
    const r = getOrCreateRoom(u.room);
    r.history.push(payload);
    pruneHistory(r.history);
    io.to(u.room).emit('chat:message', payload);
    // If this is a DM room (dm-a--b), also notify the other participant even if they are not in this room
    try {
      const roomName = String(u.room || '');
      if (roomName.startsWith('dm-')) {
        const pair = roomName.slice(3).split('--');
        if (pair.length === 2) {
          const a = String(pair[0] || '').toLowerCase();
          const b = String(pair[1] || '').toLowerCase();
          const sender = String(u.username || '').toLowerCase();
          const other = sender === a ? b : a;
          if (other) {
            for (const [sid, info] of users.entries()) {
              if (String(info.username || '').toLowerCase() === other) {
                // If the recipient socket is not already in this room, send a lightweight notify
                if (info.room !== u.room) {
                  io.to(sid).emit('dm:notify', {
                    room: roomName,
                    fromUsername: u.username,
                    text,
                    file: !!payload.file,
                    ts: payload.ts,
                  });
                }
              }
            }
          }
        }
      }
    } catch {}
    ack?.({ ok: true, deliveredAt: Date.now() });
  });

  // Edit a previously sent message (only by its sender)
  socket.on('chat:edit', ({ id, text }, ack) => {
    try {
      const u = users.get(socket.id);
      if (!u) { ack?.({ ok: false, error: 'Join a room first' }); return; }
      if (!id || typeof text !== 'string') { ack?.({ ok: false, error: 'Invalid payload' }); return; }
      const r = getOrCreateRoom(u.room);
      const i = r.history.findIndex(m => m.id === id);
      if (i === -1) { ack?.({ ok: false, error: 'Message not found' }); return; }
      const msg = r.history[i];
      if (msg.senderId !== socket.id) { ack?.({ ok: false, error: 'Not allowed' }); return; }
      const newText = String(text).trim().slice(0, 2000);
      msg.text = newText;
      msg.editedAt = Date.now();
      r.history[i] = msg;
      io.to(u.room).emit('chat:edited', { id: msg.id, text: msg.text, editedAt: msg.editedAt });
      ack?.({ ok: true });
    } catch (e) {
      ack?.({ ok: false, error: 'Edit failed' });
    }
  });

  // Delete a previously sent message (only by its sender)
  socket.on('chat:delete', ({ id }, ack) => {
    try {
      const u = users.get(socket.id);
      if (!u) { ack?.({ ok: false, error: 'Join a room first' }); return; }
      if (!id) { ack?.({ ok: false, error: 'Invalid payload' }); return; }
      const r = getOrCreateRoom(u.room);
      const i = r.history.findIndex(m => m.id === id);
      if (i === -1) { ack?.({ ok: false, error: 'Message not found' }); return; }
      const msg = r.history[i];
      if (msg.senderId !== socket.id) { ack?.({ ok: false, error: 'Not allowed' }); return; }
      // Remove from history
      r.history.splice(i, 1);
      io.to(u.room).emit('chat:deleted', { id });
      ack?.({ ok: true });
    } catch (e) {
      ack?.({ ok: false, error: 'Delete failed' });
    }
  });

  // WebRTC Signaling v2 (proper call flow)
  socket.on('call:request', ({ targetId, callType }) => {
    const u = users.get(socket.id); if (!u) return;
    const targetUser = users.get(targetId);
    if (!targetUser || targetUser.room !== u.room) return; // must be in same room
    io.to(targetId).emit('call:incoming', { fromId: socket.id, fromUsername: u.username, callType });
  });

  socket.on('call:accept', ({ targetId }) => {
    const u = users.get(socket.id); if (!u) return;
    io.to(targetId).emit('call:accepted', { fromId: socket.id, fromUsername: u.username });
  });

  socket.on('call:decline', ({ targetId }) => {
    const u = users.get(socket.id); if (!u) return;
    io.to(targetId).emit('call:declined', { fromId: socket.id });
  });

  // Relay SDP and ICE candidates
  socket.on('rtc:signal', ({ targetId, signal }) => {
    const u = users.get(socket.id); if (!u) return;
    io.to(targetId).emit('rtc:signal', { fromId: socket.id, signal });
  });

  socket.on('call:hangup', ({ targetId }) => {
    const u = users.get(socket.id); if (!u) return;
    io.to(targetId).emit('call:hangup', { fromId: socket.id });
  });

  // Typing indicator
  socket.on('user:typing', (isTyping) => {
    const u = users.get(socket.id);
    if (!u) return;
    socket.to(u.room).emit('user:typing', {
      id: socket.id,
      username: u.username,
      isTyping: !!isTyping,
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    const u = users.get(socket.id);
    if (!u) return;
    users.delete(socket.id);
    const r = getOrCreateRoom(u.room);
    r.users.delete(socket.id);
    socket.to(u.room).emit('user:left', { id: socket.id });
    io.to(u.room).emit('room:count', { count: r.users.size });
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Chat server is running on port ${PORT}`);
  console.log(`Access it at: http://localhost:${PORT}`);
});

// Export for Vercel
module.exports = app;