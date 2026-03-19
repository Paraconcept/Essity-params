// app.js — ESSITY Params SPA

(function () {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const app = $('#app');

  // --- Theme ---
  function initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
  }

  function updateThemeIcon(theme) {
    const btn = $('#theme-toggle');
    if (btn) btn.innerHTML = theme === 'dark' ? '&#9788;' : '&#9790;';
  }

  // --- Migration : produits sans dossier → dossier "Général" ---
  async function migrateOrphanedProducts() {
    const products = await getAllProducts();
    const orphans = products.filter(p => !p.folderId);
    if (orphans.length === 0) return;

    const folderId = await saveFolder({ name: 'G\u00e9n\u00e9ral' });
    for (const p of orphans) {
      p.folderId = folderId;
      await saveProduct(p);
    }
  }

  // --- Router ---
  function getRoute() {
    return location.hash || '#/';
  }

  async function router() {
    const hash = getRoute();

    if (hash === '#/' || hash === '#' || hash === '') {
      await renderFolderList();
    } else if (hash === '#/folder/new') {
      await renderFolderForm(null);
    } else if (hash.match(/^#\/folder\/(\d+)\/edit$/)) {
      const fid = parseInt(hash.match(/^#\/folder\/(\d+)\/edit$/)[1]);
      await renderFolderForm(fid);
    } else if (hash.match(/^#\/folder\/(\d+)\/product\/new$/)) {
      const fid = parseInt(hash.match(/^#\/folder\/(\d+)\/product\/new$/)[1]);
      await renderProductForm(null, fid);
    } else if (hash.match(/^#\/folder\/(\d+)\/product\/(\d+)\/edit$/)) {
      const m = hash.match(/^#\/folder\/(\d+)\/product\/(\d+)\/edit$/);
      await renderProductForm(parseInt(m[2]), parseInt(m[1]));
    } else if (hash.match(/^#\/folder\/(\d+)\/product\/(\d+)\/photo\/(\d+)$/)) {
      const m = hash.match(/^#\/folder\/(\d+)\/product\/(\d+)\/photo\/(\d+)$/);
      await renderPhotoView(parseInt(m[2]), parseInt(m[3]), parseInt(m[1]));
    } else if (hash.match(/^#\/folder\/(\d+)\/product\/(\d+)$/)) {
      const m = hash.match(/^#\/folder\/(\d+)\/product\/(\d+)$/);
      await renderProductDetail(parseInt(m[2]), parseInt(m[1]));
    } else if (hash.match(/^#\/folder\/(\d+)$/)) {
      const fid = parseInt(hash.match(/^#\/folder\/(\d+)$/)[1]);
      await renderFolderDetail(fid);
    } else {
      await renderFolderList();
    }
  }

  // --- Screens ---

  // 1. Liste des dossiers (écran d'accueil)
  async function renderFolderList() {
    const folders = await getAllFolders();
    folders.sort((a, b) => b.updatedAt - a.updatedAt);

    const counts = {};
    for (const f of folders) {
      counts[f.id] = (await getProductsByFolder(f.id)).length;
    }

    app.innerHTML = `
      <div class="search-bar">
        <input type="text" id="search-input" placeholder="Rechercher un dossier..." autocomplete="off">
      </div>
      <div id="folder-list" class="folder-list">
        ${folders.length === 0 ? '<p class="empty-state">Aucun dossier. Appuyez sur + pour en cr\u00e9er un.</p>' : ''}
        ${folders.map(f => `
          <div class="folder-card" data-id="${f.id}" data-name="${f.name.toLowerCase()}">
            <div class="folder-card-main">
              <div class="folder-icon">&#128193;</div>
              <div class="folder-info">
                <span class="folder-name">${esc(f.name)}</span>
              </div>
              <div class="folder-meta">
                <span class="badge">${counts[f.id]} produit${counts[f.id] !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      <a href="#/folder/new" class="fab">+</a>
    `;

    const searchInput = $('#search-input');
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      $$('.folder-card').forEach(card => {
        card.style.display = card.dataset.name.includes(q) ? '' : 'none';
      });
    });

    $$('.folder-card').forEach(card => {
      card.addEventListener('click', () => {
        location.hash = `#/folder/${card.dataset.id}`;
      });
    });
  }

  // 2. Formulaire dossier (nouveau / modifier)
  async function renderFolderForm(id) {
    let folder = { name: '' };
    if (id) {
      folder = await getFolder(id);
      if (!folder) return location.hash = '#/';
    }

    app.innerHTML = `
      <div class="form-screen">
        <h2>${id ? 'Modifier le dossier' : 'Nouveau dossier'}</h2>
        <form id="folder-form">
          <label for="fname">Nom du dossier</label>
          <input type="text" id="fname" value="${esc(folder.name)}" placeholder="Ex: Ligne 1 \u2014 Machine A" required>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" id="btn-cancel">Annuler</button>
            <button type="submit" class="btn btn-primary">Sauver</button>
          </div>
        </form>
      </div>
    `;

    $('#btn-cancel').addEventListener('click', () => history.back());

    $('#folder-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      folder.name = $('#fname').value.trim();
      if (!folder.name) return;
      await saveFolder(folder);
      location.hash = '#/';
    });

    $('#fname').focus();
  }

  // 3. Détail d'un dossier (liste des produits)
  async function renderFolderDetail(folderId) {
    const folder = await getFolder(folderId);
    if (!folder) return location.hash = '#/';

    const products = await getProductsByFolder(folderId);
    products.sort((a, b) => {
      if (a.position !== undefined && b.position !== undefined) return a.position - b.position;
      if (a.position !== undefined) return -1;
      if (b.position !== undefined) return 1;
      return b.updatedAt - a.updatedAt;
    });

    const counts = {};
    for (const p of products) {
      counts[p.id] = await countEntriesByProduct(p.id);
    }

    app.innerHTML = `
      <div class="detail-screen">
        <div class="detail-header">
          <button class="btn-back" id="btn-back">&larr;</button>
          <div class="detail-title">
            <h2>&#128193; ${esc(folder.name)}</h2>
          </div>
          <div class="detail-actions-top">
            <button class="btn-icon" id="btn-edit-folder" title="Modifier">&#9998;</button>
            <button class="btn-icon btn-danger" id="btn-delete-folder" title="Supprimer">&times;</button>
          </div>
        </div>
        <div class="search-bar" style="margin-top:16px">
          <input type="text" id="search-input" placeholder="Rechercher un produit..." autocomplete="off">
        </div>
        <div id="product-list" class="product-list">
          ${products.length === 0 ? '<p class="empty-state">Aucun produit. Appuyez sur + pour en cr\u00e9er un.</p>' : ''}
          ${products.map(p => `
            <div class="product-card" data-id="${p.id}" data-name="${p.name.toLowerCase()}" data-code="${p.code.toLowerCase()}">
              <div class="product-card-main">
                <span class="drag-handle">&#8942;&#8942;</span>
                <div class="product-info">
                  <span class="product-name">${esc(p.name)}</span>
                  <span class="product-code">${esc(p.code)}</span>
                </div>
                <div class="product-meta">
                  <span class="badge">${counts[p.id].photos} photo${counts[p.id].photos !== 1 ? 's' : ''}</span>
                  <span class="badge">${counts[p.id].notes} note${counts[p.id].notes !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        <a href="#/folder/${folderId}/product/new" class="fab">+</a>
      </div>
    `;

    $('#btn-back').addEventListener('click', () => { location.hash = '#/'; });

    $('#btn-edit-folder').addEventListener('click', () => {
      location.hash = `#/folder/${folderId}/edit`;
    });

    $('#btn-delete-folder').addEventListener('click', async () => {
      const n = products.length;
      const msg = n > 0
        ? `Supprimer le dossier "${folder.name}" et ses ${n} produit${n > 1 ? 's' : ''} ?`
        : `Supprimer le dossier "${folder.name}" ?`;
      if (confirm(msg)) {
        await deleteFolder(folderId);
        location.hash = '#/';
      }
    });

    const searchInput = $('#search-input');
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      $$('.product-card').forEach(card => {
        const name = card.dataset.name;
        const code = card.dataset.code;
        card.style.display = (name.includes(q) || code.includes(q)) ? '' : 'none';
      });
    });

    $$('.product-card').forEach(card => {
      card.addEventListener('click', () => {
        location.hash = `#/folder/${folderId}/product/${card.dataset.id}`;
      });
    });

    new Sortable(document.getElementById('product-list'), {
      animation: 150,
      handle: '.drag-handle',
      ghostClass: 'sortable-ghost',
      onEnd: async () => {
        const cards = $$('.product-card', document.getElementById('product-list'));
        for (let i = 0; i < cards.length; i++) {
          const product = await getProduct(parseInt(cards[i].dataset.id));
          if (product) {
            product.position = i;
            await saveProduct(product);
          }
        }
      }
    });
  }

  // 4. Formulaire produit (nouveau / modifier)
  async function renderProductForm(id, folderId) {
    let product = { name: '', code: '', folderId };
    if (id) {
      product = await getProduct(id);
      if (!product) return location.hash = `#/folder/${folderId}`;
    }

    app.innerHTML = `
      <div class="form-screen">
        <h2>${id ? 'Modifier le produit' : 'Nouveau produit'}</h2>
        <form id="product-form">
          <label for="pname">Nom du produit</label>
          <input type="text" id="pname" value="${esc(product.name)}" placeholder="Ex: Papier 3 plis Deluxe" required>
          <label for="pcode">Code produit</label>
          <input type="text" id="pcode" value="${esc(product.code)}" placeholder="Ex: P3D-001" required>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" id="btn-cancel">Annuler</button>
            <button type="submit" class="btn btn-primary">Sauver</button>
          </div>
        </form>
      </div>
    `;

    $('#btn-cancel').addEventListener('click', () => history.back());

    $('#product-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      product.name = $('#pname').value.trim();
      product.code = $('#pcode').value.trim();
      if (!product.name || !product.code) return;
      await saveProduct(product);
      location.hash = `#/folder/${folderId}`;
    });

    $('#pname').focus();
  }

  // 5. Détail produit (photos & notes)
  async function renderProductDetail(id, folderId) {
    const product = await getProduct(id);
    if (!product) return location.hash = `#/folder/${folderId}`;

    const entries = await getEntriesByProduct(id);
    entries.sort((a, b) => b.createdAt - a.createdAt);

    const photos = entries.filter(e => e.type === 'photo');
    const notes = entries.filter(e => e.type === 'note');

    app.innerHTML = `
      <div class="detail-screen">
        <div class="detail-header">
          <button class="btn-back" id="btn-back">&larr;</button>
          <div class="detail-title">
            <h2>${esc(product.name)}</h2>
            <span class="product-code">${esc(product.code)}</span>
          </div>
          <div class="detail-actions-top">
            <button class="btn-icon" id="btn-edit" title="Modifier">&#9998;</button>
            <button class="btn-icon btn-danger" id="btn-delete-product" title="Supprimer">&times;</button>
          </div>
        </div>

        ${photos.length > 0 ? `
          <h3 class="section-title">Photos (${photos.length})</h3>
          <div class="photo-grid">
            ${photos.map(p => `
              <div class="photo-thumb" data-id="${p.id}">
                <img src="${URL.createObjectURL(p.content)}" alt="${esc(p.caption || '')}">
                <button class="btn-remove" data-entry-id="${p.id}">&times;</button>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${notes.length > 0 ? `
          <h3 class="section-title">Notes (${notes.length})</h3>
          <div class="notes-list">
            ${notes.map(n => `
              <div class="note-card" data-id="${n.id}">
                <p>${esc(n.content)}</p>
                <div class="note-footer">
                  <span class="note-date">${formatDate(n.createdAt)}</span>
                  <button class="btn-remove" data-entry-id="${n.id}">&times;</button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${photos.length === 0 && notes.length === 0 ? '<p class="empty-state">Aucun contenu. Ajoutez des photos ou des notes.</p>' : ''}

        <div class="action-bar">
          <button class="btn btn-accent" id="btn-camera">&#128247; Photo</button>
          <button class="btn btn-accent" id="btn-gallery">&#128444; Galerie</button>
          <button class="btn btn-accent" id="btn-note">&#128221; Note</button>
        </div>

        <input type="file" id="file-camera" accept="image/*" capture="environment" style="display:none">
        <input type="file" id="file-gallery" accept="image/*" multiple style="display:none">
      </div>
    `;

    $('#btn-back').addEventListener('click', () => { location.hash = `#/folder/${folderId}`; });
    $('#btn-edit').addEventListener('click', () => { location.hash = `#/folder/${folderId}/product/${id}/edit`; });

    $('#btn-delete-product').addEventListener('click', async () => {
      if (confirm('Supprimer ce produit et tout son contenu ?')) {
        await deleteProduct(id);
        location.hash = `#/folder/${folderId}`;
      }
    });

    $$('.photo-thumb img').forEach(img => {
      img.addEventListener('click', (e) => {
        const entryId = e.target.closest('.photo-thumb').dataset.id;
        location.hash = `#/folder/${folderId}/product/${id}/photo/${entryId}`;
      });
    });

    $$('.btn-remove').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const entryId = parseInt(btn.dataset.entryId);
        if (confirm('Supprimer ?')) {
          await deleteEntry(entryId);
          await renderProductDetail(id, folderId);
        }
      });
    });

    $('#btn-camera').addEventListener('click', () => { $('#file-camera').click(); });
    $('#file-camera').addEventListener('change', async (e) => {
      await handleFiles(e.target.files, id, folderId);
    });

    $('#btn-gallery').addEventListener('click', () => { $('#file-gallery').click(); });
    $('#file-gallery').addEventListener('change', async (e) => {
      await handleFiles(e.target.files, id, folderId);
    });

    $('#btn-note').addEventListener('click', async () => {
      await showNoteDialog(id, folderId);
    });
  }

  async function handleFiles(files, productId, folderId) {
    for (const file of files) {
      const blob = await resizeImage(file, 1920);
      await saveEntry({
        productId,
        type: 'photo',
        content: blob,
        caption: ''
      });
      const product = await getProduct(productId);
      product.updatedAt = Date.now();
      await saveProduct(product);
    }
    await renderProductDetail(productId, folderId);
  }

  function resizeImage(file, maxSize) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w > maxSize || h > maxSize) {
            if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
            else { w = Math.round(w * maxSize / h); h = maxSize; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          canvas.toBlob(resolve, 'image/jpeg', 0.85);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function showNoteDialog(productId, folderId) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>Nouvelle note</h3>
        <textarea id="note-text" rows="5" placeholder="Param\u00e8tres, observations..."></textarea>
        <div class="form-actions">
          <button class="btn btn-secondary" id="modal-cancel">Annuler</button>
          <button class="btn btn-primary" id="modal-save">Sauver</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    $('#modal-cancel').addEventListener('click', () => overlay.remove());
    $('#modal-save').addEventListener('click', async () => {
      const text = $('#note-text').value.trim();
      if (text) {
        await saveEntry({
          productId,
          type: 'note',
          content: text,
          caption: ''
        });
        const product = await getProduct(productId);
        product.updatedAt = Date.now();
        await saveProduct(product);
      }
      overlay.remove();
      await renderProductDetail(productId, folderId);
    });

    $('#note-text').focus();
  }

  // 6. Photo plein écran
  async function renderPhotoView(productId, entryId, folderId) {
    const entry = await getEntry(entryId);
    if (!entry) return location.hash = `#/folder/${folderId}/product/${productId}`;

    const url = URL.createObjectURL(entry.content);

    app.innerHTML = `
      <div class="photo-view">
        <div class="photo-view-header">
          <button class="btn-back" id="btn-back">&larr;</button>
          <button class="btn-icon btn-danger" id="btn-delete-photo">&times;</button>
        </div>
        <div class="photo-view-body">
          <img src="${url}" alt="" id="photo-full">
        </div>
        <div class="photo-view-footer">
          <input type="text" id="photo-caption" value="${esc(entry.caption || '')}" placeholder="Ajouter une l\u00e9gende...">
        </div>
      </div>
    `;

    let scale = 1, startDist = 0;
    const img = $('#photo-full');

    img.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        startDist = Math.hypot(
          e.touches[0].pageX - e.touches[1].pageX,
          e.touches[0].pageY - e.touches[1].pageY
        );
      }
    });

    img.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].pageX - e.touches[1].pageX,
          e.touches[0].pageY - e.touches[1].pageY
        );
        scale = Math.min(5, Math.max(1, scale * (dist / startDist)));
        img.style.transform = `scale(${scale})`;
        startDist = dist;
      }
    });

    img.addEventListener('touchend', () => {
      if (scale < 1.1) { scale = 1; img.style.transform = ''; }
    });

    $('#btn-back').addEventListener('click', () => {
      location.hash = `#/folder/${folderId}/product/${productId}`;
    });

    $('#btn-delete-photo').addEventListener('click', async () => {
      if (confirm('Supprimer cette photo ?')) {
        await deleteEntry(entryId);
        location.hash = `#/folder/${folderId}/product/${productId}`;
      }
    });

    $('#photo-caption').addEventListener('change', async () => {
      entry.caption = $('#photo-caption').value.trim();
      await saveEntry(entry);
    });
  }

  // --- Helpers ---
  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // --- Init ---
  window.addEventListener('hashchange', router);
  window.addEventListener('load', async () => {
    initTheme();
    $('#theme-toggle').addEventListener('click', toggleTheme);
    await migrateOrphanedProducts();
    router();
  });

  // Register SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
})();
