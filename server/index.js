// Entry point: connect to MongoDB, load sample data on first run, start Express.
import { connectDB, disconnectDB, syncIndexes } from './db.js';
import { createApp } from './app.js';
import { Project } from './models.js';
import { seed } from './seed.js';

const PORT = Number(process.env.PORT) || 5000;

async function main() {
  await connectDB();
  await syncIndexes();
  if (!(await Project.exists({}))) {
    console.log('Empty database - loading Smart Healthcare case-study sample data...');
    await seed();
  }
  const server = createApp().listen(PORT, () => {
    console.log(`\n  Smart Healthcare SPMS running at  http://localhost:${PORT}\n`);
  });
  const stop = async () => { server.close(); await disconnectDB(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error('\nFailed to start:', e.message);
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is in use. Run with another port, e.g.  set PORT=5050 && npm start`);
  process.exit(1);
});
