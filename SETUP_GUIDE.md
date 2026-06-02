# ConnectFlow - Complete Setup Guide

This guide covers setting up ConnectFlow from scratch, both frontend and backend components.

---

## Prerequisites

- **Node.js**: v18.0.0 or higher ([download](https://nodejs.org/))
- **PostgreSQL**: 12 or higher ([download](https://www.postgresql.org/))
- **Git**: For cloning and version control
- **Docker**: Optional, for containerized deployment
- **A Unix-like system** (Linux/macOS) or WSL for Windows

---

## Part 1: Frontend Setup (React + Next.js)

### Step 1: Clone or create the project

```bash
# Clone the repository (if it exists)
git clone https://github.com/yourusername/connectflow.git
cd connectflow

# Or use the provided code directly
```

### Step 2: Install dependencies

```bash
npm install
# or
yarn install
```

### Step 3: Create environment variables

```bash
# Copy the example file
cp .env.example .env.local

# Edit .env.local with your settings
nano .env.local
```

**Environment variables for frontend** (`.env.local`):

```env
# Frontend App
NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_SIGNALING_SERVER=http://localhost:3001

# Coturn Server (optional, for production)
NEXT_PUBLIC_STUN_SERVER=stun:stun.l.google.com:19302
NEXT_PUBLIC_TURN_SERVER=turn:your-turn-server.com:3478
NEXT_PUBLIC_TURN_USERNAME=username
NEXT_PUBLIC_TURN_PASSWORD=password
```

### Step 4: Run the development server

```bash
npm run dev
```

The frontend will be available at **http://localhost:3000**

---

## Part 2: Backend Setup (Node.js + Express)

### Step 1: Set up database

#### Option A: Local PostgreSQL

```bash
# On macOS with Homebrew
brew install postgresql
brew services start postgresql

# On Ubuntu/Debian
sudo apt-get install postgresql postgresql-contrib
sudo service postgresql start

# Create a new database and user
sudo -u postgres psql

postgres=# CREATE DATABASE videoconference;
postgres=# CREATE USER videoconf_user WITH PASSWORD 'secure_password';
postgres=# ALTER ROLE videoconf_user SET client_encoding TO 'utf8';
postgres=# ALTER ROLE videoconf_user SET default_transaction_isolation TO 'read committed';
postgres=# GRANT ALL PRIVILEGES ON DATABASE videoconference TO videoconf_user;
postgres=# \q
```

#### Option B: Docker PostgreSQL

```bash
docker run --name videoconf-db \
  -e POSTGRES_DB=videoconference \
  -e POSTGRES_USER=videoconf_user \
  -e POSTGRES_PASSWORD=secure_password \
  -p 5432:5432 \
  -d postgres:15
```

### Step 2: Server environment setup

```bash
# Copy .env.example to .env
cp .env.example .env

# Edit with your database credentials
nano .env
```

**Update these values in `.env`:**

```env
# Database Connection
DB_USER=videoconf_user
DB_PASSWORD=secure_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=videoconference

# JWT Secret (change this!)
JWT_SECRET=your-super-secret-key-min-32-chars-long

# Coturn Servers
TURN_SERVER=turn:stun.l.google.com:3478
STUN_SERVER=stun:stun.l.google.com:19302
TURN_USERNAME=optional
TURN_PASSWORD=optional

# Server
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

### Step 3: Install backend dependencies

```bash
npm install
```

### Step 4: Initialize database

The server will auto-initialize tables on first startup, but you can manually initialize:

```bash
npm run db:init  # If you add this script to package.json
```

Or connect and run SQL:

```bash
psql -U videoconf_user -d videoconference -f scripts/init-db.sql
```

### Step 5: Run the backend server

```bash
npm run dev
```

The backend will be available at **http://localhost:3001**

---

## Part 3: Coturn STUN/TURN Server Setup

### Why Coturn?

Coturn enables WebRTC connections through firewalls and NAT. Essential for production deployments.

### Option A: Self-Hosted on Linux VPS

#### 1. SSH into your VPS

```bash
ssh root@your-vps-ip
```

#### 2. Install Coturn

```bash
# Ubuntu/Debian
apt-get update
apt-get install coturn

# Enable Coturn to start on boot
systemctl enable coturn
```

#### 3. Configure Coturn

Edit `/etc/coturn/turnserver.conf`:

```bash
nano /etc/coturn/turnserver.conf
```

**Key configuration:**

```ini
# Server info
realm=yourdomain.com
server-name=turn.yourdomain.com
listening-port=3478
listening-ip=0.0.0.0

# External IP (your VPS IP)
external-ip=YOUR_VPS_IP/YOUR_VPS_IP

# Performance
max-bps=1000000
bps-capacity=1000000
max-allocate-timeout=3600

# Security
fingerprint
log-file=/var/log/coturn/turnserver.log

# User authentication
user=username:password
```

#### 4. Configure Firewall

```bash
# Allow necessary ports (UDP/TCP)
ufw allow 3478/udp
ufw allow 3478/tcp
ufw allow 5349/tcp
ufw enable
```

#### 5. Start Coturn

```bash
systemctl restart coturn
systemctl status coturn

# Check logs
tail -f /var/log/coturn/turnserver.log
```

### Option B: Docker Coturn

```bash
docker run -d \
  --name coturn \
  -p 3478:3478/tcp \
  -p 3478:3478/udp \
  -p 5349:5349/tcp \
  -p 5349:5349/udp \
  -e COTURN_REALM=yourdomain.com \
  -e COTURN_USER=username \
  -e COTURN_PASSWORD=password \
  -v /etc/coturn:/etc/coturn \
  coturn/coturn:latest
```

### Option C: Use Public STUN/TURN Servers

For testing/development:

```env
# Google's free STUN server
STUN_SERVER=stun:stun.l.google.com:19302

# Twilio's TURN server (free tier available)
TURN_SERVER=turn:numb.vivox.com:3478
TURN_USERNAME=username
TURN_PASSWORD=password
```

---

## Part 4: Database Migrations

### Create Migration Script

Create `/scripts/init-db.sql`:

```sql
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_users_email ON users(email);

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP
);

CREATE INDEX idx_rooms_creator_id ON rooms(creator_id);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_room_id ON chat_messages(room_id);

-- Room participants table
CREATE TABLE IF NOT EXISTS room_participants (
  id SERIAL PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  left_at TIMESTAMP
);

CREATE INDEX idx_room_participants_room_id ON room_participants(room_id);
```

### Run Migration

```bash
psql -U videoconf_user -d videoconference -f scripts/init-db.sql
```

---

## Part 5: SSL/TLS Certificates (Production)

### Using Let's Encrypt with Certbot

```bash
# Install Certbot
apt-get install certbot python3-certbot-nginx

# Get certificate
certbot certonly --standalone -d yourdomain.com

# Certificates will be in /etc/letsencrypt/live/yourdomain.com/
```

### Update Nginx/Caddy config (two domains)

```nginx
# Frontend domain
server {
  listen 80;
  server_name app.yourdomain.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name app.yourdomain.com;

  ssl_certificate /etc/letsencrypt/live/app.yourdomain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/app.yourdomain.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

# API + Socket.IO domain
server {
  listen 80;
  server_name api.yourdomain.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name api.yourdomain.com;

  ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

Recommended env values for this layout:

Frontend `.env.local`:
```env
NEXT_PUBLIC_FRONTEND_URL=https://app.yourdomain.com
NEXT_PUBLIC_SIGNALING_SERVER=https://api.yourdomain.com
```

Backend `server/.env`:
```env
FRONTEND_URL=https://app.yourdomain.com
PORT=3001
```

---

## Part 6: Production Deployment

### Option A: Vercel (Frontend)

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel
```

### Option B: Docker Compose (Full Stack)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: videoconference
      POSTGRES_USER: videoconf_user
      POSTGRES_PASSWORD: secure_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    build: ./server
    ports:
      - "3001:3001"
    environment:
      DB_HOST: db
      DB_USER: videoconf_user
      DB_PASSWORD: secure_password
      DB_NAME: videoconference
      JWT_SECRET: your-secret-key
      NODE_ENV: production
    depends_on:
      - db

  coturn:
    image: coturn/coturn:latest
    ports:
      - "3478:3478/tcp"
      - "3478:3478/udp"
    environment:
      COTURN_REALM: yourdomain.com
      COTURN_USER: username
      COTURN_PASSWORD: password

volumes:
  postgres_data:
```

Start with:

```bash
docker-compose up -d
```

---

## Part 7: Testing & Verification

### Test Frontend

```bash
# Navigate to http://localhost:3000
# You should see the landing page

# Test login with demo credentials:
# Email: demo@example.com
# Password: demo123456
```

### Test Backend

```bash
# Health check
curl http://localhost:3001/api/health

# Should return:
# {"status":"ok","timestamp":"2026-01-29T10:00:00.000Z"}
```

### Test WebSocket Connection

```javascript
// In browser console
const io = await import('socket.io-client').then(m => m.default);
const socket = io('http://localhost:3001');
socket.on('connect', () => console.log('Connected!'));
```

### Test TURN/STUN

Use an online [WebRTC test tool](https://test.webrtc.org/) to verify connectivity.

---

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3001
lsof -i :3001

# Kill process
kill -9 <PID>
```

### Database Connection Error

```bash
# Test connection
psql -U videoconf_user -h localhost -d videoconference

# Check PostgreSQL is running
sudo systemctl status postgresql
```

### WebRTC Connection Issues

1. Check firewall allows UDP/TCP traffic
2. Verify TURN/STUN server is accessible
3. Check browser console for errors
4. Test with a [WebRTC tester](https://test.webrtc.org/)

### Socket.IO Connection Fails

1. Verify backend is running: `curl http://localhost:3001/api/health`
2. Check CORS configuration in `server/index.ts`
3. Verify frontend URL in `.env`

---

## Monitoring & Logging

### Backend Logs

```bash
# Docker
docker logs -f <container_id>

# Direct
tail -f /var/log/connectflow/app.log
```

### Database Queries

Enable query logging in PostgreSQL:

```sql
ALTER DATABASE videoconference SET log_statement = 'all';
```

### Application Monitoring

```bash
# Use PM2 for process management
npm i -g pm2

# Start with PM2
pm2 start server/index.ts --name "connectflow-backend"
pm2 logs
```

---

## Security Checklist

- [ ] Change JWT_SECRET to a strong, unique value
- [ ] Update database password
- [ ] Enable HTTPS/WSS certificates
- [ ] Configure firewall rules
- [ ] Set up rate limiting
- [ ] Enable CORS properly
- [ ] Use environment variables for secrets
- [ ] Enable PostgreSQL authentication
- [ ] Set up monitoring and alerts
- [ ] Regular backups of database
- [ ] Keep dependencies updated (`npm audit fix`)

---

## Next Steps

1. Implement complete WebRTC signaling
2. Add screen sharing functionality
3. Implement recording feature
4. Set up analytics dashboard
5. Add mobile app (React Native)
6. Implement E2E encryption
7. Add AI transcription
8. Deploy to production

---

## Support

For issues or questions:
- GitHub Issues: Report bugs
- Discord: Join community
- Email: support@connectflow.dev

---

**Happy conferencing! 🎥**
