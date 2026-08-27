import { sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { auth } from "./firebase-config.js";

const emailStorageKey = "codm-vault-email-link";
const verifiedStorageKey = "codm-vault-firebase-verification";
const continueUrl = "https://codm-vault.vercel.app/";

function showAuthMessage(message, kind = "error") {
  let toast = document.getElementById("siteToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "siteToast";
    document.body.append(toast);
  }
  toast.className = `site-toast ${kind} show`;
  toast.textContent = message;
}

function firebaseErrorMessage(error, action) {
  const messages = {
    "auth/invalid-action-code": "This Firebase email link is invalid or expired.",
    "auth/expired-action-code": "This Firebase email link has expired. Request a new link.",
    "auth/invalid-email": "The email address is invalid.",
    "auth/user-disabled": "This Firebase account has been disabled.",
    "auth/operation-not-allowed": "Firebase Email Link sign-in is not enabled for this project."
  };
  return messages[error.code] || `Could not ${action}: ${error.message}`;
}

function showEmailLinkStep() {
  const signupTab = document.querySelector('.auth-tab[data-auth="signup"]');
  const signupEmail = document.getElementById("signupEmail");
  signupTab?.click();
  if (signupEmail) signupEmail.value = localStorage.getItem(emailStorageKey) || "";
}

function showUsernameStep() {
  document.querySelectorAll("#authGate .auth-step").forEach(step => {
    step.hidden = step.dataset.step !== "username";
  });
  document.getElementById("signupUsername")?.focus();
}

function getLocalUsers() {
  return JSON.parse(localStorage.getItem("codm-vault-users") || "[]");
}

function saveFirebaseIdentity(user) {
  const identity = { uid: user.uid, email: user.email, verified: true };
  localStorage.setItem(verifiedStorageKey, JSON.stringify(identity));
  const users = getLocalUsers();
  const existingIndex = users.findIndex(item => item.email === user.email || item.firebaseUid === user.uid);
  if (existingIndex < 0) return null;
  users[existingIndex] = { ...users[existingIndex], firebaseUid: user.uid, email: user.email, emailVerified: true };
  localStorage.setItem("codm-vault-users", JSON.stringify(users));
  if (users[existingIndex].username && users[existingIndex].password) {
    localStorage.setItem("codm-vault-session", users[existingIndex].id);
  }
  return users[existingIndex];
}

function completeLocalAccount() {
  const verification = JSON.parse(localStorage.getItem(verifiedStorageKey) || "null");
  if (!verification?.uid || !verification.email) return;
  document.addEventListener("click", event => {
    if (event.target.id !== "createAccount") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const gate = document.getElementById("authGate");
    const username = gate?.querySelector("#signupUsername")?.value.trim() || "";
    const password = gate?.querySelector("#signupPassword")?.value || "";
    const confirm = gate?.querySelector("#signupConfirm")?.value || "";
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      showAuthMessage("Use 3-20 letters, numbers, or underscores.");
      return;
    }
    if (getLocalUsers().some(item => item.username.toLowerCase() === username.toLowerCase() && item.firebaseUid !== verification.uid)) {
      showAuthMessage("That username is already taken.");
      return;
    }
    if (password.length < 8 || password !== confirm) {
      showAuthMessage("Passwords must match and be at least 8 characters.");
      return;
    }
    const users = getLocalUsers();
    const existingIndex = users.findIndex(item => item.email === verification.email || item.firebaseUid === verification.uid);
    const account = { id: existingIndex >= 0 ? users[existingIndex].id : `user-${Date.now()}`, email: verification.email, firebaseUid: verification.uid, emailVerified: true, username, password, profileName: username };
    if (existingIndex >= 0) users[existingIndex] = { ...users[existingIndex], ...account };
    else users.push(account);
    localStorage.setItem("codm-vault-users", JSON.stringify(users));
    localStorage.setItem("codm-vault-session", account.id);
    localStorage.removeItem(verifiedStorageKey);
    showAuthMessage("Account created with verified Firebase email.", "success");
    setTimeout(() => window.location.reload(), 500);
  }, true);
}

async function sendEmailLink(event) {
  if (event.target.id !== "sendVerify") return;
  event.preventDefault();
  event.stopImmediatePropagation();

  const emailInput = document.getElementById("signupEmail");
  const email = emailInput?.value.trim().toLowerCase() || "";
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    showAuthMessage("Enter a valid email address.");
    return;
  }

  const actionCodeSettings = { url: continueUrl, handleCodeInApp: true };
  try {
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    localStorage.setItem(emailStorageKey, email);
    showAuthMessage("Verification link sent. Check your email to continue.", "success");
    showEmailLinkStep();
  } catch (error) {
    console.error("Firebase email link error:", error);
    showAuthMessage(firebaseErrorMessage(error, "send the verification link"));
  }
}

async function completeEmailLinkSignIn() {
  if (!isSignInWithEmailLink(auth, window.location.href)) return;

  let email = localStorage.getItem(emailStorageKey);
  if (!email) email = window.prompt("Enter the email address used for this sign-in link:");
  if (!email) {
    showAuthMessage("Your email is required to complete verification.");
    return;
  }

  try {
    await signInWithEmailLink(auth, email.trim().toLowerCase(), window.location.href);
    localStorage.removeItem(emailStorageKey);
    const firebaseUser = auth.currentUser;
    const localUser = saveFirebaseIdentity(firebaseUser);
    if (localUser?.username && localUser?.password) {
      showAuthMessage("Email verified. Existing account signed in.", "success");
      setTimeout(() => window.location.reload(), 500);
    } else {
      showAuthMessage("Email verified. Choose a username and password to finish signup.", "success");
      showUsernameStep();
      completeLocalAccount();
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  } catch (error) {
    console.error("Firebase email link sign-in error:", error);
    showAuthMessage(firebaseErrorMessage(error, "complete email verification"));
  }
}

completeLocalAccount();

document.addEventListener("click", event => {
  if (event.target.id !== "verifyEmail") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  showAuthMessage("Open the Firebase email link first. This button cannot verify your email.");
}, true);
document.addEventListener("click", sendEmailLink, true);
completeEmailLinkSignIn().catch(error => {
  console.error("Firebase email link initialization error:", error);
  showAuthMessage(firebaseErrorMessage(error, "initialize Firebase email verification"));
});
