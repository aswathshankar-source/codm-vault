(() => {
  const users = () => JSON.parse(localStorage.getItem('codm-vault-users') || '[]');
  const saveUsers = value => localStorage.setItem('codm-vault-users', JSON.stringify(value));
  const sessionUser = () => users().find(user => user.id === localStorage.getItem('codm-vault-session'));
  const toast = (message, kind = 'error') => { let box = document.getElementById('siteToast'); if (!box) { box = document.createElement('div'); box.id = 'siteToast'; document.body.append(box); } box.className = `site-toast ${kind} show`; box.textContent = message; clearTimeout(box.dismiss); box.dismiss = setTimeout(() => box.classList.remove('show'), 4500); };
  const encode = bytes => btoa(String.fromCharCode(...bytes));
  const randomSalt = () => { const bytes = new Uint8Array(16); crypto.getRandomValues(bytes); return encode(bytes); };
  const hash = async (value, salt) => { const data = new TextEncoder().encode(`${salt}:${value}`); return encode(new Uint8Array(await crypto.subtle.digest('SHA-256', data))); };
  const settingsKey = user => `codm-vault-settings-${user.id}`;
  const readSettings = user => JSON.parse(localStorage.getItem(settingsKey(user)) || '{}');
  const applySettings = user => { if (!user) return; const settings = readSettings(user); document.body.classList.toggle('plain-bg', settings.background === 'plain'); if (settings.color) document.body.style.setProperty('--user-bg-color', settings.color); if (settings.icon) document.querySelectorAll('.profile-trigger .avatar').forEach(item => item.textContent = settings.icon); };
  const savePin = async (user, pin) => { const pinSalt = randomSalt(); const updated = { ...user, pinSalt, pinHash: await hash(pin, pinSalt) }; delete updated.pin; const list = users().map(item => item.id === user.id ? updated : item); saveUsers(list); return updated; };
  const showSettings = () => { const user = sessionUser(); if (!user) return; let modal = document.getElementById('settingsModal'); if (!modal) { modal = document.createElement('div'); modal.id = 'settingsModal'; modal.className = 'settings-modal'; modal.innerHTML = `<div class="settings-panel"><button class="settings-close" type="button">x</button><p class="eyebrow">PROFILE SETTINGS</p><h2>Make it yours</h2><label for="settingsName">Profile name</label><input id="settingsName" maxlength="24"><label for="settingsIcon">Profile icon</label><input id="settingsIcon" maxlength="2" placeholder="A"><label for="settingsBackground">Background</label><select id="settingsBackground"><option value="image">Mode image</option><option value="plain">Plain colour</option></select><label for="settingsColor">Plain colour</label><input id="settingsColor" type="color" value="#172021"><div class="pin-settings"><strong>Login PIN</strong><span id="pinStatus"></span><button class="button ghost" id="pinAction" type="button"></button><button class="text-button" id="removePin" type="button">Remove PIN</button></div><button class="button primary" id="saveSettings" type="button">Save changes</button></div>`; document.body.append(modal); modal.querySelector('.settings-close').onclick = () => modal.classList.remove('open'); modal.onclick = event => { if (event.target === modal) modal.classList.remove('open'); }; modal.querySelector('#saveSettings').onclick = () => { const settings = { profileName: modal.querySelector('#settingsName').value.trim() || user.username, icon: modal.querySelector('#settingsIcon').value.trim().slice(0, 2).toUpperCase() || user.username[0].toUpperCase(), background: modal.querySelector('#settingsBackground').value, color: modal.querySelector('#settingsColor').value }; const updated = users().map(item => item.id === user.id ? { ...item, profileName: settings.profileName } : item); saveUsers(updated); localStorage.setItem(settingsKey(user), JSON.stringify(settings)); modal.classList.remove('open'); applySettings({ ...user, profileName: settings.profileName }); document.getElementById('profileLabel').textContent = settings.profileName; toast('Profile settings saved.', 'success'); }; modal.querySelector('#pinAction').onclick = async () => { const pin = prompt(user.pinHash ? 'Enter a new 4-digit PIN.' : 'Enter a 4-digit PIN.'); if (!/^\d{4}$/.test(pin || '')) { toast('PIN must contain exactly 4 numeric digits.'); return; } const confirmPin = prompt('Confirm your 4-digit PIN.'); if (pin !== confirmPin) { toast('PINs do not match.'); return; } await savePin(sessionUser(), pin); toast(user.pinHash ? 'Login PIN changed.' : 'Login PIN added.', 'success'); updatePinControls(modal, sessionUser()); }; modal.querySelector('#removePin').onclick = async () => { if (!user.pinHash || !confirm('Remove your login PIN?')) return; const updated = { ...sessionUser() }; delete updated.pinHash; delete updated.pinSalt; delete updated.pin; saveUsers(users().map(item => item.id === user.id ? updated : item)); toast('Login PIN removed.', 'success'); updatePinControls(modal, updated); }; } const settings = readSettings(user); modal.querySelector('#settingsName').value = settings.profileName || user.profileName || user.username; modal.querySelector('#settingsIcon').value = settings.icon || user.username[0]; modal.querySelector('#settingsBackground').value = settings.background || 'image'; modal.querySelector('#settingsColor').value = settings.color || '#172021'; updatePinControls(modal, user); modal.classList.add('open'); };
  const updatePinControls = (modal, user) => { modal.querySelector('#pinStatus').textContent = user.pinHash ? 'PIN enabled' : 'Add a 4-digit PIN'; modal.querySelector('#pinAction').textContent = user.pinHash ? 'Change PIN' : 'Set PIN'; modal.querySelector('#removePin').hidden = !user.pinHash; };
  const showLogin = (email, message) => { const gate = document.getElementById('authGate'); if (!gate) return; gate.querySelectorAll('.auth-step').forEach(step => { step.hidden = step.dataset.step !== 'login'; }); const input = gate.querySelector('#loginId'); if (input && email) input.value = email; toast(message, 'success'); };
  document.addEventListener('click', async event => { if (event.target.id !== 'loginSubmit') return; event.preventDefault(); event.stopImmediatePropagation(); const now = Date.now(), lock = JSON.parse(localStorage.getItem('codm-vault-login-lock') || '{}'); if (lock.until > now) { toast(`Too many attempts. Try again in ${Math.ceil((lock.until - now) / 1000)} seconds.`); return; } const gate = document.getElementById('authGate'), id = gate.querySelector('#loginId').value.trim().toLowerCase(), password = gate.querySelector('#loginPassword').value, allUsers = users(), emailMatches = allUsers.filter(user => user.email?.trim().toLowerCase() === id), usernameMatches = allUsers.filter(user => user.username?.trim().toLowerCase() === id); if (emailMatches.length > 1) { toast('Multiple accounts are associated with this email. Please contact support.'); return; } const matches = emailMatches.length ? emailMatches : usernameMatches; if (matches.length > 1) { toast('Multiple accounts match this username. Please contact support.'); return; } const found = matches[0]; let valid = false; if (found?.passwordHash && found.passwordSalt) valid = (await hash(password, found.passwordSalt)) === found.passwordHash; else if (found?.password !== undefined) { valid = found.password === password; if (valid) { const migrated = { ...found, passwordSalt: randomSalt() }; migrated.passwordHash = await hash(password, migrated.passwordSalt); delete migrated.password; saveUsers(allUsers.map(user => user.id === found.id ? migrated : user)); } } if (valid) { localStorage.removeItem('codm-vault-login-lock'); localStorage.setItem('codm-vault-session', found.id); location.reload(); return; } const attempts = (lock.attempts || 0) + 1; if (attempts >= 5) { localStorage.setItem('codm-vault-login-lock', JSON.stringify({ attempts: 0, until: now + 30000 })); toast('Five failed attempts. Login is paused for 30 seconds.'); } else { localStorage.setItem('codm-vault-login-lock', JSON.stringify({ attempts, until: 0 })); toast(`${emailMatches.length ? 'Email' : 'Username'} or password is incorrect. Attempt ${attempts} of 5.`); } }, true);
  const setup = () => { applySettings(sessionUser()); const settingsButton = document.getElementById('settingsButton'); if (settingsButton) settingsButton.onclick = showSettings; };
  setup();
})();

