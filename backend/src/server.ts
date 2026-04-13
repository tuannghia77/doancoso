import os from 'os';

import { app } from './app.js';
import { connectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { ensureDefaultAdmin } from './services/bootstrapService.js';
import { verifyMailTransport } from './services/mailService.js';

const getLanUrls = (port: number) =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter((item): item is os.NetworkInterfaceInfo => item !== undefined)
    .filter((item) => item.family === 'IPv4' && !item.internal)
    .map((item) => `http://${item.address}:${port}`);

const start = async () => {
  await connectDatabase();
  await ensureDefaultAdmin();

  try {
    await verifyMailTransport();
  } catch (error) {
    console.warn('Không thể xác minh SMTP ở thời điểm khởi động.');
    console.warn(error);
  }

  app.listen(env.port, env.host, () => {
    const lanUrls = getLanUrls(env.port);

    console.log('SpeakAI backend đã sẵn sàng.');
    console.log(`- Local:   http://localhost:${env.port}`);

    if (lanUrls.length) {
      lanUrls.forEach((url) => console.log(`- Network: ${url}`));
    }
  });
};

start().catch((error) => {
  console.error('Không thể khởi động backend:', error);
  process.exit(1);
});
