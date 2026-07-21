import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  EncodingOptionsPreset,
  S3Upload,
} from 'livekit-server-sdk';
import { livekitRoomName } from './livekit';

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function egressClient() {
  return new EgressClient(
    required('LIVEKIT_URL').replace(/^ws/i, 'http'),
    required('LIVEKIT_API_KEY'),
    required('LIVEKIT_API_SECRET')
  );
}

export async function startRoomRecording(roomId: string, sessionId: string, segment = 0) {
  const objectKey = `rooms/${roomId}/${sessionId}/segment-${String(segment).padStart(4, '0')}.mp4`;
  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: objectKey,
    output: {
      case: 's3',
      value: new S3Upload({
        accessKey: required('MINIO_ACCESS_KEY'),
        secret: required('MINIO_SECRET_KEY'),
        endpoint: required('MINIO_ENDPOINT'),
        bucket: required('MINIO_BUCKET'),
        forcePathStyle: true,
      }),
    },
  });
  const info = await egressClient().startRoomCompositeEgress(
    livekitRoomName(roomId),
    output,
    {
      layout: 'speaker-dark',
      customBaseUrl: process.env.EGRESS_LAYOUT_URL || undefined,
      encodingOptions: EncodingOptionsPreset.H264_720P_30,
    }
  );
  return { egressId: info.egressId, objectKey, segment };
}

export async function stopRoomRecording(egressId: string) {
  const client = egressClient();
  let info = await client.stopEgress(egressId);
  const terminalStatuses = new Set([3, 4, 5, 6]);
  for (let attempt = 0; attempt < 20 && !terminalStatuses.has(info.status); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const matches = await client.listEgress({ egressId });
    if (matches[0]) info = matches[0];
  }
  return info;
}
