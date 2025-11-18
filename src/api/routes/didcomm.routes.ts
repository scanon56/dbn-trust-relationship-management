// src/api/routes/didcomm.routes.ts
import { Router } from 'express';
import { httpTransport } from '../../infrastructure/transport/HttpTransport';

const router = Router();

/**
 * Receive DIDComm messages
 * POST /didcomm?did=did:example:recipient
 * Content-Type: application/didcomm-encrypted+json
 */
router.post('/', (req, res, next) => {
  httpTransport.handleIncomingMessage(req, res, next);
});

/**
 * DIDComm transport health check
 */
router.get('/health', (req, res) => {
  httpTransport.healthCheck(req, res);
});

export default router;