// npm run seed  -> wipes the database and reloads the case-study sample data.
import { connectDB, disconnectDB, syncIndexes } from '../db.js';
import { resetAndSeed } from '../seed.js';

await connectDB();
await syncIndexes();
await resetAndSeed();
console.log('Sample data reloaded.');
await disconnectDB();
