require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session for Admin & User Login
app.use(session({
  secret: 'modvault-super-secret-key-123',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 * 7 } // 1 week
}));

// Global middleware to pass user session to all EJS templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.isAdmin = req.session.isAdmin || false;
  next();
});

// Admin auth middleware
const requireAuth = (req, res, next) => {
  if (req.session.isAdmin) {
    next();
  } else {
    // If it's an API route, send 401
    if (req.originalUrl.startsWith('/admin/api')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    // Otherwise redirect to login
    res.redirect('/admin/login');
  }
};

// =======================
// PUBLIC ROUTES
// =======================

// Helper function to query DB
const queryDb = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const getDb = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

app.get('/', async (req, res) => {
  try {
    const apks = await queryDb('SELECT * FROM apks ORDER BY downloads DESC LIMIT 10');
    
    // Calculate global stats
    const totalApks = await getDb('SELECT COUNT(*) as count FROM apks');
    const totalDownloads = await getDb('SELECT SUM(downloads) as total FROM apks');
    
    const parsedApks = apks.map(apk => ({
      ...apk,
      mod_features: JSON.parse(apk.mod_features || '[]')
    }));
    
    res.render('index', { 
      apks: parsedApks, 
      currentRoute: 'home',
      stats: {
        apks: totalApks.count,
        downloads: totalDownloads.total || 0
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

app.get('/games', async (req, res) => {
  try {
    const apks = await queryDb("SELECT * FROM apks WHERE category = 'games' ORDER BY upload_date DESC");
    res.render('games', { apks, currentRoute: 'games' });
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

app.get('/apps', async (req, res) => {
  try {
    const apks = await queryDb("SELECT * FROM apks WHERE category = 'apps' ORDER BY upload_date DESC");
    res.render('apps', { apks, currentRoute: 'apps' });
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

app.get('/app/:slug', async (req, res) => {
  try {
    const apk = await getDb("SELECT * FROM apks WHERE slug = ?", [req.params.slug]);
    if (!apk) return res.status(404).send("App not found");
    
    apk.mod_features = JSON.parse(apk.mod_features || '[]');
    apk.how_to_install = JSON.parse(apk.how_to_install || '[]');
    
    // Fetch similar apps
    const similar = await queryDb("SELECT * FROM apks WHERE category = ? AND id != ? LIMIT 3", [apk.category, apk.id]);
    
    res.render('app', { apk, similar, currentRoute: 'app' });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

app.get('/search', async (req, res) => {
  const q = req.query.q || '';
  try {
    const apks = await queryDb("SELECT * FROM apks WHERE name LIKE ?", [`%${q}%`]);
    res.render('search', { apks, query: q, currentRoute: 'search' });
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

app.get('/categories', (req, res) => res.render('categories', { currentRoute: 'categories' }));
app.get('/latest', async (req, res) => {
  try {
    const apks = await queryDb("SELECT * FROM apks ORDER BY upload_date DESC");
    res.render('latest', { apks, currentRoute: 'latest' });
  } catch(err) {
    res.status(500).send("Server Error");
  }
});
app.get('/download/:slug', async (req, res) => {
  try {
    const apk = await getDb("SELECT * FROM apks WHERE slug = ?", [req.params.slug]);
    if (!apk) return res.status(404).send("App not found");
    res.render('download', { apk, currentRoute: 'download' });
  } catch(err) {
    res.status(500).send("Server Error");
  }
});

// Legal/Static pages
app.get('/contact', (req, res) => res.render('contact', { currentRoute: 'contact' }));
app.get('/faq', (req, res) => res.render('faq', { currentRoute: 'faq' }));
app.get('/terms', (req, res) => res.render('terms', { currentRoute: 'terms' }));
app.get('/privacy', (req, res) => res.render('privacy', { currentRoute: 'privacy' }));
app.get('/disclaimer', (req, res) => res.render('disclaimer', { currentRoute: 'disclaimer' }));
app.get('/dmca', (req, res) => res.render('dmca', { currentRoute: 'dmca' }));
app.get('/cookies', (req, res) => res.render('cookies', { currentRoute: 'cookies' }));

// =======================
// USER AUTH ROUTES
// =======================

app.post('/api/signup', async (req, res) => {
  const { name, username, email, password } = req.body;
  
  if (!name || !username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  // Very basic hashing for demo (in production use bcrypt)
  const encodedPass = Buffer.from(password).toString('base64');
  const joinDate = new Date().toISOString();

  try {
    db.run(
      'INSERT INTO users (name, username, email, password, role, join_date) VALUES (?, ?, ?, ?, ?, ?)',
      [name, username, email, encodedPass, 'user', joinDate],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Username or Email already exists!' });
          }
          return res.status(500).json({ error: 'Database error' });
        }
        
        // Auto login
        const newUser = { id: this.lastID, name, username, email, role: 'user' };
        req.session.user = newUser;
        res.json({ success: true, user: newUser });
      }
    );
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const encodedPass = Buffer.from(password).toString('base64');

  try {
    const user = await getDb('SELECT id, name, username, email, role FROM users WHERE (email = ? OR username = ?) AND password = ?', [email, email, encodedPass]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email/username or password' });
    }

    req.session.user = user;
    if (user.role === 'admin') {
      req.session.isAdmin = true;
    }
    
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/firebase-auth', async (req, res) => {
  const { uid, email, name, role } = req.body;

  if (!email || !uid) {
    return res.status(400).json({ error: 'Missing user data' });
  }

  try {
    // Check if user exists
    let user = await getDb('SELECT id, name, username, email, role FROM users WHERE email = ?', [email]);

    if (!user) {
      // Create user if they don't exist
      const username = email.split('@')[0] + '_' + uid.slice(0, 5);
      const joinDate = new Date().toISOString();
      const encodedPass = Buffer.from(uid).toString('base64');

      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO users (name, username, email, password, role, join_date) VALUES (?, ?, ?, ?, ?, ?)',
          [name, username, email, encodedPass, role || 'user', joinDate],
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      }).then(lastID => {
        user = { id: lastID, name, username, email, role: role || 'user' };
      });
    } else if (role && user.role !== role) {
      // Update role if it changed in Firestore
      await new Promise((resolve, reject) => {
        db.run('UPDATE users SET role = ? WHERE id = ?', [role, user.id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      user.role = role;
    }

    req.session.user = user;
    if (user.role === 'admin') {
      req.session.isAdmin = true;
    }

    res.json({ success: true, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during Firebase sync' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// =======================
// USER PROFILE ROUTES
// =======================

const requireUser = (req, res, next) => {
  if (req.session.user) next();
  else res.redirect('/'); // Or show an error modal
};

app.get('/profile', requireUser, async (req, res) => {
  try {
    // Get total download count
    const stats = await getDb('SELECT COUNT(*) as count FROM user_downloads WHERE user_id = ?', [req.session.user.id]);
    
    // Get user's download history
    const downloads = await queryDb(`
      SELECT apks.*, user_downloads.download_date 
      FROM user_downloads 
      JOIN apks ON user_downloads.apk_id = apks.id 
      WHERE user_downloads.user_id = ? 
      ORDER BY user_downloads.download_date DESC LIMIT 4
    `, [req.session.user.id]);
    
    res.render('profile', { currentRoute: 'profile', downloads, totalDownloads: stats.count });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

app.get('/downloads', requireUser, async (req, res) => {
  try {
    // Get all user downloads
    const downloads = await queryDb(`
      SELECT apks.*, user_downloads.download_date 
      FROM user_downloads 
      JOIN apks ON user_downloads.apk_id = apks.id 
      WHERE user_downloads.user_id = ? 
      ORDER BY user_downloads.download_date DESC
    `, [req.session.user.id]);
    
    res.render('downloads', { currentRoute: 'downloads', downloads });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

app.post('/api/download/:slug', requireUser, async (req, res) => {
  try {
    const apk = await getDb("SELECT id FROM apks WHERE slug = ?", [req.params.slug]);
    if (!apk) return res.status(404).json({ error: 'APK not found' });

    // Check if already downloaded
    const existing = await getDb("SELECT id FROM user_downloads WHERE user_id = ? AND apk_id = ?", [req.session.user.id, apk.id]);
    
    if (!existing) {
      const now = new Date().toISOString();
      db.run("INSERT INTO user_downloads (user_id, apk_id, download_date) VALUES (?, ?, ?)", [req.session.user.id, apk.id, now]);
      // Also increment global downloads
      db.run("UPDATE apks SET downloads = downloads + 1 WHERE id = ?", [apk.id]);
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});


// =======================
// ADMIN ROUTES
// =======================

app.get('/admin/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.render('admin_login', { error: null });
});

app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === 'admin123') { // Simple password for now
    req.session.isAdmin = true;
    res.redirect('/admin');
  } else {
    res.render('admin_login', { error: 'Invalid password' });
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// Admin Dashboard
app.get('/admin', requireAuth, async (req, res) => {
  try {
    const apks = await queryDb('SELECT * FROM apks ORDER BY upload_date DESC');
    const totalDownloads = apks.reduce((sum, apk) => sum + apk.downloads, 0);
    const totalGames = apks.filter(a => a.category === 'games').length;
    const totalApps = apks.filter(a => a.category === 'apps').length;
    
    res.render('admin', { 
      apks, 
      stats: { total: apks.length, downloads: totalDownloads, games: totalGames, apps: totalApps }
    });
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

// API endpoint to create APK
app.post('/admin/api/apk', requireAuth, (req, res) => {
  const { 
    name, version, category, sub_category, size, android_required, rating, 
    icon, download_url, mod_features, description, how_to_install 
  } = req.body;

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-mod-apk-' + Date.now().toString().slice(-4);
  const icon_bg = 'linear-gradient(135deg, #6c63ff, #a78bfa)';
  const upload_date = new Date().toISOString().split('T')[0];

  // Store features and install as JSON strings
  const featuresJson = JSON.stringify(mod_features ? mod_features.split('\n').filter(Boolean) : []);
  const installJson = JSON.stringify(how_to_install ? how_to_install.split('\n').filter(Boolean) : []);

  db.run(`
    INSERT INTO apks (
      name, slug, version, category, sub_category, size, android_required, 
      rating, icon, icon_bg, download_url, mod_features, description, 
      how_to_install, upload_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    name, slug, version, category, sub_category, size, android_required,
    parseFloat(rating) || 4.5, icon || '📱', icon_bg, download_url, featuresJson, description,
    installJson, upload_date
  ], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id: this.lastID, slug });
  });
});

// API endpoint to delete APK
app.delete('/admin/api/apk/:id', requireAuth, (req, res) => {
  db.run('DELETE FROM apks WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, changes: this.changes });
  });
});

const DOMAIN = process.env.BASE_URL || `http://localhost:${PORT}`;

app.listen(PORT, () => {
  console.log(`Server running on ${DOMAIN}`);
});
