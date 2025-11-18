// src/utils/logger.ts
import winston from 'winston';
import { config } from '../config';

const logFormat = config.logging.format === 'json'
  ? winston.format.json()
  : winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    );

export const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    logFormat
  ),
  transports: [
    new winston.transports.Console(),
  ],
});