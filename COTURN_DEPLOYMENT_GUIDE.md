# Coturn STUN/TURN Server Deployment Guide

Complete guide to deploy and configure a production-ready Coturn STUN/TURN server for ConnectFlow.

---

## What is STUN/TURN?

- **STUN (Session Traversal Utilities for NAT)**: Helps discover your public IP address when behind a firewall or NAT
- **TURN (Traversal Using Relays around NAT)**: Relays media when direct peer-to-peer connection is impossible

### When You Need TURN

- Users behind restrictive firewalls or corporate networks
- Symmetric NAT scenarios
- 4G/5G mobile networks with carrier-grade NAT
- P2P connection establishment fails

---

## AWS EC2 Deployment (Recommended)

### Step 1: Launch EC2 Instance

```bash
# AWS CLI
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.medium \
  --key-name your-key \
  --security-group-ids sg-xxxxx \
  --subnet-id subnet-xxxxx \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=coturn-server}]'
```

**Recommended Instance Type:**
- **t3.medium** for up to 50 concurrent calls
- **t3.large** for 100+ concurrent calls
- **m5.large** for 500+ concurrent calls

### Step 2: Security Group Rules

```bash
# Allow STUN/TURN ports
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxx \
  --protocol udp \
  --port 3478 \
  --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxx \
  --protocol tcp \
  --port 3478 \
  --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxx \
  --protocol udp \
  --port 5349 \
  --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxx \
  --protocol tcp \
  --port 5349 \
  --cidr 0.0.0.0/0

# Allow SSH
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxx \
  --protocol tcp \
  --port 22 \
  --cidr YOUR_IP/32
```

### Step 3: SSH and Install Coturn

```bash
# Connect to instance
ssh -i your-key.pem ubuntu@your-instance-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install Coturn
sudo apt install -y coturn certbot python3-certbot-nginx

# Enable Coturn service
sudo systemctl enable coturn
```

### Step 4: Configure Coturn

Edit `/etc/coturn/turnserver.conf`:

```ini
# Basic Configuration
realm=your-domain.com
server-name=turn.your-domain.com

# Ports
listening-port=3478
alt-listening-port=3479
listening-ip=0.0.0.0
external-ip=YOUR_ELASTIC_IP/YOUR_ELASTIC_IP

# Secure ports (TLS)
tls-listening-port=5349
alt-tls-listening-port=5350

# Database (optional, for scaling)
# psql_connect_info="host=db.example.com dbname=coturn user=coturn password=password"

# Users (simple method)
user=webrtc-user:webrtc-password

# TURN relay settings
relay-ip=YOUR_ELASTIC_IP
relay-threads=4

# Security
fingerprint
bps-capacity=0

# Logging
log-file=/var/log/coturn/turnserver.log
verbose

# Performance
max-bps=1000000
bps-capacity=0

# Additional options
allow-external-ip
stale-nonce=600
oauth
response-origin-only-check
allow-loopback-peers
realm-autogenerate
```

### Step 5: SSL/TLS Setup

```bash
# Get certificate (for TLS connections)
sudo certbot certonly --standalone \
  -d turn.your-domain.com

# Update coturn config with cert paths
# In turnserver.conf:
# cert=/etc/letsencrypt/live/turn.your-domain.com/fullchain.pem
# pkey=/etc/letsencrypt/live/turn.your-domain.com/privkey.pem

# Restart Coturn
sudo systemctl restart coturn
```

### Step 6: Elastic IP Assignment

```bash
# Allocate Elastic IP
aws ec2 allocate-address --domain vpc

# Associate with instance
aws ec2 associate-address \
  --instance-id i-xxxxxx \
  --allocation-id eipalloc-xxxxx
```

---

## Docker Deployment

### Dockerfile

Create `docker/coturn/Dockerfile`:

