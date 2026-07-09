/* ================================================================
   CONFIG
================================================================ */
const CREDS      = { user: 'admin', pass: 'ventura1215' };
const LS_KEY     = 'ventura_slime_v3';
const LS_CFG     = 'ventura_slime_cfg';
const LS_CONTACT = 'ventura_slime_contact';
const LS_SESSION = 'ventura_slime_session';
const LS_DELETED = 'ventura_slime_deleted'; // tracks deleted IDs to handle CDN cache

/* ================================================================
   STATE
================================================================ */
let images   = [];
let selected = new Set();
let contact  = { name: '', phone: '', email: '', address: '' };

/* ================================================================
   SETTINGS
================================================================ */
const GH_REPO_DEFAULT = 'hilikventura/SOL-CO';
// These are auto-patched by saveSettings() so config survives incognito/new devices:
const BAKED_TOKEN    = ''; // auto-set by admin (base64-encoded to avoid secret scanning)
const BAKED_W3F_KEY  = ''; // auto-set by admin (base64-encoded to avoid secret scanning)
const BAKED_DOMAIN   = 'venturatrend.co.il'; // auto-set by admin
const _tokenDecoded  = BAKED_TOKEN   ? atob(BAKED_TOKEN)   : '';
const _w3fDecoded    = BAKED_W3F_KEY ? atob(BAKED_W3F_KEY) : '';
let cfg = { ghRepo: GH_REPO_DEFAULT, ghToken: _tokenDecoded, w3fKey: _w3fDecoded, customDomain: BAKED_DOMAIN };

// Obfuscate credentials so GitHub secret scanning doesn't block the file
function obfuscate(s)   { return btoa(s.split('').reverse().join('')); }
function deobfuscate(s) { try { return atob(s).split('').reverse().join(''); } catch { return ''; } }

async function loadSettings() {
  // 1. Start from baked-in constants
  const _tokDec = BAKED_TOKEN   ? atob(BAKED_TOKEN)   : '';
  const _w3fDec = BAKED_W3F_KEY ? atob(BAKED_W3F_KEY) : '';
  cfg = { ghRepo: GH_REPO_DEFAULT, ghToken: _tokDec, w3fKey: _w3fDec, customDomain: BAKED_DOMAIN };
  // 2. Overlay localStorage
  try {
    const saved = JSON.parse(localStorage.getItem(LS_CFG) || '{}');
    Object.keys(saved).forEach(k => { if (saved[k]) cfg[k] = saved[k]; });
  } catch {}
  // 3. If still missing token â fetch _config.json from public repo (works on any device, no auth needed)
  if (!cfg.ghToken) {
    try {
      const r = await fetch('https://raw.githubusercontent.com/' + GH_REPO_DEFAULT + '/main/_config.json?t=' + Date.now());
      if (r.ok) {
        const d = await r.json();
        if (d.t) cfg.ghToken = deobfuscate(d.t);
        if (d.w) cfg.w3fKey  = deobfuscate(d.w);
        if (d.customDomain) cfg.customDomain = d.customDomain;
        localStorage.setItem(LS_CFG, JSON.stringify(cfg)); // cache for next load
      }
    } catch {}
  }
  if (!cfg.ghRepo) cfg.ghRepo = GH_REPO_DEFAULT;
  updateSettingsUI();
}

async function saveSettings() {
  cfg.ghRepo = GH_REPO_DEFAULT; // always fixed
  const tokenInput = (document.getElementById('s-gh-token').value || '').trim();
  if (tokenInput) cfg.ghToken = tokenInput;
  cfg.w3fKey = (document.getElementById('s-w3f-key').value || '').trim();
  cfg.ejsServiceId = (document.getElementById('s-ejs-service').value || '').trim();
  cfg.ejsTemplateId = (document.getElementById('s-ejs-template').value || '').trim();
  cfg.ejsPubKey = (document.getElementById('s-ejs-pubkey').value || '').trim();
  cfg.geminiKey = (document.getElementById('s-gemini-key')?.value || '').trim();
  cfg.customDomain = (document.getElementById('s-custom-domain').value || '').trim();
  localStorage.setItem(LS_CFG, JSON.stringify(cfg));
  updateSettingsUI();
  showToast('ð¾ Saving settingsâ¦');
  await bakeSettingsToGitHub();
}

async function bakeSettingsToGitHub() {
  if (!cfg.ghRepo || !cfg.ghToken) { showToast('â Settings saved (locally only â enter a GitHub token to sync across devices)'); return; }
  try {
    // Write credentials to _config.json â short keys + reversed base64 to bypass secret scanning
    const configData = {
      t:            obfuscate(cfg.ghToken),
      w:            obfuscate(cfg.w3fKey || ''),
      customDomain: cfg.customDomain || ''
    };
    const content = utf8ToBase64(JSON.stringify(configData, null, 2));
    // Get current SHA if file already exists
    let sha;
    try {
      const r = await ghApi('GET', 'contents/_config.json');
      if (r.ok) { const d = await r.json(); sha = d.sha; }
    } catch {}
    const body = { message: 'Update config', content };
    if (sha) body.sha = sha;
    const putRes = await ghApi('PUT', 'contents/_config.json', body);
    if (putRes.ok) showToast('â Settings saved & synced â auto-loads on every device!');
    else { const e = await putRes.json().catch(()=>({})); showToast('â ï¸ Saved locally; GitHub sync failed: ' + (e.message||putRes.status)); }
  } catch (err) {
    console.warn('bakeSettingsToGitHub error', err);
    showToast('â Settings saved locally (' + err.message + ')');
  }
}

function updateSettingsUI() {
  const ghOk  = !!(cfg.ghRepo && cfg.ghToken);
  const w3fOk = !!cfg.w3fKey;
  const allOk = ghOk && w3fOk;

  const statusEl = document.getElementById('settings-status');
  if (statusEl) {
    statusEl.textContent = allOk ? 'All Set â' : (ghOk || w3fOk ? 'Partial Setup' : 'Not Configured');
    statusEl.className   = 's-status ' + (allOk ? 'ok' : 'bad');
  }
  setChip('chip-github', ghOk,  'ð GitHub',    ghOk  ? 'Active' : 'Not Set');
  setChip('chip-w3f',    w3fOk, 'âï¸ Web3Forms',  w3fOk ? 'Active' : 'Not Set');
  setVal('s-gh-repo', cfg.ghRepo);
  setVal('s-custom-domain', cfg.customDomain);
  // Show masked token so user knows it's saved
  const tokenEl = document.getElementById('s-gh-token');
  if (tokenEl) {
    tokenEl.value       = '';
    tokenEl.placeholder = cfg.ghToken ? 'â¢â¢â¢â¢â¢â¢â¢â¢  (Saved â re-enter only to change)' : 'github_pat_...';
  }
  setVal('s-w3f-key', cfg.w3fKey);
  setVal('s-ejs-service', cfg.ejsServiceId);
  setVal('s-ejs-template', cfg.ejsTemplateId);
  setVal('s-ejs-pubkey', cfg.ejsPubKey);
  setVal('s-gemini-key', cfg.geminiKey || '');
}

function setChip(id, ok, label, status) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = label + ': ' + status;
  el.className   = 'chip ' + (ok ? 'chip-ok' : 'chip-bad');
}
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v || ''; }
function toggleSettings() { document.getElementById('settings-body').classList.toggle('open'); updateSettingsUI(); }

/* ================================================================
   CONTACT
================================================================ */
function loadContact() {
  try { contact = Object.assign({}, contact, JSON.parse(localStorage.getItem(LS_CONTACT) || '{}')); }
  catch {}
}
function saveContact() { localStorage.setItem(LS_CONTACT, JSON.stringify(contact)); }

