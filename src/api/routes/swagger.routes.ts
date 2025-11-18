// src/api/routes/swagger.routes.ts
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openapiSpec } from '../../openApiSpec';

const router = Router();

// Swagger UI options
const swaggerOptions = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'DBN Trust Management API',
};

// Serve Swagger UI
router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(openapiSpec, swaggerOptions));

export default router;