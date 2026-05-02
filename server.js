require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      admin.initializeApp();
    }
  } catch (err) {
    console.error('Firebase initialization error:', err);
    // Fallback for local dev if no service account is provided
    admin.initializeApp();
  }
}

const db = admin.firestore();
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
  name: '__session', // Required for Firebase Hosting, works on Vercel too
  secret: 'modvault-super-secret-key-123',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

// Global middleware
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.isAdmin = req.session.isAdmin || false;
  next();
});

// Auth middleware
const requireAuth = (req, res, next) => {
  if (req.session.isAdmin) next();
  else res.redirect('/admin/login');
};

const requireUser = (req, res, next) => {
  if (req.session.user) next();
  else res.redirect('/');
};

// =======================
// DB HELPERS (Firestore)
// =======================
const getAllApks = async () => {
  const snapshot = await db.collection('apks').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

const getApkBySlug = async (slug) => {
  const snapshot = await db.collection('apks').where('slug', '==', slug).limit(1).get();
  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
};

// =======================
// PUBLIC ROUTES
// =======================

app.get('/', async (req, res) => {
  try {
    const apks = await getAllApks();
    apks.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    
    const stats = {
      apks: apks.length,
      downloads: apks.reduce((sum, a) => sum + (a.downloads || 0), 0)
    };
    
    res.render('index', { 
      apks: apks.slice(0, 10), 
      currentRoute: 'home',
      stats
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

app.get('/games', async (req, res) => {
  try {
    const apks = await getAllApks();
    const games = apks.filter(a => a.category === 'games').sort((a, b) => new Date(b.upload_date) - new Date(a.upload_date));
    res.render('games', { apks: games, currentRoute: 'games' });
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

app.get('/apps', async (req, res) => {
  try {
    const apks = await getAllApks();
    const apps = apks.filter(a => a.category === 'apps').sort((a, b) => new Date(b.upload_date) - new Date(a.upload_date));
    res.render('apps', { apks: apps, currentRoute: 'apps' });
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

app.get('/app/:slug', async (req, res) => {
  try {
    const apk = await getApkBySlug(req.params.slug);
    if (!apk) return res.status(404).send("App not found");
    
    const apks = await getAllApks();
    const similar = apks.filter(a => a.category === apk.category && a.id !== apk.id).slice(0, 3);
    
    res.render('app', { apk, similar, currentRoute: 'app' });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

app.get('/search', async (req, res) => {
  const q = req.query.q || '';
  try {
    const apks = await getAllApks();
    const filtered = apks.filter(a => a.name.toLowerCase().includes(q.toLowerCase()));
    res.render('search', { apks: filtered, query: q, currentRoute: 'search' });
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

app.get('/categories', (req, res) => res.render('categories', { currentRoute: 'categories' }));

app.get('/latest', async (req, res) => {
  try {
    const apks = await getAllApks();
    apks.sort((a, b) => new Date(b.upload_date) - new Date(a.upload_date));
    res.render('latest', { apks, currentRoute: 'latest' });
  } catch(err) {
    res.status(500).send("Server Error");
  }
});

app.get('/download/:slug', async (req, res) => {
  try {
    const apk = await getApkBySlug(req.params.slug);
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

app.post('/api/firebase-auth', async (req, res) => {
  const { uid, email, name, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Missing email' });

  try {
    const userRef = db.collection('users').doc(email);
    const doc = await userRef.get();
    
    let userData;
    if (!doc.exists) {
      userData = {
        name,
        email,
        uid,
        role: role || 'user',
        join_date: new Date().toISOString()
      };
      await userRef.set(userData);
    } else {
      userData = doc.data();
      if (role && userData.role !== role) {
        await userRef.update({ role });
        userData.role = role;
      }
    }

    req.session.user = userData;
    if (userData.role === 'admin') req.session.isAdmin = true;

    res.json({ success: true, user: userData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during auth' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// =======================
// USER PROFILE ROUTES
// =======================

app.get('/profile', requireUser, async (req, res) => {
  try {
    const email = req.session.user.email;
    const snap = await db.collection('user_downloads').where('email', '==', email).orderBy('download_date', 'desc').limit(4).get();
    const downloads = snap.docs.map(doc => doc.data());
    
    // For simplicity, we count directly from user_downloads collection
    const countSnap = await db.collection('user_downloads').where('email', '==', email).get();
    
    res.render('profile', { 
      currentRoute: 'profile', 
      downloads, 
      totalDownloads: countSnap.size 
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

app.get('/downloads', requireUser, async (req, res) => {
  try {
    const email = req.session.user.email;
    const snap = await db.collection('user_downloads').where('email', '==', email).orderBy('download_date', 'desc').get();
    const downloads = snap.docs.map(doc => doc.data());
    res.render('downloads', { currentRoute: 'downloads', downloads });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

app.post('/api/download/:slug', requireUser, async (req, res) => {
  try {
    const apk = await getApkBySlug(req.params.slug);
    if (!apk) return res.status(404).json({ error: 'APK not found' });

    const email = req.session.user.email;
    const downloadId = `${email}_${apk.id}`;
    const downloadRef = db.collection('user_downloads').doc(downloadId);
    const doc = await downloadRef.get();

    if (!doc.exists) {
      await downloadRef.set({
        email,
        apk_id: apk.id,
        name: apk.name,
        icon: apk.icon,
        icon_bg: apk.icon_bg,
        slug: apk.slug,
        download_date: new Date().toISOString()
      });
      
      // Increment global downloads
      const apkRef = db.collection('apks').doc(apk.id);
      await apkRef.update({
        downloads: admin.firestore.FieldValue.increment(1)
      });
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error(err);
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
  if (password === 'admin123') {
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

app.get('/admin', requireAuth, async (req, res) => {
  try {
    const apks = await getAllApks();
    apks.sort((a, b) => new Date(b.upload_date) - new Date(a.upload_date));
    
    const stats = {
      total: apks.length,
      downloads: apks.reduce((sum, a) => sum + (a.downloads || 0), 0),
      games: apks.filter(a => a.category === 'games').length,
      apps: apks.filter(a => a.category === 'apps').length
    };
    
    res.render('admin', { apks, stats });
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

app.post('/admin/api/apk', requireAuth, async (req, res) => {
  const { 
    name, version, category, sub_category, size, android_required, rating, 
    icon, download_url, mod_features, description, how_to_install 
  } = req.body;

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-mod-apk-' + Date.now().toString().slice(-4);
  const icon_bg = 'linear-gradient(135deg, #6c63ff, #a78bfa)';
  const upload_date = new Date().toISOString().split('T')[0];

  const newApk = {
    name, slug, version, category, sub_category, size, android_required,
    rating: parseFloat(rating) || 4.5, icon: icon || '📱', icon_bg, download_url,
    mod_features: mod_features ? mod_features.split('\n').filter(Boolean) : [],
    description,
    how_to_install: how_to_install ? how_to_install.split('\n').filter(Boolean) : [],
    upload_date,
    downloads: 0
  };

  try {
    const docRef = await db.collection('apks').add(newApk);
    res.json({ success: true, id: docRef.id, slug });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/admin/api/apk/:id', requireAuth, async (req, res) => {
  try {
    await db.collection('apks').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const DOMAIN = process.env.BASE_URL || `http://localhost:${PORT}`;

app.listen(PORT, () => {
  console.log(`Server running on ${DOMAIN}`);
});
