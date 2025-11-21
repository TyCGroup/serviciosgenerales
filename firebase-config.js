// Import the functions you need from the SDKs you need
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBy_GEuGbqA5usYHbwrAn__73JTXrzWFI4",
  authDomain: "rhserivicosgenerales.firebaseapp.com",
  projectId: "rhserivicosgenerales",
  storageBucket: "rhserivicosgenerales.firebasestorage.app",
  messagingSenderId: "669857108764",
  appId: "1:669857108764:web:bd42ae58c2008e017b60d9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);