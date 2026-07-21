import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, RedisClientType } from 'redis';
import { Server } from 'socket.io';

let publisher: RedisClientType | null = null;
let subscriber: RedisClientType | null = null;
let ready = false;

function redisUrl() {
  const host = process.env.REDIS_HOST?.trim();
  if (!host) return null;
  const port = Number(process.env.REDIS_PORT || 6379);
  const password = process.env.REDIS_PASSWORD || undefined;
  const credentials = password ? `:${encodeURIComponent(password)}@` : '';
  return `redis://${credentials}${host}:${port}`;
}

export async function configureRedisAdapter(io: Server) {
  const url = redisUrl();
  if (!url) {
    console.warn('[redis] REDIS_HOST is not configured; Socket.IO is running in single-instance mode');
    return false;
  }

  publisher = createClient({ url });
  subscriber = publisher.duplicate();
  publisher.on('error', (error) => console.error('[redis] publisher error', error));
  subscriber.on('error', (error) => console.error('[redis] subscriber error', error));

  try {
    await Promise.all([publisher.connect(), subscriber.connect()]);
    io.adapter(createAdapter(publisher, subscriber));
    ready = true;
    console.log('[redis] Socket.IO adapter connected');
    return true;
  } catch (error) {
    ready = false;
    await closeRedis();
    if (process.env.NODE_ENV === 'production') throw error;
    console.warn('[redis] unavailable; continuing in single-instance development mode');
    return false;
  }
}

export function isRedisReady() {
  return ready;
}

export async function closeRedis() {
  ready = false;
  await Promise.allSettled([
    publisher?.isOpen ? publisher.quit() : Promise.resolve(),
    subscriber?.isOpen ? subscriber.quit() : Promise.resolve(),
  ]);
  publisher = null;
  subscriber = null;
}
