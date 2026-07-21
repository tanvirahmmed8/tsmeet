# TSMeet

**Video meetings, scheduling, API access, and server-managed recording**

Build with Next.js, Node.js, MySQL, Redis, Socket.IO, and a self-hosted LiveKit SFU. Supports meetings, calendars, booking flows, API docs, LiveKit Egress composite recording, and private MinIO storage.

![Node](https://img.shields.io/badge/Node-18%2B-green.svg)
![React](https://img.shields.io/badge/React-19.2-blue.svg)
![MySQL](https://img.shields.io/badge/MySQL-8%2B-4479A1.svg)

---

## 🎯 Key Features

- ✅ **1-to-1 & Small Group Video Calls** - WebRTC mesh rooms capped by `MAX_MESH_PARTICIPANTS` (default: 8)
- ✅ **HD Audio & Video** - Up to 1080p with adaptive bitrate
- ✅ **Screen Sharing** - Share your screen with zero latency
- ✅ **Text Chat** - Real-time messaging during meetings
- ✅ **Media Controls** - Mute/unmute, camera on/off
- ✅ **Meeting Links** - Invite via shareable link (no accounts needed for guests)
- ✅ **Secure** - End-to-end encryption ready, self-hosted
- ✅ **Archive Recording** - Recorder worker and recording session management

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MySQL 8+ (or compatible MariaDB)
- Git

### Installation

```bash
# 1. Clone repository
git clone https://github.com/tanvirahmmed8/tsmeet.git
cd tsmeet

# 2. Install dependencies
npm install

# 3. Setup environment
cp .env.example .env.local
# Edit .env.local with your configuration

# 4. Start frontend (http://localhost:3001)
npm run dev

# 5. In another terminal, start backend
cd server
npm install
npm run dev
# Runs on http://localhost:3002

# 6. Create MySQL database
# mysql -u root -p
# CREATE DATABASE videoconference;

# 7. Open browser and visit http://localhost:3001
```

**Test Credentials:**
- Email: `demo@example.com`
- Password: `demo123456`

---

## 📚 Documentation

- **[Setup Guide](./SETUP_GUIDE.md)** - Detailed installation for production
- **[API Documentation](./API.md)** - Backend REST + realtime contracts

---

## 🏗️ Architecture Overview

```
User Browser (React)
    ↓ WebRTC + Socket.IO
Signaling Server (Node.js/Express)
    ↓ HTTPS/REST
MySQL Database
    ↓
Coturn STUN/TURN Server
```

### Realtime Signaling Flow (Summary)
1. User requests to join room over Socket.IO.
2. Host approval flow controls waiting room access.
3. Peers exchange WebRTC offer/answer and ICE candidates through signaling server.
4. Media streams are sent peer-to-peer once connection is established.

### Security Model (Summary)
- JWT authentication for protected REST endpoints.
- Socket auth supports JWT from handshake.
- Prepared SQL queries via parameterized execution.
- CORS restricted by `FRONTEND_URL`.
- Use HTTPS/WSS in production.

### Core Components

**Frontend (Next.js + React)**
- Landing page with feature showcase
- User authentication (registration/login)
- Dashboard for managing meetings
- Full-featured video call interface
- Modern responsive UI with Tailwind CSS

**Backend (Node.js + Express)**
- WebSocket signaling for WebRTC
- REST API for auth and room management
- MySQL integration
- JWT-based authentication
- Real-time participant tracking

**Database (MySQL)**
- User accounts and authentication
- Meeting rooms and history
- Chat messages
- Participant tracking

**Infrastructure**
- Self-hosted Coturn for STUN/TURN
- No cloud APIs or external dependencies
- Docker deployment ready

---

## 🛠️ Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Frontend | React 19 + Next.js 16 | Modern, performant, full-stack |
| Backend | Node.js + Express | Fast, event-driven architecture |
| Real-time | WebRTC + Socket.IO | P2P connections, low latency |
| Database | MySQL | Reliable, scalable, and easy to operate |
| Auth | JWT + bcryptjs | Stateless, secure sessions |
| Styling | Tailwind CSS v4 | Utility-first, responsive design |
| UI Components | shadcn/ui | Beautiful, accessible components |
| NAT Traversal | Coturn | Self-hosted STUN/TURN server |

**All 100% free and open source.**

---

## 📊 Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Connection Time | < 2 seconds | WebRTC peer setup |
| Video Latency | < 100ms | End-to-end delay |
| Chat Latency | < 50ms | Message delivery |
| Max Participants | 8 by default | WebRTC mesh; use an SFU for larger rooms |
| Bandwidth | 2.5-4 Mbps | For HD video per user |
| CPU Usage | < 30% | Per signaling server |

---

## 🔒 Security

### Built-in Security
- **JWT Authentication** - Stateless, time-limited tokens
- **Password Hashing** - bcryptjs with salt rounds
- **DTLS-SRTP** - Encrypted media streams via WebRTC
- **Database Protection** - Prepared statements prevent SQL injection
- **CORS** - Restricted to authorized origins
- **HTTPS/WSS** - Encrypted in transit

### Future Improvements
- End-to-end encryption (Noise protocol)
- Two-factor authentication
- Activity audit logging
- Rate limiting
- DDoS protection

See [ARCHITECTURE.md](./ARCHITECTURE.md#security-considerations) for details.

---

## 💰 Cost Analysis

| Service | TSMeet | Zoom | Twilio | Daily.co |
|---------|-------------|------|--------|----------|
| 1-to-1 Calls | Free | Free (up to 40 min) | $0.01-0.05/min | $0.10-0.20/min |
| Group Calls | Free | $15.99/mo | $0.02-0.04/min | $0.25-0.50/min |
| Screen Share | Free | Free | Included | Included |
| Recording | Free* | $15.99/mo | Paid | Paid |
| **Annual Cost** | **$0** | **$192-240** | **$100-500** | **$300-1000** |

*Recording requires self-hosted FFmpeg setup

---

## 🚢 Deployment

### Development
```bash
npm run dev          # Frontend
cd server && npm run dev  # Backend
```

### Production
See [SETUP_GUIDE.md](./SETUP_GUIDE.md) for detailed steps.

Quick version:
```bash
# Run frontend and backend
# frontend: 127.0.0.1:3000
# backend(api+socket): 127.0.0.1:3001

# Configure two domains in Nginx:
# app.yourdomain.com -> 127.0.0.1:3000
# api.yourdomain.com -> 127.0.0.1:3001

# Issue SSL certs
certbot certonly --standalone -d app.yourdomain.com
certbot certonly --standalone -d api.yourdomain.com
```

Nginx reverse proxy example:
```nginx
server {
  listen 443 ssl http2;
  server_name app.yourdomain.com;
  ssl_certificate /etc/letsencrypt/live/app.yourdomain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/app.yourdomain.com/privkey.pem;
  location / { proxy_pass http://127.0.0.1:3000; }
}

server {
  listen 443 ssl http2;
  server_name api.yourdomain.com;
  ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
  location / {
    proxy_pass http://127.0.0.1:3002;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

Environment values for this setup:
```env
# frontend .env.local
NEXT_PUBLIC_SIGNALING_SERVER=https://api.yourdomain.com
BACKEND_URL=https://api.yourdomain.com

# backend server/.env
FRONTEND_URL=https://app.yourdomain.com
BACKEND_URL=http://127.0.0.1:3002
PORT=3002
```

### Docker Compose
```bash
docker-compose up -d
# Frontend: http://localhost:3001
# Backend: http://localhost:3002
# Database: mysql://localhost:3306/videoconference
```

---

## 📖 Usage Guide

### For Users
1. Visit your TSMeet deployment
2. Sign up with email and password
3. Create a new meeting or join an existing one
4. Share the link with participants
5. Enable camera/microphone and start talking

### For Developers
Quick reference:
- Add routes in `server/routes/*` and mount in `server/index.ts`.
- Database bootstraps automatically from `server/db.ts` on backend start.
- Frontend calls backend via Next API proxy routes in `app/api/*`.
- LiveKit media/session behavior is centered in `hooks/useLiveKitRoom.ts` and `app/room/[roomId]/page.tsx`; Socket.IO remains responsible for application events and moderation.
- Main APIs: auth, rooms, calendars, bookings, public calendars.

### For System Administrators
See [SETUP_GUIDE.md](./SETUP_GUIDE.md) for:
- Step-by-step installation
- MySQL setup
- Coturn configuration
- SSL/TLS certificates
- Docker deployment
- Troubleshooting

---

## 🧪 Developer Commands

```bash
# Frontend
npm run dev
npm run build
npm run lint

# Backend
cd server
npm run dev
npm run start
```

## ⚙️ Environment

Frontend `.env.local`:
```env
NEXT_PUBLIC_SIGNALING_SERVER=https://api.yourdomain.com
BACKEND_URL=https://api.yourdomain.com
```

Backend `server/.env`:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=videoconference
JWT_SECRET=change-this
FRONTEND_URL=https://app.yourdomain.com
BACKEND_URL=http://127.0.0.1:3002
PORT=3002
NODE_ENV=production
RECORDER_SERVICE_TOKEN=change-this-too
RECORDER_POLL_INTERVAL_MS=4000
RECORDER_SERVICE_INSTANCE_ID=tsmeet-recorder-1
```

---

## 🤝 Contributing

We welcome contributions! Whether it's features, bug fixes, documentation, or translations.

### Getting Started
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow the existing code style
- Add tests for new features
- Update documentation
- Keep commits atomic and descriptive

---

## 🗺️ Roadmap

### Phase 1 ✅ Complete
- [x] Core WebRTC infrastructure
- [x] User authentication
- [x] Video call interface
- [x] Chat functionality
- [x] Room management

### Phase 2 🚧 In Progress
- [x] Complete WebRTC peer connections for small mesh rooms
- [ ] Audio/video codec selection
- [ ] Bandwidth adaptation
- [ ] Recording support

### Phase 3 📋 Planned
- [ ] Advanced features (screen share, virtual backgrounds)
- [ ] Mobile app (React Native)
- [ ] AI transcription
- [ ] Meeting scheduling
- [ ] Analytics dashboard

See [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md) for full roadmap.

---

## 📞 Support

- **Documentation** - Use the repository docs in this project
- **GitHub Issues** - Replace with your repository issue tracker if needed
- **Discord** - Replace with your team or community link if needed
- **Email** - Replace with your support address

---

## 📜 License

TSMeet is provided as a self-hosted application and API platform.

See [LICENSE](./LICENSE) file for details.

---

## 👥 Community

- **GitHub Stars** - Give us a star if you like this project ⭐
- **Contribute** - Improve TSMeet for your deployment or product stack
- **Operate** - Run frontend, backend, and recorder worker separately

---

## 🎓 Learning Resources

### WebRTC
- [WebRTC Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [WebRTC Academy](https://webrtcacademy.com/)
- [Interactive WebRTC Samples](https://webrtc.github.io/samples/)

### Socket.IO
- [Socket.IO Documentation](https://socket.io/docs/)
- [Socket.IO Tutorial](https://socket.io/get-started/chat/)

### React & Next.js
- [React Documentation](https://react.dev)
- [Next.js Documentation](https://nextjs.org/docs)

### MySQL
- [MySQL Documentation](https://dev.mysql.com/doc/)
- [MySQL Tutorial](https://www.mysqltutorial.org/)

---

## 🙏 Acknowledgments

Built with inspiration from:
- [Zoom](https://zoom.us/) - for the user experience
- [Jitsi Meet](https://jitsi.org/jitsi-meet/) - product inspiration
- [WebRTC community](https://webrtc.org/) - enabling peer-to-peer communication

---

## 📈 Status

- **Latest Release**: v1.0.0-alpha
- **Status**: Active Development
- **Last Updated**: January 29, 2026
- **Node**: v18+
- **React**: v19.2+

---

## 🎉 Get Started Now

```bash
# Clone the repository
git clone https://github.com/tanvirahmmed8/tsmeet.git
cd tsmeet

# Follow the Quick Start guide above
npm install
npm run dev

# Visit http://localhost:3001
```

**Use the frontend, backend, and recorder worker together for full functionality.**

---

**TSMeet**

*Meetings, scheduling, API access, and recording in one stack*
