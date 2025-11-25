import * as firebaseApp from "firebase/app";
import { getFirestore } from "firebase/firestore/lite";
import { getAuth } from "firebase/auth";

export const firebaseConfig = {
  apiKey: "AIzaSyBYoxdfAV9VwjBiOxHNi1Adu9IP4-ySgGU",
  authDomain: "tester010-1a27e.firebaseapp.com",
  projectId: "tester010-1a27e",
  storageBucket: "tester010-1a27e.firebasestorage.app",
  messagingSenderId: "382540758055",
  appId: "1:382540758055:web:167349ce9df428d8f4a202",
  measurementId: "G-9ZFW3LE63X"
};

// Cast firebaseApp to any to bypass "Module has no exported member" errors 
// which occur due to version mismatches or type definition issues in some environments.
const app = (firebaseApp as any).initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);