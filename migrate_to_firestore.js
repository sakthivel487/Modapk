require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const admin = require('firebase-admin');

// 1. Initialize Firebase Admin
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} else {
  console.error("No FIREBASE_SERVICE_ACCOUNT found in .env");
  process.exit(1);
}

const db = admin.firestore();
const sqliteDb = new sqlite3.Database('./modvault.db');

async function migrate() {
    console.log("Starting migration...");

    // Migrate APKs
    sqliteDb.all("SELECT * FROM apks", async (err, rows) => {
        if (err) return console.error(err);
        console.log(`Found ${rows.length} APKs to migrate.`);

        for (const row of rows) {
            const data = {
                ...row,
                mod_features: JSON.parse(row.mod_features || '[]'),
                how_to_install: JSON.parse(row.how_to_install || '[]')
            };
            delete data.id; // Let Firestore generate ID or use SQLite ID as string
            
            await db.collection('apks').doc(row.id.toString()).set(data);
            console.log(`Migrated APK: ${row.name}`);
        }

        // Migrate Users
        sqliteDb.all("SELECT * FROM users", async (err, users) => {
            if (err) return console.error(err);
            console.log(`Found ${users.length} users to migrate.`);

            for (const user of users) {
                const userData = { ...user };
                delete userData.id;
                await db.collection('users').doc(user.email).set(userData);
                console.log(`Migrated User: ${user.email}`);
            }

            console.log("Migration complete!");
            process.exit(0);
        });
    });
}

migrate();
