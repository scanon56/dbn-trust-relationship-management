// src/openapiSpec.ts
export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'DBN Trust Relationship Management API',
    version: '1.0.0',
    description:
      'DIDComm-based peer-to-peer connection and message management for the Decentralized Business Network Platform.\n\nUse the Connections endpoints to create and accept invitations, then send messages over active connections. For encrypted DIDComm traffic from remote agents, use the /didcomm transport endpoint with Content-Type application/didcomm-encrypted+json.',
    contact: {
      name: 'API Support',
      email: 'support@example.com',
    },
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'Local development server A',
    },
    {
      url: 'http://localhost:3002',
      description: 'Local development server',
    },
    {
      url: 'https://api.example.com',
      description: 'Production server',
    },
  ],
  tags: [
    {
      name: 'Connections',
      description:
        'Manage DIDComm connections. Typical flow: 1) Create invitation, 2) Share the invitation URL, 3) Accept the invitation from the other agent (invited → requested), 4) Respond (requested → responded), 5) Acknowledge / confirm (responded → complete). In dual-instance local testing each agent may use a separate database (dbn_trust_management_a / dbn_trust_management_b) and sees only its own side of the handshake; use the correlationId (dbn:cid) to trace across both.',
    },
    {
      name: 'Messages',
      description:
        'Exchange DIDComm messages over established connections. Provide a valid connectionId and a DIDComm message type (e.g., https://didcomm.org/basicmessage/2.0/message).',
    },
    {
      name: 'DIDComm',
      description:
        'Transport endpoint for inbound encrypted DIDComm messages from peers. Clients must POST a JWE with Content-Type application/didcomm-encrypted+json and include the recipient DID as a query parameter.',
    },
    { name: 'Health', description: 'Service health and readiness probes.' },
  ],
  components: {
    schemas: {
      Connection: {
        type: 'object',
        description: 'Represents one side of a DIDComm connection. States advance independently per role.',
        properties: {
          id: { type: 'string', format: 'uuid' },
          myDid: { type: 'string', example: 'did:web:example.com:alice' },
          theirDid: { type: 'string', example: 'did:web:example.com:bob' },
          theirLabel: { type: 'string', example: 'Bob Agent' },
          state: { type: 'string', enum: ['invited', 'requested', 'responded', 'complete', 'error'] },
          role: { type: 'string', enum: ['inviter', 'invitee'] },
          theirEndpoint: { type: 'string', example: 'https://bob.example.com/didcomm' },
          theirProtocols: { type: 'array', items: { type: 'string' } },
          theirServices: { type: 'array', items: { type: 'object' } },
          invitation: { $ref: '#/components/schemas/OutOfBandInvitation' },
          invitationUrl: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string' },
          metadata: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          lastActiveAt: { type: 'string', format: 'date-time' },
          correlationId: { type: 'string' },
        },
      },
      Message: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          messageId: { type: 'string' },
          threadId: { type: 'string' },
          parentId: { type: 'string', format: 'uuid' },
          connectionId: { type: 'string', format: 'uuid' },
          type: { type: 'string', example: 'https://didcomm.org/basicmessage/2.0/message' },
          direction: { type: 'string', enum: ['inbound', 'outbound'] },
          fromDid: { type: 'string' },
          toDids: { type: 'array', items: { type: 'string' } },
          body: { type: 'object' },
          attachments: { type: 'array', items: { type: 'object' } },
          state: { type: 'string', enum: ['pending', 'sent', 'delivered', 'failed', 'processed'] },
          errorMessage: { type: 'string' },
          retryCount: { type: 'integer' },
          metadata: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
          processedAt: { type: 'string', format: 'date-time' },
        },
      },
      OutOfBandInvitation: {
        type: 'object',
        required: ['@type', '@id', 'services'],
        properties: {
          '@type': { type: 'string', example: 'https://didcomm.org/out-of-band/2.0/invitation' },
          '@id': { type: 'string' },
          label: { type: 'string' },
          goal_code: { type: 'string' },
          goal: { type: 'string' },
          accept: { type: 'array', items: { type: 'string' } },
          services: { type: 'array', items: { type: 'object' } },
          'dbn:target': { type: 'string' },
          'dbn:cid': { type: 'string' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', enum: [false] },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'object' },
            },
          },
        },
      },
    },
  },

  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        tags: ['Health'],
        responses: {
          '200': {
            description: 'Service health status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        status: { type: 'string' },
                        uptime: { type: 'number' },
                        timestamp: { type: 'string', format: 'date-time' },
                        environment: { type: 'string' },
                        checks: {
                          type: 'object',
                          properties: {
                            database: { type: 'string' },
                            phase4Api: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/didcomm': {
      post: {
        summary: 'Receive DIDComm message',
        tags: ['DIDComm'],
        description:
          'Transport endpoint for receiving encrypted DIDComm messages from peers.\n\nSwagger tip: This operation expects Content-Type application/didcomm-encrypted+json and a raw JWE string in the request body. Most users will not call this manually; it is intended for agent-to-agent delivery.',
        operationId: 'receiveDidcomm',
        parameters: [
          {
            name: 'did',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Recipient DID for which this service is acting.',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/didcomm-encrypted+json': {
              schema: {
                type: 'string',
                description: 'Compact or JSON serialization JWE containing the DIDComm message.',
              },
              example: 'eyJwcm90ZWN0ZWQiOiB0cnVlLCAiandlIjogIi4uLiJ9',
            },
          },
        },
        responses: {
          '202': {
            description: 'Message accepted for processing',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Bad request',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/connections/invitations': {
      post: {
        summary: 'Create out-of-band invitation',
        tags: ['Connections'],
        description:
          'Step 1: Create an invitation to start a new connection.\n\nIn Swagger: Click Try it out, set myDid to your DID, optionally set a label/goal, and Execute. Copy the invitationUrl and share it with the peer. The response also includes the invitation object.',
        operationId: 'createInvitation',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['myDid'],
                properties: {
                  myDid: { type: 'string', example: 'did:web:example.com:alice' },
                  label: { type: 'string', example: 'Alice Agent' },
                  goalCode: { type: 'string', example: 'establish-connection' },
                  goal: { type: 'string', example: 'To establish a secure connection' },
                  targetDid: { 
                    type: 'string', 
                    example: 'did:web:example.com:bob',
                    description: 'Optional: Restrict invitation to specific DID' 
                },
                },
              },
              examples: {
                basic: {
                  summary: 'Minimal',
                  value: { myDid: 'did:web:example.com:alice' },
                },
                withLabel: {
                  summary: 'With label and goal',
                  value: {
                    myDid: 'did:web:example.com:alice',
                    label: 'Alice Agent',
                    goalCode: 'establish-connection',
                    goal: 'Establish business connection',
                  },
                },
                targetedInvitation: {
                  summary: 'Targeted invitation (only Bob can accept)',
                  value: {
                    myDid: 'did:web:example.com:alice',
                    label: 'Alice Agent',
                    targetDid: 'did:web:example.com:bob',
                    goal: 'Private connection for Bob'
                  }
            }
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Invitation created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        connection: { $ref: '#/components/schemas/Connection' },
                        invitationUrl: { type: 'string' },
                        invitation: { $ref: '#/components/schemas/OutOfBandInvitation' },
                        correlationId: { type: 'string', description: 'Tracing correlation ID for this invitation.' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Bad request',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/connections/accept-invitation': {
      post: {
        summary: 'Accept out-of-band invitation',
        tags: ['Connections'],
        description:
          'Step 2: Accept an invitation received from a peer.\n\nIn Swagger: Paste the invitationUrl (oob=...) into the invitation field as a string, or paste the full invitation JSON. Set myDid to your DID and optionally a label. Execute to create a progressing connection (invited → requested). Subsequent protocol messages will advance it to responded then complete.',
        operationId: 'acceptInvitation',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['invitation', 'myDid'],
                properties: {
                  invitation: {
                    oneOf: [
                      { type: 'string', description: 'Invitation URL' },
                      { $ref: '#/components/schemas/OutOfBandInvitation' },
                    ],
                  },
                  myDid: { type: 'string', example: 'did:web:example.com:bob' },
                  label: { type: 'string', example: 'Bob Agent' },
                },
              },
              examples: {
                url: {
                  summary: 'Using invitation URL',
                  value: {
                    invitation: 'https://example.com?oob=eyJAdHlwZSI6Imh0dHBzOi8vZGlkY29tbS5vcmcvb3V0LW9mLWJhbmQvMi4wL2ludml0YXRpb24iLC4uLn0',
                    myDid: 'did:web:example.com:bob',
                    label: 'Bob Agent',
                  },
                },
                object: {
                  summary: 'Using invitation object',
                  value: {
                    invitation: {
                      '@type': 'https://didcomm.org/out-of-band/2.0/invitation',
                      '@id': '1234',
                      label: 'Alice Agent',
                      services: ['did:web:example.com:alice'],
                    },
                    myDid: 'did:web:example.com:bob',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Invitation accepted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        connection: { $ref: '#/components/schemas/Connection' },
                        correlationId: { type: 'string', description: 'Tracing correlation ID propagated from invitation.' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Bad request',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/connections': {
      get: {
        summary: 'List connections',
        tags: ['Connections'],
        description:
          'Browse and filter connections.\n\nTips: Use myDid to narrow to your DID. The protocols and tags parameters accept comma-separated lists (e.g., basicmessage,trust-ping). Pagination via limit and offset.',
        operationId: 'listConnections',
        parameters: [
          { name: 'myDid', in: 'query', schema: { type: 'string' } },
          { 
            name: 'state', 
            in: 'query', 
            schema: { 
              type: 'string', 
              enum: ['invited', 'requested', 'responded', 'complete', 'error'] 
            } 
          },
          { name: 'protocols', in: 'query', schema: { type: 'string' }, description: 'Comma-separated protocol IDs' },
          { name: 'tags', in: 'query', schema: { type: 'string' }, description: 'Comma-separated tags' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, minimum: 1, maximum: 100 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0, minimum: 0 } },
        ],
        responses: {
          '200': {
            description: 'List of connections',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        connections: { 
                          type: 'array', 
                          items: { $ref: '#/components/schemas/Connection' } 
                        },
                        total: { type: 'integer' },
                        limit: { type: 'integer' },
                        offset: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/connections/{id}': {
      get: {
        summary: 'Get connection by ID',
        tags: ['Connections'],
        description: 'Fetch a single connection record by UUID.',
        operationId: 'getConnection',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Connection details',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        connection: { $ref: '#/components/schemas/Connection' },
                        correlationId: { type: 'string', description: 'Tracing correlation ID for this connection.' },
                      },
                    },
                  },
                },
              },
            },
          },
          '404': {
            description: 'Connection not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
      patch: {
        summary: 'Update connection metadata',
        tags: ['Connections'],
        description: 'Partially update label, tags, notes, or custom metadata for a connection.',
        operationId: 'updateConnection',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  theirLabel: { type: 'string' },
                  tags: { type: 'array', items: { type: 'string' } },
                  notes: { type: 'string' },
                  metadata: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Connection updated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        connection: { $ref: '#/components/schemas/Connection' },
                        correlationId: { type: 'string', description: 'Tracing correlation ID for this connection.' },
                      },
                    },
                  },
                },
              },
            },
          },
          '404': {
            description: 'Connection not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
      delete: {
        summary: 'Delete connection',
        tags: ['Connections'],
        description: 'Permanently delete a connection. This does not delete messages.',
        operationId: 'deleteConnection',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Connection deleted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          '404': {
            description: 'Connection not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/connections/{id}/capabilities': {
      get: {
        summary: 'Get connection capabilities',
        tags: ['Connections'],
        description: 'Return discovered protocols, DID services, and endpoint for the peer.',
        operationId: 'getCapabilities',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Connection capabilities',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        protocols: { type: 'array', items: { type: 'string' } },
                        services: { type: 'array', items: { type: 'object' } },
                        endpoint: { type: 'string' },
                        correlationId: { type: 'string', description: 'Tracing correlation ID for this connection.' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/connections/{id}/capabilities/refresh': {
      post: {
        summary: 'Refresh connection capabilities',
        tags: ['Connections'],
        description: 'Re-discover capabilities from the peer DID Document and update the record.',
        operationId: 'refreshCapabilities',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Capabilities refreshed',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        connection: { $ref: '#/components/schemas/Connection' },
                        correlationId: { type: 'string', description: 'Tracing correlation ID for this connection.' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/connections/{id}/ping': {
      post: {
        summary: 'Send trust ping',
        tags: ['Connections'],
        description: 'Check connection health and measure response time. Requires a complete connection.',
        operationId: 'trustPing',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Ping sent',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        responseTime: { type: 'number' },
                        correlationId: { type: 'string', description: 'Tracing correlation ID for the pinged connection.' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/messages': {
      post: {
        summary: 'Send message',
        tags: ['Messages'],
        description:
          'Send a DIDComm message over an existing connection.\n\nTips: For a simple text message, use type https://didcomm.org/basicmessage/2.0/message and body { "content": "Hello" }. You may also supply threadId to continue a thread.',
        operationId: 'sendMessage',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['connectionId', 'type', 'body'],
                properties: {
                  connectionId: { type: 'string', format: 'uuid' },
                  type: { type: 'string', example: 'https://didcomm.org/basicmessage/2.0/message' },
                  body: { type: 'object', example: { content: 'Hello!' } },
                  threadId: { type: 'string' },
                  parentId: { type: 'string', format: 'uuid' },
                },
              },
              examples: {
                basicMessage: {
                  summary: 'BasicMessage (text)',
                  value: {
                    connectionId: '11111111-2222-3333-4444-555555555555',
                    type: 'https://didcomm.org/basicmessage/2.0/message',
                    body: { content: 'Hello Bob!' },
                  },
                },
                threaded: {
                  summary: 'Continue a thread',
                  value: {
                    connectionId: '11111111-2222-3333-4444-555555555555',
                    type: 'https://didcomm.org/basicmessage/2.0/message',
                    body: { content: 'Follow-up message' },
                    threadId: 'abcd-thread-1234',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Message sent',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        message: { $ref: '#/components/schemas/Message' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      get: {
        summary: 'List messages',
        tags: ['Messages'],
        description: 'Browse messages with optional filters like connectionId, threadId, type, direction, and state.',
        operationId: 'listMessages',
        parameters: [
          { name: 'connectionId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'threadId', in: 'query', schema: { type: 'string' } },
          { name: 'type', in: 'query', schema: { type: 'string' } },
          { name: 'direction', in: 'query', schema: { type: 'string', enum: ['inbound', 'outbound'] } },
          { name: 'state', in: 'query', schema: { type: 'string', enum: ['pending', 'sent', 'delivered', 'failed', 'processed'] } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, minimum: 1, maximum: 100 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0, minimum: 0 } },
        ],
        responses: {
          '200': {
            description: 'List of messages',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        messages: { type: 'array', items: { $ref: '#/components/schemas/Message' } },
                        total: { type: 'integer' },
                        limit: { type: 'integer' },
                        offset: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/messages/search': {
      get: {
        summary: 'Search messages',
        tags: ['Messages'],
        description: 'Full-text search over message content and metadata. Provide a query string in q.',
        operationId: 'searchMessages',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: 'Search query' },
          { name: 'connectionId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          '200': {
            description: 'Search results',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        messages: { type: 'array', items: { $ref: '#/components/schemas/Message' } },
                        total: { type: 'integer' },
                        limit: { type: 'integer' },
                        offset: { type: 'integer' },
                        query: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/messages/{id}': {
      get: {
        summary: 'Get message by ID',
        tags: ['Messages'],
        description: 'Fetch a single message record by UUID.',
        operationId: 'getMessage',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Message details',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        message: { $ref: '#/components/schemas/Message' },
                      },
                    },
                  },
                },
              },
            },
          },
          '404': {
            description: 'Message not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
      delete: {
        summary: 'Delete message',
        tags: ['Messages'],
        description: 'Permanently delete a message record.',
        operationId: 'deleteMessage',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Message deleted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/messages/thread/{threadId}': {
      get: {
        summary: 'Get messages in thread',
        tags: ['Messages'],
        description: 'Return all messages associated with a DIDComm ~thread thid.',
        operationId: 'getThread',
        parameters: [
          { name: 'threadId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Thread messages',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        messages: { type: 'array', items: { $ref: '#/components/schemas/Message' } },
                        threadId: { type: 'string' },
                        count: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/messages/{id}/retry': {
      post: {
        summary: 'Retry failed message',
        tags: ['Messages'],
        description: 'Retry delivery for a message in failed state. The system will attempt to resend and update state accordingly.',
        operationId: 'retryMessage',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Message retry initiated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        message: { $ref: '#/components/schemas/Message' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export default openapiSpec;