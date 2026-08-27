import { sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, Timestamp, updateDoc } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const emailStorageKey = "codm-vault-email-link";
const pendingIdStorageKey = "codm-vault-pending-verification-id";
const pendingCollection = "pendingVerifications";
const pendingLifetimeMs = 15 * 60 * 1000;
const continueUrl = "https://codm-vault.vercel.app/";
let pendingVerification = null;
let pendingListener = null;
let accountDraft = null;

function showAuthMessage(message, kind = "error") {
  let toast = document.getElementById("siteToast");
  if (!toast) { toast = document.createElement("div"); toast.id = "siteToast"; document.body.append(toast); }
  toast.className = `site-toast ${kind} show`;
  toast.textContent = message;
}

function firebaseErrorMessage(error, action) {
  const messages = {
    "auth/invalid-action-code": "This Firebase email link is invalid or expired.",
    "auth/expired-action-code": "This Firebase email link has expired. Request a new link.",
    "auth/invalid-email": "The email address is invalid.",
    "auth/operation-not-allowed": "Firebase Email Link or Anonymous Authentication is not enabled.",
    "permission-denied": "Firestore permission denied for this verification request.",
    "failed-precondition": "Firestore is not ready for this verification request."
  };
  return messages[error.code] || `Could not ${action}: ${error.message}`;
}

function showStep(step) {
  document.querySelectorAll("#authGate .auth-step").forEach(item => { item.hidden = item.dataset.step !== step; });
  document.getElementById(step === "username" ? "signupUsername" : "signupEmail")?.focus();
}

