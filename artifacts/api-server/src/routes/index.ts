import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import bridgeRouter from "./bridge.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bridgeRouter);

export default router;
