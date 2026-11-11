'use client';

import { useCallback, useEffect, useState, type RefObject } from 'react';
import type { Socket } from 'socket.io-client';
import { appendChatMessage, MAX_CHAT_LENGTH, type MeetingChatMessage } from '@/lib/meetingChat';

export function useMeetingChat(roomId: string, socketRef: RefObject<Socket | null>, approvedRef: RefObject<boolean>) {
  const [chatMessages, setChatMessages] = useState<MeetingChatMessage[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  useEffect(() => { setChatMessages([]); setChatError(null); }, [roomId]);

  const receiveMessage = useCallback((message: unknown) => {
    setChatMessages((items) => appendChatMessage(items, message, roomId));
  }, [roomId]);

  const sendMessage = useCallback(async (text: string): Promise<boolean> => {
    const message = text.trim();
    const socket = socketRef.current;
    if (!message || message.length > MAX_CHAT_LENGTH) {
      setChatError(`Enter a message of 1–${MAX_CHAT_LENGTH} characters.`);
      return false;
    }
    if (!socket?.connected || !approvedRef.current) {
      setChatError('Chat is disconnected or waiting for admission. Reconnect and try again.');
      return false;
    }
    setChatError(null);
    return new Promise((resolve) => {
      // Do not queue chat offline or automatically replay it into another session.
      socket.timeout(5000).emit('send-message', { roomId, message, clientMessageId: crypto.randomUUID() },
        (error: Error | null, result?: { ok?: boolean; error?: string }) => {
          if (error || !result?.ok) {
            setChatError(error ? 'Delivery could not be confirmed. Check the conversation before retrying.' : result?.error || 'Unable to send message.');
            resolve(false);
          } else resolve(true);
        });
    });
  }, [approvedRef, roomId, socketRef]);

  return { chatMessages, chatError, sendMessage, receiveMessage };
}
