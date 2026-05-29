import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import bridgeRouter from "./bridge.js";
import adminRouter from "./admin.js";
import rpcRouter from "./rpc.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bridgeRouter);
router.use(adminRouter);
router.use(rpcRouter);

export default router;
