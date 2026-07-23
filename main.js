// main.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { app, BrowserWindow, ipcMain, dialog, Notification, clipboard, nativeImage } = require('electron');
const Database = require('better-sqlite3');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const admin = require('firebase-admin');
const bcrypt = require('bcrypt');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { autoUpdater } = require('electron-updater');

// sharp es un módulo nativo (binario compilado, no JS puro). Si su binario no quedó bien
// instalado/empacado en esta máquina, NO debe tumbar toda la aplicación — solo debe
// deshabilitarse la compresión de imágenes en notas. Por eso se carga de forma diferida
// (la primera vez que realmente se necesita) y con try/catch, en vez de al arrancar.
let sharpModule = null;
function getSharp() {
  if (sharpModule === null) {
    try {
      sharpModule = require('sharp');
    } catch (e) {
      console.error('No se pudo cargar el módulo "sharp" (la compresión de imágenes quedará deshabilitada, se subirán sin comprimir):', e.message);
      sharpModule = false;
    }
  }
  return sharpModule || null;
}

// Cliente de Dropbox para guardar imágenes pegadas en notas. Se crea de forma diferida y solo
// si las credenciales están configuradas en .env; si faltan, la función de pegar imagen falla
// con un mensaje claro en vez de tumbar la app.
let dropboxClient = null;
let dropboxClientAttempted = false;
function getDropboxClient() {
  if (dropboxClientAttempted) return dropboxClient;
  dropboxClientAttempted = true;
  const { DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN } = process.env;
  if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET || !DROPBOX_REFRESH_TOKEN) {
    console.error('Dropbox no está configurado (faltan DROPBOX_APP_KEY / DROPBOX_APP_SECRET / DROPBOX_REFRESH_TOKEN en tu .env). Pegar imágenes en notas no funcionará hasta que lo configures.');
    return null;
  }
  try {
    const { Dropbox } = require('dropbox');
    dropboxClient = new Dropbox({
      clientId: DROPBOX_APP_KEY,
      clientSecret: DROPBOX_APP_SECRET,
      refreshToken: DROPBOX_REFRESH_TOKEN,
      fetch
    });
  } catch (e) {
    console.error('No se pudo inicializar el cliente de Dropbox:', e.message);
    dropboxClient = null;
  }
  return dropboxClient;
}

async function uploadImageToDropbox(localImagePath) {
  const dbx = getDropboxClient();
  if (!dbx) return { success: false, message: 'Dropbox no está configurado en este equipo (revisa el archivo .env).' };
  try {
    const { path: compressedImagePath, isTemp } = await compressImage(localImagePath);
    const fileBuffer = fs.readFileSync(compressedImagePath);
    const dropboxPath = `/notas-imagenes/${uuidv4()}-${path.basename(compressedImagePath)}`;

    await dbx.filesUpload({ path: dropboxPath, contents: fileBuffer, mode: { '.tag': 'add' }, autorename: true });
    if (isTemp) { try { fs.unlinkSync(compressedImagePath); } catch (e) { /* no-op */ } }

    let sharedUrl = null;
    try {
      const linkResult = await dbx.sharingCreateSharedLinkWithSettings({ path: dropboxPath });
      sharedUrl = linkResult.result.url;
    } catch (linkErr) {
      // Si ya existía un link compartido para ese archivo, lo recuperamos en vez de fallar.
      try {
        const existing = await dbx.sharingListSharedLinks({ path: dropboxPath, direct_only: true });
        sharedUrl = existing.result.links[0] ? existing.result.links[0].url : null;
      } catch (e2) { /* no-op */ }
    }
    if (!sharedUrl) return { success: false, message: 'La imagen se subió pero no se pudo generar el link para compartirla.' };

    // Convierte el link de vista previa de Dropbox (www.dropbox.com/.../?dl=0) a uno de
    // contenido directo (dl.dropboxusercontent.com), necesario para usarlo como <img src="...">.
    const directUrl = sharedUrl.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace(/([?&])dl=0/, '$1raw=1');
    return { success: true, url: directUrl };
  } catch (err) {
    console.error('Error al subir la imagen a Dropbox:', err);
    return { success: false, message: err.message || 'Error desconocido al subir a Dropbox.' };
  }
}

