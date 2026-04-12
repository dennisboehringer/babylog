import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, push, remove, child } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyC8zLGSuKBIswi_bgAHjRajmEDlcTIp6L4",
  authDomain: "feeding-73895.firebaseapp.com",
  databaseURL: "https://feeding-73895-default-rtdb.firebaseio.com",
  projectId: "feeding-73895",
  storageBucket: "feeding-73895.firebasestorage.app",
  messagingSenderId: "673577367564",
  appId: "1:673577367564:web:577cbec073ed3ce5ef5629",
};

const app = initializeApp(firebaseConfig);
export const rtdb = getDatabase(app);

export { ref, onValue, set, push, remove, child };