(() => {
  const maxImageBytes = 5 * 1024 * 1024;
  const maxImageSide = 512;
  const users = () => JSON.parse(localStorage.getItem('codm-vault-users') || '[]');
  const currentUser = () => users().find(user => user.id === localStorage.getItem('codm-vault-session'));
  const saveUsers = value => localStorage.setItem('codm-vault-users', JSON.stringify(value));
  const notify = (message, kind = 'error') => { let box = document.getElementById('siteToast'); if (!box) { box = document.createElement('div'); box.id = 'siteToast'; document.body.append(box); } box.className = `site-toast ${kind} show`; box.textContent = message; clearTimeout(box.dismiss); box.dismiss = setTimeout(() => box.classList.remove('show'), 4500); };
  const initials = user => (user?.profileName || user?.username || 'V')[0].toUpperCase();

  function updateAvatars(user) {
    if (!user) return;
    document.querySelectorAll('.profile-trigger .avatar, .composer > .avatar').forEach(avatar => {
      avatar.textContent = user.profileImage ? '' : initials(user);
      avatar.style.backgroundImage = user.profileImage ? `url("${user.profileImage}")` : '';
      avatar.classList.toggle('has-profile-image', Boolean(user.profileImage));
    });
    document.querySelectorAll('.post-card .post-meta').forEach(meta => {
      const name = meta.querySelector('strong')?.textContent?.trim().toLowerCase();
      if (name !== user.username?.trim().toLowerCase() && name !== user.profileName?.trim().toLowerCase()) return;
      const avatar = meta.querySelector('.avatar');
      if (!avatar) return;
      avatar.textContent = user.profileImage ? '' : initials(user);
      avatar.style.backgroundImage = user.profileImage ? `url("${user.profileImage}")` : '';
      avatar.classList.toggle('has-profile-image', Boolean(user.profileImage));
    });
  }

  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { reject(new Error('Choose a PNG, JPG, JPEG, or WEBP image.')); return; }
      if (file.size > maxImageBytes) { reject(new Error('Profile image must be 5 MB or smaller.')); return; }
      const image = new Image();
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('The image could not be read.'));
      reader.onload = () => { image.onerror = () => reject(new Error('The image could not be loaded.')); image.src = reader.result; };
      image.onload = () => { const scale = Math.min(1, maxImageSide / Math.max(image.naturalWidth, image.naturalHeight)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale)); const context = canvas.getContext('2d'); if (!context) { reject(new Error('Image processing is unavailable.')); return; } context.drawImage(image, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/jpeg', 0.82)); };
      reader.readAsDataURL(file);
    });
  }

  function addPhotoControls(modal, user) {
    if (modal.querySelector('#profilePhotoInput')) return;
    const panel = modal.querySelector('.settings-panel');
    const saveButton = modal.querySelector('#saveSettings');
    const block = document.createElement('div');
    block.className = 'profile-photo-controls';
    block.innerHTML = '<strong>Profile photo</strong><div class="profile-photo-preview" id="profilePhotoPreview"></div><input id="profilePhotoInput" type="file" accept="image/*" hidden><button class="button ghost" id="chooseProfilePhoto" type="button">Choose photo</button><button class="text-button" id="removeProfilePhoto" type="button">Remove photo</button><p class="photo-help">PNG, JPG, or WEBP · max 5 MB</p><p class="form-error" id="profilePhotoError"></p>';
    panel.insertBefore(block, saveButton);
    const preview = block.querySelector('#profilePhotoPreview');
    let selectedImage = user.profileImage || '';
    const drawPreview = () => { preview.textContent = selectedImage ? '' : initials(user); preview.style.backgroundImage = selectedImage ? `url("${selectedImage}")` : ''; block.querySelector('#removeProfilePhoto').hidden = !selectedImage; };
    drawPreview();
    block.querySelector('#chooseProfilePhoto').onclick = () => block.querySelector('#profilePhotoInput').click();
    block.querySelector('#profilePhotoInput').onchange = async event => { try { selectedImage = await resizeImage(event.target.files[0]); drawPreview(); block.querySelector('#profilePhotoError').textContent = ''; } catch (error) { event.target.value = ''; block.querySelector('#profilePhotoError').textContent = error.message; } };
    block.querySelector('#removeProfilePhoto').onclick = () => { selectedImage = ''; drawPreview(); };
    saveButton.addEventListener('click', () => { const latestUser = currentUser(); if (!latestUser) return; const updated = { ...latestUser, profileImage: selectedImage || '' }; if (!selectedImage) delete updated.profileImage; try { saveUsers(users().map(item => item.id === latestUser.id ? updated : item)); updateAvatars(updated); } catch (error) { notify('Profile photo could not be saved. Browser storage may be full.'); } });
  }

  document.addEventListener('click', event => {
    if (event.target.id === 'editProfile') {
      event.preventDefault();
      event.stopImmediatePropagation();
      document.getElementById('settingsButton')?.click();
    }
    if (event.target.id === 'settingsButton') setTimeout(() => { const user = currentUser(); const modal = document.getElementById('settingsModal'); if (user && modal) addPhotoControls(modal, user); }, 0);
  }, true);
  updateAvatars(currentUser());
})();