// --- Caché local de imágenes vistas en notas (para que consultarlas sea rápido y no dependa
// de la red cada vez). Se guardan en la carpeta de datos de la app, identificadas por un hash
// de su URL, y nunca se vuelven a descargar una vez que ya están en disco.
function getImageCacheDir() {
    const dir = path.join(app.getPath('userData'), 'image-cache');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function cacheFilePathForUrl(url) {
    const hash = crypto.createHash('sha256').update(url).digest('hex');
    let ext = '.img';
    try {
        const pathname = new URL(url).pathname;
        const found = path.extname(pathname);
        if (found) ext = found;
    } catch (e) { /* URL inválida: usamos la extensión genérica */ }
    return path.join(getImageCacheDir(), `${hash}${ext}`);
}

async function ensureImageCached(url) {
    const filePath = cacheFilePathForUrl(url);
    if (fs.existsSync(filePath)) return filePath;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} al descargar la imagen`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    return filePath;
}

let serviceAccount;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8'));
  } else {
    // Para desarrollo local: coloca tu archivo de credenciales de Firebase
    // en la raíz del proyecto con este nombre exacto. Este archivo NUNCA debe subirse a git
    // (ya está en .gitignore).
    serviceAccount = require('./firebase-service-account.json');
  }
} catch (error) {
  console.error("Error al cargar las credenciales de Firebase:", error.message);
  serviceAccount = null;
}

if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
} else {
    console.error("No se pudo inicializar Firebase Admin SDK. Las credenciales son nulas.");
}
const firestoreDb = admin.firestore();
const firebaseStorage = admin.storage();

if (!process.env.GEMINI_API_KEY) {
  console.error('ADVERTENCIA: No se encontró GEMINI_API_KEY en las variables de entorno. El asistente Gemini no funcionará hasta que la configures en tu archivo .env');
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');



let mainWindow;
let db;
// Sesión activa de ESTA ejecución de la app, sin importar si el usuario marcó "recordarme".
// La tabla 'sessions' de SQLite solo guarda algo si rememberMe estaba marcado; sin esto,
// las sincronizaciones no sabían a quién avisarle que los datos cambiaron.
let activeSession = null;
const SALT_ROUNDS = 10;
let chatListenerUnsubscribe = null; // Para detener el listener del chat

function setupAutoUpdater() {
  // No revisar actualizaciones en modo desarrollo (evita errores cuando no hay release publicado)
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;

  function sendStatus(success, message) {
    console.log(`[autoUpdater] ${message}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sync-status', { success, message });
    }
  }

  autoUpdater.on('checking-for-update', () => {
    sendStatus(true, 'Buscando actualizaciones...');
  });

  autoUpdater.on('update-available', (info) => {
    sendStatus(true, `Descargando actualización ${info.version}...`);
  });

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent || 0);
    const mbTransferred = (progress.transferred / (1024 * 1024)).toFixed(1);
    const mbTotal = (progress.total / (1024 * 1024)).toFixed(1);
    sendStatus(true, `Descargando actualización... ${pct}% (${mbTransferred} MB / ${mbTotal} MB)`);
  });

  autoUpdater.on('update-not-available', () => {
    sendStatus(true, `Ya tienes la última versión (${app.getVersion()}).`);
  });

  autoUpdater.on('error', (err) => {
    sendStatus(false, `Error al buscar actualizaciones: ${err.message}`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendStatus(true, `Actualización ${info.version} descargada. Reinicia para instalarla.`);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Actualización lista',
      message: `Se descargó la versión ${info.version}. ¿Reiniciar ahora para instalarla?`,
      buttons: ['Reiniciar ahora', 'Más tarde']
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.checkForUpdates();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
}

function addColumnIfNotExists(tableName, columnName, columnType, defaultValue) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const hasColumn = columns.some(col => col.name === columnName);
  if (!hasColumn) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType} DEFAULT ${defaultValue}`);
    console.log(`Added '${columnName}' column to '${tableName}' table.`);
  }
}

async function deleteOldFirestoreChatMessages() {
    const oneDayAgo = admin.firestore.Timestamp.fromMillis(Date.now() - (24 * 60 * 60 * 1000));
    const chatRef = firestoreDb.collection('chat_messages');
    const oldMessagesSnapshot = await chatRef.where('timestamp', '<', oneDayAgo).get();

    if (oldMessagesSnapshot.empty) {
        console.log('No hay mensajes de chat antiguos para eliminar de Firestore.');
        return;
    }

    const batch = firestoreDb.batch();
    oldMessagesSnapshot.forEach(doc => {
        batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`${oldMessagesSnapshot.size} mensajes de chat antiguos eliminados de Firestore.`);
}


function setupChatListener() {
    if (chatListenerUnsubscribe) {
        chatListenerUnsubscribe(); // Detener listener anterior si existe
    }
    const oneDayAgo = admin.firestore.Timestamp.fromMillis(Date.now() - (24 * 60 * 60 * 1000));
    const chatQuery = firestoreDb.collection('chat_messages')
                                 .where('timestamp', '>=', oneDayAgo)
                                 .orderBy('timestamp', 'asc');

    chatListenerUnsubscribe = chatQuery.onSnapshot(snapshot => {
        const messages = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // El timestamp llega como Firestore Timestamp; lo convertimos a milisegundos
            // (número simple) para que viaje bien por IPC y se use igual que antes en la interfaz.
            const timestamp = data.timestamp && typeof data.timestamp.toMillis === 'function'
                ? data.timestamp.toMillis()
                : Date.now();
            messages.push({ id: doc.id, ...data, timestamp });
        });
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('chat-messages-update', messages);
        }
    }, err => {
        console.error('Error en el listener del chat de Firestore:', err);
    });
}


async function compressImage(inputPath) {
    const sharp = getSharp();
    if (!sharp) {
        // Sin sharp disponible: subimos la imagen original sin comprimir en vez de fallar.
        return { path: inputPath, isTemp: false };
    }
    const tempPath = path.join(app.getPath('temp'), `${uuidv4()}.webp`);
    await sharp(inputPath)
        .resize(800)
        .webp({ quality: 80 })
        .toFile(tempPath);
    return { path: tempPath, isTemp: true };
}

async function uploadImageToFirebase(localImagePath) {
    if (!localImagePath) return null;
    try {
        const { path: compressedImagePath, isTemp } = await compressImage(localImagePath);
        const bucket = firebaseStorage.bucket();
        const ext = (path.extname(compressedImagePath).replace('.', '') || 'webp').toLowerCase();
        const contentType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
        const firebasePath = `notes/images/${path.basename(compressedImagePath)}`;
        await bucket.upload(compressedImagePath, {
            destination: firebasePath,
            metadata: { contentType }
        });
        if (isTemp) fs.unlinkSync(compressedImagePath);
        const file = bucket.file(firebasePath);
        const [url] = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' });
        return url;
    } catch (err) {
        console.error('Error al subir la imagen a Firebase Storage:', err);
        return null;
    }
}

async function deleteImageFromFirebase(url) {
    if (!url) return;
    try {
        const bucket = firebaseStorage.bucket();
        const filePath = url.split("?")[0].split("/o/")[1];
        const file = bucket.file(decodeURIComponent(filePath));
        await file.delete();
    } catch (err) {
        console.error('Error al eliminar la imagen de Firebase Storage:', err);
    }
}

async function downloadAndConcileData() {
    console.log('Descargando y conciliando datos de Firestore...');
    const collections = ['links', 'notes', 'queries', 'users', 'favorites', 'groups'];
    try {
        for (const collectionName of collections) {
            const collectionRef = firestoreDb.collection(collectionName);
            const snapshot = await collectionRef.get();
            if (snapshot.empty) continue;

            db.transaction(() => {
                snapshot.forEach(doc => {
                    try {
                        const remoteData = { id: doc.id, ...doc.data() };
                        delete remoteData.isFavorite;

                        const localItem = db.prepare(`SELECT * FROM ${collectionName} WHERE id = ?`).get(remoteData.id);
                        if (!remoteData.lastModified) remoteData.lastModified = Date.now();

                        if (!localItem) {
                            if (!remoteData.isDeleted) {
                                const columns = Object.keys(remoteData).join(', ');
                                const placeholders = Object.keys(remoteData).map(() => '?').join(', ');
                                db.prepare(`INSERT OR REPLACE INTO ${collectionName} (${columns}) VALUES (${placeholders})`).run(...Object.values(remoteData));
                            }
                        } else if (remoteData.lastModified > localItem.lastModified) {
                            if (remoteData.isDeleted) {
                                db.prepare(`DELETE FROM ${collectionName} WHERE id = ?`).run(remoteData.id);
                            } else {
                                const setStatements = Object.keys(remoteData).map(key => `${key} = ?`).join(', ');
                                db.prepare(`UPDATE ${collectionName} SET ${setStatements} WHERE id = ?`).run(...Object.values(remoteData), remoteData.id);
                            }
                        }
                    } catch (docError) {
                        // No dejamos que UN documento problemático (ej. username duplicado) tumbe
                        // la conciliación de toda la colección. Se reporta y se sigue con los demás.
                        console.error(`No se pudo conciliar el documento "${doc.id}" de "${collectionName}": ${docError.message}`);
                    }
                });
            })();
        }
    } catch (error) {
        console.error('Error en la descarga y conciliación:', error);
    }
}

async function uploadLocalChanges() {
    console.log('Subiendo cambios locales a Firestore...');
    const collections = ['links', 'notes', 'queries', 'users', 'favorites', 'groups'];
    try {
        for (const collectionName of collections) {
            const localItems = db.prepare(`SELECT * FROM ${collectionName}`).all();
            const collectionRef = firestoreDb.collection(collectionName);
            for (const item of localItems) {
                const docRef = collectionRef.doc(item.id || `${item.itemId}-${item.userId}`);
                const firestoreItem = await docRef.get();
                if (!firestoreItem.exists) {
                    await docRef.set(item);
                } else {
                    const remoteData = firestoreItem.data();
                    if (!remoteData.lastModified || item.lastModified > remoteData.lastModified) {
                        await docRef.set(item, { merge: true });
                        if (item.isDeleted && collectionName === 'notes' && item.imagePath) {
                            await deleteImageFromFirebase(item.imagePath);
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error subiendo cambios locales:', error);
    }
}

// En una instalación nueva, intenta primero descargar los usuarios reales desde Firebase.
// Solo si después de eso sigue sin haber NINGÚN usuario (ni local ni remoto) se crea un admin
// de emergencia, con un ID único por instalación (nunca un ID fijo, para no chocar con el
// admin real de otras instalaciones al sincronizar).
async function ensureAdminAccountExists() {
  try {
    await downloadAndConcileData();
  } catch (e) {
    console.error('No se pudo sincronizar antes de verificar el usuario admin:', e.message);
  }

  const userCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE isDeleted = 0').get().c;
  if (userCount > 0) return; // Ya hay usuarios (locales o recién descargados de Firebase). No crear nada.

  const ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
  const ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, SALT_ROUNDS);
  const now = Date.now();
  db.prepare('INSERT INTO users (id, username, password, role, status, lastModified) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), ADMIN_USERNAME, hashedPassword, 'admin', 'approved', now);
  console.log(`No se encontró ningún usuario (ni local ni en Firebase). Se creó un admin de emergencia: "${ADMIN_USERNAME}".`);
  if (!process.env.DEFAULT_ADMIN_PASSWORD) {
    console.log(`Contraseña generada automáticamente (guárdala, no se mostrará de nuevo): ${ADMIN_PASSWORD}`);
  }
}

async function syncDataWithFirebase() {
    console.log('Iniciando sincronización bidireccional...');
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync-status', { success: false, message: 'Sincronizando...' });
    }
    try {
        await downloadAndConcileData();
        await uploadLocalChanges();
        console.log('Sincronización completada.');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sync-status', { success: true, message: 'Datos sincronizados con Firebase.' });
            const session = activeSession || db.prepare('SELECT user_id, role FROM sessions LIMIT 1').get();
            if (session) {
                sendDataToRenderer(session.user_id, session.role);
            }
        }
    } catch (err) {
        console.error('Error fatal durante la sincronización:', err.message);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sync-status', { success: false, message: 'Error al sincronizar. Trabajando localmente.' });
        }
    }
}

function initializeDatabase() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'app_data.db');
  if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });

  try {
    db = new Database(dbPath);
    console.log('Conectado a la base de datos SQLite en:', dbPath);

    // --- Schema Definition ---
    db.exec(`CREATE TABLE IF NOT EXISTS favorites (
        id TEXT PRIMARY KEY,
        itemId TEXT NOT NULL,
        userId TEXT NOT NULL,
        itemType TEXT NOT NULL,
        lastModified INTEGER
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS links (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL,
      createdAt INTEGER NOT NULL, lastModified INTEGER NOT NULL, isDeleted INTEGER DEFAULT 0,
      category TEXT DEFAULT 'General', ownerId TEXT, visibility TEXT DEFAULT 'public'
    )`);
     addColumnIfNotExists('links', 'category', 'TEXT', "'General'");
     addColumnIfNotExists('links', 'ownerId', 'TEXT', 'NULL');
     addColumnIfNotExists('links', 'visibility', 'TEXT', "'public'");
     addColumnIfNotExists('links', 'groups', 'TEXT', "'[]'");

    db.exec(`CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, imagePath TEXT,
      createdAt INTEGER NOT NULL, lastModified INTEGER NOT NULL, isDeleted INTEGER DEFAULT 0,
      category TEXT DEFAULT 'General', ownerId TEXT, visibility TEXT DEFAULT 'public'
    )`);
    addColumnIfNotExists('notes', 'category', 'TEXT', "'General'");
    addColumnIfNotExists('notes', 'ownerId', 'TEXT', 'NULL');
    addColumnIfNotExists('notes', 'visibility', 'TEXT', "'public'");
    addColumnIfNotExists('notes', 'groups', 'TEXT', "'[]'");

    db.exec(`CREATE TABLE IF NOT EXISTS queries (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, queryContent TEXT NOT NULL,
      createdAt INTEGER NOT NULL, lastModified INTEGER NOT NULL, isDeleted INTEGER DEFAULT 0,
      category TEXT DEFAULT 'General', ownerId TEXT, visibility TEXT DEFAULT 'public'
    )`);
    addColumnIfNotExists('queries', 'category', 'TEXT', "'General'");
    addColumnIfNotExists('queries', 'ownerId', 'TEXT', 'NULL');
    addColumnIfNotExists('queries', 'visibility', 'TEXT', "'public'");
    addColumnIfNotExists('queries', 'groups', 'TEXT', "'[]'");

    db.prepare("UPDATE links SET category = 'General' WHERE category IS NULL").run();
    db.prepare("UPDATE notes SET category = 'General' WHERE category IS NULL").run();
    db.prepare("UPDATE queries SET category = 'SICAR 4' WHERE category IS NULL").run();
    db.prepare("UPDATE links SET visibility = 'public' WHERE visibility IS NULL").run();
    db.prepare("UPDATE notes SET visibility = 'public' WHERE visibility IS NULL").run();
    db.prepare("UPDATE queries SET visibility = 'public' WHERE visibility IS NULL").run();
    db.prepare("UPDATE links SET groups = '[]' WHERE groups IS NULL").run();
    db.prepare("UPDATE notes SET groups = '[]' WHERE groups IS NULL").run();
    db.prepare("UPDATE queries SET groups = '[]' WHERE groups IS NULL").run();

    // Grupos: etiquetas compartidas para todo el equipo, muchos-a-muchos con links/notas/queries
    // (cada elemento guarda un arreglo JSON de ids de grupo en su columna 'groups').
    db.exec(`CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      createdAt INTEGER NOT NULL, lastModified INTEGER NOT NULL, isDeleted INTEGER DEFAULT 0
    )`);
    // pinnedItems: arreglo JSON con los ids de los elementos fijados en ese grupo, en orden
    // (el primero del arreglo es el que se muestra más arriba).
    addColumnIfNotExists('groups', 'pinnedItems', 'TEXT', "'[]'");

    db.exec(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL,
      birthDate TEXT, status TEXT DEFAULT 'approved', lastModified INTEGER NOT NULL DEFAULT 0, isDeleted INTEGER DEFAULT 0
    )`);
    addColumnIfNotExists('users', 'birthDate', 'TEXT', 'NULL');
    addColumnIfNotExists('users', 'status', 'TEXT', "'approved'");
    addColumnIfNotExists('users', 'lastModified', 'INTEGER', 0);
    addColumnIfNotExists('users', 'isDeleted', 'INTEGER', 0);
    
    db.exec(`CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, role TEXT NOT NULL
    )`);

    // Agenda / recordatorios: 100% LOCALES, nunca se agregan a 'collections' ni se suben a
    // Firebase. Cada uno pertenece a un usuario (ownerId) para que, si varias personas usan la
    // misma máquina, cada quien vea solo los suyos.
    db.exec(`CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, title TEXT NOT NULL, notes TEXT,
      dueAt INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled',
      repeatType TEXT NOT NULL DEFAULT 'none', repeatIntervalDays INTEGER DEFAULT 1, repeatWeekdays TEXT DEFAULT '[]',
      maxSnoozes INTEGER NOT NULL DEFAULT 3, snoozeCount INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL, isDeleted INTEGER DEFAULT 0
    )`);

  } catch (err) {
    console.error('Error al inicializar la base de datos:', err.message);
  }
}