const encode = bytes => btoa(String.fromCharCode(...bytes));
const createSalt = () => { const bytes = new Uint8Array(16); crypto.getRandomValues(bytes); return encode(bytes); };
const hashSecret = async (secret, salt) => encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${secret}`))));

function showPinStep() {
  const gate = document.getElementById("authGate");
  if (!gate) return;
  let step = gate.querySelector('[data-step="pin"]');
  if (!step) {
    step = document.createElement("div");
    step.className = "auth-step";
    step.dataset.step = "pin";
    step.innerHTML = '<p class="eyebrow">OPTIONAL SECURITY</p><h2>Set up a 4-digit login PIN?</h2><p class="modal-note">Use a PIN for quicker login.</p><button class="button primary auth-submit" id="setPinButton" type="button">Set PIN</button><button class="text-button" id="skipPinButton" type="button">Skip</button><p class="form-error" id="pinError"></p>';
    gate.querySelector(".auth-panel").append(step);
    step.querySelector("#setPinButton").onclick = async () => { const pin = prompt("Enter exactly 4 numeric digits."); if (!/^\d{4}$/.test(pin || "")) { showAuthMessage("PIN must contain exactly 4 numeric digits."); return; } const confirmation = prompt("Confirm your 4-digit PIN."); if (pin !== confirmation) { showAuthMessage("PINs do not match."); return; } await finishLocalAccount(pin); };
    step.querySelector("#skipPinButton").onclick = () => finishLocalAccount();
  }
  gate.querySelectorAll(".auth-step").forEach(item => { item.hidden = item !== step; });
}

async function finishLocalAccount(pin) {
  if (!accountDraft || !pendingVerification) return;
  const users = JSON.parse(localStorage.getItem("codm-vault-users") || "[]");
  const passwordSalt = createSalt();
  const account = { ...accountDraft, passwordSalt, passwordHash: await hashSecret(accountDraft.password, passwordSalt) };
  delete account.password;
  if (pin) { account.pinSalt = createSalt(); account.pinHash = await hashSecret(pin, account.pinSalt); }
  const existingIndex = users.findIndex(item => item.email?.trim().toLowerCase() === pendingVerification.email || item.firebaseUid === pendingVerification.firebaseUid);
  if (existingIndex >= 0) users[existingIndex] = { ...users[existingIndex], ...account }; else users.push(account);
  localStorage.setItem("codm-vault-users", JSON.stringify(users));
  localStorage.setItem("codm-vault-session", account.id);
  localStorage.removeItem("codm-vault-email-link"); localStorage.removeItem("codm-vault-pending-verification-id");
  try { await deleteDoc(doc(db, pendingCollection, pendingVerification.id)); } catch (error) { console.error("Verified record cleanup error:", error); }
  accountDraft = null; pendingVerification = null;
  showAuthMessage("Account created with verified Firebase email.", "success");
  setTimeout(() => window.location.reload(), 500);
}

function getVerificationIdFromUrl() {
  return new URL(window.location.href).searchParams.get("verificationId") || "";
}

function createVerificationId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function getLaptopAnonymousUser() {
  if (auth.currentUser?.isAnonymous) return auth.currentUser;
  if (auth.currentUser) throw new Error("A non-anonymous Firebase session is already active on this device.");
  return (await signInAnonymously(auth)).user;
}

function stopPendingListener() {
  if (pendingListener) { pendingListener(); pendingListener = null; }
}

function startPendingListener(verificationId, email) {
  stopPendingListener();
  pendingListener = onSnapshot(doc(db, pendingCollection, verificationId), snapshot => {
    if (!snapshot.exists()) { showAuthMessage("The verification request was not found or has expired."); stopPendingListener(); return; }
    const record = snapshot.data();
    if (record.expiresAt?.toMillis() <= Date.now()) { showAuthMessage("This verification request has expired. Request a new link."); stopPendingListener(); return; }
    if (record.status !== "verified") return;
    if (record.email !== email || !record.firebaseUid) { showAuthMessage("The verified email does not match this signup request."); stopPendingListener(); return; }
    pendingVerification = { id: verificationId, email: record.email, firebaseUid: record.firebaseUid };
    stopPendingListener();
    const existingAccounts = JSON.parse(localStorage.getItem("codm-vault-users") || "[]").filter(item => item.email?.trim().toLowerCase() === email);
    if (existingAccounts.length) {
      document.querySelectorAll("#authGate .auth-step").forEach(step => { step.hidden = step.dataset.step !== "login"; });
      const loginInput = document.getElementById("loginId");
      if (loginInput) loginInput.value = email;
      pendingVerification = null;
      localStorage.removeItem("codm-vault-email-link");
      localStorage.removeItem("codm-vault-pending-verification-id");
      showAuthMessage("An account already exists with this email. Please log in.", "success");
      return;
    }
    showAuthMessage("Email verified. Choose a username and password on this device.", "success");
    showStep("username");
  }, error => { console.error("Firestore verification listener error:", error); showAuthMessage(firebaseErrorMessage(error, "listen for email verification")); stopPendingListener(); });
}

async function sendEmailLink(event) {
  if (event.target.id !== "sendVerify") return;
  event.preventDefault(); event.stopImmediatePropagation();
  const email = document.getElementById("signupEmail")?.value.trim().toLowerCase() || "";
  if (!/^\S+@\S+\.\S+$/.test(email)) { showAuthMessage("Enter a valid email address."); return; }
  let verificationId;
  try {
    const anonymousUser = await getLaptopAnonymousUser();
    verificationId = createVerificationId();
    const expiresAt = Timestamp.fromMillis(Date.now() + pendingLifetimeMs);
    await setDoc(doc(db, pendingCollection, verificationId), { ownerUid: anonymousUser.uid, email, status: "pending", firebaseUid: null, createdAt: serverTimestamp(), expiresAt, verifiedAt: null });
    const actionCodeSettings = { url: `${continueUrl}?verificationId=${encodeURIComponent(verificationId)}`, handleCodeInApp: true };
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    localStorage.setItem(emailStorageKey, email);
    localStorage.setItem(pendingIdStorageKey, verificationId);
    showAuthMessage("Verification link sent. Check your email to continue.", "success");
    startPendingListener(verificationId, email);
  } catch (error) {
    console.error("Firebase email link request error:", error);
    if (verificationId) { try { await deleteDoc(doc(db, pendingCollection, verificationId)); } catch (cleanupError) { console.error("Pending verification cleanup error:", cleanupError); } }
    showAuthMessage(firebaseErrorMessage(error, "send the verification link"));
  }
}

async function completePhoneVerification() {
  if (!isSignInWithEmailLink(auth, window.location.href)) return;
  const verificationId = getVerificationIdFromUrl();
  if (!verificationId) { showAuthMessage("This email link is missing its verification ID."); return; }
  let email = localStorage.getItem(emailStorageKey);
  if (!email) email = window.prompt("Enter the email address used to request this link:");
  email = email?.trim().toLowerCase() || "";
  if (!/^\S+@\S+\.\S+$/.test(email)) { showAuthMessage("Enter the email address used to request this link."); return; }
  try {
    await signInWithEmailLink(auth, email, window.location.href);
    const firebaseUser = auth.currentUser;
    if (!firebaseUser?.uid || !firebaseUser.email || firebaseUser.email !== email) throw new Error("Firebase returned an unexpected verified email.");
    const verificationRef = doc(db, pendingCollection, verificationId);
    await updateDoc(verificationRef, { status: "verified", firebaseUid: firebaseUser.uid, email: firebaseUser.email, verifiedAt: serverTimestamp() });
    showAuthMessage("Email verified. Return to the device where you started signup.", "success");
    window.history.replaceState({}, document.title, window.location.pathname);
  } catch (error) {
    console.error("Firebase cross-device verification error:", error);
    showAuthMessage(firebaseErrorMessage(error, "complete email verification"));
  }
}

function completeLaptopAccount() {
  document.addEventListener("click", async event => {
    if (event.target.id !== "createAccount") return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!pendingVerification) { showAuthMessage("Verify your email from the Firebase link before creating an account."); return; }
    const gate = document.getElementById("authGate");
    const username = gate?.querySelector("#signupUsername")?.value.trim() || "";
    const password = gate?.querySelector("#signupPassword")?.value || "";
    const confirm = gate?.querySelector("#signupConfirm")?.value || "";
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) { showAuthMessage("Use 3-20 letters, numbers, or underscores."); return; }
    if (password.length < 8 || password !== confirm) { showAuthMessage("Passwords must match and be at least 8 characters."); return; }
    const users = JSON.parse(localStorage.getItem("codm-vault-users") || "[]");
    const normalizedEmail = pendingVerification.email.trim().toLowerCase();
    const emailMatches = users.filter(item => item.email?.trim().toLowerCase() === normalizedEmail);
    if (emailMatches.some(item => item.firebaseUid && item.firebaseUid !== pendingVerification.firebaseUid)) { showAuthMessage("An account with this verified email already exists."); return; }
    const normalized = username.toLowerCase();
    if (users.some(item => item.username?.toLowerCase() === normalized && item.firebaseUid !== pendingVerification.firebaseUid)) { showAuthMessage("That username is already taken."); return; }
    const existingIndex = users.findIndex(item => item.email?.trim().toLowerCase() === normalizedEmail || item.firebaseUid === pendingVerification.firebaseUid);
    accountDraft = { id: existingIndex >= 0 ? users[existingIndex].id : `user-${Date.now()}`, email: normalizedEmail, firebaseUid: pendingVerification.firebaseUid, emailVerified: true, username: normalized, password, profileName: username };
    showPinStep();
  }, true);
}

document.addEventListener("click", event => { if (event.target.id === "verifyEmail") { event.preventDefault(); event.stopImmediatePropagation(); showAuthMessage("Open the Firebase email link first. This button cannot verify your email."); } }, true);
document.addEventListener("click", sendEmailLink, true);
completeLaptopAccount();
(async () => {
  try {
    if (isSignInWithEmailLink(auth, window.location.href)) await completePhoneVerification();
    else {
      const verificationId = localStorage.getItem(pendingIdStorageKey), email = localStorage.getItem(emailStorageKey);
      if (!localStorage.getItem("codm-vault-session")) {
        getLaptopAnonymousUser().then(() => { if (verificationId && email) startPendingListener(verificationId, email); }).catch(error => showAuthMessage(firebaseErrorMessage(error, "prepare anonymous signup")));
      }
    }
  } catch (error) { console.error("Firebase verification initialization error:", error); showAuthMessage(firebaseErrorMessage(error, "initialize email verification")); }
})();
