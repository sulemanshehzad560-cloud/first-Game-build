import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence, signInAnonymously, onAuthStateChanged, connectAuthEmulator } from 'firebase/auth';
import { getDatabase, ref, onValue, set, update, runTransaction, serverTimestamp, get, off, connectDatabaseEmulator } from 'firebase/database';
window.FirebaseLive = { initializeApp, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence, signInAnonymously, onAuthStateChanged,
  connectAuthEmulator, getDatabase, ref, onValue, set, update, runTransaction, serverTimestamp, get, off, connectDatabaseEmulator };
