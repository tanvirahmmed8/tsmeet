# Capacity and scaling

## Verified baseline (2026-07-20)

The local self-hosted node exposes 8 logical CPUs to LiveKit. The official
`livekit/livekit-cli` load generator was run inside the Docker edge network.

Verified scenario:

- 20 simultaneous participants: 10 medium-resolution simulcast video
  publishers plus 10 subscribers.
- Gallery policy: 3x3, so each subscriber received nine tracks.
- Result: 90/100 possible subscriptions active, 38.1 Mbps aggregate subscriber
  traffic, 0% packet loss, and zero client errors over the steady test window.

The 50-participant attempt did not pass on this node: after 20 publishers,
additional ICE connections timed out. Therefore 50 participants is a target,
not a supported claim for this server profile.

## Supported capacity

- Certified maximum on the current 8-vCPU development node: **20 participants
  in one video room**, with at most nine visible remote videos per desktop and
  four per mobile client.
- Operational admission threshold: stop placing new rooms on a node when CPU,
  memory, media egress, or packet-loss alerts cross their warning thresholds.
- A room is not split between LiveKit nodes. A single room must fit on one node;
  Redis allows separate rooms to be distributed across multiple nodes.

## Production server profile

Minimum profile for the verified 20-participant policy:

- 8 dedicated vCPU
- 16 GB RAM
- 1 Gbps symmetric network interface
- Linux with UDP media ports and file-descriptor limit of at least 65,535
- Separate Egress workers; do not run composite encoding on the SFU node

For the 50-participant target, begin with 16 dedicated compute-optimized vCPU,
32 GB RAM, and at least 2 Gbps symmetric networking, then rerun the exact TSMeet
load scenarios before raising `MAX_PARTICIPANTS`. LiveKit's published benchmark
also uses a 16-core compute-optimized node:
https://docs.livekit.io/transport/self-hosting/benchmark/

## Required release tests

Run the official CLI from a separate load-generator host so load generation
does not consume SFU CPU:

```bash
lk load-test --url wss://media.example.com \
  --api-key "$LIVEKIT_API_KEY" --api-secret "$LIVEKIT_API_SECRET" \
  --room capacity-20 --duration 5m \
  --video-publishers 10 --subscribers 10 \
  --video-resolution medium --layout 3x3

lk load-test --url wss://media.example.com \
  --api-key "$LIVEKIT_API_KEY" --api-secret "$LIVEKIT_API_SECRET" \
  --room capacity-50 --duration 5m \
  --video-publishers 25 --subscribers 25 \
  --video-resolution medium --layout 3x3
```

Pass only when every subscriber has the expected tracks, client errors are
zero, packet loss remains below 1%, and CPU stays below 70% sustained. Record
the server SKU, region, duration, ingress/egress, CPU, memory, and loss results.

## Horizontal scaling threshold

Add another LiveKit node before any of these are sustained for ten minutes:

- CPU above 70%
- memory above 80%
- network transmit above 70% of interface capacity
- packet loss above 1%
- more than 80% of the certified concurrent-room capacity

Redis is the shared coordination layer. Drain a node before maintenance and
place new rooms on healthy nodes; existing rooms remain on their assigned node.
