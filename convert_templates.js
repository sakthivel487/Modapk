const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, 'views');
const files = fs.readdirSync(viewsDir).filter(f => f.endsWith('.ejs'));

files.forEach(file => {
  const filePath = path.join(viewsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix all .html links to relative paths (e.g. index.html -> /)
  content = content.replace(/href="index\.html"/g, 'href="/"');
  content = content.replace(/href="games\.html"/g, 'href="/games"');
  content = content.replace(/href="apps\.html"/g, 'href="/apps"');
  content = content.replace(/href="categories\.html\?cat=([^"]+)"/g, 'href="/category/$1"');
  content = content.replace(/href="categories\.html"/g, 'href="/categories"');
  content = content.replace(/href="latest\.html"/g, 'href="/latest"');
  content = content.replace(/href="search\.html\?q=([^"]+)"/g, 'href="/search?q=$1"');
  content = content.replace(/href="search\.html\?sort=popular"/g, 'href="/search?sort=popular"');
  content = content.replace(/href="search\.html"/g, 'href="/search"');
  content = content.replace(/href="contact\.html"/g, 'href="/contact"');
  content = content.replace(/href="faq\.html"/g, 'href="/faq"');
  content = content.replace(/href="privacy\.html"/g, 'href="/privacy"');
  content = content.replace(/href="terms\.html"/g, 'href="/terms"');
  content = content.replace(/href="disclaimer\.html"/g, 'href="/disclaimer"');
  content = content.replace(/href="dmca\.html"/g, 'href="/dmca"');

  // Remove the static js files script tags
  content = content.replace(/<script src="js\/data\.js"><\/script>/g, '');
  content = content.replace(/<script src="js\/main\.js"><\/script>/g, '');

  // Add EJS loop for standard apk grids
  const gridReplacement = `
    <div class="cards-grid">
      <% apks.forEach(apk => { %>
        <%- include('partials/_apk_card', { apk: apk }) %>
      <% }) %>
    </div>
  `;

  content = content.replace(/<div class="cards-grid" id="trending-grid"><\/div>/g, gridReplacement);
  content = content.replace(/<div class="cards-grid" id="games-grid"><\/div>/g, gridReplacement);
  content = content.replace(/<div class="cards-grid" id="apps-grid"><\/div>/g, gridReplacement);

  // Add EJS loop for latest list
  const latestReplacement = `
    <div class="latest-list">
      <% apks.forEach(a => { %>
        <div class="latest-item" onclick="window.location.href='/app/<%= a.slug %>'">
          <div class="latest-icon" style="background:<%= a.icon_bg %>"><%= a.icon %></div>
          <div class="latest-info">
            <div class="latest-name"><%= a.name %></div>
            <div class="latest-sub"><%= a.category %> • <%= a.size %> • Android <%= a.android_required %></div>
          </div>
          <div class="latest-meta">
            <div class="latest-version">v<%= a.version %></div>
            <div class="latest-date"><%= a.upload_date %></div>
            <div class="latest-badge mt-1">MOD</div>
          </div>
        </div>
      <% }) %>
    </div>
  `;
  content = content.replace(/<div class="latest-list" id="latest-list"><\/div>/g, latestReplacement);

  // Search Results grid
  content = content.replace(/<div class="cards-grid" id="search-grid"><\/div>/g, `
    <% if (apks.length === 0) { %>
      <div style="text-align:center; padding:3rem; grid-column:1/-1;">
        <i class="fa-solid fa-ghost" style="font-size:3rem; color:var(--text-muted); margin-bottom:1rem;"></i>
        <h3>No results found</h3>
        <p style="color:var(--text-muted);">Try searching for something else like "Minecraft" or "Spotify".</p>
      </div>
    <% } else { %>
      ${gridReplacement}
    <% } %>
  `);

  fs.writeFileSync(filePath, content);
});

console.log("Templates updated successfully!");
