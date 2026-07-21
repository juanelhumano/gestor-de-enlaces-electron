const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Autenticación y Usuarios
  login: (credentials) => ipcRenderer.invoke('login', credentials),
  requestAccess: (data) => ipcRenderer.invoke('request-access', data),
  resetPassword: (data) => ipcRenderer.invoke('reset-password', data),
  getUsers: () => ipcRenderer.invoke('get-users'),
  addUser: (userData) => ipcRenderer.invoke('add-user', userData),
  updateUser: (userData) => ipcRenderer.invoke('update-user', userData),
  deleteUser: (id) => ipcRenderer.invoke('delete-user', id),
  approveUser: (id) => ipcRenderer.invoke('approve-user', id),
  declineUser: (id) => ipcRenderer.invoke('decline-user', id),
  onUpdateUsers: (callback) => ipcRenderer.on('update-users', (event, users) => callback(users)),

  // Gemini
  askGemini: (data) => ipcRenderer.invoke('ask-gemini', data),
  
  // Datos y Favoritos
  getInitialData: (data) => ipcRenderer.invoke('get-initial-data', data),
  toggleFavorite: (data) => ipcRenderer.invoke('toggle-favorite', data),

  // Notas
  printNote: () => ipcRenderer.invoke('print-note'),
  addNote: (data) => ipcRenderer.invoke('add-note', data),
  updateNote: (data) => ipcRenderer.invoke('update-note', data),
  deleteNote: (id) => ipcRenderer.invoke('delete-note', id),
  onUpdateNotes: (callback) => ipcRenderer.on('update-notes', (event, notes) => callback(notes)),

  // Links
  addLink: (data) => ipcRenderer.invoke('add-link', data),
  updateLink: (data) => ipcRenderer.invoke('update-link', data),
  deleteLink: (id) => ipcRenderer.invoke('delete-link', id),
  onUpdateLinks: (callback) => ipcRenderer.on('update-links', (event, links) => callback(links)),

  // Queries
  addQuery: (data) => ipcRenderer.invoke('add-query', data),
  updateQuery: (data) => ipcRenderer.invoke('update-query', data),
  deleteQuery: (id) => ipcRenderer.invoke('delete-query', id),
  onUpdateQueries: (callback) => ipcRenderer.on('update-queries', (event, queries) => callback(queries)),

  // Grupos
  getGroups: () => ipcRenderer.invoke('get-groups'),
  addGroup: (data) => ipcRenderer.invoke('add-group', data),
  deleteGroup: (id) => ipcRenderer.invoke('delete-group', { id }),
  addItemToGroup: (data) => ipcRenderer.invoke('add-item-to-group', data),
  removeItemFromGroup: (data) => ipcRenderer.invoke('remove-item-from-group', data),
  togglePinInGroup: (data) => ipcRenderer.invoke('toggle-pin-in-group', data),
  onUpdateGroups: (callback) => ipcRenderer.on('update-groups', (event, groups) => callback(groups)),

  // Agenda / Recordatorios (local)
  getReminders: (data) => ipcRenderer.invoke('get-reminders', data),
  addReminder: (data) => ipcRenderer.invoke('add-reminder', data),
  updateReminder: (data) => ipcRenderer.invoke('update-reminder', data),
  deleteReminder: (data) => ipcRenderer.invoke('delete-reminder', data),
  snoozeReminder: (data) => ipcRenderer.invoke('snooze-reminder', data),
  dismissReminder: (data) => ipcRenderer.invoke('dismiss-reminder', data),
  onUpdateReminders: (callback) => ipcRenderer.on('update-reminders', (event, reminders) => callback(reminders)),
  onReminderDue: (callback) => ipcRenderer.on('reminder-due', (event, reminder) => callback(reminder)),
  
  // Gestión de Sesión
  getSession: () => ipcRenderer.invoke('get-session'),
  clearSession: () => ipcRenderer.invoke('clear-session'),

  // Chat
  sendChatMessageToFirebase: (message) => ipcRenderer.invoke('send-chat-message-to-firebase', message),
  onChatMessagesUpdate: (callback) => ipcRenderer.on('chat-messages-update', (event, messages) => callback(messages)),

  // Utilidades
  onSyncStatus: (callback) => ipcRenderer.on('sync-status', (event, status) => callback(status)),
  manualSync: () => ipcRenderer.invoke('manual-sync'),

  // Configuración
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getAppVersion: () => ipcRenderer.invoke('get-app-version')
});
