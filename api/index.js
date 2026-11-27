import { createRequestHandler } from '../src/server.js';

let cachedHandler = null;

export default async function handler(req, res) {
  if (!cachedHandler) {
    cachedHandler = createRequestHandler();
  }
  return cachedHandler(req, res);
}