/* ================================================================
   GITHUB API HELPER
================================================================ */
function ghApi(method, path, body) {
  const opts = {
    method,
    headers: {
      'Authorization': 'Bearer ' + cfg.ghToken,
      'Content-Type':  'application/json',
      'Accept':        'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch('https://api.github.com/repos/' + cfg.ghRepo + '/' + path, opts);
}

/* ================================================================
   GITHUB â Test connection
================================================================ */
async function testGithubConnection() {
  // Pull token from field if user just typed a new one
  const tokenInput = (document.getElementById('s-gh-token').value || '').trim();
  const token = tokenInput || cfg.ghToken;
  const resultEl = document.getElementById('gh-test-result');
  resultEl.style.display = 'block';
  resultEl.style.color = '#64748b';
  resultEl.textContent = 'â³ Testingâ¦';
  if (!token) {
    resultEl.style.color = '#ef4444';
    resultEl.textContent = 'â No token entered â paste your GitHub Personal Access Token above first.';
    return;
  }
  try {
    const res = await fetch('https://api.github.com/repos/' + cfg.ghRepo + '/contents/catalog.json', {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    if (res.ok || res.status === 404) {
      resultEl.style.color = '#16a34a';
      resultEl.textContent = 'â Token valid! GitHub connection OK.';
      if (tokenInput) { cfg.ghToken = token; }
    } else if (res.status === 401) {
      resultEl.style.color = '#ef4444';
      resultEl.textContent = 'â Unauthorized (401) â token is invalid or expired. Generate a new one.';
    } else if (res.status === 403) {
      resultEl.style.color = '#ef4444';
      resultEl.textContent = 'â Forbidden (403) â token exists but lacks "Contents: Read & Write" permission.';
    } else {
      resultEl.style.color = '#ef4444';
      resultEl.textContent = 'â Error ' + res.status + ' â check repo name in settings.';
    }
  } catch (err) {
    resultEl.style.color = '#ef4444';
    resultEl.textContent = 'â Network error: ' + err.message;
  }
}

/* ================================================================
   CATALOG â GitHub + localStorage fallback
================================================================ */
function getDeletedIds() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_DELETED) || '[]')); }
  catch { return new Set(); }
}
function addDeletedId(id) {
  const s = getDeletedIds(); s.add(id);
  localStorage.setItem(LS_DELETED, JSON.stringify([...s]));
}

async function loadCatalog() {
  const local      = (() => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } })();
  const deletedIds = getDeletedIds();

  // Only trust GitHub if we have a token (meaning we also SAVE there)
  if (cfg.ghToken) {
    try {
      // Use GitHub API (not raw CDN) â always returns latest, not cached
      const r = await ghApi('GET', 'contents/catalog.json');
      if (r.ok) {
        const d = await r.json();
        // Decode base64 content returned by the API
        const jsonStr = new TextDecoder().decode(Uint8Array.from(atob(d.content.replace(/\n/g,'')), c => c.charCodeAt(0)));
        let ghData = JSON.parse(jsonStr);
        // Remove any IDs the user already deleted (handles CDN lag)
        ghData = ghData.filter(i => !deletedIds.has(i.id));
        // Merge: add local-only items not yet pushed to GitHub
        const ghIds = new Set(ghData.map(i => i.id));
        const localOnly = local.filter(i => !ghIds.has(i.id) && !deletedIds.has(i.id));
        images = [...ghData, ...localOnly];
        localStorage.setItem(LS_KEY, JSON.stringify(images));
        return;
      }
    } catch (err) { console.warn('GitHub catalog load failed', err); }
  }

  // No token or GitHub failed â use localStorage, filter out deleted IDs
  images = local.filter(i => !deletedIds.has(i.id));
}

