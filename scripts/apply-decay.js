import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getJigsudoDateString } from "../js/utils/time.js"; // Uses Jigsudo offset handling

const MISSED_DAY_PENALTY = 10.0;

async function runDecay() {
  console.log("📉 [Decay Service] Starting automated decay execution...");

  // Initialize Firebase Admin using Service Account from Environment Variable
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountRaw) {
    console.error(
      "❌ Fatal: FIREBASE_SERVICE_ACCOUNT environment variable not set.",
    );
    process.exit(1);
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountRaw);
  } catch (err) {
    console.error(
      "❌ Fatal: Failed to parse FIREBASE_SERVICE_ACCOUNT. Must be valid JSON.",
      err,
    );
    process.exit(1);
  }

  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  const todayStr = getJigsudoDateString();
  console.log(`🕒 Jigsudo Target Date: ${todayStr}`);

  try {
    const usersRef = db.collection("users");

    // We only penalize users who:
    // 1. Have not played today (lastDailyUpdate != todayStr)
    // 2. Have actual RP to lose (totalRP > 0)
    // 3. We exclude users who never even got verified and don't play.
    //    Checking totalRP > 0 covers the inactive fresh accounts naturally.
    const snapshot = await usersRef.where("totalRP", ">", 0).get();

    if (snapshot.empty) {
      console.log("✅ No eligible users found for decay.");
      process.exit(0);
    }

    const batch = db.batch();
    let penalizedCount = 0;

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const lastUpdate = data.lastDailyUpdate;

      if (lastUpdate !== todayStr) {
        // User missed today!
        const currentRP = data.totalRP || 0;
        let newRP = currentRP - MISSED_DAY_PENALTY;
        if (newRP < 0) newRP = 0;

        newRP = Number(newRP.toFixed(3)); // Ensure precision matches client

        if (newRP !== currentRP) {
          // Update the root totalRP because Ranking uses it
          const updateObj = {
            totalRP: newRP,
            "stats.currentRP": newRP, // Update the nested stats too
            "stats.lastDecayCheck": todayStr,
            lastUpdated: FieldValue.serverTimestamp(),
          };

          batch.update(doc.ref, updateObj);
          penalizedCount++;
        }
      }
    });

    if (penalizedCount > 0) {
      console.log(
        `⏳ Committing batch penalty for ${penalizedCount} inactive user(s)...`,
      );
      await batch.commit();
      console.log("✅ Decay successfully applied.");
    } else {
      console.log("✅ All active users played today. No penalties applied.");
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error executing decay:", error);
    process.exit(1);
  }
}

runDecay();
