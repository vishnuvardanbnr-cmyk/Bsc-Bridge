import { Router } from 'express';
import { logger } from '../lib/logger.js';

const router = Router();

const MCHAIN_RPC = 'https://node.mymchain.com/api/rpc';

router.post('/rpc/mchain', async (req, res) => {
  try {
    const response = await fetch(MCHAIN_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'MChain RPC proxy error');
    res.status(502).json({ jsonrpc: '2.0', error: { code: -32603, message: 'RPC proxy error' }, id: null });
  }
});

export default router;
