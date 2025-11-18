// src/api/routes/connections.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { connectionManager } from '../../core/connections/ConnectionManager';
import { validateBody, validateQuery, validateParams } from '../middleware/validation';
import {
  createInvitationSchema,
  acceptInvitationSchema,
  updateConnectionMetadataSchema,
  listConnectionsQuerySchema,
} from '../schemas/connection.schema';

const router = Router();

// UUID validation schema for params
const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid connection ID'),
});

/**
 * Create out-of-band invitation
 * POST /api/v1/connections/invitations
 */
router.post(
  '/invitations',
  validateBody(createInvitationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await connectionManager.createInvitation(req.body);

      res.status(201).json({
        success: true,
        data: {
          connection: result.connection,
          invitationUrl: result.invitationUrl,
          invitation: result.invitation,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Accept invitation
 * POST /api/v1/connections/accept-invitation
 */
router.post(
  '/accept-invitation',
  validateBody(acceptInvitationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connection = await connectionManager.acceptInvitation(req.body);

      res.status(201).json({
        success: true,
        data: { connection },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * List connections
 * GET /api/v1/connections
 */
router.get(
  '/',
  validateQuery(listConnectionsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as any;
      
      // Parse comma-separated arrays
      const protocols = query.protocols 
        ? query.protocols.split(',').map((p: string) => p.trim())
        : undefined;
      
      const tags = query.tags
        ? query.tags.split(',').map((t: string) => t.trim())
        : undefined;

      const result = await connectionManager.listConnections({
        myDid: query.myDid,
        state: query.state,
        protocols,
        tags,
        limit: query.limit,
        offset: query.offset,
      });

      res.status(200).json({
        success: true,
        data: {
          connections: result.connections,
          total: result.total,
          limit: query.limit,
          offset: query.offset,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Get connection by ID
 * GET /api/v1/connections/:id
 */
router.get(
  '/:id',
  validateParams(uuidParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connection = await connectionManager.getConnection(req.params.id);

      res.status(200).json({
        success: true,
        data: { connection },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Update connection metadata
 * PATCH /api/v1/connections/:id
 */
router.patch(
  '/:id',
  validateParams(uuidParamSchema),
  validateBody(updateConnectionMetadataSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connection = await connectionManager.updateMetadata(
        req.params.id,
        req.body
      );

      res.status(200).json({
        success: true,
        data: { connection },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Delete connection
 * DELETE /api/v1/connections/:id
 */
router.delete(
  '/:id',
  validateParams(uuidParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await connectionManager.deleteConnection(req.params.id);

      res.status(200).json({
        success: true,
        message: 'Connection deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Refresh connection capabilities
 * POST /api/v1/connections/:id/capabilities/refresh
 */
router.post(
  '/:id/capabilities/refresh',
  validateParams(uuidParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connection = await connectionManager.refreshCapabilities(req.params.id);

      res.status(200).json({
        success: true,
        data: { connection },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Get connection capabilities
 * GET /api/v1/connections/:id/capabilities
 */
router.get(
  '/:id/capabilities',
  validateParams(uuidParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connection = await connectionManager.getConnection(req.params.id);

      res.status(200).json({
        success: true,
        data: {
          protocols: connection.theirProtocols,
          services: connection.theirServices,
          endpoint: connection.theirEndpoint,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Send trust ping
 * POST /api/v1/connections/:id/ping
 */
router.post(
  '/:id/ping',
  validateParams(uuidParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await connectionManager.ping(req.params.id);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;