function getDataForUser(dataType, userId, userRole) {
    let query;
    if (userRole === 'visor') {
        query = `SELECT * FROM ${dataType} WHERE isDeleted = 0 AND visibility = 'public'`;
    } else {
        query = `SELECT * FROM ${dataType} WHERE isDeleted = 0 AND (visibility = 'public' OR ownerId = '${userId}')`;
    }
    const data = db.prepare(query).all();
    const favorites = db.prepare('SELECT itemId FROM favorites WHERE userId = ?').all(userId).map(f => f.itemId);
    return data.map(item => ({
        ...item,
        isFavorite: favorites.includes(item.id)
    }));
}

function getGroupsData() {
    return db.prepare('SELECT * FROM groups WHERE isDeleted = 0 ORDER BY name COLLATE NOCASE').all();
}

function sendGroupsToRenderer() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-groups', getGroupsData());
    }
}

function tableForItemType(itemType) {
    return { link: 'links', note: 'notes', query: 'queries' }[itemType];
}

function getUsersData() {
    return db.prepare('SELECT id, username, role, status FROM users WHERE isDeleted = 0').all();
}

function sendUsersToRenderer() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-users', getUsersData());
    }
}

function sendDataToRenderer(userId, userRole) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-links', getDataForUser('links', userId, userRole));
        mainWindow.webContents.send('update-notes', getDataForUser('notes', userId, userRole));
        mainWindow.webContents.send('update-queries', getDataForUser('queries', userId, userRole));
        sendGroupsToRenderer();
        sendUsersToRenderer();
    }
}

