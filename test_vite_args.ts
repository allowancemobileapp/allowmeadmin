import { createServer } from 'vite';
createServer({
  server: { middlewareMode: true },
  appType: "spa"
}).then(async vite => {
  console.log("Vite resolved port:", vite.config.server.port);
  process.exit(0);
});
