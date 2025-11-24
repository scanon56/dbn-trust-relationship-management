// src/api/routes/index.ts
// Update your existing routes file to include messages routes

import { Router } from 'express';
import healthRoutes from './health.routes';
import connectionRoutes from './connections.routes';
import messagesRoutes from './messages.routes'; // NEW

const router = Router();

router.use('/health', healthRoutes);
router.use('/connections', connectionRoutes);
router.use('/messages', messagesRoutes); // NEW

export default router;