// --- IPC Handlers ---
ipcMain.handle('login', async (event, { username, password, rememberMe }) => {
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND isDeleted = 0').get(username);
    if (user && bcrypt.compareSync(password, user.password)) {
        if (user.status === 'approved') {
            db.prepare('DELETE FROM sessions').run();
            if (rememberMe) {
                db.prepare('INSERT INTO sessions (user_id, role) VALUES (?, ?)').run(user.id, user.role);
            }
            activeSession = { user_id: user.id, role: user.role };
            setupChatListener(); // Iniciar el listener de chat después del login
            return { success: true, role: user.role, userId: user.id, username: user.username };
        }
        return { success: false, message: 'Tu cuenta está pendiente de aprobación.' };
    }
    return { success: false, message: 'Usuario o contraseña incorrectos.' };
});

ipcMain.handle('get-initial-data', (event, { userId, userRole }) => {
    sendDataToRenderer(userId, userRole);
    return { success: true };
});

ipcMain.handle('toggle-favorite', (event, { itemId, userId, itemType }) => {
    const favoriteId = `${itemId}-${userId}`;
    const isFavorite = db.prepare('SELECT * FROM favorites WHERE id = ?').get(favoriteId);
    if (isFavorite) {
        db.prepare('DELETE FROM favorites WHERE id = ?').run(favoriteId);
    } else {
        db.prepare('INSERT INTO favorites (id, itemId, userId, itemType, lastModified) VALUES (?, ?, ?, ?, ?)').run(favoriteId, itemId, userId, itemType, Date.now());
    }
    const session = activeSession || db.prepare('SELECT user_id, role FROM sessions LIMIT 1').get() || { user_id: userId, role: 'agente' }; // Fallback role
    sendDataToRenderer(session.user_id, session.role); 
    syncDataWithFirebase();
    return { success: true };
});

