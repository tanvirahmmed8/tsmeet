import { MAX_CHAT_LENGTH, MAX_CHAT_MESSAGES, type MeetingChatMessage } from '../server/contracts/meetingChat';
export { MAX_CHAT_LENGTH, MAX_CHAT_MESSAGES, type MeetingChatMessage } from '../server/contracts/meetingChat';

export function appendChatMessage(messages: MeetingChatMessage[], value: unknown, roomId: string) {
  const item = value as Partial<MeetingChatMessage> | null;
  if (!item || item.roomId !== roomId || typeof item.id !== 'string' ||
    typeof item.senderId !== 'string' || typeof item.senderName !== 'string' ||
    typeof item.socketId !== 'string' || typeof item.timestamp !== 'string' ||
    !Number.isFinite(Date.parse(item.timestamp)) || typeof item.message !== 'string' ||
    !item.message.trim() || item.message.length > MAX_CHAT_LENGTH ||
    messages.some((message) => message.id === item.id)) return messages;
  return [...messages, item as MeetingChatMessage].slice(-MAX_CHAT_MESSAGES);
}
