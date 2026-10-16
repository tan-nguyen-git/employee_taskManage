import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

function connectFirebase() {
  const serviceAccount = JSON.parse(
    readFileSync(
      new URL("./service-account.json", import.meta.url),
      "utf8"
    )
  );

  const firebaseApp = initializeApp({
    credential: cert(serviceAccount),
    databaseURL: "https://employee-task-manager-3d70a-default-rtdb.firebaseio.com/"
  });

  return getDatabase(firebaseApp);
}

// `npm run emulator` swaps in an in-memory database (see emulator.js)
export const db = globalThis.__EMULATOR_DB__ ?? connectFirebase();