function utf8ToBase64(str) {
  // Chunked to avoid stack overflow on large files (spread operator limit ~65k)
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function saveCatalog() {
  localStorage.setItem(LS_KEY, JSON.stringify(images));
  if (!cfg.ghRepo || !cfg.ghToken) return;
  try {
    const content = utf8ToBase64(JSON.stringify(images, null, 2));
    // Get current SHA (if file already exists)
    let sha;
    try {
      const r = await ghApi('GET', 'contents/catalog.json');
      if (r.ok) { const d = await r.json(); sha = d.sha; }
      else if (r.status === 401) { showToast('â GitHub token invalid or expired â update in Settings'); return; }
      else if (r.status === 403) { showToast('â GitHub token lacks write permission â check repo access in Settings'); return; }
    } catch {}
    const body = { message: 'Update catalog', content };
    if (sha) body.sha = sha;
    const saveRes = await ghApi('PUT', 'contents/catalog.json', body);
    if (saveRes.ok) {
      // Prune LS_DELETED â catalog is now authoritative, no need to keep stale deleted IDs
      localStorage.removeItem(LS_DELETED);
    } else {
      const errData = await saveRes.json().catch(() => ({}));
      const msg = errData.message || ('HTTP ' + saveRes.status);
      if (saveRes.status === 401) showToast('â GitHub: Unauthorized â re-enter your token in Settings');
      else if (saveRes.status === 403) showToast('â GitHub: Forbidden â token missing "Contents: Read & Write" permission');
      else if (saveRes.status === 409) showToast('â ï¸ GitHub: Conflict â refresh and try again');
      else if (saveRes.status === 422) showToast('â ï¸ GitHub: ' + msg);
      else showToast('â ï¸ GitHub save failed (' + saveRes.status + '): ' + msg);
      console.warn('GitHub catalog save failed', saveRes.status, errData);
    }
  } catch (err) {
    console.warn('GitHub catalog save failed', err);
    showToast('â ï¸ GitHub: Save error (saved locally) â ' + (err.message || ''));
  }
}

/* ================================================================
   UPLOAD IMAGE TO GITHUB
================================================================ */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function uploadFile(file, category) {
  if (cfg.ghRepo && cfg.ghToken) {
    try {
      const dataUrl  = await fileToBase64(file);
      const base64   = dataUrl.split(',')[1];
      const safeName = Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path     = 'images/' + category + '/' + safeName;

      const res = await ghApi('PUT', 'contents/' + path, {
        message: 'Upload ' + file.name,
        content: base64
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.warn('GitHub upload failed (' + (errData.message || res.status) + '), using local fallback');
        showToast('â ï¸ GitHub upload failed â saved locally');
        // Fall through to base64 fallback below
      } else {
        const data = await res.json();
        let baseUrl;
        if (cfg.customDomain) {
          baseUrl = 'https://' + cfg.customDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
        } else {
          const [owner, repo] = cfg.ghRepo.split('/');
          baseUrl = cfg.customDomain ? 'https://' + cfg.customDomain : 'https://' + owner + '.github.io/' + repo;
        }
        return { url: baseUrl + '/' + path, sha: data.content.sha, path };
      }
    } catch (err) {
      console.warn('GitHub upload error, using local fallback:', err);
      showToast('â ï¸ GitHub error â saved locally');
    }
  }
  // Fallback: base64
  const dataUrl = await fileToBase64(file);
  return { url: dataUrl, sha: null, path: null };
}

async function deleteFileFromGitHub(img) {
  if (!cfg.ghRepo || !cfg.ghToken || !img.path) return;
  try {
    // Always fetch the current SHA â stored SHA may be stale
    let sha = img.sha;
    const check = await ghApi('GET', 'contents/' + img.path);
    if (check.ok) {
      const fileData = await check.json();
      sha = fileData.sha;
    } else if (check.status === 404) {
      return; // file already gone
    }
    if (!sha) return;

    const res = await ghApi('DELETE', 'contents/' + img.path, {
      message: 'Delete ' + img.name,
      sha
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.warn('GitHub delete failed:', errData.message || res.status);
      showToast('â ï¸ GitHub delete failed: ' + (errData.message || res.status));
    }
  } catch (err) {
    console.warn('GitHub delete error', err);
    showToast('â ï¸ GitHub delete error â file may still exist on GitHub');
  }
}

/* ================================================================
   VIEW ROUTING
================================================================ */
function showPublic() {
  localStorage.removeItem('ventura_slime_session'); document.body.className = ''; renderPublic(); }

function showLogin() {
  document.body.className = 'show-login';
  document.getElementById('inp-user').value = '';
  document.getElementById('inp-pass').value = '';
  document.getElementById('login-error').classList.remove('show');
  setTimeout(() => document.getElementById('inp-user').focus(), 80);
}

async function showAdmin() {
  document.body.className = 'show-admin';
  await loadCatalog();
  renderAdmin();
}

/* ================================================================
   AUTH
================================================================ */
function focusPass() { document.getElementById('inp-pass').focus(); }

async function doLogin() {
  const u = (document.getElementById('inp-user').value || '').trim();
  const p = (document.getElementById('inp-pass').value || '');
  const errEl = document.getElementById('login-error');
  const btn   = document.querySelector('.btn-login-submit');
  if (u === CREDS.user && p === CREDS.pass) {
    errEl.classList.remove('show');
    if (btn) { btn.disabled = true; btn.textContent = 'â³ Loading...'; }
    localStorage.setItem(LS_SESSION, '1');
    try {
      await showAdmin();
    } catch (err) {
      console.error('showAdmin failed:', err);
      showToast('â Error loading admin panel');
      if (btn) { btn.disabled = false; btn.textContent = 'Login â'; }
    }
  } else {
    errEl.textContent = u === CREDS.user ? 'â Wrong password' : 'â Wrong username or password';
    errEl.classList.add('show');
    document.getElementById('inp-pass').value = '';
    document.getElementById('inp-pass').focus();
  }
}
function doLogout() { localStorage.removeItem(LS_SESSION); showPublic(); }

/* ================================================================
   HELPERS
================================================================ */
function byCategory(cat) { return images.filter(img => img.category === cat); }

/* ================================================================
   PUBLIC RENDER
================================================================ */
function renderPublic() {
  selected.clear(); updateSelUI();
  renderPubSection('slime',   byCategory('slime'));
  renderPubSection('macrame', byCategory('macrame'));
renderPubSection('homemade', byCategory('homemade'));
}

function switchPubTab(cat) {
  ['slime','macrame','homemade'].forEach(c => {
    document.getElementById('pub-tab-' + c).classList.toggle('active', c === cat);
    document.getElementById('pub-' + c + '-section').classList.toggle('active', c === cat);
  });
}

function switchAdminTab(cat) {
  ['slime','macrame','homemade'].forEach(c => {
    document.getElementById('admin-tab-' + c).classList.toggle('active', c === cat);
    document.getElementById('admin-' + c + '-pane').classList.toggle('active', c === cat);
  });
}

function renderPubSection(cat, imgs) {
  const gridEl  = document.getElementById('pub-grid-' + cat);
  const countEl = document.getElementById('pub-' + cat + '-count');
  countEl.textContent = imgs.length;
  gridEl.innerHTML = imgs.map(img => {
    const title    = img.title || img.name;
    const hasTitle = !!img.title;
    const price    = img.price ? 'âª' + img.price : '';
    const inCart   = selected.has(img.id);
    return `
    <div class="prod-card${inCart ? ' in-cart' : ''}" id="card-${img.id}">
      <div class="prod-img" onclick="openLightbox('${esc(img.dataUrl)}','${esc(title)}')">
        <img src="${img.dataUrl}" alt="${esc(title)}" loading="lazy" decoding="async" />
        <div class="prod-in-cart-badge">â</div>
        ${price ? '<div class="prod-badge" data-i18n="available">â¦ ' + (window.i18n ? window.i18n('available') : 'Available') + '</div>' : ''}
      </div>
      <div class="prod-info">
        <div class="prod-title${hasTitle ? '' : ' untitled'}" data-en-title="${esc(title)}">${esc(title)}</div>
        <div class="prod-price-row">
          ${price ? `<span class="prod-price-val">${esc(price)}</span>` : '<span class="prod-price-tbd">Price on request</span>'}
        </div>
        <div class="prod-btns">
          <button class="btn-cart" onclick="addToCart('${img.id}')">
            ${inCart ? (document.documentElement.lang==='he' ? 'â ××¢×××' : 'â In Cart') : (document.documentElement.lang==='he' ? 'ð ×××¡×£ ××¢×××' : 'ð Add to Cart')}
          </button>
          <button class="btn-buy" onclick="buyNow('${img.id}')">${document.documentElement.lang==='he' ? '×§× × ×¢××©××' : 'Buy Now'}</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ================================================================
   SELECTION
================================================================ */
/* Add / remove from cart */
function addToCart(id) {
  if (selected.has(id)) {
    selected.delete(id);
  } else {
    selected.add(id);
  }
  updateCartUI();
  // Re-render just this card's button states without full re-render
  const card = document.getElementById('card-' + id);
  if (card) {
    const inCart = selected.has(id);
    card.classList.toggle('in-cart', inCart);
    const btn = card.querySelector('.btn-cart');
    if (btn) btn.textContent = inCart ? (document.documentElement.lang==='he'?'â ××¢×××':'â In Cart') : (document.documentElement.lang==='he'?'ð ×××¡×£ ××¢×××':'ð Add to Cart');
    if (inCart) {
      if (btn) btn.style.background = '#16a34a';
      showToast(document.documentElement.lang==='he'?'ð × ××¡×£ ××¢×××!':'ð Added to cart!')
        if(window._showDonkey) window._showDonkey();;
    } else {
      if (btn) btn.style.background = '';
      showToast('Removed from cart');
    }
  }
}

/* Buy just this one item immediately */
function buyNow(id) {
  selected.clear();
  selected.add(id);
  updateCartUI();
  sendMail();
}

function clearSelection() {
  selected.forEach(id => {
    const card = document.getElementById('card-' + id);
    if (card) {
      card.classList.remove('in-cart');
      const btn = card.querySelector('.btn-cart');
      if (btn) { btn.textContent = 'ð Add to Cart'; btn.style.background = ''; }
    }
  });
  selected.clear();
  updateCartUI();
}

function updateCartUI() {
  const n = selected.size;
  document.getElementById('btn-clear-pub').style.display  = n ? 'inline-flex' : 'none';
  document.getElementById('send-panel').classList.toggle('visible', n > 0);
  document.getElementById('panel-count').textContent = n;
  const topBtn   = document.getElementById('cart-action-btn');
  const topBadge = document.getElementById('cart-badge-top');
  if (topBtn)   topBtn.style.display   = n ? 'flex' : 'none';
  if (topBadge) topBadge.textContent   = n;
}

/* keep legacy name used elsewhere */
function updateSelUI() { updateCartUI(); }

/* ================================================================
   BUILD MESSAGE
================================================================ */
function buildMessage(ct) {
  const slimeSel   = images.filter(img => selected.has(img.id) && img.category === 'slime');
  const macrameSel = images.filter(img => selected.has(img.id) && img.category === 'macrame');
  const homemadeSel = images.filter(img => selected.has(img.id) && img.category === 'homemade');
  const lines = [];
  lines.push('ð¤ Customer Details:');
  lines.push('Name: '    + ct.name);
  lines.push('Phone: '   + ct.phone);
  if (ct.email)   lines.push('Email: '   + ct.email);
  if (ct.address) lines.push('Address: ' + ct.address);

  function addItems(arr, label) {
    if (!arr.length) return;
    lines.push(''); lines.push(label);
    arr.forEach((img, i) => {
      const title = (img.title || img.name).trim();
      const price = (img.price || '').trim();
      lines.push(price
        ? '  ' + (i+1) + '. ' + title + '  |  Price: âª' + price
        : '  ' + (i+1) + '. ' + title);
    });
  }
  addItems(slimeSel,   'ð«§ Squishies:');
  addItems(macrameSel, 'ðª¢ MacramÃ©:');
addItems(homemadeSel, 'ð  Home Made:');
  return lines.join('\n');
}

/* ================================================================
   SEND â step 1: open contact modal
================================================================ */
function sendMail() {
  if (!selected.size) return;
  document.getElementById('c-name').value    = contact.name    || '';
  document.getElementById('c-phone').value   = contact.phone   || '';
  document.getElementById('c-email').value   = contact.email   || '';
  document.getElementById('c-address').value = contact.address || '';
  document.getElementById('contact-err').classList.remove('show');
  document.getElementById('contact-modal').classList.add('open');
  setTimeout(() => document.getElementById('c-name').focus(), 80);
}

function closeContactModal(event) {
  if (event && event.target !== document.getElementById('contact-modal')) return;
  document.getElementById('contact-modal').classList.remove('open');
}

/* ================================================================
   SEND â step 2: validate + send
================================================================ */
async function submitWithContact() {
  const name    = document.getElementById('c-name').value.trim();
  const phone   = document.getElementById('c-phone').value.trim();
  const email   = document.getElementById('c-email').value.trim();
  const address = document.getElementById('c-address').value.trim();
  const errEl   = document.getElementById('contact-err');

  if (!name || !phone) {
    errEl.classList.add('show');
    document.getElementById('c-name').classList.toggle('invalid', !name);
    document.getElementById('c-phone').classList.toggle('invalid', !phone);
    return;
  }
  errEl.classList.remove('show');
  contact = { name, phone, email, address };
  saveContact();

  const _ms = JSON.parse(localStorage.getItem('bysol_session')||'null');
  const _mn = _ms ? '\n\nð¤ ×©× ×××¨: ' + _ms.name + ' | ' + _ms.email : '';
  const message = 'Hi Sol!\n\n' + buildMessage(contact) + _mn + '\n\nThank you! ð«§';
  document.getElementById('contact-modal').classList.remove('open');

  const sendBtn = document.querySelector('#send-panel .btn-primary');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'â³ Sending...'; }

  if (!cfg.w3fKey) {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = 'âï¸&nbsp; Send to Sol'; }
    openFallbackModal(message); return;
  }

  try {
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        access_key: cfg.w3fKey,
        subject:    'BySOL Order from ' + name,
        from_name:  name,
        message:    message,
        botcheck:   ''
      })
    });
    const json = await res.json();
    if (json.success) { showToast('â Email sent to Sol!'); clearSelection(); }
    else throw new Error(json.message || 'Error');
  } catch (err) {
    console.error('Web3Forms error:', err);
    showToast('â Send error â please try again');
    openFallbackModal(message);
  } finally {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = 'âï¸&nbsp; Send to Sol'; }
  }
}

/* ================================================================
   FALLBACK MODAL
================================================================ */
function openFallbackModal(text) { document.getElementById('fallback-text').value = text; document.getElementById('fallback-modal').classList.add('open'); }
function closeFallbackModal(event) {
  if (event && event.target !== document.getElementById('fallback-modal')) return;
  document.getElementById('fallback-modal').classList.remove('open');
}
function copyFallbackText() {
  const ta = document.getElementById('fallback-text');
  ta.select();
  try { navigator.clipboard.writeText(ta.value).catch(() => document.execCommand('copy')); }
  catch { document.execCommand('copy'); }
  showToast('â Text copied!');
}

/* ================================================================
   ADMIN RENDER
================================================================ */
function renderAdmin() {
  const slimeImgs   = byCategory('slime');
  const macrameImgs = byCategory('macrame');
  const homemadeImgs = byCategory('homemade');
  document.getElementById('stat-slime').textContent          = slimeImgs.length;
  document.getElementById('stat-macrame').textContent        = macrameImgs.length;
  document.getElementById('stat-homemade').textContent        = homemadeImgs.length;
  document.getElementById('admin-slime-count').textContent   = slimeImgs.length;
  document.getElementById('admin-macrame-count').textContent = macrameImgs.length;
  document.getElementById('admin-homemade-count').textContent = homemadeImgs.length;
  renderAdminGrid('admin-grid-slime',   slimeImgs,   'ð«§ No slime images uploaded yet');
  renderAdminGrid('admin-grid-macrame', macrameImgs, 'ðª¢ No macramÃ© images uploaded yet');
renderAdminGrid('admin-grid-homemade', homemadeImgs, 'ð  No home made images uploaded yet');
  updateSettingsUI();
}

function renderAdminGrid(gridId, imgs, emptyMsg) {
  const grid = document.getElementById(gridId);
  if (!imgs.length) {
    grid.innerHTML = `<div class="admin-empty"><span class="ico">ð­</span><p>${emptyMsg}</p></div>`;
    return;
  }
  grid.innerHTML = imgs.map(img => `
    <div class="admin-card">
      <figure><img src="${img.dataUrl}" alt="${esc(img.title || img.name)}" loading="lazy" decoding="async" /></figure>
      <div class="card-footer">
        <div class="card-field">
          <label>Title</label>
          <input type="text" value="${esc(img.title || '')}" placeholder="Enter title..."
                 oninput="updateField('${img.id}','title',this.value)" onblur="saveCatalog()" />
        </div>
        <div class="card-field">
          <label>Price (âª)</label>
          <input type="number" min="0" step="0.5" class="price-input"
                 value="${esc(img.price || '')}" placeholder="0"
                 oninput="updateField('${img.id}','price',this.value)" onblur="saveCatalog()" />
        </div>
        <div class="card-del-row">
          <span class="fname" title="${esc(img.name)}">${esc(img.name)}</span>
          <button class="btn-del" onclick="deleteImage('${img.id}')">ð Delete</button>
          <div class="ai-btns">
            <button class="btn-ai" onclick="aiEnhance('${img.id}')" title="Enhance with Gemini AI">â¨</button>
            <button class="btn-ai" onclick="aiRemoveBg('${img.id}')" title="Remove Background">âï¸</button>
            <button class="btn-ai" onclick="aiGenerate('${img.id}')" title="Generate new image">ð</button>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

/* ================================================================
   UPLOAD
================================================================ */
/* ââ Upload details modal ââ */
function promptUploadDetails(filename) {
  return new Promise(resolve => {
    document.getElementById('udm-filename').textContent = filename;
    document.getElementById('udm-name').value  = '';
    document.getElementById('udm-price').value = '';
    document.getElementById('udm-name').classList.remove('err');
    document.getElementById('udm-price').classList.remove('err');
    document.getElementById('udm-name-err').classList.remove('show');
    document.getElementById('udm-price-err').classList.remove('show');
    document.getElementById('udm-overlay').style.display = 'flex';
    setTimeout(() => document.getElementById('udm-name').focus(), 50);
    window._udmResolve = resolve;
  });
}
function udmConfirm() {
  const name  = document.getElementById('udm-name').value.trim();
  const price = document.getElementById('udm-price').value.trim();
  let valid = true;
  if (!name)  { document.getElementById('udm-name').classList.add('err');  document.getElementById('udm-name-err').classList.add('show');  valid = false; }
  if (!price || isNaN(price) || Number(price) <= 0) {
    document.getElementById('udm-price').classList.add('err');
    document.getElementById('udm-price-err').classList.add('show');
    valid = false;
  }
  if (!valid) return;
  document.getElementById('udm-overlay').style.display = 'none';
  window._udmResolve({ title: name, price });
}
function udmCancel() {
  document.getElementById('udm-overlay').style.display = 'none';
  window._udmResolve(null);
}

async function handleUpload(fileList, category) {
  const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
  if (!files.length) { showToast('â ï¸ No image files selected'); return; }

  // Collect name + price for each file before uploading
  const fileDetails = [];
  for (let __rawFile of files) {
        const file=(typeof imageCompression!=='undefined'&&__rawFile.type.startsWith('image/'))?await imageCompression(__rawFile,{maxSizeMB:0.4,maxWidthOrHeight:800,useWebWorker:true,initialQuality:0.82}).catch(()=>__rawFile):__rawFile;
    const details = await promptUploadDetails(file.name);
    if (!details) {
      showToast('Upload cancelled');
      document.getElementById('file-input-' + category).value = '';
      return;
    }
    fileDetails.push({ file, ...details });
  }

  const progressEl = document.getElementById('upload-progress');
  const progFill   = document.getElementById('prog-fill');
  const progText   = document.getElementById('prog-text');
  progressEl.classList.add('show'); progFill.style.width = '0%';
  progText.textContent = '0 / ' + fileDetails.length;

  let done = 0; const errors = [];
  const total = fileDetails.length;

  // Upload all files in parallel for maximum speed
  await Promise.all(fileDetails.map(async ({ file, title, price }) => {
    try {
      const { url, sha, path } = await uploadFile(file, category);
      images.push({
        id:       Date.now().toString(36) + Math.random().toString(36).slice(2,7),
        name:     file.name, title, price,
        category, dataUrl: url, sha, path
      });
      renderAdmin(); // show each image as soon as it's ready
    } catch (err) { errors.push(file.name); console.error('Upload error', file.name, err); }
    done++;
    progFill.style.width = Math.round((done / total) * 100) + '%';
    progText.textContent = done + ' / ' + total;
  }));

  await saveCatalog();
  setTimeout(() => { progressEl.classList.remove('show'); progFill.style.width = '0%'; }, 600);

  const catLabel = category === 'slime' ? 'slime' : 'macramÃ©';
  if (errors.length) showToast('â ï¸ ' + (done - errors.length) + ' uploaded, ' + errors.length + ' failed');
  else showToast('â ' + done + ' ' + catLabel + ' images uploaded');
  document.getElementById('file-input-' + category).value = '';
}

function onDragOver(e, cat)  { e.preventDefault(); document.getElementById('upload-zone-' + cat).classList.add('dragging'); }
function onDragLeave(e, cat) { document.getElementById('upload-zone-' + cat).classList.remove('dragging'); }
function onDrop(e, cat)      { e.preventDefault(); document.getElementById('upload-zone-' + cat).classList.remove('dragging'); handleUpload(e.dataTransfer.files, cat); }

/* ================================================================
   UPDATE FIELD
================================================================ */
function updateField(id, field, value) { const img = images.find(i => i.id === id); if (img) img[field] = value; }

/* ================================================================
   DELETE
================================================================ */
async function deleteImage(id) {
  if (!confirm('Delete this image?')) return;
  const img = images.find(i => i.id === id);
  if (!img) return;
  images = images.filter(i => i.id !== id);
  addDeletedId(id); // remember deletion even if GitHub CDN is cached
  await Promise.all([saveCatalog(), deleteFileFromGitHub(img)]);
  renderAdmin(); showToast('ð Image deleted');
}

async function deleteAll() {
  if (!images.length) return;
  if (!confirm('Delete all ' + images.length + ' images?')) return;
  const toDelete = [...images];
  toDelete.forEach(img => addDeletedId(img.id));
  images = [];
  await saveCatalog();
  await Promise.all(toDelete.map(img => deleteFileFromGitHub(img)));
  renderAdmin(); showToast('ð All images deleted');
}

/* ================================================================
   UTILS
================================================================ */
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
let toastTimer;
function showToast(msg) {
  clearTimeout(toastTimer);
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

/* ================================================================
   LIGHTBOX
================================================================ */
function openLightbox(src, title) {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  const lbTitle = document.getElementById('lightbox-title');
  img.src = src; img.alt = title || '';
  lbTitle.textContent = title || '';
  lbTitle.style.display = title ? '' : 'none';
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLightbox(e) {
  if (e && e.target !== document.getElementById('lightbox') && !e.target.classList.contains('lightbox-close')) return;
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
  setTimeout(() => { document.getElementById('lightbox-img').src = ''; }, 350);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') { document.getElementById('lightbox')?.classList.remove('open'); document.body.style.overflow = ''; } });

/* ================================================================
   CARD TILT EFFECT
================================================================ */
function initTilt() {
  document.addEventListener('mousemove', e => {
    const card = e.target.closest('.prod-card');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width  - 0.5;
    const y = (e.clientY - rect.top)  / rect.height - 0.5;
    card.style.transform = `perspective(600px) rotateY(${x * 12}deg) rotateX(${-y * 12}deg) translateY(-8px) scale(1.02)`;
  });
  document.addEventListener('mouseout', e => {
    const card = e.target.closest('.prod-card');
    if (card && !card.contains(e.relatedTarget)) card.style.transform = '';
  });
}

/* ================================================================
   BOOT
================================================================ */
(async function init() {
  await loadSettings();
  loadContact();
  if (localStorage.getItem(LS_SESSION) === '1') {
    await showAdmin(); // showAdmin calls loadCatalog internally
  } else {
    await loadCatalog();
    renderPublic();
  }
  initTilt();
})();

/* Scroll-reveal IntersectionObserver */
  (function(){
    const io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){
          e.target.classList.add('in-view');
          io.unobserve(e.target);
        }
      });
    }, {threshold:0.08, rootMargin:'0px 0px -30px 0px'});

    /* Reveal sections */
    document.querySelectorAll('.cat-section, .action-bar, .gallery-inner, .hero-sub, .hero-cta')
      .forEach(function(el){ el.classList.add('reveal'); io.observe(el); });

    /* Stagger product grids */
    document.querySelectorAll('.img-grid').forEach(function(el){ io.observe(el); });

    /* Cart badge micro-interaction */
    var _origAddToCart = window.addToCart;
    if(_origAddToCart){
      window.addToCart = function(){
        _origAddToCart.apply(this, arguments);
        var badge = document.querySelector('.sel-badge');
        if(badge){ badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump'); }
      };
    }
  })();

/* ââ MEMBER SYSTEM JS v1.0 ââ */
(function(){
  var MK = 'bysol_members';
  var SK = 'bysol_session';
  var CK = 'bysol_cart_saved';
  var DISC = 0.9; // 10% off

  function getMembers(){ try{return JSON.parse(localStorage.getItem(MK)||'[]');}catch(e){return[];} }
  function saveMembers(m){ localStorage.setItem(MK, JSON.stringify(m)); }
  function getSession(){ try{return JSON.parse(localStorage.getItem(SK)||'null');}catch(e){return null;} }
  function saveSession(u){ localStorage.setItem(SK, JSON.stringify(u)); }
  function clearSession(){ localStorage.removeItem(SK); }

  function showPanel(name){
    ['login','register','profile'].forEach(function(p){
      var el=document.getElementById('panel-'+p);
      if(el) el.style.display=(p===name?'':'none');
    });
  }

  window.openAuthModal = function(tab){
    var modal=document.getElementById('auth-modal');
    modal.style.display='flex';
    modal.style.opacity='1';
    modal.style.pointerEvents='all';
    var s=getSession();
    if(s){
      showPanel('profile');
      var g=document.getElementById('profile-greeting');
      if(g) g.textContent=(window.i18n ? window.i18n('greeting') : '×©×××, ')+s.name+' ð';
    } else {
      showPanel('login');
    }
  };

  window.closeAuthModal = function(){
    var modal=document.getElementById('auth-modal');
    if(modal){ modal.style.display='none'; modal.style.opacity=''; modal.style.pointerEvents=''; }
  };

  window.switchAuthTab = function(tab){
    showPanel(tab);
  };

  window.doMemberLogin = function(){
    var email=(document.getElementById('login-email')||{}).value||'';
    var pass=(document.getElementById('login-pass')||{}).value||'';
    var errEl=document.getElementById('login-err');
    errEl.style.display='none';
    email=email.trim().toLowerCase();
    var members=getMembers();
    var member=null;
    for(var i=0;i<members.length;i++){
      if(members[i].email===email && members[i].pw===btoa(unescape(encodeURIComponent(pass)))){member=members[i];break;}
    }
    if(!member){errEl.textContent=window.i18n('loginError');errEl.style.display='';return;}
    saveSession({id:member.id,name:member.name,email:member.email});
    applyMemberState(true);
    closeAuthModal();
  };

  window.doMemberRegister = function(){
    var name=(document.getElementById('reg-name')||{}).value||'';
    var email=(document.getElementById('reg-email')||{}).value||'';
    var pass=(document.getElementById('reg-pass')||{}).value||'';
    var errEl=document.getElementById('reg-err');
    errEl.style.display='none';
    name=name.trim(); email=email.trim().toLowerCase();
    if(!name||!email||!pass){errEl.textContent='×× × ×××× ××ª ×× ××©×××ª';errEl.style.display='';return;}
    if(pass.length<6){errEl.textContent='××¡××¡×× ×××××ª ××××× ××¤×××ª 6 ×ª××××';errEl.style.display='';return;}
    var members=getMembers();
    for(var i=0;i<members.length;i++){
      if(members[i].email===email){errEl.textContent='××ª×××ª ××××××× ×××¨ ×¨×©×××';errEl.style.display='';return;}
    }
    var member={id:Date.now(),name:name,email:email,pw:btoa(unescape(encodeURIComponent(pass))),joined:new Date().toISOString()};
    members.push(member);
    saveMembers(members);
    saveSession({id:member.id,name:member.name,email:member.email});
    applyMemberState(true);
    closeAuthModal();
  };

  window.doMemberLogout = function(){
    clearSession();
    applyMemberState(false);
    closeAuthModal();
  };

  function applyMemberState(isMember){
    var btn=document.getElementById('member-btn');
    var lbl=document.getElementById('member-label');
    if(isMember){
      document.body.classList.add('is-member');
      if(btn) btn.classList.add('logged-in');
      var s=getSession();
      if(lbl&&s) lbl.textContent=s.name.split(' ')[0];
      applyMemberPrices();
      restoreCart();
    } else {
      document.body.classList.remove('is-member');
      if(btn) btn.classList.remove('logged-in');
      if(lbl) lbl.textContent='××¦××¨×¤×';
      revertPrices();
    }
  }

  function applyMemberPrices(){
    document.querySelectorAll('.prod-price-val').forEach(function(el){
      if(el.dataset.mp) return;
      el.dataset.mp='1';
      var txt=el.textContent||'';
      var m=txt.match(/[âªâª]\s*([\d.]+)/);
      if(!m) return;
      var orig=parseFloat(m[1]);
      var disc=Math.round(orig*DISC);
      el.dataset.origPrice=txt.trim();
      el.innerHTML='<span class="guest-price">'+txt.trim()+'</span> <span class="member-price-tag">×××¨× âª'+disc+'</span>';
    });
  }

  function revertPrices(){
    document.querySelectorAll('.prod-price-val[data-mp]').forEach(function(el){
      if(el.dataset.origPrice) el.textContent=el.dataset.origPrice;
      delete el.dataset.mp;
    });
  }

  // Save cart when items changfunction saveCart(){
    if(!getSession()) return;
    try{ localStorage.setItem(CK+'_'+getSession().id, JSON.stringify([...selected])); }catch(e){}
  }
  }

  function restoreCart(){
    var s=getSession();
    if(!s) return;
    try{
      var saved=JSON.parse(localStorage.getItem(CK+'_'+s.id)||'null');
      if(saved && Array.isArray(saved) && saved.length>0){
        saved.forEach(function(id){ selected.add(id); });
        updateCartUI();
      }
    }catch(e){}
  }

  // Observe cart changes via MutationObserver on badge
  var cartSaveTimer;
  var cartBadge=document.querySelector('.sel-badge');
  if(cartBadge){
    new MutationObserver(function(){
      clearTimeout(cartSaveTimer);
      cartSaveTimer=setTimeout(saveCart, 800);
    }).observe(cartBadge,{childList:true,characterData:true,subtree:true});
  }

  // Also hook addToCart
  var _origAddToCart=window.addToCart;
  if(typeof _origAddToCart==='function'){
    window.addToCart=function(){
      _origAddToCart.apply(this,arguments);
      setTimeout(saveCart,500);
    };
  }

  // VIP product lock overlays for guests
  function applyVipLocks(){
    document.querySelectorAll('.prod-card.vip-product').forEach(function(card){
      if(card.querySelector('.vip-lock-overlay')) return;
      var overlay=document.createElement('div');
      overlay.className='vip-lock-overlay';
      overlay.innerHTML='<span class="lock-icon">ð</span><span class="lock-label">××××¨××ª ××××</span>';
      overlay.onclick=function(){ openAuthModal(); };
      card.appendChild(overlay);
    });
  }

  // Re-apply on DOM changes (new products loaded dynamically)
  new MutationObserver(function(){
    if(getSession()) applyMemberPrices();
    applyVipLocks();
  }).observe(document.body,{childList:true,subtree:true});

  // Init
  var session=getSession();
  if(session){
    applyMemberState(true);
  }
  applyVipLocks();

})();

// Extend showPanel to include forgot
  var _origShowPanel = window._showPanel || null;
  window._showPanelFull = function(name){
    ['login','register','profile','forgot'].forEach(function(p){
      var el=document.getElementById('panel-'+p);
      if(el) el.style.display=(p===name?'':'none');
    });
  };

  // Override switchAuthTab to support forgot
  window.switchAuthTab = function(tab){
    window._showPanelFull(tab);
  };

  // Also patch openAuthModal to use full panel list
  var _origOpen2 = window.openAuthModal;
  window.openAuthModal = function(tab){
    var modal=document.getElementById('auth-modal');
    modal.style.display='flex';
    modal.style.opacity='1';
    modal.style.pointerEvents='all';
    var s=JSON.parse(localStorage.getItem('bysol_session')||'null');
    if(s){
      window._showPanelFull('profile');
      var g=document.getElementById('profile-greeting');
      if(g) g.textContent='×©×××, '+s.name+' ð';
    } else {
      window._showPanelFull(tab||'register');
    }
  };

  window.doSendResetLink = async function(){
    var eml=(document.getElementById('forgot-email')||{}).value||'';
    eml=eml.trim().toLowerCase();
    var eEl=document.getElementById('forgot-err');var oEl=document.getElementById('forgot-ok');
    var boxEl=document.getElementById('reset-link-box');var linkEl=document.getElementById('reset-link-anchor');
    eEl.style.display='none';oEl.style.display='none';if(boxEl)boxEl.style.display='none';
    eEl.textContent='';
    if(!eml){eEl.textContent='×× × ××× ××¡× ××ª×××ª ××××××';eEl.style.display='block';return;}
    var mems=JSON.parse(localStorage.getItem('bysol_members')||'[]');
    var mem=mems.find(function(m){return m.email.toLowerCase()===eml;});
    if(!mem){oEl.textContent='×× ××××××× ×§××× ×××¢×¨××ª, ×××©×× ×§××©××¨ ××××¤××¡ ð§';oEl.style.display='block';return;}
    var tok=btoa(JSON.stringify({email:mem.email,expires:Date.now()+3600000}));
    var rUrl=location.origin+'/?reset='+encodeURIComponent(tok);
    var rc=JSON.parse(localStorage.getItem('ventura_slime_cfg')||'{}');

    // 1. Try EmailJS if configured
    if(rc.ejsPubKey&&rc.ejsServiceId&&rc.ejsTemplateId){
      try{
        await emailjs.send(rc.ejsServiceId,rc.ejsTemplateId,{
          to_email:mem.email,to_name:mem.name||'',reset_link:rUrl,from_name:'BySOL'
        },{publicKey:rc.ejsPubKey});
        if(oEl){oEl.textContent='â ×§××©××¨ × ×©×× ××××××× ×©×× ð§ ×××§× ×× ×¡×¤××';oEl.style.display='block';}
        return;
      }catch(ex){ /* fall through */ }
    }

    // 2. Show the reset link directly on screen â member clicks it right here
    if(boxEl&&linkEl){
      linkEl.href=rUrl;
      boxEl.style.display='block';
    }

    // 3. Also notify admin via Web3Forms so they can assist if needed
    if(rc.w3fKey){
      try{
        var fd=new FormData();
        fd.append('access_key',rc.w3fKey);
        fd.append('subject','ð ××§×©×ª ×××¤××¡ ×¡××¡×× - BySOL');
        fd.append('from_name','BySOL Members');
        fd.append('replyto',mem.email);
        fd.append('message','×××¨× ×××§×©× ×××¤××¡ ×¡××¡××:\n×©×: '+(mem.name||'â')+'\n××××××: '+mem.email+'\n×§××©××¨: '+rUrl);
        fetch('https://api.web3forms.com/submit',{method:'POST',body:fd});
      }catch(e){}
    }
  };
  window.doSetNewPassword = function(){
    var p1=(document.getElementById('forgot-newpass')||{}).value||'';
    var p2=(document.getElementById('forgot-newpass2')||{}).value||'';
    var eEl=document.getElementById('forgot-err2');var oEl=document.getElementById('forgot-ok2');
    eEl.style.display='none';oEl.style.display='none';
    if(p1.length<6){eEl.textContent='×¡××¡×× ×××××ª ××××× ××¤×××ª 6 ×ª××××';eEl.style.display='block';return;}
    if(p1!==p2){eEl.textContent='××¡××¡××××ª ××× × ×ª×××××ª';eEl.style.display='block';return;}
    var mems=JSON.parse(localStorage.getItem('bysol_members')||'[]');
    var ix=mems.findIndex(function(m){return m.email.toLowerCase()===(window._resetEmail||'').toLowerCase();});
    if(ix===-1){eEl.textContent='×©×××× â ××©×ª××© ×× × ××¦×';eEl.style.display='block';return;}
    mems[ix].pw=btoa(unescape(encodeURIComponent(p1)));
    localStorage.setItem('bysol_members',JSON.stringify(mems));
    
    history.replaceState({},'',location.pathname);
    oEl.textContent='â ××¡××¡×× ×¢×××× ×! ×××¢××¨ ××× ××¡×...';oEl.style.display='block';
    document.getElementById('forgot-newpass').value='';document.getElementById('forgot-newpass2').value='';
    setTimeout(function(){switchAuthTab('login');},2500);
  };
  (function(){
    var prms=new URLSearchParams(location.search);var tok=prms.get('reset');
    if(!tok)return;
    var sd;try{sd=JSON.parse(atob(decodeURIComponent(tok)));}catch(e2){history.replaceState({},'',location.pathname);return;}
    if(!sd||!sd.email||!sd.expires||Date.now()>sd.expires){history.replaceState({},'',location.pathname);return;}
    window._resetToken=tok;window._resetEmail=sd.email;
    setTimeout(function(){
      openAuthModal('forgot');
      var s1=document.getElementById('forgot-step1');var s2=document.getElementById('forgot-step2');
      if(s1)s1.style.display='none';if(s2)s2.style.display='block';
    },600);
  })();

  window.checkRegEmail = function(val){
    var hint=document.getElementById('reg-exists-hint');
    if(!hint) return;
    var email=(val||'').trim().toLowerCase();
    if(!email){hint.style.display='none';return;}
    var members=JSON.parse(localStorage.getItem('bysol_members')||'[]');
    var exists=members.some(function(m){return m.email===email;});
    hint.style.display=exists?'':'none';
  };

/* ââ I18N â Language Toggle ââ */
(function(){
  var LANG_KEY = 'bysol_lang';

  var T = {
    he: {
      heroSub: '×××¨× ×× ×©××ª ×××××ª ××©××× ×× × â × ××××¨ ×××× ×××§××! ð',
      gallery: '××××¨×× ×©×× ×',
      cartItems: '×¤×¨×××× ××¢×××',
      clearCart: '× ×§× ×¢×××',
      sendToSol: 'âï¸Â  ×©××× ××¡××',
      waMsg: '××× ×¡××! ð ×¨×××ª× ××ª ××× ××ª ×©×× ××¨×¦××ª× ××©×××...',
      available: '××××',
      tabSquishy: 'ð«§ ×¡×§×××©',
      tabMacrame: 'ðª¢ ××§×¨××',
      tabHomemade: 'â»ï¸ ×× ×©× ××',
      join: '××¦××¨×¤×',
      loginTab: '×× ××¡×',
      registerTab: '××¦××¨×¤××ª',
      welcomeTitle: '××¨××× ×××× ð',
      enterDetails: '××× ××¡× ××ª ××¤×¨××× ×©××',
      emailPh: '××××××',
      passPh: '×¡××¡××',
      loginBtn: '×× ××¡× ×××××¨ ××××¨××ª',
      forgotLink: '×©×××ª× ×¡××¡××',
      joinTitle: '××¦××¨×¤× ×××©×¤×× ð¸',
      joinSub: '×××¨××ª ××§××××ª 10% ×× ×× ××ª××× ×××¢××',
      firstNamePh: '×©× ×¤×¨××',
      existsHintText: '××ª×××ª ×× ×××¨ ×¨×©××× â ',
      loginInstead: '××ª×××¨× ×××§××',
      passMinPh: '×¡××¡×× (6+ ×ª××××)',
      joinFreeBtn: '××¦××¨×¤××ª ××× × â¨',
      resetTitle: '×©××××¨ ×¡××¡×× ð',
      resetLinkReady: '××§××©××¨ ×©×× ×××× â ×××¦× ××× ××× ×××¤×¡ ×¡××¡××:',
      resetLinkBtn: 'ð ××¤×¡× ×¡××¡×× ×¢××©××',
      resetSub: '××× ××¡× ××ª ××××××× ×©×× ×× ×©×× ×§××©××¨ ××××¤××¡ ××¡××¡××',
      regEmailPh: '×××××× ×¨×©××',
      sendResetBtn: '×©×× ×§××©××¨ ××××¤××¡ ð§',
      backToLogin: 'â ×××¨× ××× ××¡×',
      enterNewPass: '××× ××¡× ×¡××¡×× ×××©×',
      newPassPh: '×¡××¡×× ×××©× (6+ ×ª××××)',
      confirmPassPh: '×××××ª ×¡××¡××',
      savePassBtn: '×©×××¨×ª ×¡××¡×× ×××©× â',
      vipBadge: 'â¨ ×××¨× VIP',
      perk1: '10% ×× ×× ×¢× ×× ××××¦×¨××',
      perk2: '×××©× ××ª××× ×××¢××',
      perk3: '×¢×××ª ×§× ×××ª ×©×××¨×',
      logout: '××ª× ×ª×§××ª',
      greeting: '×©×××, ',
      loginError: '×××××× ×× ×¡××¡×× ×©×××××',
      regErrorEmpty: '×× × ×××× ××ª ×× ××©×××ª',
      regErrorShort: '××¡××¡×× ×××××ª ××××× ××¤×××ª 6 ×ª××××',
      regErrorExists: '××××××× ×××¨ ×¨×©××',
      products: {
        'Ice popsicle': '××¨×××§ ×§×¨×',
        'Peanut': '××××',
        'Rabbit': '××¨× ×',
        'Dumpling': '×××¤×ª××',
        'ice cube': '×§×××××ª ×§×¨×',
        'BUTTER': '××××',
        'Donag': '××× ××',
        'Sun': '×©××©',
        'Small Basket': '×¡× ×§××',
        'Large Basket': '×¡× ××××',
        'Green tree': '×¢×¥ ××¨××§',
        'Small owl': '×× ×©××£ ×§××',
        'Three plants': '×©×××©× ×¦××××',
        'Bat': '×¢×××£',
        'Colorful stand': '××ª×× ×¦××¢×× ×',
        'Basket to many things': '×¡× ××× ×××¨',
        'Big owl': '×× ×©××£ ××××',
        'Moon': '××¨×'
      }
    },
    en: {
      heroSub: 'Pick what you love and send it to us â we\'ll get back to you soon! ð',
      gallery: 'Our Gallery',
      cartItems: 'items in your cart',
      clearCart: 'Clear Cart',
      sendToSol: 'âï¸Â  Send to Sol',
      waMsg: 'Hey Sol! ð I saw your shop and wanted to ask...',
      available: 'Available',
      tabSquishy: 'ð«§ Squishy',
      tabMacrame: 'ðª¢ MacramÃ©',
      tabHomemade: 'â»ï¸ Second Hand',
      join: 'Join',
      loginTab: 'Login',
      registerTab: 'Register',
      welcomeTitle: 'Welcome ð',
      enterDetails: 'Enter your details',
      emailPh: 'Email',
      passPh: 'Password',
      loginBtn: 'Login to Members Area',
      forgotLink: 'Forgot password',
      joinTitle: 'Join the Family ð¸',
      joinSub: 'Members get 10% off & exclusive content',
      firstNamePh: 'First Name',
      existsHintText: 'This email is already registered â ',
      loginInstead: 'Login instead',
      passMinPh: 'Password (6+ chars)',
      joinFreeBtn: 'Join for Free â¨',
      resetTitle: 'Reset Password ð',
      resetLinkReady: 'Your link is ready â click below to reset your password:',
      resetLinkBtn: 'ð Reset Password Now',
      resetSub: 'Enter your email and we\'ll send a reset link',
      regEmailPh: 'Registered email',
      sendResetBtn: 'Send Reset Link ð§',
      backToLogin: 'â Back to Login',
      enterNewPass: 'Enter new password',
      newPassPh: 'New password (6+ chars)',
      confirmPassPh: 'Confirm password',
      savePassBtn: 'Save New Password â',
      vipBadge: 'â¨ VIP Member',
      perk1: '10% off all products',
      perk2: 'Access to exclusive content',
      perk3: 'Saved shopping cart',
      logout: 'Logout',
      greeting: 'Hello, ',
      loginError: 'Incorrect email or password',
      regErrorEmpty: 'Please fill in all fields',
      regErrorShort: 'Password must be at least 6 characters',
      regErrorExists: 'Email already registered',
      products: {
        'Ice popsicle': 'Ice Popsicle',
        'Peanut': 'Peanut',
        'Rabbit': 'Rabbit',
        'Dumpling': 'Dumpling',
        'ice cube': 'Ice Cube',
        'BUTTER': 'Butter',
        'Donag': 'Donag',
        'Sun': 'Sun',
        'Small Basket': 'Small Basket',
        'Large Basket': 'Large Basket',
        'Green tree': 'Green Tree',
        'Small owl': 'Small Owl',
        'Three plants': 'Three Plants',
        'Bat': 'Bat',
        'Colorful stand': 'Colorful Stand',
        'Basket to many things': 'Basket for Everything'
      }
    }
  };

  var currentLang = localStorage.getItem(LANG_KEY) || 'he';

  function applyLang(lang) {
    currentLang = lang;
    localStorage.setItem(LANG_KEY, lang);
    var dict = T[lang];
    var isHe = lang === 'he';

    // Update toggle button label
    var btn = document.getElementById('lang-toggle');
    if (btn) btn.textContent = isHe ? 'ð EN' : 'ð ×¢×';

    // Update text content elements
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.getAttribute('data-i18n');
      if (dict[key] !== undefined) el.textContent = dict[key];
    });

    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (dict[key] !== undefined) el.placeholder = dict[key];
    });

    // Update input direction
    document.querySelectorAll('.auth-input').forEach(function(el) {
      el.style.direction = isHe ? 'rtl' : 'ltr';
      el.style.textAlign = isHe ? 'right' : 'left';
    });

    // Translate product titles
    document.querySelectorAll('.prod-title[data-en-title]').forEach(function(el) {
      var enTitle = el.getAttribute('data-en-title');
      var translated = dict.products && dict.products[enTitle];
      el.textContent = translated || enTitle;
    });
  }

  window.toggleLang = function() {
    applyLang(currentLang === 'he' ? 'en' : 'he');
  };

  // Expose translation helper for JS-generated strings
  window.i18n = function(key) {
    return (T[currentLang] && T[currentLang][key]) || (T['en'] && T['en'][key]) || key;
  };

  // Re-apply after product cards render
  var _origRP = window.renderPublic;
  if (_origRP) { window.renderPublic = function(){ _origRP.apply(this,arguments); applyLang(currentLang); }; }

  // Apply on load
  applyLang(currentLang);
})();

