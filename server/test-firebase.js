import { db } from "./firebase.js";

try {
  const snapshot = await db.ref("owners/owner_001").get();

  console.log("Owner record:", snapshot.val());
} catch (error) {
  console.error("Firebase connection failed:", error.message);
  process.exitCode = 1;
} finally {
  await db.app.delete();
}