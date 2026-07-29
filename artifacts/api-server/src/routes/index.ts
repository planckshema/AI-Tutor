import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import courseRouter from "./course";
import learnerRouter from "./learner";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);
router.use(courseRouter);
router.use(learnerRouter);

export default router;
