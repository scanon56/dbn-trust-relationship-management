import { BasicMessageProtocol, buildBasicMessage } from '../../src/core/protocols/BasicMessageProtocol';
import { eventBus, Events } from '../../src/core/events/EventBus';
import { messageRepository } from '../../src/core/messages/MessageRepository';
import { ProtocolHandler } from '../../src/types/protocol.types';

jest.mock('../../src/core/messages/MessageRepository', () => ({
  messageRepository: { create: jest.fn().mockResolvedValue(undefined) }
}));

describe('BasicMessageProtocol events', () => {
  const protocol: ProtocolHandler = new BasicMessageProtocol();

  test('emits basicmessage.received after storing message', async () => {
    const msg = buildBasicMessage('Hello world', 'en');
    const listener = jest.fn();
    eventBus.once(Events.BASIC_MESSAGE_RECEIVED, listener);

    await protocol.handle(msg as any, {
      direction: 'inbound',
      transport: 'http',
      encrypted: true,
      connectionId: 'conn-1',
      receivedAt: new Date(),
    });

    expect(messageRepository.create).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
    const payload = listener.mock.calls[0][0];
    expect(payload.content).toBe('Hello world');
    expect(payload.lang).toBe('en');
    expect(payload.connectionId).toBe('conn-1');
  });
});
