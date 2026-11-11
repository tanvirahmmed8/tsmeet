// Browser-safe protocol definitions only: no server state, credentials or imports.
export const MAX_CHAT_LENGTH = 2000;
export const MAX_CHAT_MESSAGES = 200;

export interface MeetingChatMessage {
  id: string;
  roomId: string;
  socketId: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: string;
}
