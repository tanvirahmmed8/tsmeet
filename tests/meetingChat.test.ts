import assert from 'node:assert/strict';
import test from 'node:test';
import { appendChatMessage, MAX_CHAT_MESSAGES } from '../lib/meetingChat';

const message = { id: 'one', roomId: 'room', socketId: 'socket', senderId: 'guest', senderName: 'Guest', message: '<b>plain text বাংলা</b>', timestamp: new Date().toISOString() };
test('chat accepts server messages once and rejects cross-room or malformed events', () => {
  const messages = appendChatMessage([], message, 'room');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].message, message.message);
  assert.equal(appendChatMessage(messages, message, 'room'), messages);
  assert.equal(appendChatMessage([], message, 'other').length, 0);
  for (const value of [null, {}, { ...message, timestamp: 'invalid' }, { ...message, message: ' ' }]) {
    assert.equal(appendChatMessage([], value, 'room').length, 0);
  }
});
test('chat keeps a bounded live session history', () => {
  const history = Array.from({ length: MAX_CHAT_MESSAGES }, (_, index) => ({ ...message, id: String(index) }));
  const result = appendChatMessage(history, { ...message, id: 'new' }, 'room');
  assert.equal(result.length, MAX_CHAT_MESSAGES);
  assert.equal(result[0].id, '1');
  assert.equal(result.at(-1)?.id, 'new');
});