// ==================================================================
// == MODIFICACIÓN: Instrucción explícita para Gemini en modo local ==
// ==================================================================
ipcMain.handle('ask-gemini', async (event, { prompt, mode }) => {
    try {
        let finalPrompt = prompt;
        if (mode === 'local') {
            const links = db.prepare('SELECT name, url FROM links WHERE isDeleted = 0 GROUP BY name, url').all();
            const notes = db.prepare('SELECT title, content FROM notes WHERE isDeleted = 0 GROUP BY title, content').all();
            const queries = db.prepare('SELECT title, queryContent FROM queries WHERE isDeleted = 0 GROUP BY title, queryContent').all();
            
            let context = "Contexto local:\n";
            context += "Enlaces:\n" + links.map(l => `- Nombre: ${l.name}, URL: ${l.url}`).join('\n');
            context += "\n\nNotas:\n" + notes.map(n => `- Título: ${n.title}, Contenido: ${n.content.replace(/<[^>]*>/g, ' ')}`).join('\n');
            context += "\n\nQueries:\n" + queries.map(q => `- Título: ${q.title}, Query: ${q.queryContent}`).join('\n');

            // Instrucción clave para que Gemini formatee la respuesta
            finalPrompt = `Basado en el siguiente contexto local, responde a la pregunta del usuario.
            IMPORTANTE: Si tu respuesta se basa en uno o más elementos del contexto, debes mencionarlos usando el formato exacto @[Tipo: Nombre del elemento].
            Los tipos pueden ser 'Enlace', 'Nota', o 'Query'. El nombre debe ser exacto al que aparece en el contexto.
            Por ejemplo, si recomiendas un enlace llamado "Google", debes escribir en tu respuesta: @[Enlace: Google].
            
            Contexto:
            ${context}
            
            Pregunta del usuario: ${prompt}`;
        }

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        return { success: true, text: response.text() };
    } catch (err) {
        console.error('Error asking Gemini:', err.message);
        return { success: false, message: err.message };
    }
});

ipcMain.handle('add-link', async (event, data) => {
  const now = Date.now();
  db.prepare('INSERT INTO links (id, name, url, createdAt, lastModified, category, ownerId, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(now.toString(), data.name, data.url, now, now, data.category, data.ownerId, data.visibility);
  syncDataWithFirebase();
});
ipcMain.handle('update-link', async (event, data) => {
  const ownerId = data.visibility === 'private' ? data.ownerId : null;
  db.prepare('UPDATE links SET name = ?, url = ?, category = ?, visibility = ?, ownerId = ?, lastModified = ? WHERE id = ?')
    .run(data.name, data.url, data.category, data.visibility, ownerId, Date.now(), data.id);
  syncDataWithFirebase();
});
ipcMain.handle('delete-link', async (event, id) => {
  db.prepare('UPDATE links SET isDeleted = 1, lastModified = ? WHERE id = ?').run(Date.now(), id);
  syncDataWithFirebase();
});

// --- Agenda / Recordatorios (100% local, nunca toca Firebase) ---
function getRemindersData(ownerId) {
    return db.prepare('SELECT * FROM reminders WHERE isDeleted = 0 AND ownerId = ? ORDER BY dueAt ASC').all(ownerId);
}

function sendRemindersToRenderer(ownerId) {
    if (mainWindow && !mainWindow.isDestroyed() && ownerId) {
        mainWindow.webContents.send('update-reminders', getRemindersData(ownerId));
    }
}

function computeNextDueDate(reminder, fromTimestamp) {
    const base = new Date(fromTimestamp);
    if (reminder.repeatType === 'daily') {
        base.setDate(base.getDate() + 1);
        return base.getTime();
    }
    if (reminder.repeatType === 'custom_days') {
        base.setDate(base.getDate() + Math.max(1, reminder.repeatIntervalDays || 1));
        return base.getTime();
    }
    if (reminder.repeatType === 'weekdays') {
        let weekdays = [];
        try { weekdays = JSON.parse(reminder.repeatWeekdays || '[]'); } catch (e) { weekdays = []; }
        if (weekdays.length === 0) { base.setDate(base.getDate() + 7); return base.getTime(); }
        for (let i = 1; i <= 14; i++) {
            const candidate = new Date(fromTimestamp);
            candidate.setDate(candidate.getDate() + i);
            if (weekdays.includes(candidate.getDay())) return candidate.getTime();
        }
        base.setDate(base.getDate() + 7);
        return base.getTime();
    }
    return null; // 'none' → no se repite
}

function checkDueReminders() {
    if (!db) return;
    const now = Date.now();
    let due = [];
    try {
        due = db.prepare("SELECT * FROM reminders WHERE isDeleted = 0 AND status = 'scheduled' AND dueAt <= ?").all(now);
    } catch (e) { return; }
    due.forEach(r => {
        db.prepare("UPDATE reminders SET status = 'firing' WHERE id = ?").run(r.id);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('reminder-due', r);
        }
        try {
            new Notification({ title: `⏰ ${r.title}`, body: r.notes || 'Recordatorio de tu Agenda' }).show();
        } catch (e) { /* Notification puede no estar disponible en algunos entornos */ }
    });
}
let reminderCheckInterval = null;

