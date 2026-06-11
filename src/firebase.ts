import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY || "AIzaSyDxfd9hJ0NYN9KNP6UdCTU5VWHGLum-VFE",
  authDomain: (import.meta as any).env.VITE_FIREBASE_AUTH_DOMAIN || "allowance-001.firebaseapp.com",
  projectId: (import.meta as any).env.VITE_FIREBASE_PROJECT_ID || "allowance-001",
  storageBucket: (import.meta as any).env.VITE_FIREBASE_STORAGE_BUCKET || "allowance-001.firebasestorage.app",
  messagingSenderId: (import.meta as any).env.VITE_FIREBASE_MESSAGING_SENDER_ID || "463313212619",
  appId: (import.meta as any).env.VITE_FIREBASE_APP_ID || "1:463313212619:web:29b6ae18f4648e6ae1774e",
  measurementId: (import.meta as any).env.VITE_FIREBASE_MEASUREMENT_ID || "G-1K8Q2V9G2Y"
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
