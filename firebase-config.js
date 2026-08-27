import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDcnCrKU8-2F7fSSXLqREp5OwSIAw6XB44",
  authDomain: "codm-valut.firebaseapp.com",
  projectId: "codm-valut",
  storageBucket: "codm-valut.firebasestorage.app",
  messagingSenderId: "952088577198",
  appId: "1:952088577198:web:c6c05b68e20710f94f993f",
  measurementId: "G-B8QBXNZZZ6"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, analytics, auth, db };
