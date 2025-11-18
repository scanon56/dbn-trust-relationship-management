// src/openapiSpec.ts
export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'DBN Trust Relationship Management API',
    version: '1.0.0',
    description: 'DIDComm-based peer-to-peer connection and message management for the Decentralized Business Network Platform.',
    contact: {
      name: 'API Support',
      email: 'support@example.com',
    },
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'Local development server',
    },
    {
      url: 'https://api.example.com',
      description: 'Production server',
    },
  ],
  components: {
    schemas: {
      Connection: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          myDid: { type: 'string', example: 'did:web:example.com:alice' },
          theirDid: { type: 'string', example: 'did:web:example.com:bob' },
          theirLabel: { type: 'string', example: 'Bob Agent' },
          state: { 
            type: 'string', 
            enum: ['invited', 'requested', 'responded', 'active', 'completed', 'error'] 
          },
          role: { type: 'string', enum: ['inviter', 'invitee'] },
          theirEndpoint: { type: 'string', example: 'https://bob.example.com/didcomm' },
          theirProtocols: { 
            type: 'array', 
            items: { type: 'string' },
            example: ['https://didcomm.org/basicmessage/2.0', 'https://didcomm.org/trust-ping/2.0']
          },
          theirServices: { type: 'array', items: { type: 'object' } },
          invitation: { type: 'object' },
          invitationUrl: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string' },
          metadata: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          lastActiveAt: { type: 'string', format: 'date-time' },
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
        properties: {
          '@type': { type: 'string', example: 'https://didcomm.org/out-of-band/2.0/invitation' },
          '@id': { type: 'string' },
          label: { type: 'string' },
          goal_code: { type: 'string' },
          goal: { type: 'string' },
          accept: { type: 'array', items: { type: 'string' } },
          services: { type: 'array', items: { type: 'object' } },
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
        description: 'Transport endpoint for receiving encrypted DIDComm messages from peers',
        parameters: [
          {
            name: 'did',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Recipient DID',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/didcomm-encrypted+json': {
              schema: {
                type: 'string',
                description: 'JWE encrypted DIDComm message',
              },
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
                },
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
        parameters: [
          { name: 'myDid', in: 'query', schema: { type: 'string' } },
          { 
            name: 'state', 
            in: 'query', 
            schema: { 
              type: 'string', 
              enum: ['invited', 'requested', 'responded', 'active', 'completed', 'error'] 
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
        description: 'Re-discover capabilities from peer DID Document',
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
        description: 'Check connection health and measure response time',
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