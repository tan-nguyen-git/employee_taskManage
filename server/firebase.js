import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

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

export const db = getDatabase(firebaseApp);