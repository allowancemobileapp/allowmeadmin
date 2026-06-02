import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDxfd9hJ0NYN9KNP6UdCTU5VWHGLum-VFE",
  authDomain: "allowance-001.firebaseapp.com",
  projectId: "allowance-001",
  storageBucket: "allowance-001.firebasestorage.app",
  messagingSenderId: "463313212619",
  appId: "1:463313212619:web:29b6ae18f4648e6ae1774e",
  measurementId: "G-1K8Q2V9G2Y"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function logoutFirebase() {
  await signOut(auth);
}
