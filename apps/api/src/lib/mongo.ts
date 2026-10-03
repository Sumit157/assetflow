import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export async function connectMongo(): Promise<void> {
  mongoose.connection.on('error', (error) => {
    logger.error('MongoDB connection error', { error });
  });
  await mongoose.connect(env.MONGODB_URI);
  logger.info('MongoDB connected', { uri: env.MONGODB_URI.replace(/\/\/.*@/, '//***@') });
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}

export async function pingMongo(): Promise<void> {
  const state = mongoose.connection.readyState;
  if (state !== 1 || !mongoose.connection.db) {
    throw new Error('MongoDB is not connected');
  }
  await mongoose.connection.db.admin().command({ ping: 1 });
}