```dockerfile
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    coturn \
    certbot \
    && rm -rf /var/lib/apt/lists/*

COPY turnserver.conf /etc/coturn/turnserver.conf
COPY docker-entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

EXPOSE 3478/udp 3478/tcp 5349/tcp 5350/tcp

ENTRYPOINT ["/entrypoint.sh"]
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  coturn:
    build:
      context: .
      dockerfile: docker/coturn/Dockerfile
    image: connectflow-coturn:latest
    container_name: coturn-server
    network_mode: host
    restart: always
    volumes:
      - ./docker/coturn/turnserver.conf:/etc/coturn/turnserver.conf
      - ./certs:/etc/letsencrypt:ro
      - coturn-logs:/var/log/coturn
    environment:
      - TURNSERVER_REALM=your-domain.com
      - TURNSERVER_EXTERNAL_IP=YOUR_ELASTIC_IP
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3478"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  coturn-logs:
    driver: local
```

### Deploy to Docker

```bash
# Build image
docker-compose build

# Start service
docker-compose up -d

# View logs
docker-compose logs -f coturn

# Test connectivity
docker exec coturn-server turnutils_uclient -v -t -W webrtc-password username 127.0.0.1
```

---

## Kubernetes Deployment

### Helm Chart Values

Create `helm/coturn/values.yaml`:

```yaml
replicaCount: 3

image:
  repository: connectflow-coturn
  tag: latest
  pullPolicy: IfNotPresent

service:
  type: LoadBalancer
  stun:
    port: 3478
    nodePort: 30478
  turns:
    port: 5349
    nodePort: 30549

resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 2000m
    memory: 2Gi

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70

persistence:
  enabled: true
  size: 10Gi
  storageClassName: gp2

config:
  realm: your-domain.com
  externalIp: YOUR_ELASTIC_IP
```

### Kubernetes Manifest

Create `k8s/coturn-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: coturn
  namespace: default
spec:
  replicas: 3
  selector:
    matchLabels:
      app: coturn
  template:
    metadata:
      labels:
        app: coturn
    spec:
      containers:
      - name: coturn
        image: connectflow-coturn:latest
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 3478
          protocol: UDP
          name: stun-udp
        - containerPort: 3478
          protocol: TCP
          name: stun-tcp
        - containerPort: 5349
          protocol: TCP
          name: turns-tcp
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 2000m
            memory: 2Gi
        env:
        - name: TURNSERVER_REALM
          value: your-domain.com
        - name: TURNSERVER_EXTERNAL_IP
          value: YOUR_ELASTIC_IP
        volumeMounts:
        - name: coturn-config
          mountPath: /etc/coturn
        - name: logs
          mountPath: /var/log/coturn
        livenessProbe:
          tcpSocket:
            port: 3478
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          tcpSocket:
            port: 3478
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: coturn-config
        configMap:
          name: coturn-config
      - name: logs
        emptyDir: {}

---
apiVersion: v1
kind: Service
metadata:
  name: coturn-lb
spec:
  type: LoadBalancer
  selector:
    app: coturn
  ports:
  - port: 3478
    targetPort: 3478
    protocol: UDP
    name: stun-udp
  - port: 3478
    targetPort: 3478
    protocol: TCP
    name: stun-tcp
  - port: 5349
    targetPort: 5349
    protocol: TCP
    name: turns-tcp
```

---

## Configure ConnectFlow to Use TURN

Update `hooks/useWebRTC.ts`:

```typescript
const configuration: RTCConfiguration = {
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
      ],
    },
    {
      urls: ['turn:turn.your-domain.com:3478?transport=udp'],
      username: 'webrtc-user',
      credential: 'webrtc-password',
    },
    {
      urls: ['turn:turn.your-domain.com:5349?transport=tcp'],
      username: 'webrtc-user',
      credential: 'webrtc-password',
    },
  ],
  iceCandidatePoolSize: 10,
};

// Rest of configuration
const peerConnection = new RTCPeerConnection(configuration);
```

---

## Monitoring & Health Checks

### Prometheus Metrics

Enable in `turnserver.conf`:

