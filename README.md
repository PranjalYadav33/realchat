# Realtime Chat Application

A modern, feature-rich realtime chat application with video calling capabilities, built with Node.js, Socket.IO, and WebRTC.

## Features

### Chat Features
- Real-time messaging with Socket.IO
- File attachments (images, documents)
- Drag & drop file upload
- Typing indicators
- Message delivery status
- Room-based chat system
- No database required (ephemeral)

### Video Call Features
- High-quality video and audio calls
- Screen sharing
- Picture-in-picture mode
- Call quality monitoring with statistics
- Connection recovery and reconnection
- Mute/unmute audio and video
- Draggable local video window
- Mobile-responsive call interface
- Echo cancellation and noise suppression

### UI Features
- Modern, responsive design
- Dark/light theme toggle
- Mobile-friendly interface
- Smooth animations and transitions
- Toast notifications
- Modal dialogs

## Project Structure

```
realtime-chat/
├── server.js                 # Express server with Socket.IO
├── package.json              # Dependencies and scripts
├── public/                   # Client-side files
│   ├── index.html           # Main HTML structure
│   ├── css/
│   │   └── styles.css       # All CSS styles
│   └── js/
│       ├── app.js           # Main application controller
│       ├── chat.js          # Chat functionality
│       ├── webrtc.js        # WebRTC video call management
│       ├── ui-utils.js      # UI utilities and interactions
│       └── socket-handlers.js # Socket.IO event handlers
```

## File Descriptions

### Frontend Modules

#### `app.js` - Main Application Controller
- Initializes all other modules
- Manages application state
- Provides public API for the application
- Handles auto-start and connection management

#### `chat.js` - Chat Functionality
- Message sending and receiving
- File attachment handling
- Typing indicators
- User list management
- Message rendering and display

#### `webrtc.js` - WebRTC Video Calls
- Peer-to-peer connection management
- Media stream handling (audio/video)
- Screen sharing functionality
- Call quality monitoring
- Connection recovery
- Picture-in-picture support

#### `ui-utils.js` - UI Management
- Modal dialogs (join, user selection, calls)
- Theme management
- Mobile sidebar handling
- Button interactions
- Toast notifications

#### `socket-handlers.js` - Socket.IO Events
- Connection management
- Chat event handling
- Call signaling
- User presence management
- Room management

#### `styles.css` - Complete Styling
- Modern CSS with CSS custom properties
- Responsive design
- Dark/light theme support
- Call interface styling
- Animations and transitions

### Backend

#### `server.js` - Node.js Server
- Express web server with HTTPS
- Socket.IO real-time communication
- WebRTC signaling server
- Room and user management
- File attachment support

## Installation and Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Access the application:**
   - Open your browser to `https://localhost:3000`
   - Accept the self-signed certificate warning
   - Enter your name and room to start chatting

## Usage

### Starting a Chat
1. Enter your name and room name
2. Click "Join" to enter the chat room
3. Start sending messages and files

### Making Video Calls
1. Click the video call button in the message composer
2. Select a user from the online users list
3. Wait for them to accept the call
4. Use the call controls to mute, share screen, or end the call

### Advanced Features
- **Screen Sharing**: Click the screen share button during a video call
- **Picture-in-Picture**: Click the PiP button to minimize the call window
- **Theme Toggle**: Click the theme button to switch between dark/light modes
- **Mobile Support**: The interface adapts to mobile devices automatically

## Technical Details

### WebRTC Implementation
- Uses STUN servers for NAT traversal
- Implements proper offer/answer signaling
- Supports connection recovery and reconnection
- Includes call quality monitoring with statistics

### Real-time Communication
- Socket.IO for reliable real-time messaging
- Automatic reconnection handling
- Typing indicators with debouncing
- Message delivery confirmation

### Security Features
- HTTPS with self-signed certificates
- Input sanitization and validation
- File size limits for attachments
- XSS protection in message rendering

## Browser Compatibility

- Chrome 80+ (recommended)
- Firefox 75+
- Safari 13+
- Edge 80+

Note: WebRTC features require HTTPS and modern browser support.

## Development

The modular structure makes it easy to:
- Add new features to specific modules
- Modify UI components independently
- Extend WebRTC functionality
- Customize styling and themes

Each module is self-contained with clear interfaces, making the codebase maintainable and extensible.
