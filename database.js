const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'modvault.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Create APKs table
  db.run(`
    CREATE TABLE IF NOT EXISTS apks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      version TEXT NOT NULL,
      category TEXT NOT NULL,
      sub_category TEXT,
      size TEXT,
      android_required TEXT,
      rating REAL DEFAULT 4.5,
      icon TEXT,
      icon_bg TEXT,
      download_url TEXT NOT NULL,
      mod_features TEXT,
      description TEXT,
      how_to_install TEXT,
      upload_date TEXT,
      downloads INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      join_date TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      apk_id INTEGER NOT NULL,
      download_date TEXT,
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (apk_id) REFERENCES apks (id)
    )
  `);

  // Check if we need to seed data
  db.get("SELECT COUNT(*) AS count FROM apks", (err, row) => {
    if (!err && row.count === 0) {
      console.log("Seeding initial database...");
      const stmt = db.prepare(`
        INSERT INTO apks (
          name, slug, version, category, sub_category, size, 
          android_required, rating, icon, icon_bg, download_url, 
          mod_features, description, how_to_install, upload_date, downloads
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const sampleApks = [
        {
          name: "Minecraft", slug: "minecraft-mod-apk", version: "1.21.0", category: "games", sub_category: "adventure",
          size: "120 MB", android_required: "5.0+", rating: 4.9, icon: "⛏️", icon_bg: "linear-gradient(135deg, #27ae60, #2ecc71)",
          download_url: "https://example.com/download/minecraft",
          mod_features: JSON.stringify(["Unlimited Money", "Premium Skins Unlocked", "God Mode"]),
          description: "Explore infinite worlds and build everything from the simplest of homes to the grandest of castles.",
          how_to_install: JSON.stringify(["Enable Unknown Sources", "Download the APK", "Install and enjoy"]),
          upload_date: new Date().toISOString().split('T')[0], downloads: 982000
        },
        {
          name: "Spotify Premium", slug: "spotify-premium-mod", version: "8.9.14", category: "apps", sub_category: "music",
          size: "65 MB", android_required: "6.0+", rating: 4.8, icon: "🎵", icon_bg: "linear-gradient(135deg, #1DB954, #1ed760)",
          download_url: "https://example.com/download/spotify",
          mod_features: JSON.stringify(["No Ads", "Unlimited Skips", "Offline Download Unlocked"]),
          description: "Listen to all your favorite music and podcasts without any interruptions.",
          how_to_install: JSON.stringify(["Uninstall original Spotify", "Download this MOD", "Login with a new account"]),
          upload_date: new Date().toISOString().split('T')[0], downloads: 1500000
        }
      ];

      sampleApks.forEach(apk => {
        stmt.run(
          apk.name, apk.slug, apk.version, apk.category, apk.sub_category,
          apk.size, apk.android_required, apk.rating, apk.icon, apk.icon_bg,
          apk.download_url, apk.mod_features, apk.description, apk.how_to_install,
          apk.upload_date, apk.downloads
        );
      });
      stmt.finalize();
      console.log("Database seeded.");
    }
  });
});

module.exports = db;
