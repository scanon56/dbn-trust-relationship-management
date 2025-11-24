// src/core/events/EventBus.ts
import { EventEmitter } from 'events';

// Define payload interfaces
export interface BasicMessageReceivedPayload {
  messageId: string;
  connectionId?: string; // optional if not resolved yet
  fromDid: string;
  content: string;
  lang?: string;
  createdTime: number;
  encrypted: boolean;
  attachmentsCount: number;
}

// Event name constants
export const Events = {
  BASIC_MESSAGE_RECEIVED: 'basicmessage.received',
} as const;

export type EventMap = {
  [Events.BASIC_MESSAGE_RECEIVED]: BasicMessageReceivedPayload;
};

class EventBus {
  private emitter = new EventEmitter();

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.emitter.emit(event, payload);
  }

  on<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): void {
    this.emitter.on(event, listener);
  }

  once<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): void {
    this.emitter.once(event, listener);
  }

  off<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): void {
    this.emitter.off(event, listener);
  }
}

export const eventBus = new EventBus();