```ini
# Prometheus metrics
prometheus
prometheus-ip=0.0.0.0
prometheus-port=8089
```

### Health Check Script

Create `scripts/coturn-health-check.sh`:

```bash
#!/bin/bash

TURN_SERVER="turn.your-domain.com"
TURN_PORT="3478"
TURN_USER="webrtc-user"
TURN_PASS="webrtc-password"

# Test STUN
echo "Testing STUN..."
if nc -zv -w 2 $TURN_SERVER $TURN_PORT; then
    echo "✓ STUN port is open"
else
    echo "✗ STUN port is closed"
    exit 1
fi

# Test TURN connectivity
echo "Testing TURN..."
turnutils_uclient -v -t -W $TURN_PASS -u $TURN_USER $TURN_SERVER

# Check CPU and memory
echo "Server Resources:"
free -h
top -bn1 | head -n 12

# Check logs
echo "Recent errors:"
tail -20 /var/log/coturn/turnserver.log | grep -i error
```

### Automated Monitoring

```bash
# Create cron job
0 * * * * /opt/scripts/coturn-health-check.sh

# Monitor bandwidth usage
nethogs -t eth0

# Monitor connections
netstat -an | grep ESTABLISHED | wc -l
```

---

## Load Testing

### Test with turnutils

```bash
# Single connection test
turnutils_uclient -v -t -W webrtc-password username turn.your-domain.com

# Stress test with multiple connections
for i in {1..100}; do
  turnutils_uclient -v -t -W webrtc-password user$i turn.your-domain.com &
done
```

### Test with PION Library

```bash
# Create test file: test-turn.go
package main

import (
	"fmt"
	"github.com/pion/webrtc/v3"
)

func main() {
	config := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{
				URLs:       []string{"turn:turn.your-domain.com:3478"},
				Username:   "webrtc-user",
				Credential: "webrtc-password",
			},
		},
	}

	peerConnection, _ := webrtc.NewPeerConnection(config)
	fmt.Println("Connection established:", peerConnection)
}
```

---

## Troubleshooting

### Coturn Not Starting

```bash
# Check logs
sudo tail -f /var/log/coturn/turnserver.log

# Verify syntax
sudo turnserver -c /etc/coturn/turnserver.conf -v

# Check permissions
ls -la /etc/coturn/turnserver.conf
```

### Connection Issues

```bash
# Verify ports are open
sudo netstat -tuln | grep 3478

# Test from external host
telnet turn.your-domain.com 3478

# Check firewall
sudo ufw status
sudo iptables -L
```

### Performance Issues

```bash
# Monitor real-time usage
watch -n 1 'netstat -an | grep ESTABLISHED | wc -l'

# Check thread usage
cat /var/log/coturn/turnserver.log | grep "relay_threads"

# Increase relay threads in config:
relay-threads=8
bps-capacity=10000000
```

---

## Cost Optimization

### Bandwidth

| Provider | Cost | Notes |
|----------|------|-------|
| AWS | $0.09/GB out | EC2 data transfer |
| Linode | $20/mo | 20TB included |
| Heroku | $50/month | Limited bandwidth |
| DigitalOcean | $12/mo | Custom pricing |

### Scaling Strategy

1. **Small**: 1 Coturn instance (up to 50 calls)
2. **Medium**: 3 instances + load balancer (50-200 calls)
3. **Large**: 10+ instances in multi-region (200+ calls)

---

## Production Checklist

- [ ] Elastic IP assigned to Coturn server
- [ ] SSL/TLS certificates configured
- [ ] Security groups restrict access appropriately
- [ ] Monitoring and alerting enabled
- [ ] Health checks configured
- [ ] Automatic failover in place
- [ ] Bandwidth limits set
- [ ] Logging enabled
- [ ] Backup strategy defined
- [ ] Load testing completed
- [ ] Documentation updated
- [ ] Team trained on operations

---

**Phase 6 Complete: Production-ready Coturn STUN/TURN server!**