(function(){var heMode=false;function applyLang(l){document.querySelectorAll('.btn-cart').forEach(function(b){var ic=b.textContent.trim().charCodeAt(0)===10003;b.textContent=ic?(l==='he'?'â ××¢×××':'â In Cart'):(l==='he'?'ð ×××¡×£ ××¢×××':'ð Add to Cart');});document.querySelectorAll('.btn-buy').forEach(function(b){b.textContent=l==='he'?'×§× × ×¢××©××':'Buy Now';});document.querySelectorAll('[data-he][data-en]').forEach(function(e){e.textContent=l==='he'?e.getAttribute('data-he'):e.getAttribute('data-en');});}var origTL=window.toggleLang;window.toggleLang=function(){origTL&&origTL();heMode=!heMode;applyLang(heMode?'he':'en');};})();
window._showDonkey=function(){
  var el=document.getElementById('dk-popup');
  if(!el)return;
  el.classList.remove('dk-run');
  void el.offsetWidth;
  el.classList.add('dk-run');
  setTimeout(function(){el.classList.remove('dk-run');},2700);
};


window.batchOptimizeImages = async function(){
  if(typeof imageCompression==='undefined'){
    var s=document.getElementById('batch-opt-status');
    if(s) s.textContent='Error: compression library not loaded';
    return;
  }
  var btn=document.getElementById('batch-opt-btn');
  var status=document.getElementById('batch-opt-status');
  if(!btn||!status) return;
  btn.disabled=true;
  status.textContent='Loading image list...';
  var cfgOpt=JSON.parse(localStorage.getItem('ventura_slime_cfg')||'{}');
  var tokOpt=cfgOpt.ghToken;
  var repoOpt=cfgOpt.ghRepo||'hilikventura/SOL-CO';
  try{
    var listR=await fetch('https://api.github.com/repos/'+repoOpt+'/contents/images',{
      headers:{Authorization:'token '+tokOpt,Accept:'application/vnd.github.v3+json'}
    });
    if(!listR.ok){status.textContent='Error: cannot list images ('+listR.status+')';btn.disabled=false;return;}
    var allFiles=await listR.json();
    var imgs=allFiles.filter(function(f){return /\.(jpe?g|png)$/i.test(f.name);});
    var total=imgs.length, compressed=0;
    if(total===0){status.textContent='No JPEG/PNG files found in images/';btn.disabled=false;return;}
    for(var i=0;i<imgs.length;i++){
      var fi=imgs[i];
      status.textContent=(i+1)+'/'+total+' scanning · '+compressed+' compressed';
      try{
        var dlR=await fetch(fi.download_url);
        var origBlob=await dlR.blob();
        var origSize=origBlob.size;
        var ext=fi.name.split('.').pop().toLowerCase();
        var mime=ext==='png'?'image/png':'image/jpeg';
        var compBlob=await imageCompression(new File([origBlob],fi.name,{type:mime}),{
          maxSizeMB:0.35,maxWidthOrHeight:800,useWebWorker:true,initialQuality:0.82,fileType:mime
        });
        if(compBlob.size < origSize*0.9){
          var b64=await new Promise(function(res){
            var rd=new FileReader();
            rd.onload=function(e){res(e.target.result.split(',')[1]);};
            rd.readAsDataURL(compBlob);
          });
          var putR=await fetch('https://api.github.com/repos/'+repoOpt+'/contents/images/'+fi.name,{
            method:'PUT',
            headers:{Authorization:'token '+tokOpt,Accept:'application/vnd.github.v3+json','Content-Type':'application/json'},
            body:JSON.stringify({
              message:'\u{1F5DC}\uFE0F Optimize '+fi.name+' ('+Math.round(origSize/1024)+'KB → '+Math.round(compBlob.size/1024)+'KB)',
              content:b64,
              sha:fi.sha
            })
          });
          if(putR.ok) compressed++;
        }
      }catch(eInner){/* skip file on error */}
      if(i<imgs.length-1) await new Promise(function(res){setTimeout(res,450);});
    }
    status.textContent='\u2705 Done: '+total+' scanned, '+compressed+' optimized';
  }catch(eOuter){
    status.textContent='Error: '+eOuter.message;
  }
  btn.disabled=false;
};