import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

// Firebase configuration - matches backend and google-services.json
const firebaseConfig = {
  apiKey: "AIzaSyDqKPNYgIvFOASOyjBB9VkNowtBhp1O06k",
  authDomain: "flacronai-c8dab.firebaseapp.com",
  projectId: "flacronai-c8dab",
  storageBucket: "flacronai-c8dab.firebasestorage.app",
  messagingSenderId: "773892679617",
  appId: "1:773892679617:web:daa3f6b5e3774501957140",
  measurementId: "G-NB7SZYH1KS"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

const appleProvider = new firebase.auth.OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');

export {
  auth,
  db,
  googleProvider,
  appleProvider,
  firebase
};

export default firebase;
