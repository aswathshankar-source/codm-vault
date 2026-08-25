const mode = document.body && document.body.dataset && document.body.dataset.mode;
if (mode) {
  const DB_NAME = "codm-vault";
  const STORE = "photos";
  let photos = [];
  let objectURLs = [];

  function safeEl(id) {
    return document.getElementById(id) || null;
  }

  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = event => {
    const db = event.target.result;
    if (!db.objectStoreNames.contains(STORE)) {
      db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    }
  };
  request.onerror = event => {
    console.error('IndexedDB open error:', event.target.error);
  };

  request.onsuccess = event => {
    window.vaultDB = event.target.result;
    loadPhotos();
  };

  const savePhoto = photo => {
    if (!window.vaultDB) return;
    try {
      const transaction = vaultDB.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      store.add(photo);
      transaction.oncomplete = loadPhotos;
      transaction.onerror = e => console.error('Transaction error saving photo:', e.target.error);
    } catch (e) {
      console.error('savePhoto error', e);
    }
  };

  function loadPhotos() {
    if (!window.vaultDB) return;
    const transaction = vaultDB.transaction(STORE, "readonly");
    const getAll = transaction.objectStore(STORE).getAll();
    getAll.onsuccess = () => {
      photos = (getAll.result || []).filter(photo => photo.mode === mode);
      renderPhotos();
    };
    getAll.onerror = e => console.error('Error reading photos:', e.target.error);
  }

  function addFiles(files) {
    if (!files) return;
    [...files].filter(file => file && file.type && file.type.startsWith("image/")).forEach(file => {
      savePhoto({ mode, name: file.name, type: file.type, created: Date.now(), blob: file });
    });
  }

  function revokeObjectURLs() {
    objectURLs.forEach(u => {
      try { URL.revokeObjectURL(u); } catch (e) {}
    });
    objectURLs = [];
  }

  function renderPhotos() {
    const gallery = safeEl("gallery");
    const count = safeEl("photoCount");
    const sortEl = safeEl("sortPhotos");
    if (!gallery || !count || !sortEl) return;

    const sort = sortEl.value;
    const sorted = [...photos].sort((a, b) => {
      if (sort === "oldest") return a.created - b.created;
      if (sort === "name") return a.name.localeCompare(b.name);
      return b.created - a.created;
    });

    count.textContent = `${photos.length} ${photos.length === 1 ? "photo" : "photos"}`;

    revokeObjectURLs();

    if (!sorted.length) {
      gallery.innerHTML = `<div class="empty">No screenshots here yet.<br>Upload your first combat memory above.</div>`;
      return;
    }

    gallery.innerHTML = sorted.map(photo => {
      const shortName = photo.name && photo.name.length > 25 ? photo.name.slice(0, 25) + "…" : (photo.name || 'untitled');
      return `
      <article class="photo-card">
        <img data-id="${photo.id}" alt="${(photo.name||'').replace(/"/g,'')}">
        <div class="photo-info">
          <span>${shortName}</span>
          <button class="delete-photo" data-delete="${photo.id}" title="Delete photo">×</button>
        </div>
      </article>
    `;
    }).join("");

    gallery.querySelectorAll("img").forEach((image, idx) => {
      const photo = sorted[idx];
      try {
        const u = URL.createObjectURL(photo.blob);
        objectURLs.push(u);
        image.src = u;
      } catch (e) {
        console.error('Error creating object URL for photo', e);
      }
      image.onclick = () => {
        const lbImg = safeEl('lightboxImage');
        const lb = safeEl('lightbox');
        if (lbImg) lbImg.src = image.src;
        if (lb) lb.classList.add('show');
      };
    });

    gallery.querySelectorAll("[data-delete]").forEach(button => {
      button.onclick = () => {
        if (!confirm("Delete this photo?")) return;
        if (!window.vaultDB) return;
        const transaction = vaultDB.transaction(STORE, "readwrite");
        transaction.objectStore(STORE).delete(Number(button.dataset.delete));
        transaction.oncomplete = loadPhotos;
        transaction.onerror = e => console.error('Delete transaction error', e.target.error);
      };
    });
  }

  // Wire up UI if elements exist
  const photoInput = safeEl('photoInput');
  if (photoInput) photoInput.onchange = event => addFiles(event.target.files);
  const sortPhotos = safeEl('sortPhotos');
  if (sortPhotos) sortPhotos.onchange = renderPhotos;

  const dropZone = safeEl('dropZone');
  if (dropZone) {
    dropZone.onclick = event => {
      if (event.target === dropZone || event.target.closest('.upload-zone')) {
        if (photoInput) photoInput.click();
      }
    };
    ['dragenter', 'dragover'].forEach(eventName => dropZone.addEventListener(eventName, event => {
      event.preventDefault();
      dropZone.classList.add('dragging');
    }));
    ['dragleave', 'drop'].forEach(eventName => dropZone.addEventListener(eventName, event => {
      event.preventDefault();
      dropZone.classList.remove('dragging');
    }));
    dropZone.addEventListener('drop', event => addFiles(event.dataTransfer.files));
  }

  const closeLightbox = safeEl('closeLightbox');
  const lightbox = safeEl('lightbox');
  if (closeLightbox && lightbox) {
    closeLightbox.onclick = () => lightbox.classList.remove('show');
    lightbox.onclick = event => { if (event.target.id === 'lightbox') event.currentTarget.classList.remove('show'); };
  }

  window.addEventListener('beforeunload', revokeObjectURLs);
}