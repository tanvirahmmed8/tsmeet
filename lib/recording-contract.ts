export type RecordingSessionStatus =
  | 'awaiting_recorder'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'completed'
  | 'failed';

export type RecordingSession = {
  id: string;
  roomId: string;
  creatorId: string;
  startedByUserId: string;
  status: RecordingSessionStatus;
  hiddenRecorderSocketId?: string | null;
  recorderServiceInstanceId?: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt?: string | null;
  lastHeartbeatAt?: string | null;
  failureReason?: string | null;
};

export type StartRecordingSessionRequest = {
  roomId: string;
};

export type ClaimRecordingSessionRequest = {
  serviceInstanceId: string;
  recorderSocketId: string;
};

export type RecordingHeartbeatRequest = {
  serviceInstanceId: string;
};

export type FailRecordingSessionRequest = {
  reason: string;
};

export type JoinRecorderSocketPayload = {
  roomId: string;
  sessionId: string;
  serviceInstanceId: string;
  serviceToken: string;
};
