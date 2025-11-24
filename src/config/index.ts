// src/config/index.ts
import dotenv from 'dotenv';

// Load explicit path if provided, else default .env
if (process.env.DOTENV_CONFIG_PATH) {
  dotenv.config({ path: process.env.DOTENV_CONFIG_PATH });
} else {
  dotenv.config();
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'dbn_trust_management',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
  },
  
  // Phase 4 API
  phase4: {
    baseUrl: process.env.PHASE4_API_URL || 'http://localhost:3000',
    timeout: parseInt(process.env.PHASE4_TIMEOUT || '30000', 10),
  },
  
  // DIDComm
  didcomm: {
    endpoint: process.env.DIDCOMM_ENDPOINT || 'http://localhost:3001/didcomm',
    defaultDid: process.env.DEFAULT_DID,
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },
  // Connection protocol behavior flags
  connectionFlags: {
    autoActivateOnResponse: process.env.CONNECTION_AUTO_ACTIVATE_ON_RESPONSE === 'true',
  },
} as const;