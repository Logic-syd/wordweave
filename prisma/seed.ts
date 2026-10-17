import { seedDemos } from "../src/lib/demos";
import { db } from "../src/lib/db";
import { runAsOwner } from "../src/lib/auth-context";
runAsOwner("personal", seedDemos)
  .then(() => console.log("两篇结构化演示文章已就绪（已有数据保持不变）。"))
  .finally(() => db.$disconnect());
