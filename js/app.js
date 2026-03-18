// app.js — ESSITY Params SPA

(function () {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const app = $('#app');

  // --- Theme ---
  function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
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

  // --- Router ---
  function getRoute() {
    const hash = location.hash || '#/';
    return hash;
  }

  async function router() {
    const hash = getRoute();

    if (hash === '#/' || hash === '#' || hash === '') {
      await renderProductList();
    } else if (hash === '#/product/new') {
      await renderProductForm(null);
    } else if (hash.match(/^#\/product\/(\d+)\/edit$/)) {
      const id = parseInt(hash.match(/^#\/product\/(\d+)\/edit$/)[1]);
      await renderProductForm(id);
    } else if (hash.match(/^#\/product\/(\d+)\/photo\/(\d+)$/)) {
      const m = hash.match(/^#\/product\/(\d+)\/photo\/(\d+)$/);
      await renderPhotoView(parseInt(m[1]), parseInt(m[2]));
    } else if (hash.match(/^#\/product\/(\d+)$/)) {
      const id = parseInt(hash.match(/^#\/product\/(\d+)$/)[1]);
      await renderProductDetail(id);
    } else {
      await renderProductList();
    }
  }

  // --- Screens ---

  // 1. Product List
  async function renderProductList() {
    const products = await getAllProducts();
    products.sort((a, b) => b.updatedAt - a.updatedAt);

    // Pre-fetch counts
    const counts = {};
    for (const p of products) {
      counts[p.id] = await countEntriesByProduct(p.id);
    }

    app.innerHTML = `
      <div class="search-bar">
        <input type="text" id="search-input" placeholder="Rechercher un produit..." autocomplete="off">
      </div>
      <div id="product-list" class="product-list">
        ${products.length === 0 ? '<p class="empty-state">Aucun produit. Appuyez sur + pour en cr\u00e9er un.</p>' : ''}
        ${products.map(p => `
          <div class="product-card" data-id="${p.id}" data-name="${p.name.toLowerCase()}" data-code="${p.code.toLowerCase()}">
            <div class="product-card-main">
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
      <a href="#/product/new" class="fab">+</a>
    `;

    // Search
    const searchInput = $('#search-input');
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      $$('.product-card').forEach(card => {
        const name = card.dataset.name;
        const code = card.dataset.code;
        card.style.display = (name.includes(q) || code.includes(q)) ? '' : 'none';
      });
    });

    // Card click
    $$('.product-card').forEach(card => {
      card.addEventListener('click', () => {
        location.hash = `#/product/${card.dataset.id}`;
      });
    });
  }

  // 2. Product Form (new / edit)
  async function renderProductForm(id) {
    let product = { name: '', code: '' };
    if (id) {
      product = await getProduct(id);
      if (!product) return location.hash = '#/';
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

    $('#btn-cancel').addEventListener('click', () => {
      history.back();
    });

    $('#product-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      product.name = $('#pname').value.trim();
      product.code = $('#pcode').value.trim();
      if (!product.name || !product.code) return;

      await saveProduct(product);
      location.hash = '#/';
    });
  }

  // 3. Product Detail (folder)
  async function renderProductDetail(id) {
    const product = await getProduct(id);
    if (!product) return location.hash = '#/';

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

    // Back
    $('#btn-back').addEventListener('click', () => { location.hash = '#/'; });

    // Edit
    $('#btn-edit').addEventListener('click', () => { location.hash = `#/product/${id}/edit`; });

    // Delete product
    $('#btn-delete-product').addEventListener('click', async () => {
      if (confirm('Supprimer ce produit et tout son contenu ?')) {
        await deleteProduct(id);
        location.hash = '#/';
      }
    });

    // Photo click -> fullscreen
    $$('.photo-thumb img').forEach(img => {
      img.addEventListener('click', (e) => {
        const entryId = e.target.closest('.photo-thumb').dataset.id;
        location.hash = `#/product/${id}/photo/${entryId}`;
      });
    });

    // Remove buttons
    $$('.btn-remove').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const entryId = parseInt(btn.dataset.entryId);
        if (confirm('Supprimer ?')) {
          await deleteEntry(entryId);
          await renderProductDetail(id);
        }
      });
    });

    // Camera
    $('#btn-camera').addEventListener('click', () => { $('#file-camera').click(); });
    $('#file-camera').addEventListener('change', async (e) => {
      await handleFiles(e.target.files, id);
    });

    // Gallery
    $('#btn-gallery').addEventListener('click', () => { $('#file-gallery').click(); });
    $('#file-gallery').addEventListener('change', async (e) => {
      await handleFiles(e.target.files, id);
    });

    // Note
    $('#btn-note').addEventListener('click', async () => {
      await showNoteDialog(id);
    });
  }

  async function handleFiles(files, productId) {
    for (const file of files) {
      const blob = await resizeImage(file, 1920);
      await saveEntry({
        productId,
        type: 'photo',
        content: blob,
        caption: ''
      });
      // Update product timestamp
      const product = await getProduct(productId);
      product.updatedAt = Date.now();
      await saveProduct(product);
    }
    await renderProductDetail(productId);
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

  async function showNoteDialog(productId) {
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
      await renderProductDetail(productId);
    });

    $('#note-text').focus();
  }

  // 4. Photo fullscreen view
  async function renderPhotoView(productId, entryId) {
    const entry = await getEntry(entryId);
    if (!entry) return location.hash = `#/product/${productId}`;

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

    // Pinch zoom
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

    // Back
    $('#btn-back').addEventListener('click', () => {
      location.hash = `#/product/${productId}`;
    });

    // Delete
    $('#btn-delete-photo').addEventListener('click', async () => {
      if (confirm('Supprimer cette photo ?')) {
        await deleteEntry(entryId);
        location.hash = `#/product/${productId}`;
      }
    });

    // Caption save on blur
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
  window.addEventListener('load', () => {
    initTheme();
    $('#theme-toggle').addEventListener('click', toggleTheme);
    router();
  });

  // Register SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./js/sw.js');
  }
})();
