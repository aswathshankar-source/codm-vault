import { sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { auth } from "./firebase-config.js";

const emailStorageKey = "codm-vault-email-link";
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
    showAuthMessage(`Could not send verification link: ${error.message}`);
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
    showAuthMessage("Email verified successfully. You are signed in.", "success");
    showUsernameStep();
    window.history.replaceState({}, document.title, window.location.pathname);
  } catch (error) {
    console.error("Firebase email link sign-in error:", error);
    showAuthMessage(`Could not complete email verification: ${error.message}`);
  }
}

document.addEventListener("click", event => {
  if (event.target.id !== "verifyEmail") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  showAuthMessage("Open the Firebase email link first. This button cannot verify your email.");
}, true);
document.addEventListener("click", sendEmailLink, true);
completeEmailLinkSignIn().catch(error => {
  console.error("Firebase email link initialization error:", error);
  showAuthMessage(`Firebase email verification error: ${error.message}`);
});
