// db.js — IndexedDB layer for ESSITY Params

const DB_NAME = 'essity-params';
const DB_VERSION = 1;

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const database = e.target.result;

      if (!database.objectStoreNames.contains('products')) {
        const productStore = database.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
        productStore.createIndex('code', 'code', { unique: false });
        productStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      if (!database.objectStoreNames.contains('entries')) {
        const entryStore = database.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
        entryStore.createIndex('productId', 'productId', { unique: false });
        entryStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    request.onerror = (e) => reject(e.target.error);
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
  // Delete all entries for this product first
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
