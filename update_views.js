const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, 'views');
const files = fs.readdirSync(viewsDir).filter(f => f.endsWith('.ejs') && f !== 'admin_login.ejs');

const navReplacement = `
    <div class="nav-links">
      <a href="/games" class="nav-link"><i class="fa-solid fa-gamepad"></i> Games</a>
      <a href="/apps" class="nav-link"><i class="fa-solid fa-mobile-screen"></i> Apps</a>
      <a href="/categories" class="nav-link"><i class="fa-solid fa-grid-2"></i> Categories</a>
      <a href="/latest" class="nav-link"><i class="fa-solid fa-fire"></i> Latest</a>
    </div>
    
    <% if (user) { %>
    <div class="user-menu" id="userMenu">
        <div class="user-avatar-btn" onclick="toggleUserDropdown()">
            <div class="user-avatar" id="navAvatar"><%= user.name.charAt(0).toUpperCase() %></div>
            <span class="user-name" id="navUserName"><%= user.name %></span>
            <i class="fas fa-chevron-down" style="font-size:0.7rem;color:var(--text-secondary)"></i>
        </div>
        <div class="user-dropdown" id="userDropdown">
            <div class="user-dropdown-header">
                <div class="user-dropdown-name" id="ddName"><%= user.name %></div>
                <div class="user-dropdown-email" id="ddEmail"><%= user.email %></div>
                <div class="user-dropdown-badge <%= user.role === 'admin' ? 'admin' : '' %>" id="ddBadge"><%= user.role === 'admin' ? 'Admin' : 'User' %></div>
            </div>
            <a href="/profile" class="user-dropdown-item"><i class="fas fa-user"></i> My Profile</a>
            <a href="/downloads" class="user-dropdown-item"><i class="fas fa-download"></i> My Downloads</a>
            <% if (user.role === 'admin') { %>
            <a href="/admin" class="user-dropdown-item"><i class="fas fa-cog"></i> Admin Panel</a>
            <% } %>
            <div class="user-dropdown-divider"></div>
            <button type="button" class="user-dropdown-item danger" onclick="logout()"><i class="fas fa-sign-out-alt"></i> Logout</button>
        </div>
    </div>
    <% } else { %>
    <div class="nav-auth-btns">
        <button class="btn-login" onclick="openAuth('login')"><i class="fas fa-sign-in-alt"></i> Login</button>
        <button class="btn-signup" onclick="openAuth('signup')"><i class="fas fa-user-plus"></i> Sign Up</button>
    </div>
    <% } %>
`;

for (const file of files) {
  const filePath = path.join(viewsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // 1. Add auth.css link
  if (!content.includes('auth.css')) {
    content = content.replace('<link rel="stylesheet" href="css/style.css" />', '<link rel="stylesheet" href="/css/style.css" />\n  <link rel="stylesheet" href="/css/auth.css" />');
    content = content.replace('<link rel="stylesheet" href="/css/style.css" />', '<link rel="stylesheet" href="/css/style.css" />\n  <link rel="stylesheet" href="/css/auth.css" />');
    content = content.replace('<link rel="stylesheet" href="../css/style.css" />', '<link rel="stylesheet" href="/css/style.css" />\n  <link rel="stylesheet" href="/css/auth.css" />');
  }
  
  // 2. Add nav replacement
  const navMatch = content.match(/<div class="nav-links">[\s\S]*?<\/div>/);
  if (navMatch && !content.includes('nav-auth-btns') && !content.includes('navUserName')) {
    content = content.replace(navMatch[0], navReplacement);
  }
  
  // 3. Add auth scripts and partials
  if (!content.includes('partials/cookie_banner')) {
    // Clear out old partials if they exist to prevent duplication
    content = content.replace("<%- include('partials/firebase') %>", "");
    content = content.replace("<%- include('partials/auth_modals') %>", "");
    content = content.replace('<script src="/js/auth.js"></script>', "");
    
    // Add new bundle
    const bundle = `  <%- include('partials/firebase') %>\n  <%- include('partials/cookie_banner') %>\n  <%- include('partials/auth_modals') %>\n  <script src="/js/auth.js"></script>`;
    content = content.replace('</body>', bundle + '\n</body>');
  }
  
  // Quick fix for absolute paths in scripts
  content = content.replace('src="js/main.js"', 'src="/js/main.js"');
  content = content.replace("src='js/main.js'", "src='/js/main.js'");
  
  fs.writeFileSync(filePath, content);
  console.log('Updated ' + file);
}