ipcMain.handle('get-reminders', (event, { ownerId }) => getRemindersData(ownerId));

ipcMain.handle('add-reminder', (event, data) => {
    const id = uuidv4();
    db.prepare(`INSERT INTO reminders (id, ownerId, title, notes, dueAt, status, repeatType, repeatIntervalDays, repeatWeekdays, maxSnoozes, snoozeCount, createdAt)
                VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, 0, ?)`)
      .run(id, data.ownerId, data.title.trim(), data.notes || null, data.dueAt, data.repeatType || 'none', data.repeatIntervalDays || 1, JSON.stringify(data.repeatWeekdays || []), data.maxSnoozes ?? 3, Date.now());
    sendRemindersToRenderer(data.ownerId);
    return { success: true, id };
});

ipcMain.handle('update-reminder', (event, data) => {
    db.prepare(`UPDATE reminders SET title = ?, notes = ?, dueAt = ?, status = 'scheduled', repeatType = ?, repeatIntervalDays = ?, repeatWeekdays = ?, maxSnoozes = ?, snoozeCount = 0
                WHERE id = ? AND ownerId = ?`)
      .run(data.title.trim(), data.notes || null, data.dueAt, data.repeatType || 'none', data.repeatIntervalDays || 1, JSON.stringify(data.repeatWeekdays || []), data.maxSnoozes ?? 3, data.id, data.ownerId);
    sendRemindersToRenderer(data.ownerId);
    return { success: true };
});

ipcMain.handle('delete-reminder', (event, { id, ownerId }) => {
    db.prepare('DELETE FROM reminders WHERE id = ? AND ownerId = ?').run(id, ownerId);
    sendRemindersToRenderer(ownerId);
    return { success: true };
});

ipcMain.handle('snooze-reminder', (event, { id, ownerId }) => {
    const reminder = db.prepare('SELECT * FROM reminders WHERE id = ? AND ownerId = ?').get(id, ownerId);
    if (!reminder) return { success: false };
    if (reminder.snoozeCount >= reminder.maxSnoozes) return { success: false, message: 'Ya no puedes posponer más este recordatorio.' };
    const newDueAt = Date.now() + 10 * 60 * 1000;
    db.prepare("UPDATE reminders SET dueAt = ?, status = 'scheduled', snoozeCount = snoozeCount + 1 WHERE id = ?").run(newDueAt, id);
    sendRemindersToRenderer(ownerId);
    return { success: true };
});

ipcMain.handle('dismiss-reminder', (event, { id, ownerId }) => {
    const reminder = db.prepare('SELECT * FROM reminders WHERE id = ? AND ownerId = ?').get(id, ownerId);
    if (!reminder) return { success: false };
    const nextDueAt = computeNextDueDate(reminder, reminder.dueAt);
    if (nextDueAt) {
        db.prepare("UPDATE reminders SET dueAt = ?, status = 'scheduled', snoozeCount = 0 WHERE id = ?").run(nextDueAt, id);
    } else {
        db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
    }
    sendRemindersToRenderer(ownerId);
    return { success: true };
});

// --- Grupos (etiquetas compartidas, muchos-a-muchos con links/notas/queries) ---
ipcMain.handle('get-groups', () => getGroupsData());



ipcMain.handle('add-group', (event, { name }) => {
  const trimmed = (name || '').trim();
  if (!trimmed) return { success: false, message: 'El nombre del grupo no puede estar vacío.' };
  const now = Date.now();
  db.prepare('INSERT INTO groups (id, name, createdAt, lastModified, isDeleted) VALUES (?, ?, ?, ?, 0)').run(uuidv4(), trimmed, now, now);
  sendGroupsToRenderer();
  syncDataWithFirebase();
  return { success: true };
});

ipcMain.handle('delete-group', (event, { id }) => {
  db.prepare('UPDATE groups SET isDeleted = 1, lastModified = ? WHERE id = ?').run(Date.now(), id);
  sendGroupsToRenderer();
  syncDataWithFirebase();
  return { success: true };
});

ipcMain.handle('add-item-to-group', (event, { groupId, itemId, itemType, userId, userRole }) => {
  const table = tableForItemType(itemType);
  if (!table) return { success: false };
  const item = db.prepare(`SELECT groups FROM ${table} WHERE id = ?`).get(itemId);
  if (!item) return { success: false };
  let groupIds = [];
  try { groupIds = JSON.parse(item.groups || '[]'); } catch (e) { groupIds = []; }
  if (!groupIds.includes(groupId)) groupIds.push(groupId);
  db.prepare(`UPDATE ${table} SET groups = ?, lastModified = ? WHERE id = ?`).run(JSON.stringify(groupIds), Date.now(), itemId);
  sendDataToRenderer(userId, userRole);
  syncDataWithFirebase();
  return { success: true };
});

ipcMain.handle('remove-item-from-group', (event, { groupId, itemId, itemType, userId, userRole }) => {
  const table = tableForItemType(itemType);
  if (!table) return { success: false };
  const item = db.prepare(`SELECT groups FROM ${table} WHERE id = ?`).get(itemId);
  if (!item) return { success: false };
  let groupIds = [];
  try { groupIds = JSON.parse(item.groups || '[]'); } catch (e) { groupIds = []; }
  groupIds = groupIds.filter(g => g !== groupId);
  db.prepare(`UPDATE ${table} SET groups = ?, lastModified = ? WHERE id = ?`).run(JSON.stringify(groupIds), Date.now(), itemId);

  // Si estaba fijado en ese grupo, también lo quitamos de la lista de fijados.
  const group = db.prepare('SELECT pinnedItems FROM groups WHERE id = ?').get(groupId);
  if (group) {
    let pinned = [];
    try { pinned = JSON.parse(group.pinnedItems || '[]'); } catch (e) { pinned = []; }
    if (pinned.includes(itemId)) {
      pinned = pinned.filter(id => id !== itemId);
      db.prepare('UPDATE groups SET pinnedItems = ?, lastModified = ? WHERE id = ?').run(JSON.stringify(pinned), Date.now(), groupId);
    }
  }

  sendDataToRenderer(userId, userRole);
  sendGroupsToRenderer();
  syncDataWithFirebase();
  return { success: true };
});

