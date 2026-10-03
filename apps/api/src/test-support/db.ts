import mongoose from 'mongoose';
import { env } from '../config/env.js';

/** Connects to the test database and wipes it for a clean run. */
export async function connectTestDatabase(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  await mongoose.connection.db?.dropDatabase();
}

export async function disconnectTestDatabase(): Promise<void> {
  await mongoose.disconnect();
}
