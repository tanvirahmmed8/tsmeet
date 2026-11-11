import assert from 'node:assert/strict';
import test from 'node:test';
import { appendChatMessage, receiveChatMessage, markChatRead, MAX_CHAT_MESSAGES, type MeetingChatState } from '../lib/meetingChat';

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

test('unread counts only valid new remote messages while not reading', () => {
  let state: MeetingChatState = { messages: [], unread: 0 };
  state = receiveChatMessage(state, message, 'room', 'self', false);
  assert.equal(state.unread, 1);
  assert.equal(receiveChatMessage(state, message, 'room', 'self', false), state);
  assert.equal(receiveChatMessage(state, { ...message, id: 'other-room', roomId: 'another' }, 'room', 'self', false), state);
  assert.equal(receiveChatMessage(state, null, 'room', 'self', false), state);
  state = receiveChatMessage(state, { ...message, id: 'own', senderId: 'self' }, 'room', 'self', false);
  assert.equal(state.unread, 1);
  state = markChatRead(state);
  assert.equal(state.unread, 0);
  assert.equal(state.messages.length, 2);
  state = receiveChatMessage(state, { ...message, id: 'visible' }, 'room', 'self', true);
  assert.equal(state.unread, 0);
  state = receiveChatMessage(state, { ...message, id: 'background' }, 'room', 'self', false);
  assert.equal(state.unread, 1);
});

test('unread still increments after bounded history reaches capacity', () => {
  let state: MeetingChatState = { messages: [], unread: 0 };
  for (let index = 0; index < MAX_CHAT_MESSAGES + 3; index++) {
    state = receiveChatMessage(state, { ...message, id: String(index) }, 'room', 'self', false);
  }
  assert.equal(state.messages.length, MAX_CHAT_MESSAGES);
  assert.equal(state.unread, MAX_CHAT_MESSAGES + 3);
  assert.equal(markChatRead(state).unread, 0);
});
