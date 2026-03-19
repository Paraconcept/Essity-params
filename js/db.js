// db.js — IndexedDB layer for ESSITY Params

const DB_NAME = 'essity-params';
const DB_VERSION = 2;

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      const oldVersion = e.oldVersion;

      if (oldVersion < 1) {
        // Fresh install : créer toutes les tables
        const productStore = database.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
        productStore.createIndex('code', 'code', { unique: false });
        productStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        productStore.createIndex('folderId', 'folderId', { unique: false });

        const entryStore = database.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
        entryStore.createIndex('productId', 'productId', { unique: false });
        entryStore.createIndex('createdAt', 'createdAt', { unique: false });

        database.createObjectStore('folders', { keyPath: 'id', autoIncrement: true });
      }

      if (oldVersion === 1) {
        // Migration v1 → v2 : ajouter la table folders et l'index folderId sur products
        database.createObjectStore('folders', { keyPath: 'id', autoIncrement: true });
        const productStore = e.target.transaction.objectStore('products');
        productStore.createIndex('folderId', 'folderId', { unique: false });
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    request.onerror = (e) => reject(e.target.error);
  });
}

// --- Folders ---

async function getAllFolders() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('folders', 'readonly');
    const request = tx.objectStore('folders').getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getFolder(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('folders', 'readonly');
    const request = tx.objectStore('folders').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveFolder(folder) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('folders', 'readwrite');
    const now = Date.now();
    if (!folder.id) {
      folder.createdAt = now;
    }
    folder.updatedAt = now;
    const request = tx.objectStore('folders').put(folder);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteFolder(id) {
  const products = await getProductsByFolder(id);
  for (const p of products) {
    await deleteProduct(p.id);
  }
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('folders', 'readwrite');
    tx.objectStore('folders').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Products ---

async function getAllProducts() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('products', 'readonly');
    const store = tx.objectStore('products');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getProductsByFolder(folderId) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('products', 'readonly');
    const index = tx.objectStore('products').index('folderId');
    const request = index.getAll(folderId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getProduct(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('products', 'readonly');
    const store = tx.objectStore('products');
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveProduct(product) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('products', 'readwrite');
    const store = tx.objectStore('products');
    const now = Date.now();

    if (product.id) {
      product.updatedAt = now;
    } else {
      product.createdAt = now;
      product.updatedAt = now;
    }

    const request = store.put(product);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteProduct(id) {
  const database = await openDB();
  const entries = await getEntriesByProduct(id);
  const tx = database.transaction(['products', 'entries'], 'readwrite');

  for (const entry of entries) {
    tx.objectStore('entries').delete(entry.id);
  }
  tx.objectStore('products').delete(id);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Entries (photos & notes) ---

async function getEntriesByProduct(productId) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('entries', 'readonly');
    const store = tx.objectStore('entries');
    const index = store.index('productId');
    const request = index.getAll(productId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getEntry(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('entries', 'readonly');
    const store = tx.objectStore('entries');
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveEntry(entry) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('entries', 'readwrite');
    const store = tx.objectStore('entries');

    if (!entry.createdAt) {
      entry.createdAt = Date.now();
    }

    const request = store.put(entry);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteEntry(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('entries', 'readwrite');
    const store = tx.objectStore('entries');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function countEntriesByProduct(productId) {
  const entries = await getEntriesByProduct(productId);
  const photos = entries.filter(e => e.type === 'photo').length;
  const notes = entries.filter(e => e.type === 'note').length;
  return { photos, notes };
}

// --- Export / Import ---

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(dataUrl) {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(data);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
}

async function exportAllData() {
  const database = await openDB();
  const folders = await getAllFolders();
  const products = await getAllProducts();

  const entries = await new Promise((resolve, reject) => {
    const tx = database.transaction('entries', 'readonly');
    const request = tx.objectStore('entries').getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const serializedEntries = await Promise.all(entries.map(async (entry) => {
    if (entry.type === 'photo' && entry.content instanceof Blob) {
      return { ...entry, content: await blobToBase64(entry.content), _isBase64: true };
    }
    return entry;
  }));

  return { version: 1, exportedAt: Date.now(), folders, products, entries: serializedEntries };
}

async function clearAllData() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(['folders', 'products', 'entries'], 'readwrite');
    tx.objectStore('folders').clear();
    tx.objectStore('products').clear();
    tx.objectStore('entries').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function importAllData(data) {
  await clearAllData();

  const folderIdMap = {};
  const productIdMap = {};

  for (const folder of (data.folders || [])) {
    const oldId = folder.id;
    const f = { name: folder.name };
    const newId = await saveFolder(f);
    folderIdMap[oldId] = newId;
  }

  for (const product of (data.products || [])) {
    const oldId = product.id;
    const p = { ...product };
    delete p.id;
    if (p.folderId != null) p.folderId = folderIdMap[p.folderId];
    const newId = await saveProduct(p);
    productIdMap[oldId] = newId;
  }

  for (const entry of (data.entries || [])) {
    const e = { ...entry };
    delete e.id;
    e.productId = productIdMap[e.productId];
    if (e._isBase64) {
      e.content = base64ToBlob(e.content);
      delete e._isBase64;
    }
    await saveEntry(e);
  }
}
