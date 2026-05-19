import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import bridgeRouter from "./bridge.js";
import adminRouter from "./admin.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bridgeRouter);
router.use(adminRouter);

export default router;
