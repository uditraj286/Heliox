/**
 * Heliox - Local Storage Module
 * IndexedDB-based chat persistence
 */
const DB_NAME = 'heliox_db';
const DB_VERSION = 1;
const STORE_CHATS = 'chats';

let db = null;

export async function initStorage() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_CHATS)) {
                const store = database.createObjectStore(STORE_CHATS, { keyPath: 'id' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
                store.createIndex('userId', 'userId', { unique: false });
            }
        };
    });
}

export async function saveChat(chat) {
    if (!db) await initStorage();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_CHATS, 'readwrite');
        const store = tx.objectStore(STORE_CHATS);
        const request = store.put({ ...chat, updatedAt: Date.now() });
        request.onsuccess = () => resolve(chat);
        request.onerror = () => reject(request.error);
    });
}

export async function getChat(id) {
    if (!db) await initStorage();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_CHATS, 'readonly');
        const store = tx.objectStore(STORE_CHATS);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function getAllChats(userId) {
    if (!db) await initStorage();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_CHATS, 'readonly');
        const store = tx.objectStore(STORE_CHATS);
        const chats = [];
        const request = store.openCursor();
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                if (!userId || cursor.value.userId === userId) {
                    chats.push(cursor.value);
                }
                cursor.continue();
            } else {
                chats.sort((a, b) => b.timestamp - a.timestamp);
                resolve(chats);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

export async function deleteChat(id) {
    if (!db) await initStorage();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_CHATS, 'readwrite');
        const store = tx.objectStore(STORE_CHATS);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function clearAllChats() {
    if (!db) await initStorage();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_CHATS, 'readwrite');
        const store = tx.objectStore(STORE_CHATS);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export function generateId() {
    return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