ipcMain.handle('toggle-pin-in-group', (event, { groupId, itemId, pin }) => {
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
  if (!group) return { success: false };
  let pinned = [];
  try { pinned = JSON.parse(group.pinnedItems || '[]'); } catch (e) { pinned = []; }
  if (pin) {
    if (!pinned.includes(itemId)) pinned.push(itemId);
  } else {
    pinned = pinned.filter(id => id !== itemId);
  }
  db.prepare('UPDATE groups SET pinnedItems = ?, lastModified = ? WHERE id = ?').run(JSON.stringify(pinned), Date.now(), groupId);
  sendGroupsToRenderer();
  syncDataWithFirebase();
  return { success: true };
});

ipcMain.handle('add-note', async (event, data) => {
    const now = Date.now();
    const imagePath = data.localImagePath ? await uploadImageToFirebase(data.localImagePath) : null;
    db.prepare('INSERT INTO notes (id, title, content, imagePath, createdAt, lastModified, category, ownerId, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(now.toString(), data.title, data.content, imagePath, now, now, data.category, data.ownerId, data.visibility);
    syncDataWithFirebase();
});
ipcMain.handle('update-note', async (event, data) => {
    let imagePath = data.imagePath;
    if (data.localImagePath && !data.localImagePath.startsWith('http')) imagePath = await uploadImageToFirebase(data.localImagePath);
    const ownerId = data.visibility === 'private' ? data.ownerId : null;
    db.prepare('UPDATE notes SET title = ?, content = ?, imagePath = ?, category = ?, visibility = ?, ownerId = ?, lastModified = ? WHERE id = ?')
      .run(data.title, data.content, imagePath, data.category, data.visibility, ownerId, Date.now(), data.id);
    syncDataWithFirebase();
});
ipcMain.handle('delete-note', async (event, id) => {
  db.prepare('UPDATE notes SET isDeleted = 1, lastModified = ? WHERE id = ?').run(Date.now(), id);
  syncDataWithFirebase();
});

ipcMain.handle('add-query', async (event, data) => {
  const now = Date.now();
  db.prepare('INSERT INTO queries (id, title, queryContent, createdAt, lastModified, category, ownerId, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(now.toString(), data.title, data.queryContent, now, now, data.category, data.ownerId, data.visibility);
  syncDataWithFirebase();
});
ipcMain.handle('update-query', async (event, data) => {
  const ownerId = data.visibility === 'private' ? data.ownerId : null;
  db.prepare('UPDATE queries SET title = ?, queryContent = ?, category = ?, visibility = ?, ownerId = ?, lastModified = ? WHERE id = ?')
    .run(data.title, data.queryContent, data.category, data.visibility, ownerId, Date.now(), data.id);
  syncDataWithFirebase();
});
ipcMain.handle('delete-query', async (event, id) => {
  db.prepare('UPDATE queries SET isDeleted = 1, lastModified = ? WHERE id = ?').run(Date.now(), id);
  syncDataWithFirebase();
});

ipcMain.handle('request-access', (event, data) => {
    const existingUser = db.prepare('SELECT * FROM users WHERE username = ?').get(data.username);
    if (existingUser) return { success: false, message: 'El nombre de usuario ya existe.' };
    const hashedPassword = bcrypt.hashSync(data.password, SALT_ROUNDS);
    db.prepare('INSERT INTO users (id, username, password, role, birthDate, status, lastModified) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), data.username, hashedPassword, 'agente', data.birthDate, 'pending', Date.now());
    syncDataWithFirebase();
    return { success: true };
});
ipcMain.handle('get-users', () => db.prepare('SELECT id, username, role, status FROM users WHERE isDeleted = 0').all());
ipcMain.handle('add-user', (event, userData) => {
    const hashedPassword = bcrypt.hashSync(userData.password, SALT_ROUNDS);
    db.prepare('INSERT INTO users (id, username, password, role, status, lastModified) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), userData.username, hashedPassword, userData.role, 'approved', Date.now());
    syncDataWithFirebase();
    return { success: true };
});
ipcMain.handle('update-user', (event, userData) => {
    if (userData.password) {
        const hashedPassword = bcrypt.hashSync(userData.password, SALT_ROUNDS);
        db.prepare('UPDATE users SET role = ?, password = ?, lastModified = ? WHERE id = ?').run(userData.role, hashedPassword, Date.now(), userData.id);
    } else {
        db.prepare('UPDATE users SET role = ?, lastModified = ? WHERE id = ?').run(userData.role, Date.now(), userData.id);
    }
    syncDataWithFirebase();
    return { success: true };
});
ipcMain.handle('approve-user', (event, id) => {
    db.prepare("UPDATE users SET status = 'approved', lastModified = ? WHERE id = ?").run(Date.now(), id);
    syncDataWithFirebase();
    return { success: true };
});
ipcMain.handle('decline-user', (event, id) => {
    db.prepare("UPDATE users SET isDeleted = 1, lastModified = ? WHERE id = ?").run(Date.now(), id);
    syncDataWithFirebase();
    return { success: true };
});
ipcMain.handle('delete-user', (event, id) => {
    db.prepare('UPDATE users SET isDeleted = 1, lastModified = ? WHERE id = ?').run(Date.now(), id);
    syncDataWithFirebase();
    return { success: true };
});
ipcMain.handle('reset-password', (event, data) => {
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND birthDate = ? AND isDeleted = 0').get(data.username, data.birthDate);
    if (!user) return { success: false, message: 'Usuario o fecha de nacimiento incorrectos.' };
    const hashedPassword = bcrypt.hashSync(data.newPassword, SALT_ROUNDS);
    db.prepare('UPDATE users SET password = ?, lastModified = ? WHERE id = ?').run(hashedPassword, Date.now(), user.id);
    syncDataWithFirebase();
    return { success: true };
});

ipcMain.handle('get-session', () => {
    const session = db.prepare('SELECT s.user_id, s.role, u.username FROM sessions s JOIN users u ON s.user_id = u.id LIMIT 1').get();
    if (session) {
        activeSession = { user_id: session.user_id, role: session.role };
        setupChatListener(); // Re-iniciar listener si hay sesión guardada
        return { success: true, role: session.role, userId: session.user_id, username: session.username };
    }
    return { success: false };
});
ipcMain.handle('clear-session', () => {
    if (chatListenerUnsubscribe) {
        chatListenerUnsubscribe();
        chatListenerUnsubscribe = null;
    }
    activeSession = null;
    db.prepare('DELETE FROM sessions').run()
});
ipcMain.handle('manual-sync', async () => syncDataWithFirebase());
ipcMain.handle('print-note', () => mainWindow.webContents.print({}));

// --- Configuración local de la app (no se sincroniza con Firebase, es por instalación) ---
const settingsFilePath = path.join(app.getPath('userData'), 'app-settings.json');
const DEFAULT_SETTINGS = {
  defaultSection: 'linksSection', // linksSection | notesSection | queriesSection | globalSection
  searchMode: 'incremental',      // 'exact' | 'incremental'
  darkMode: false,
  openAtLogin: false
};

function readSettings() {
  try {
    const raw = fs.readFileSync(settingsFilePath, 'utf-8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(settings) {
  fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2), 'utf-8');
}

ipcMain.handle('get-settings', () => readSettings());
ipcMain.handle('get-app-version', () => app.getVersion());

// Descarga (una sola vez) y sirve imágenes de notas desde caché local, para que verlas
// después sea instantáneo en vez de tener que bajarlas de Dropbox cada vez.
ipcMain.handle('resolve-image-cache', async (event, { urls }) => {
    const result = {};
    for (const url of (urls || [])) {
        try {
            const localPath = await ensureImageCached(url);
            result[url] = `file://${localPath.replace(/\\/g, '/')}`;
        } catch (e) {
            console.error(`No se pudo cachear la imagen ${url}:`, e.message);
            result[url] = url; // Falla la descarga: se deja la URL original (carga por red)
        }
    }
    return result;
});

ipcMain.handle('copy-image-to-clipboard', async (event, src) => {
    try {
        let buffer;
        if (src.startsWith('file://')) {
            buffer = fs.readFileSync(decodeURIComponent(src.replace('file://', '')));
        } else {
            const response = await fetch(src);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            buffer = Buffer.from(await response.arrayBuffer());
        }
        const image = nativeImage.createFromBuffer(buffer);
        if (image.isEmpty()) return { success: false, message: 'No se pudo leer la imagen.' };
        clipboard.writeImage(image);
        return { success: true };
    } catch (err) {
        console.error('Error al copiar imagen al portapapeles:', err);
        return { success: false, message: err.message };
    }
});

ipcMain.handle('upload-pasted-image', async (event, { dataUrl }) => {
  try {
    const matches = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl || '');
    if (!matches) return { success: false, message: 'Formato de imagen no válido.' };
    const subtype = matches[1].split('/')[1];
    const ext = subtype === 'jpeg' ? 'jpg' : subtype;
    const tempPath = path.join(app.getPath('temp'), `${uuidv4()}.${ext}`);
    fs.writeFileSync(tempPath, Buffer.from(matches[2], 'base64'));
    const result = await uploadImageToDropbox(tempPath);
    try { fs.unlinkSync(tempPath); } catch (e) { /* no-op */ }
    return result;
  } catch (err) {
    console.error('Error al procesar la imagen pegada:', err);
    return { success: false, message: err.message };
  }
});

ipcMain.handle('save-settings', (event, newSettings) => {
  const merged = { ...readSettings(), ...newSettings };
  writeSettings(merged);

  // "Iniciar con Windows" solo tiene soporte nativo en Windows y macOS.
  if (process.platform === 'win32' || process.platform === 'darwin') {
    try {
      app.setLoginItemSettings({ openAtLogin: !!merged.openAtLogin });
    } catch (e) {
      console.error('No se pudo configurar el inicio automático:', e.message);
    }
  }
  return { success: true, settings: merged };
});

// Chat IPC Handlers
ipcMain.handle('send-chat-message-to-firebase', async (event, { userId, username, message }) => {
    try {
        await firestoreDb.collection('chat_messages').add({
            userId,
            username,
            message,
            // Usamos la hora del SERVIDOR de Firebase, no la de la computadora que envía.
            // Así el orden de los mensajes es siempre consistente aunque el reloj de alguna
            // máquina esté desfasado (esto era justo lo que causaba mensajes fuera de orden).
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        return { success: true };
    } catch (err) {
        console.error('Error al enviar mensaje de chat a Firestore:', err);
        return { success: false, message: err.message };
    }
});


app.whenReady().then(async () => {
  initializeDatabase();
  await ensureAdminAccountExists();
  await deleteOldFirestoreChatMessages(); // Clean up old messages on startup
  createWindow();
  setupAutoUpdater();
  reminderCheckInterval = setInterval(checkDueReminders, 20000);
  checkDueReminders();
  if (process.platform === 'win32' || process.platform === 'darwin') {
    try { app.setLoginItemSettings({ openAtLogin: !!readSettings().openAtLogin }); } catch (e) { /* no-op */ }
  }
  mainWindow.webContents.on('did-finish-load', () => {
    // Initial data load is now triggered by login or session check
  });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { 
    if (chatListenerUnsubscribe) {
        chatListenerUnsubscribe();
    }
    if (db) db.close(); 
});
