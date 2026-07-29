import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { coursesTable, unitsTable, problemsTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";

const router = Router();

// GET /api/course — returns the full course structure (units + problems)
router.get("/course", async (req: Request, res: Response) => {
  try {
    const course = await db.query.coursesTable.findFirst({
      where: eq(coursesTable.slug, "tip101"),
    });

    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    const units = await db
      .select()
      .from(unitsTable)
      .where(eq(unitsTable.courseId, course.id))
      .orderBy(asc(unitsTable.order));

    const unitsWithProblems = await Promise.all(
      units.map(async (unit) => {
        const problems = await db
          .select({
            id: problemsTable.id,
            title: problemsTable.title,
            slug: problemsTable.slug,
            difficulty: problemsTable.difficulty,
            order: problemsTable.order,
            tags: problemsTable.tags,
          })
          .from(problemsTable)
          .where(eq(problemsTable.unitId, unit.id))
          .orderBy(asc(problemsTable.order));

        return { ...unit, problems };
      }),
    );

    res.json({ course, units: unitsWithProblems });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch course");
    res.status(500).json({ error: "Failed to fetch course" });
  }
});

// GET /api/problems/:id — returns full problem detail
router.get("/problems/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid problem id" });
    return;
  }

  try {
    const problem = await db.query.problemsTable.findFirst({
      where: eq(problemsTable.id, id),
    });

    if (!problem) {
      res.status(404).json({ error: "Problem not found" });
      return;
    }

    res.json({ problem });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch problem");
    res.status(500).json({ error: "Failed to fetch problem" });
  }
});

export default router;
