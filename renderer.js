// renderer.js
document.addEventListener('DOMContentLoaded', async () => {
    const electronAPI = window.electronAPI;

    // --- State variables ---
    let currentUserRole = null;
    let currentUserId = null;
    let currentUsername = null;
    let allLinks = [], allNotes = [], allQueries = [], allFavorites = [], allUsers = [];
    let currentAction = null;
    let globalTypeFilters = new Set(['link', 'note', 'query']); 
    let globalCategoryFilters = new Set(['General', 'SICAR 4', 'SICAR X']); 
    let isMuted = false;
    const userColors = new Map();
    let chatMode = 'general'; // 'general' or 'gemini'
    let geminiChatHistory = []; // To store the conversation with Gemini
    let generalChatHistory = []; // To store general chat messages
    let currentQuillInstance = null; // To hold the active Quill editor instance
    let appSettings = { defaultSection: 'linksSection', searchMode: 'incremental', darkMode: false, openAtLogin: false };

    // --- UI Elements ---
    const loginModal = document.getElementById('loginModal'), loginUsername = document.getElementById('loginUsername'), loginPassword = document.getElementById('loginPassword'), loginBtn = document.getElementById('loginBtn'), loginMessage = document.getElementById('loginMessage'), rememberMeCheckbox = document.getElementById('rememberMe'), showRequestAccessBtn = document.getElementById('showRequestAccessBtn'), showForgotPasswordBtn = document.getElementById('showForgotPasswordBtn'), loginRefreshBtn = document.getElementById('loginRefreshBtn');
    const requestAccessModal = document.getElementById('requestAccessModal'), requestUsername = document.getElementById('requestUsername'), requestPassword = document.getElementById('requestPassword'), requestBirthDate = document.getElementById('requestBirthDate'), requestAccessBtn = document.getElementById('requestAccessBtn'), cancelRequestBtn = document.getElementById('cancelRequestBtn');
    const forgotPasswordModal = document.getElementById('forgotPasswordModal'), forgotUsername = document.getElementById('forgotUsername'), forgotBirthDate = document.getElementById('forgotBirthDate'), newPasswordReset = document.getElementById('newPasswordReset'), resetPasswordBtn = document.getElementById('resetPasswordBtn'), cancelResetBtn = document.getElementById('cancelResetBtn');
    const sidebar = document.getElementById('sidebar'), mainContent = document.getElementById('mainContent'), logoutBtn = document.getElementById('logoutBtn');
    const linksBtn = document.getElementById('linksBtn'), notesBtn = document.getElementById('notesBtn'), queriesBtn = document.getElementById('queriesBtn'), globalBtn = document.getElementById('globalBtn'), favoritesBtn = document.getElementById('favoritesBtn'), usersBtn = document.getElementById('usersBtn'), syncBtn = document.getElementById('syncBtn');
    const linksSection = document.getElementById('linksSection'), notesSection = document.getElementById('notesSection'), queriesSection = document.getElementById('queriesSection'), globalSection = document.getElementById('globalSection'), groupsSection = document.getElementById('groupsSection'), agendaSection = document.getElementById('agendaSection'), favoritesSection = document.getElementById('favoritesSection'), usersSection = document.getElementById('usersSection');
    const linksList = document.getElementById('linksList'), notesList = document.getElementById('notesList'), queriesList = document.getElementById('queriesList'), globalList = document.getElementById('globalList'), favoritesList = document.getElementById('favoritesList');
    const searchLinksBar = document.getElementById('searchLinksBar'), searchNotesBar = document.getElementById('searchNotesBar'), searchQueriesBar = document.getElementById('searchQueriesBar'), searchGlobalBar = document.getElementById('searchGlobalBar');
    const openAddLinkModalBtn = document.getElementById('openAddLinkModalBtn'), openAddNoteModalBtn = document.getElementById('openAddNoteModalBtn'), openAddQueryModalBtn = document.getElementById('openAddQueryModalBtn');
    const visibilityFilterLinks = document.getElementById('visibilityFilterLinks'), visibilityFilterNotes = document.getElementById('visibilityFilterNotes'), visibilityFilterQueries = document.getElementById('visibilityFilterQueries');
    const contentArea = document.querySelector('.content-area');
    const syncStatusContainer = document.getElementById('syncStatusContainer');
    const searchUsersBar = document.getElementById('searchUsersBar'), usersList = document.getElementById('usersList'), addUserBtn = document.getElementById('addUserBtn'), newUsername = document.getElementById('newUsername'), newPassword = document.getElementById('newPassword'), newUserRole = document.getElementById('newUserRole');
    const addEditModal = document.getElementById('addEditModal'), addEditModalContent = document.getElementById('addEditModalContent'), closeAddEditModalBtn = document.getElementById('closeAddEditModalBtn'), addEditModalTitle = document.getElementById('addEditModalTitle'), addEditModalBody = document.getElementById('addEditModalBody');
    const viewNoteModal = document.getElementById('viewNoteModal'), closeViewNoteModalBtn = document.getElementById('closeViewNoteModalBtn'), viewNoteTitle = document.getElementById('viewNoteTitle'), viewNoteContent = document.getElementById('viewNoteContent'), viewNoteImage = document.getElementById('viewNoteImage'), printNoteBtn = document.getElementById('printNoteBtn');
    const confirmModal = document.getElementById('confirmModal'), confirmYesBtn = document.getElementById('confirmYesBtn'), confirmNoBtn = document.getElementById('confirmNoBtn'), confirmModalMessage = document.getElementById('confirmModalMessage');
    const globalTypeFilterContainer = document.getElementById('globalTypeFilterContainer');
    const globalCategoryFilterContainer = document.getElementById('globalCategoryFilterContainer');
    const settingsBtn = document.getElementById('settingsBtn'), settingsModal = document.getElementById('settingsModal'), closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn'), saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const settingDefaultSection = document.getElementById('settingDefaultSection'), settingSearchMode = document.getElementById('settingSearchMode'), settingDarkMode = document.getElementById('settingDarkMode'), settingOpenAtLogin = document.getElementById('settingOpenAtLogin');
    const appVersionLabel = document.getElementById('appVersionLabel');
    const currentUserLabel = document.getElementById('currentUserLabel');
    const copyDateModal = document.getElementById('copyDateModal'), copyDateModalBody = document.getElementById('copyDateModalBody');
    const copyDateReplaceBtn = document.getElementById('copyDateReplaceBtn'), copyDateAsIsBtn = document.getElementById('copyDateAsIsBtn'), copyDateCancelBtn = document.getElementById('copyDateCancelBtn');
    const groupsBtn = document.getElementById('groupsBtn'), groupsListView = document.getElementById('groupsListView'), groupDetailView = document.getElementById('groupDetailView');
    const agendaBtn = document.getElementById('agendaBtn');
    const openNewReminderFormBtn = document.getElementById('openNewReminderFormBtn'), reminderFormContainer = document.getElementById('reminderFormContainer');
    const reminderIdInput = document.getElementById('reminderIdInput'), reminderTitleInput = document.getElementById('reminderTitleInput'), reminderNotesInput = document.getElementById('reminderNotesInput'), reminderDueAtInput = document.getElementById('reminderDueAtInput');
    const reminderRepeatTypeSelect = document.getElementById('reminderRepeatTypeSelect'), reminderCustomDaysContainer = document.getElementById('reminderCustomDaysContainer'), reminderIntervalDaysInput = document.getElementById('reminderIntervalDaysInput');
    const reminderWeekdaysContainer = document.getElementById('reminderWeekdaysContainer'), reminderMaxSnoozesInput = document.getElementById('reminderMaxSnoozesInput');
    const saveReminderBtn = document.getElementById('saveReminderBtn'), cancelReminderFormBtn = document.getElementById('cancelReminderFormBtn'), remindersListContainer = document.getElementById('remindersListContainer');
    const reminderAlertModal = document.getElementById('reminderAlertModal'), reminderAlertTitle = document.getElementById('reminderAlertTitle'), reminderAlertNotes = document.getElementById('reminderAlertNotes'), reminderAlertSnoozeBtn = document.getElementById('reminderAlertSnoozeBtn'), reminderAlertDismissBtn = document.getElementById('reminderAlertDismissBtn');
    let allReminders = [];
    let reminderAlertQueue = [];
    let currentAlertingReminderId = null;
    const groupsListContainer = document.getElementById('groupsListContainer'), openNewGroupFormBtn = document.getElementById('openNewGroupFormBtn'), newGroupFormContainer = document.getElementById('newGroupFormContainer'), newGroupNameInput = document.getElementById('newGroupNameInput'), confirmNewGroupBtn = document.getElementById('confirmNewGroupBtn');
    const groupsBackBtn = document.getElementById('groupsBackBtn'), groupDetailTitle = document.getElementById('groupDetailTitle'), groupSearchInput = document.getElementById('groupSearchInput'), groupSearchSuggestions = document.getElementById('groupSearchSuggestions'), groupDetailItemsList = document.getElementById('groupDetailItemsList');
    let allGroups = [];
    let currentOpenGroupId = null;
    
    // Chat UI Elements
    const chatToggleButton = document.getElementById('chatToggleButton'), chatNotification = document.getElementById('chatNotification'), chatWindow = document.getElementById('chatWindow'), closeChatBtn = document.getElementById('closeChatBtn'), chatMessages = document.getElementById('chatMessages'), chatInput = document.getElementById('chatInput'), sendChatBtn = document.getElementById('sendChatBtn'), emojiBtn = document.getElementById('emojiBtn'), mentionSuggestions = document.getElementById('mentionSuggestions'), muteChatBtn = document.getElementById('muteChatBtn');
    const newMessagesIndicator = document.getElementById('newMessagesIndicator');
    let lastRenderedMessageCount = 0;
    const chatModeGeneralBtn = document.getElementById('chatModeGeneralBtn'), chatModeGeminiBtn = document.getElementById('chatModeGeminiBtn'), geminiOptionsContainer = document.getElementById('geminiOptionsContainer');
    
    // Emoji Picker Elements from Library
    const emojiPickerContainer = document.getElementById('emojiPickerContainer');
    const emojiPicker = document.querySelector('emoji-picker');


    // --- Helper & UI Functions ---
    function escapeAttr(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function showMessage(message, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `p-2 rounded-lg text-center ${isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'} text-sm fixed top-4 left-1/2 -translate-x-1/2 z-[1001] shadow-lg`;
        messageDiv.textContent = message;
        document.body.appendChild(messageDiv);
        setTimeout(() => messageDiv.remove(), 4000);
    }

    function showSection(sectionId) {
        [linksSection, notesSection, queriesSection, globalSection, groupsSection, agendaSection, favoritesSection, usersSection].forEach(s => s.classList.add('hidden'));
        document.getElementById(sectionId).classList.remove('hidden');
        [linksBtn, notesBtn, queriesBtn, globalBtn, groupsBtn, agendaBtn, favoritesBtn, usersBtn].forEach(b => b.classList.remove('bg-blue-600'));
        
        if (sectionId === 'linksSection') linksBtn.classList.add('bg-blue-600');
        else if (sectionId === 'notesSection') notesBtn.classList.add('bg-blue-600');
        else if (sectionId === 'queriesSection') queriesBtn.classList.add('bg-blue-600');
        else if (sectionId === 'globalSection') {
            globalBtn.classList.add('bg-blue-600');
            filterGlobal();
        } else if (sectionId === 'groupsSection') {
            groupsBtn.classList.add('bg-blue-600');
            currentOpenGroupId = null;
            groupDetailView.classList.add('hidden');
            groupsListView.classList.remove('hidden');
            renderGroupsList();
        } else if (sectionId === 'agendaSection') {
            agendaBtn.classList.add('bg-blue-600');
            reminderFormContainer.classList.add('hidden');
            renderRemindersList();
        } else if (sectionId === 'favoritesSection') {
            favoritesBtn.classList.add('bg-blue-600');
            displayFavorites();
        } else if (sectionId === 'usersSection') {
            usersBtn.classList.add('bg-blue-600');
            refreshUsersList();
        }
    }

    function checkPermissions() {
        const canAdd = ['agente', 'gestor', 'admin'].includes(currentUserRole);
        openAddLinkModalBtn.classList.toggle('hidden', !canAdd);
        openAddNoteModalBtn.classList.toggle('hidden', !canAdd);
        openAddQueryModalBtn.classList.toggle('hidden', !canAdd);

        const isAdmin = currentUserRole === 'admin';
        document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin));
        usersBtn.classList.toggle('hidden', !isAdmin);
        
        const isVisor = currentUserRole === 'visor';
        [visibilityFilterLinks, visibilityFilterNotes, visibilityFilterQueries].forEach(filter => {
            if (filter) filter.classList.toggle('hidden', isVisor);
        });
    }
    
    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            showMessage("Copiado al portapapeles.");
        } catch (err) {
            console.error('Error al copiar: ', err);
            showMessage("Error al copiar.", true);
        }
    }

    // --- Caché local de imágenes: la primera vez se descargan, luego se ven al instante ---
    async function cacheAndSwapNoteImages(container) {
        const imgs = Array.from(container.querySelectorAll('img[src^="http"]'));
        if (imgs.length === 0) return;
        const urls = Array.from(new Set(imgs.map(img => img.getAttribute('src'))));
        try {
            const map = await electronAPI.resolveImageCache(urls);
            imgs.forEach(img => {
                const original = img.getAttribute('src');
                if (map[original]) img.src = map[original];
            });
        } catch (e) {
            // Si falla el caché, las imágenes se quedan cargando de la red tal cual (sin romper nada).
            console.error('No se pudo cachear alguna imagen:', e);
        }
    }

    // --- Pegar imágenes (Ctrl+V) directo en el editor de notas, se suben a Dropbox ---
    async function handleQuillImagePaste(e, quill) {
        const clipboardData = e.clipboardData || window.clipboardData;
        if (!clipboardData) return;
        let imageFile = null;
        for (let i = 0; i < clipboardData.items.length; i++) {
            if (clipboardData.items[i].type && clipboardData.items[i].type.indexOf('image') !== -1) {
                imageFile = clipboardData.items[i].getAsFile();
                break;
            }
        }
        if (!imageFile) return; // No es una imagen: deja que Quill maneje el pegado normal (texto).
        e.preventDefault();
        e.stopPropagation();

        const range = quill.getSelection(true) || { index: quill.getLength() };
        showMessage('Subiendo imagen...');

        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const result = await electronAPI.uploadPastedImage(reader.result);
                if (result && result.success) {
                    quill.insertEmbed(range.index, 'image', result.url, 'user');
                    quill.setSelection(range.index + 1);
                    showMessage('Imagen agregada.');
                } else {
                    showMessage((result && result.message) || 'No se pudo subir la imagen.', true);
                }
            } catch (err) {
                showMessage('Error al subir la imagen.', true);
            }
        };
        reader.readAsDataURL(imageFile);
    }

    // --- Detección de fechas en Queries (para el modal de copiar con fecha) ---
    function todayStr() {
        return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    }

    // Revisa una query y decide si necesita fecha(s) antes de copiarla.
    // Prioridad: 1) marcadores {FECHA_INICIO}/{FECHA_FIN} o {FECHA}. 2) fechas ya escritas en el texto (YYYY-MM-DD).
    // Devuelve null si no hay nada que reemplazar (se copia tal cual, sin modal).
    function detectDateFields(text) {
        if (!text) return null;
        if (text.includes('{FECHA_INICIO}') && text.includes('{FECHA_FIN}')) {
            return { mode: 'range', kind: 'marker' };
        }
        if (text.includes('{FECHA}')) {
            return { mode: 'single', kind: 'marker' };
        }
        const found = [...new Set(text.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [])];
        if (found.length >= 2) {
            return { mode: 'range', kind: 'auto', original: [found[0], found[1]] };
        }
        if (found.length === 1) {
            return { mode: 'single', kind: 'auto', original: found[0] };
        }
        return null;
    }

    // Aplica las fechas elegidas por el usuario sobre el texto original de la query.
    function buildQueryWithDates(text, detection, values) {
        if (!detection) return text;
        if (detection.kind === 'marker') {
            if (detection.mode === 'range') {
                return text.split('{FECHA_INICIO}').join(values.start).split('{FECHA_FIN}').join(values.end);
            }
            return text.split('{FECHA}').join(values.date);
        }
        // Detección automática: reemplaza cada aparición de la fecha original encontrada.
        if (detection.mode === 'range') {
            return text.split(detection.original[0]).join(values.start).split(detection.original[1]).join(values.end);
        }
        return text.split(detection.original).join(values.date);
    }

    let pendingCopyText = null;
    let pendingCopyDetection = null;

    function openCopyDateModal(text, detection) {
        pendingCopyText = text;
        pendingCopyDetection = detection;
        if (detection.mode === 'range') {
            const startVal = detection.kind === 'auto' ? detection.original[0] : todayStr();
            const endVal = detection.kind === 'auto' ? detection.original[1] : todayStr();
            copyDateModalBody.innerHTML = `
                <label class="block text-sm font-medium text-gray-700 mb-1">Desde</label>
                <input type="date" id="copyDateStart" class="w-full p-2 border rounded-lg mb-3 text-sm" value="${startVal}">
                <label class="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
                <input type="date" id="copyDateEnd" class="w-full p-2 border rounded-lg text-sm" value="${endVal}">
            `;
        } else {
            const val = detection.kind === 'auto' ? detection.original : todayStr();
            copyDateModalBody.innerHTML = `
                <label class="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                <input type="date" id="copyDateSingle" class="w-full p-2 border rounded-lg text-sm" value="${val}">
            `;
        }
        openModal(copyDateModal);
    }

    copyDateReplaceBtn.addEventListener('click', () => {
        if (!pendingCopyDetection) return;
        let values;
        if (pendingCopyDetection.mode === 'range') {
            const start = document.getElementById('copyDateStart').value;
            const end = document.getElementById('copyDateEnd').value;
            if (!start || !end) { showMessage('Selecciona ambas fechas.', true); return; }
            values = { start, end };
        } else {
            const date = document.getElementById('copyDateSingle').value;
            if (!date) { showMessage('Selecciona una fecha.', true); return; }
            values = { date };
        }
        copyToClipboard(buildQueryWithDates(pendingCopyText, pendingCopyDetection, values));
        closeModal(copyDateModal);
    });
    copyDateAsIsBtn.addEventListener('click', () => {
        if (pendingCopyText != null) copyToClipboard(pendingCopyText);
        closeModal(copyDateModal);
    });
    copyDateCancelBtn.addEventListener('click', () => closeModal(copyDateModal));

    // --- Modals ---
    function openModal(modal) { modal.classList.remove('hidden'); }
    function closeModal(modal) { 
        modal.classList.add('hidden');
        if (modal === addEditModal) {
            currentQuillInstance = null;
            addEditModalContent.classList.remove('note-editor-modal');
            addEditModalBody.classList.remove('note-editor-body');
        }
    }
    showRequestAccessBtn.addEventListener('click', () => { closeModal(loginModal); openModal(requestAccessModal); });
    cancelRequestBtn.addEventListener('click', () => { closeModal(requestAccessModal); openModal(loginModal); });
    showForgotPasswordBtn.addEventListener('click', () => { closeModal(loginModal); openModal(forgotPasswordModal); });
    cancelResetBtn.addEventListener('click', () => { closeModal(forgotPasswordModal); openModal(loginModal); });
    closeAddEditModalBtn.addEventListener('click', () => closeModal(addEditModal));
    closeViewNoteModalBtn.addEventListener('click', () => closeModal(viewNoteModal));

    function openConfirmModal(action, message) {
        confirmModalMessage.textContent = message;
        currentAction = action;
        openModal(confirmModal);
    }
    confirmYesBtn.addEventListener('click', () => {
        if (currentAction) currentAction();
        closeModal(confirmModal);
    });
    confirmNoBtn.addEventListener('click', () => closeModal(confirmModal));

    // --- Configuración de la app ---
    function applyDarkMode(enabled) {
        document.body.classList.toggle('dark-mode', !!enabled);
    }

    async function loadSettings() {
        try {
            appSettings = await electronAPI.getSettings();
        } catch (e) {
            console.error('No se pudieron cargar las preferencias, se usan los valores por defecto.', e);
        }
        applyDarkMode(appSettings.darkMode);
        try {
            const version = await electronAPI.getAppVersion();
            appVersionLabel.textContent = `v${version}`;
        } catch (e) { /* no-op */ }
    }

    function openSettingsModal() {
        settingDefaultSection.value = appSettings.defaultSection;
        settingSearchMode.value = appSettings.searchMode;
        settingDarkMode.checked = !!appSettings.darkMode;
        settingOpenAtLogin.checked = !!appSettings.openAtLogin;
        openModal(settingsModal);
    }
    settingsBtn.addEventListener('click', openSettingsModal);
    closeSettingsModalBtn.addEventListener('click', () => closeModal(settingsModal));

    saveSettingsBtn.addEventListener('click', async () => {
        const newSettings = {
            defaultSection: settingDefaultSection.value,
            searchMode: settingSearchMode.value,
            darkMode: settingDarkMode.checked,
            openAtLogin: settingOpenAtLogin.checked
        };
        try {
            const result = await electronAPI.saveSettings(newSettings);
            appSettings = result.settings;
            applyDarkMode(appSettings.darkMode);
            // Re-aplica la búsqueda actual con el nuevo modo, y re-renderiza listas
            filterLinks(); filterNotes(); filterQueries(); filterGlobal();
            showMessage('Configuración guardada.');
            closeModal(settingsModal);
        } catch (e) {
            showMessage(`Error al guardar la configuración: ${e.message}`, true);
        }
    });

    // --- Authentication & Session ---
    function updateCurrentUserLabel() {
        if (!currentUsername) { currentUserLabel.textContent = ''; return; }
        const roleLabel = { admin: 'Admin', agente: 'Agente', visor: 'Visor' }[currentUserRole] || currentUserRole || '';
        currentUserLabel.textContent = `${currentUsername}${roleLabel ? ' · ' + roleLabel : ''}`;
    }

    async function handleLogin() {
        const result = await electronAPI.login({ 
            username: loginUsername.value, 
            password: loginPassword.value,
            rememberMe: rememberMeCheckbox.checked 
        });
        if (result.success) {
            currentUserRole = result.role;
            currentUserId = result.userId;
            currentUsername = result.username;
            updateCurrentUserLabel();
            closeModal(loginModal);
            sidebar.classList.remove('hidden');
            mainContent.classList.remove('hidden');
            chatToggleButton.classList.remove('hidden');
            checkPermissions();
            await loadInitialData();
            electronAPI.manualSync();
            showSection(appSettings.defaultSection || 'linksSection');
        } else {
            loginMessage.textContent = result.message;
            loginMessage.classList.remove('hidden');
        }
    }
    loginBtn.addEventListener('click', handleLogin);
    loginPassword.addEventListener('keydown', e => e.key === 'Enter' && handleLogin());
    logoutBtn.addEventListener('click', async () => { await electronAPI.clearSession(); location.reload(); });
    
    loginRefreshBtn.addEventListener('click', async () => {
        const icon = loginRefreshBtn.querySelector('i');
        icon.classList.add('fa-spin');
        await electronAPI.manualSync();
        showMessage("Datos de usuario actualizados.");
        icon.classList.remove('fa-spin');
    });

    requestAccessBtn.addEventListener('click', async () => {
        try {
            const result = await electronAPI.requestAccess({ username: requestUsername.value, password: requestPassword.value, birthDate: requestBirthDate.value });
            if (result.success) {
                showMessage("Solicitud enviada. Un administrador la revisará.");
                closeModal(requestAccessModal);
                openModal(loginModal);
            } else { 
                showMessage(result.message, true); 
            }
        } catch (error) {
            showMessage(`Error al enviar la solicitud: ${error.message}`, true);
        }
    });

    resetPasswordBtn.addEventListener('click', async () => {
        const result = await electronAPI.resetPassword({ username: forgotUsername.value, birthDate: forgotBirthDate.value, newPassword: newPasswordReset.value });
        if (result.success) {
            showMessage("Contraseña restablecida exitosamente.");
            closeModal(forgotPasswordModal);
            openModal(loginModal);
        } else { showMessage(result.message, true); }
    });

    async function checkSavedSession() {
        const session = await electronAPI.getSession();
        if (session.success) {
            currentUserRole = session.role;
            currentUserId = session.userId;
            currentUsername = session.username;
            updateCurrentUserLabel();
            closeModal(loginModal);
            sidebar.classList.remove('hidden');
            mainContent.classList.remove('hidden');
            chatToggleButton.classList.remove('hidden');
            checkPermissions();
            await loadInitialData();
            electronAPI.manualSync();
            showSection(appSettings.defaultSection || 'linksSection');
        } else {
            openModal(loginModal);
        }
    }
    
    // --- User Management ---
    async function refreshUsersList() {
        if (currentUserRole !== 'admin') return;
        allUsers = await electronAPI.getUsers();
        renderUsers();
    }
    
    function renderUsers() {
        const term = normalizeText(searchUsersBar.value);
        const filteredUsers = allUsers.filter(u => !term || normalizeText(u.username).includes(term));

        usersList.innerHTML = filteredUsers.map(user => {
            const isPending = user.status === 'pending';
            return `
            <div class="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm ${isPending ? 'border-l-4 border-yellow-500' : ''}">
                <div>
                    <p class="font-medium text-gray-900">${user.username}</p>
                    <span class="text-xs text-gray-500">${user.role} ${isPending ? '(Pendiente)' : ''}</span>
                </div>
                <div class="flex items-center space-x-2">
                    ${isPending ? `
                        <button class="approve-user-btn p-1 bg-green-500 text-white rounded-full hover:bg-green-600" data-id="${user.id}" title="Aprobar"><i class="fas fa-check"></i></button>
                        <button class="decline-user-btn p-1 bg-gray-500 text-white rounded-full hover:bg-gray-600" data-id="${user.id}" title="Rechazar"><i class="fas fa-times"></i></button>
                    ` : `
                        <button class="edit-user-btn p-1 bg-yellow-500 text-white rounded-full hover:bg-yellow-600" data-id="${user.id}" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="delete-user-btn p-1 bg-red-500 text-white rounded-full hover:bg-red-600" data-id="${user.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
                    `}
                </div>
            </div>`;
        }).join('');
    }

    searchUsersBar.addEventListener('input', renderUsers);

    usersList.addEventListener('click', e => {
        const button = e.target.closest('button');
        if (!button) return;
        const id = button.dataset.id;
        if (button.classList.contains('approve-user-btn')) openConfirmModal(() => handleApproveUser(id), '¿Aprobar este usuario?');
        else if (button.classList.contains('decline-user-btn')) openConfirmModal(() => handleDeclineUser(id), '¿Rechazar y eliminar esta solicitud?');
        else if (button.classList.contains('edit-user-btn')) openEditUserModal(id);
        else if (button.classList.contains('delete-user-btn')) openConfirmModal(() => handleDeleteUser(id), '¿Eliminar este usuario permanentemente?');
    });

    addUserBtn.addEventListener('click', async () => {
        if (currentUserRole !== 'admin') return;
        const username = newUsername.value.trim();
        const password = newPassword.value;
        const role = newUserRole.value;

        if (!username || !password) {
            return showMessage("Usuario y contraseña son requeridos.", true);
        }

        try {
            await electronAPI.addUser({ username, password, role });
            showMessage(`Usuario '${username}' agregado.`);
            newUsername.value = '';
            newPassword.value = '';
            refreshUsersList();
        } catch (err) {
            showMessage(`Error al agregar usuario: ${err.message}`, true);
        }
    });

    async function handleApproveUser(id) { await electronAPI.approveUser(id); refreshUsersList(); }
    async function handleDeclineUser(id) { await electronAPI.declineUser(id); refreshUsersList(); }
    async function handleDeleteUser(id) { await electronAPI.deleteUser(id); refreshUsersList(); }
    
    function openEditUserModal(id) {
        const user = allUsers.find(u => u.id === id);
        addEditModalTitle.textContent = 'Editar Usuario';
        addEditModalBody.innerHTML = `
            <input type="hidden" id="modalUserId" value="${user.id}">
            <p class="text-lg font-semibold">${user.username}</p>
            <select id="modalUserRole" class="w-full p-2 border rounded-lg">
                <option value="visor" ${user.role === 'visor' ? 'selected' : ''}>Visor</option>
                <option value="agente" ${user.role === 'agente' ? 'selected' : ''}>Agente</option>
                <option value="gestor" ${user.role === 'gestor' ? 'selected' : ''}>Gestor</option>
                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
            </select>
            <input type="password" id="modalUserPassword" placeholder="Nueva contraseña (opcional)" class="w-full p-2 border rounded-lg">
            <button id="modalSaveUserBtn" class="w-full bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 mt-2">Guardar Cambios</button>
        `;
        document.getElementById('modalSaveUserBtn').onclick = handleUpdateUser;
        openModal(addEditModal);
    }
    
    async function handleUpdateUser() {
        const id = document.getElementById('modalUserId').value;
        const role = document.getElementById('modalUserRole').value;
        const password = document.getElementById('modalUserPassword').value;
        await electronAPI.updateUser({ id, role, password: password || null });
        showMessage("Usuario actualizado.");
        closeModal(addEditModal);
        refreshUsersList();
    }

    // --- Data Loading, Rendering & Sync ---
    async function loadInitialData() {
        await electronAPI.getInitialData({ userId: currentUserId, userRole: currentUserRole });
        allReminders = await electronAPI.getReminders({ ownerId: currentUserId });
    }

    function refreshGroupViewsIfVisible() {
        if (!groupsSection.classList.contains('hidden')) {
            if (currentOpenGroupId) renderGroupDetailItems();
            else renderGroupsList();
        }
    }

    electronAPI.onUpdateLinks((links) => { allLinks = links; filterLinks(); filterGlobal(); updateFavoritesList(); refreshGroupViewsIfVisible(); });
    electronAPI.onUpdateNotes((notes) => { allNotes = notes; filterNotes(); filterGlobal(); updateFavoritesList(); refreshGroupViewsIfVisible(); });
    electronAPI.onUpdateQueries((queries) => { allQueries = queries; filterQueries(); filterGlobal(); updateFavoritesList(); refreshGroupViewsIfVisible(); });
    electronAPI.onUpdateGroups((groups) => { allGroups = groups; refreshGroupViewsIfVisible(); });
    electronAPI.onUpdateReminders((reminders) => {
        allReminders = reminders;
        if (!agendaSection.classList.contains('hidden')) renderRemindersList();
    });
    electronAPI.onReminderDue((reminder) => {
        reminderAlertQueue.push(reminder);
        processReminderAlertQueue();
    });
    electronAPI.onUpdateUsers((users) => { allUsers = users; if(currentUserRole === 'admin' && !usersSection.classList.contains('hidden')) { renderUsers(); } });


    function renderItems(items, container, filterId, extraButtonFn) {
        const canEdit = ['admin', 'gestor'].includes(currentUserRole);
        const visibilityFilter = document.getElementById(filterId)?.value || 'all';
        
        const filteredItems = items.filter(item => {
            if (currentUserRole === 'visor') return item.visibility === 'public';
            if (visibilityFilter === 'all') return true;
            if (visibilityFilter === 'public') return item.visibility === 'public';
            if (visibilityFilter === 'private') return item.visibility === 'private';
            return true;
        });

        container.innerHTML = filteredItems.map(item => {
            let categoryColor = 'gray';
            if (item.category === 'SICAR 4') categoryColor = 'blue';
            else if (item.category === 'SICAR X') categoryColor = 'green';
            const categoryBadge = `<span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-${categoryColor}-100 text-${categoryColor}-800 mr-2">${item.category}</span>`;
            const privateIcon = item.visibility === 'private' ? `<span class="visibility-badge-personal" title="Solo tú puedes ver este elemento"><i class="fas fa-lock"></i> Personal</span>` : '';

            let iconHtml, contentHtml, copyButtonHtml, editButtonHtml, deleteButtonHtml;
            const isFav = item.isFavorite ? 'text-yellow-400' : 'text-gray-400';
            const favTitle = item.isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos';
            const favBtn = `<button class="favorite-btn p-1 rounded-full hover:bg-gray-200 w-6 h-6 flex items-center justify-center" data-id="${item.id}" data-type="${item.url ? 'link' : (item.queryContent ? 'query' : 'note')}" data-isfavorite="${item.isFavorite}" title="${favTitle}"><i class="fas fa-star ${isFav}"></i></button>`;
            
            editButtonHtml = canEdit && (item.visibility === 'public' || item.ownerId === currentUserId) ? `<button class="edit-btn p-1 bg-yellow-500 text-white rounded-full hover:bg-yellow-600 w-6 h-6 flex items-center justify-center" data-id="${item.id}" data-type="${item.url ? 'link' : (item.queryContent ? 'query' : 'note')}" title="Editar"><i class="fas fa-edit"></i></button>` : '';
            deleteButtonHtml = canEdit && (item.visibility === 'public' || item.ownerId === currentUserId) ? `<button class="delete-btn p-1 bg-red-500 text-white rounded-full hover:bg-red-600 w-6 h-6 flex items-center justify-center" data-id="${item.id}" data-type="${item.url ? 'link' : (item.queryContent ? 'query' : 'note')}" title="Eliminar"><i class="fas fa-trash"></i></button>` : '';

            if (item.url) { // Link
                iconHtml = '<i class="fas fa-link text-blue-500 mr-3"></i>';
                contentHtml = `<div><div class="flex items-center">${privateIcon}${categoryBadge}<p class="font-medium text-gray-900 truncate">${item.name}</p></div><a href="${item.url}" target="_blank" class="text-blue-600 hover:underline text-xs truncate block ml-8">${item.url}</a></div>`;
                copyButtonHtml = `<button class="copy-btn p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 shadow-sm" data-content="${escapeAttr(item.url)}" title="Copiar URL"><i class="fas fa-copy"></i></button>`;
            } else if (item.queryContent) { // Query
                iconHtml = '<i class="fas fa-database text-purple-500 mr-3"></i>';
                contentHtml = `<div><div class="flex items-center">${privateIcon}${categoryBadge}<p class="font-medium text-gray-900 truncate">${item.title}</p></div><pre class="text-gray-700 text-xs max-h-12 overflow-hidden bg-gray-100 p-1 rounded-md font-mono ml-8">${item.queryContent}</pre></div>`;
                copyButtonHtml = `<button class="copy-btn p-2 bg-purple-500 text-white rounded-full hover:bg-purple-600 shadow-sm" data-type="query" data-content="${escapeAttr(item.queryContent)}" title="Copiar Query"><i class="fas fa-copy"></i></button>`;
            } else { // Note
                iconHtml = '<i class="fas fa-clipboard-list text-green-500 mr-3"></i>';
                contentHtml = `<div><div class="flex items-center">${privateIcon}${categoryBadge}<p class="font-medium text-gray-900 truncate">${item.title}</p></div><div class="text-gray-700 text-xs max-h-12 overflow-hidden ml-8">${item.content}</div></div>`;
                copyButtonHtml = `<button class="view-note-btn p-2 bg-green-500 text-white rounded-full hover:bg-green-600 shadow-sm" data-id="${item.id}" title="Ver Nota"><i class="fas fa-eye"></i></button>`;
            }

            const extraButtonHtml = extraButtonFn ? extraButtonFn(item) : '';

            return `<div class="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm hover:shadow-md border-l-4 border-${categoryColor}-500">
                        <div class="flex items-center flex-1 min-w-0 mr-4">${iconHtml}<div class="flex-1 min-w-0">${contentHtml}</div></div>
                        <div class="flex items-center space-x-1">${favBtn}${copyButtonHtml}${editButtonHtml}${deleteButtonHtml}${extraButtonHtml}</div>
                    </div>`;
        }).join('');
    }

    // --- Búsqueda mejorada (configurable: exacta o incremental por relevancia) ---
    // Quita acentos/diacríticos, pasa a minúsculas, quita etiquetas HTML y normaliza espacios.
    function normalizeText(str) {
        if (!str) return '';
        return String(str)
            .replace(/<[^>]*>/g, ' ')           // quita HTML (importante para notas con Quill)
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos (á->a, ñ->n, etc.)
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Calcula si un elemento coincide con el término de búsqueda y con qué puntaje de relevancia.
    // Devuelve -1 si no coincide. En modo "exact" solo hay coincidencia/no coincidencia (score 0).
    // En modo "incremental" todas las palabras deben aparecer (en cualquier orden) y se puntúa
    // más alto si coinciden en el campo principal (nombre/título) que en el secundario.
    function searchScore(term, primaryText, secondaryText) {
        const t = normalizeText(term);
        if (!t) return 0;
        const primary = normalizeText(primaryText);
        const secondary = normalizeText(secondaryText);

        if (appSettings.searchMode === 'exact') {
            return `${primary} ${secondary}`.includes(t) ? 0 : -1;
        }

        // Modo incremental / por relevancia
        const words = t.split(' ').filter(Boolean);
        const combined = `${primary} ${secondary}`;
        if (!words.every(word => combined.includes(word))) return -1;

        let score = 0;
        words.forEach(word => {
            if (primary.includes(word)) score += 3;
            if (secondary.includes(word)) score += 1;
        });
        if (primary.startsWith(t)) score += 5;
        else if (primary.includes(t)) score += 2;
        return score;
    }

    // Filtra y, en modo incremental, ordena por relevancia. Si no hay término de búsqueda,
    // regresa los elementos tal cual (sin reordenar).
    function searchFilterSort(items, term, primaryFn, secondaryFn) {
        if (!normalizeText(term)) return items;
        const scored = items
            .map(item => ({ item, score: searchScore(term, primaryFn(item), secondaryFn(item)) }))
            .filter(x => x.score >= 0);
        if (appSettings.searchMode !== 'exact') {
            scored.sort((a, b) => b.score - a.score);
        }
        return scored.map(x => x.item);
    }

    // Filter functions
    function filterLinks() { renderItems(searchFilterSort(allLinks, searchLinksBar.value, l => l.name, l => l.url), linksList, 'visibilityFilterLinks'); }
    function filterNotes() { renderItems(searchFilterSort(allNotes, searchNotesBar.value, n => n.title, n => n.content), notesList, 'visibilityFilterNotes'); }
    function filterQueries() { renderItems(searchFilterSort(allQueries, searchQueriesBar.value, q => q.title, q => q.queryContent), queriesList, 'visibilityFilterQueries'); }
    
    function filterGlobal() {
        const term = searchGlobalBar.value.trim();
        let sourceData = [];
        if (globalTypeFilters.has('link')) sourceData.push(...allLinks);
        if (globalTypeFilters.has('note')) sourceData.push(...allNotes);
        if (globalTypeFilters.has('query')) sourceData.push(...allQueries);
        sourceData = sourceData.filter(item => globalCategoryFilters.has(item.category));
        if (!term && globalTypeFilters.size > 0 && globalCategoryFilters.size > 0) {
            renderItems(sourceData, globalList);
            return;
        }
        if (!term) {
            globalList.innerHTML = '';
            return;
        }
        const results = searchFilterSort(
            sourceData, term,
            i => i.name || i.title,
            i => i.url || i.content || i.queryContent
        );
        if (appSettings.searchMode === 'exact') {
            results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        }
        renderItems(results, globalList);
    }

    // --- Grupos (etiquetas compartidas, muchos-a-muchos con enlaces/notas/queries) ---
    function itemGroupIds(item) {
        try { return JSON.parse(item.groups || '[]'); } catch (e) { return []; }
    }
    function itemType(item) {
        return item.url ? 'link' : (item.queryContent ? 'query' : 'note');
    }
    function allItemsFlat() {
        return [...allLinks, ...allNotes, ...allQueries];
    }

    function renderGroupsList() {
        if (allGroups.length === 0) {
            groupsListContainer.innerHTML = '<p class="text-sm text-gray-500 text-center py-6">Todavía no hay grupos. Crea el primero para empezar a organizar tus enlaces, notas y queries.</p>';
            return;
        }
        const flat = allItemsFlat();
        groupsListContainer.innerHTML = allGroups.map(g => {
            const count = flat.filter(item => itemGroupIds(item).includes(g.id)).length;
            const deleteBtn = currentUserRole === 'admin'
                ? `<button class="delete-group-btn p-2 text-gray-400 hover:text-red-600" data-id="${g.id}" data-name="${escapeAttr(g.name)}" title="Eliminar grupo"><i class="fas fa-trash"></i></button>`
                : '';
            return `<div class="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm hover:shadow-md border-l-4 border-indigo-400">
                        <button class="open-group-btn flex-1 text-left" data-id="${g.id}">
                            <p class="font-semibold text-gray-800">${g.name}</p>
                            <p class="text-xs text-gray-500">${count} elemento${count === 1 ? '' : 's'}</p>
                        </button>
                        ${deleteBtn}
                    </div>`;
        }).join('');
    }

    function renderGroupDetailItems() {
        if (!currentOpenGroupId) return;
        const group = allGroups.find(g => g.id === currentOpenGroupId);
        let pinnedIds = [];
        try { pinnedIds = JSON.parse((group && group.pinnedItems) || '[]'); } catch (e) { pinnedIds = []; }

        let items = allItemsFlat().filter(item => itemGroupIds(item).includes(currentOpenGroupId));
        if (items.length === 0) {
            groupDetailItemsList.innerHTML = '<p class="text-sm text-gray-500 text-center py-6">Este grupo todavía no tiene elementos. Búscalos arriba para agregarlos.</p>';
            return;
        }

        // Los fijados van arriba, en el orden en que se fijaron (el primero fijado, primero en la lista).
        items = items.slice().sort((a, b) => {
            const ai = pinnedIds.indexOf(a.id), bi = pinnedIds.indexOf(b.id);
            if (ai === -1 && bi === -1) return 0;
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
        });

        renderItems(items, groupDetailItemsList, null, (item) => {
            const type = itemType(item);
            const isPinned = pinnedIds.includes(item.id);
            const pinBtn = `<button class="pin-in-group-btn p-1 rounded-full w-6 h-6 flex items-center justify-center ${isPinned ? 'bg-amber-400 text-white hover:bg-amber-500' : 'bg-gray-200 text-gray-500 hover:bg-amber-100 hover:text-amber-600'}" data-id="${item.id}" data-type="${type}" data-pinned="${isPinned}" title="${isPinned ? 'Quitar de fijados' : 'Fijar arriba en este grupo'}"><i class="fas fa-thumbtack"></i></button>`;
            const removeBtn = `<button class="remove-from-group-btn p-1 bg-gray-200 text-gray-600 rounded-full hover:bg-red-100 hover:text-red-600 w-6 h-6 flex items-center justify-center" data-id="${item.id}" data-type="${type}" title="Quitar del grupo"><i class="fas fa-times"></i></button>`;
            return pinBtn + removeBtn;
        });
    }

    function openGroupDetail(groupId) {
        const group = allGroups.find(g => g.id === groupId);
        if (!group) return;
        currentOpenGroupId = groupId;
        groupDetailTitle.textContent = group.name;
        groupSearchInput.value = '';
        groupSearchSuggestions.classList.add('hidden');
        groupSearchSuggestions.innerHTML = '';
        renderGroupDetailItems();
        groupsListView.classList.add('hidden');
        groupDetailView.classList.remove('hidden');
    }

    groupsBackBtn.addEventListener('click', () => {
        currentOpenGroupId = null;
        groupDetailView.classList.add('hidden');
        groupsListView.classList.remove('hidden');
        renderGroupsList();
    });

    groupsListContainer.addEventListener('click', (e) => {
        const openBtn = e.target.closest('.open-group-btn');
        if (openBtn) { openGroupDetail(openBtn.dataset.id); return; }
        const delBtn = e.target.closest('.delete-group-btn');
        if (delBtn) {
            openConfirmModal(async () => {
                await electronAPI.deleteGroup(delBtn.dataset.id);
                showMessage('Grupo eliminado.');
            }, `¿Eliminar el grupo "${delBtn.dataset.name}"? Los elementos que contenía no se borran, solo dejan de estar agrupados ahí.`);
        }
    });

    openNewGroupFormBtn.addEventListener('click', () => {
        newGroupFormContainer.classList.toggle('hidden');
        if (!newGroupFormContainer.classList.contains('hidden')) newGroupNameInput.focus();
    });
    confirmNewGroupBtn.addEventListener('click', async () => {
        const name = newGroupNameInput.value.trim();
        if (!name) { showMessage('Escribe un nombre para el grupo.', true); return; }
        const result = await electronAPI.addGroup({ name });
        if (result && result.success) {
            newGroupNameInput.value = '';
            newGroupFormContainer.classList.add('hidden');
            showMessage('Grupo creado.');
        } else {
            showMessage((result && result.message) || 'No se pudo crear el grupo.', true);
        }
    });
    newGroupNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmNewGroupBtn.click(); });

    // Buscador tipo "@" dentro de un grupo, para agregar enlaces/notas/queries existentes
    groupSearchInput.addEventListener('input', () => {
        const term = normalizeText(groupSearchInput.value.replace(/^@/, ''));
        if (!term || !currentOpenGroupId) {
            groupSearchSuggestions.classList.add('hidden');
            groupSearchSuggestions.innerHTML = '';
            return;
        }
        const alreadyIn = new Set(allItemsFlat().filter(i => itemGroupIds(i).includes(currentOpenGroupId)).map(i => i.id));
        const matches = allItemsFlat()
            .filter(item => !alreadyIn.has(item.id) && normalizeText(item.name || item.title).includes(term))
            .slice(0, 8);
        if (matches.length === 0) {
            groupSearchSuggestions.innerHTML = '<div class="p-2 text-xs text-gray-500">Sin resultados</div>';
        } else {
            const iconClassFor = (type) => type === 'link' ? 'fa-link text-blue-500' : type === 'query' ? 'fa-database text-purple-500' : 'fa-clipboard-list text-green-500';
            groupSearchSuggestions.innerHTML = matches.map(item => {
                const type = itemType(item);
                return `<div class="mention-item" data-id="${item.id}" data-type="${type}"><i class="fas ${iconClassFor(type)} mr-2"></i>${escapeAttr(item.name || item.title)}</div>`;
            }).join('');
        }
        groupSearchSuggestions.classList.remove('hidden');
    });

    groupSearchSuggestions.addEventListener('click', async (e) => {
        const el = e.target.closest('.mention-item');
        if (!el || !currentOpenGroupId) return;
        await electronAPI.addItemToGroup({ groupId: currentOpenGroupId, itemId: el.dataset.id, itemType: el.dataset.type, userId: currentUserId, userRole: currentUserRole });
        groupSearchInput.value = '';
        groupSearchSuggestions.classList.add('hidden');
        groupSearchSuggestions.innerHTML = '';
    });

    document.addEventListener('click', (e) => {
        if (!groupSearchSuggestions.classList.contains('hidden') && !groupSearchSuggestions.contains(e.target) && e.target !== groupSearchInput) {
            groupSearchSuggestions.classList.add('hidden');
        }
    });

    groupDetailItemsList.addEventListener('click', async (e) => {
        if (!currentOpenGroupId) return;
        const pinBtn = e.target.closest('.pin-in-group-btn');
        if (pinBtn) {
            const isPinned = pinBtn.dataset.pinned === 'true';
            await electronAPI.togglePinInGroup({ groupId: currentOpenGroupId, itemId: pinBtn.dataset.id, pin: !isPinned });
            return;
        }
        const removeBtn = e.target.closest('.remove-from-group-btn');
        if (removeBtn) {
            await electronAPI.removeItemFromGroup({ groupId: currentOpenGroupId, itemId: removeBtn.dataset.id, itemType: removeBtn.dataset.type, userId: currentUserId, userRole: currentUserRole });
        }
    });

    // --- Agenda / Recordatorios (100% local) ---
    function formatReminderDate(ts) {
        return new Date(ts).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
    }

    function reminderRepeatLabel(reminder) {
        if (reminder.repeatType === 'daily') return 'todos los días';
        if (reminder.repeatType === 'custom_days') return `cada ${reminder.repeatIntervalDays} día${reminder.repeatIntervalDays == 1 ? '' : 's'}`;
        if (reminder.repeatType === 'weekdays') {
            const names = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            let days = [];
            try { days = JSON.parse(reminder.repeatWeekdays || '[]'); } catch (e) { days = []; }
            return days.length ? days.slice().sort().map(d => names[d]).join(', ') : 'sin días elegidos';
        }
        return 'no se repite';
    }

    function renderRemindersList() {
        if (allReminders.length === 0) {
            remindersListContainer.innerHTML = '<p class="text-sm text-gray-500 text-center py-6">No tienes recordatorios. Crea el primero con "Nuevo".</p>';
            return;
        }
        remindersListContainer.innerHTML = allReminders.map(r => {
            const snoozeInfo = r.maxSnoozes > 0 ? ` · pospuesto ${r.snoozeCount}/${r.maxSnoozes}` : '';
            return `<div class="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm border-l-4 border-amber-400">
                        <div class="flex-1 min-w-0">
                            <p class="font-semibold text-gray-800 truncate">${escapeAttr(r.title)}</p>
                            <p class="text-xs text-gray-500">${formatReminderDate(r.dueAt)} · ${reminderRepeatLabel(r)}${snoozeInfo}</p>
                            ${r.notes ? `<p class="text-xs text-gray-400 mt-1 truncate">${escapeAttr(r.notes)}</p>` : ''}
                        </div>
                        <div class="flex items-center space-x-1 flex-shrink-0">
                            <button class="edit-reminder-btn p-2 text-gray-500 hover:text-blue-600" data-id="${r.id}" title="Editar"><i class="fas fa-pen"></i></button>
                            <button class="delete-reminder-btn p-2 text-gray-500 hover:text-red-600" data-id="${r.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>`;
        }).join('');
    }

    function toLocalDatetimeInputValue(ts) {
        const d = new Date(ts);
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }

    function resetReminderForm() {
        reminderIdInput.value = '';
        reminderTitleInput.value = '';
        reminderNotesInput.value = '';
        reminderRepeatTypeSelect.value = 'none';
        reminderIntervalDaysInput.value = 2;
        reminderMaxSnoozesInput.value = 3;
        document.querySelectorAll('.reminder-weekday-cb').forEach(cb => cb.checked = false);
        reminderCustomDaysContainer.classList.add('hidden');
        reminderWeekdaysContainer.classList.add('hidden');
        const suggested = new Date(Date.now() + 60 * 60 * 1000);
        suggested.setSeconds(0, 0);
        reminderDueAtInput.value = toLocalDatetimeInputValue(suggested.getTime());
    }

    openNewReminderFormBtn.addEventListener('click', () => {
        resetReminderForm();
        reminderFormContainer.classList.remove('hidden');
    });
    cancelReminderFormBtn.addEventListener('click', () => reminderFormContainer.classList.add('hidden'));

    reminderRepeatTypeSelect.addEventListener('change', () => {
        reminderCustomDaysContainer.classList.toggle('hidden', reminderRepeatTypeSelect.value !== 'custom_days');
        reminderWeekdaysContainer.classList.toggle('hidden', reminderRepeatTypeSelect.value !== 'weekdays');
    });

    saveReminderBtn.addEventListener('click', async () => {
        const title = reminderTitleInput.value.trim();
        if (!title) { showMessage('Escribe qué quieres recordar.', true); return; }
        if (!reminderDueAtInput.value) { showMessage('Selecciona la fecha y hora.', true); return; }
        const repeatWeekdays = Array.from(document.querySelectorAll('.reminder-weekday-cb:checked')).map(cb => parseInt(cb.value, 10));
        const payload = {
            id: reminderIdInput.value || undefined,
            ownerId: currentUserId,
            title,
            notes: reminderNotesInput.value.trim(),
            dueAt: new Date(reminderDueAtInput.value).getTime(),
            repeatType: reminderRepeatTypeSelect.value,
            repeatIntervalDays: parseInt(reminderIntervalDaysInput.value, 10) || 1,
            repeatWeekdays,
            maxSnoozes: parseInt(reminderMaxSnoozesInput.value, 10) || 0
        };
        const result = reminderIdInput.value ? await electronAPI.updateReminder(payload) : await electronAPI.addReminder(payload);
        if (result && result.success) {
            reminderFormContainer.classList.add('hidden');
            showMessage('Recordatorio guardado.');
        } else {
            showMessage('No se pudo guardar el recordatorio.', true);
        }
    });

    remindersListContainer.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-reminder-btn');
        if (editBtn) {
            const r = allReminders.find(x => x.id === editBtn.dataset.id);
            if (!r) return;
            reminderIdInput.value = r.id;
            reminderTitleInput.value = r.title;
            reminderNotesInput.value = r.notes || '';
            reminderDueAtInput.value = toLocalDatetimeInputValue(r.dueAt);
            reminderRepeatTypeSelect.value = r.repeatType;
            reminderIntervalDaysInput.value = r.repeatIntervalDays || 2;
            reminderMaxSnoozesInput.value = r.maxSnoozes;
            let days = [];
            try { days = JSON.parse(r.repeatWeekdays || '[]'); } catch (e2) { days = []; }
            document.querySelectorAll('.reminder-weekday-cb').forEach(cb => cb.checked = days.includes(parseInt(cb.value, 10)));
            reminderCustomDaysContainer.classList.toggle('hidden', r.repeatType !== 'custom_days');
            reminderWeekdaysContainer.classList.toggle('hidden', r.repeatType !== 'weekdays');
            reminderFormContainer.classList.remove('hidden');
            return;
        }
        const delBtn = e.target.closest('.delete-reminder-btn');
        if (delBtn) {
            openConfirmModal(async () => {
                await electronAPI.deleteReminder({ id: delBtn.dataset.id, ownerId: currentUserId });
                showMessage('Recordatorio eliminado.');
            }, '¿Eliminar este recordatorio?');
        }
    });

    // Cola de alertas: si suenan varios recordatorios a la vez, se muestran uno por uno.
    let reminderAlarmAudio = null;

    function startReminderAlarmSound() {
        stopReminderAlarmSound();
        if (isMuted) return;
        reminderAlarmAudio = new Audio('./assets/new-notification-09-352705.mp3');
        reminderAlarmAudio.loop = true;
        reminderAlarmAudio.volume = 0.6;
        reminderAlarmAudio.play().catch(error => {
            console.error("Error al reproducir la alarma del recordatorio:", error);
        });
    }

    function stopReminderAlarmSound() {
        if (reminderAlarmAudio) {
            reminderAlarmAudio.pause();
            reminderAlarmAudio.currentTime = 0;
            reminderAlarmAudio = null;
        }
    }

    function processReminderAlertQueue() {
        if (currentAlertingReminderId || reminderAlertQueue.length === 0) return;
        const reminder = reminderAlertQueue.shift();
        currentAlertingReminderId = reminder.id;
        reminderAlertTitle.textContent = reminder.title;
        reminderAlertNotes.textContent = reminder.notes || '';
        reminderAlertNotes.classList.toggle('hidden', !reminder.notes);
        reminderAlertSnoozeBtn.classList.toggle('hidden', reminder.maxSnoozes <= 0 || reminder.snoozeCount >= reminder.maxSnoozes);
        startReminderAlarmSound();
        openModal(reminderAlertModal);
    }

    reminderAlertSnoozeBtn.addEventListener('click', async () => {
        if (!currentAlertingReminderId) return;
        stopReminderAlarmSound();
        await electronAPI.snoozeReminder({ id: currentAlertingReminderId, ownerId: currentUserId });
        closeModal(reminderAlertModal);
        currentAlertingReminderId = null;
        processReminderAlertQueue();
    });
    reminderAlertDismissBtn.addEventListener('click', async () => {
        if (!currentAlertingReminderId) return;
        stopReminderAlarmSound();
        await electronAPI.dismissReminder({ id: currentAlertingReminderId, ownerId: currentUserId });
        closeModal(reminderAlertModal);
        currentAlertingReminderId = null;
        processReminderAlertQueue();
    });

    function displayFavorites() { renderItems(allFavorites, favoritesList); }
    function updateFavoritesList() {
        allFavorites = [...allLinks, ...allNotes, ...allQueries].filter(i => i.isFavorite);
        if (!favoritesSection.classList.contains('hidden')) displayFavorites();
    }

    // --- Event Listeners ---
    searchLinksBar.addEventListener('input', filterLinks);
    searchNotesBar.addEventListener('input', filterNotes);
    searchQueriesBar.addEventListener('input', filterQueries);
    visibilityFilterLinks.addEventListener('change', filterLinks);
    visibilityFilterNotes.addEventListener('change', filterNotes);
    visibilityFilterQueries.addEventListener('change', filterQueries);
    searchGlobalBar.addEventListener('input', filterGlobal);
    
    [globalTypeFilterContainer, globalCategoryFilterContainer].forEach(container => {
        container.addEventListener('change', (e) => {
            const checkbox = e.target.closest('input.global-filter-cb');
            if (!checkbox) return;
            const group = checkbox.dataset.filterGroup;
            const filter = checkbox.dataset.filter;
            const filterSet = group === 'type' ? globalTypeFilters : globalCategoryFilters;
            if (checkbox.checked) { filterSet.add(filter); } 
            else { filterSet.delete(filter); }
            filterGlobal();
        });
    });

    contentArea.addEventListener('click', e => {
        const button = e.target.closest('button');
        if (!button) return;
        const id = button.dataset.id;
        const type = button.dataset.type;

        if (button.classList.contains('copy-btn')) {
            const text = button.dataset.content;
            if (button.dataset.type === 'query') {
                const detection = detectDateFields(text);
                if (detection) {
                    openCopyDateModal(text, detection);
                } else {
                    copyToClipboard(text);
                }
            } else {
                copyToClipboard(text);
            }
        } else if (button.classList.contains('view-note-btn')) {
            const item = allNotes.find(i => i.id == id);
            if (item) {
                viewNoteTitle.textContent = item.title;
                
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = item.content;
                tempDiv.querySelectorAll('a').forEach(link => {
                    const container = document.createElement('span');
                    container.className = 'note-link-container';
                    
                    const copyBtn = document.createElement('button');
                    copyBtn.className = 'copy-link-btn p-1 bg-gray-200 text-gray-600 rounded-full hover:bg-blue-600 hover:text-white w-6 h-6 flex items-center justify-center';
                    copyBtn.innerHTML = '<i class="fas fa-copy fa-xs"></i>';
                    copyBtn.title = 'Copiar URL';
                    
                    link.parentNode.insertBefore(container, link);
                    container.appendChild(link);
                    container.appendChild(copyBtn);
                });
                tempDiv.querySelectorAll('img').forEach(img => {
                    const wrapper = document.createElement('span');
                    wrapper.className = 'note-image-wrapper';
                    img.parentNode.insertBefore(wrapper, img);
                    wrapper.appendChild(img);

                    const copyImgBtn = document.createElement('button');
                    copyImgBtn.className = 'copy-image-btn';
                    copyImgBtn.innerHTML = '<i class="fas fa-copy fa-xs"></i>';
                    copyImgBtn.title = 'Copiar imagen al portapapeles';
                    wrapper.appendChild(copyImgBtn);
                });
                viewNoteContent.innerHTML = tempDiv.innerHTML;
                cacheAndSwapNoteImages(viewNoteContent);
                
                viewNoteImage.innerHTML = item.imagePath ? `<img src="${item.imagePath}" class="max-w-full h-auto max-h-80 object-contain mx-auto rounded-lg border" onerror="this.style.display='none';">` : '';
                openModal(viewNoteModal);
            }
        } else if (button.classList.contains('edit-btn')) {
            let item;
            if (type === 'link') item = allLinks.find(i => i.id == id);
            else if (type === 'note') item = allNotes.find(i => i.id == id);
            else if (type === 'query') item = allQueries.find(i => i.id == id);
            if (item) openEditModal(type, item);
        } else if (button.classList.contains('delete-btn')) {
            openConfirmModal(() => {
                if (type === 'link') electronAPI.deleteLink(id);
                else if (type === 'note') electronAPI.deleteNote(id);
                else if (type === 'query') electronAPI.deleteQuery(id);
            }, '¿Estás seguro de que quieres eliminar este elemento?');
        } else if (button.classList.contains('favorite-btn')) {
            electronAPI.toggleFavorite({ itemId: id, userId: currentUserId, itemType: type });
        }
    });
    
    function openEditModal(type, item = null) {
        if (!['agente', 'gestor', 'admin'].includes(currentUserRole)) return;
        
        addEditModal.classList.remove('hidden');
        addEditModalBody.innerHTML = ''; // Clear previous content
        let saveButtonHandler = null;
        let hiddenIdInput = item ? `<input type="hidden" id="modalItemId" value="${item.id}">` : '';

        const categorySelector = `
            <select id="modalCategory" class="w-full p-2 border rounded-lg mt-2">
                <option value="General" ${item?.category === 'General' ? 'selected' : ''}>General</option>
                <option value="SICAR 4" ${item?.category === 'SICAR 4' ? 'selected' : ''}>SICAR 4</option>
                <option value="SICAR X" ${item?.category === 'SICAR X' ? 'selected' : ''}>SICAR X</option>
            </select>
        `;
        const visibilityToggle = `
            <div class="flex items-center justify-center space-x-4 mt-2">
                <label><input type="radio" name="visibility" value="public" ${item?.visibility === 'private' ? '' : 'checked'}> Público</label>
                <label><input type="radio" name="visibility" value="private" ${item?.visibility === 'private' ? 'checked' : ''}> Personal</label>
            </div>
        `;

        if (type === 'link') {
            addEditModalTitle.textContent = item ? 'Editar Enlace' : 'Agregar Nuevo Enlace';
            saveButtonHandler = item ? handleUpdateLink : handleAddLink;
            addEditModalBody.innerHTML = `
                ${hiddenIdInput}
                <input type="text" id="modalLinkName" placeholder="Nombre" class="w-full p-2 border rounded-lg" value="${item ? escapeAttr(item.name) : ''}">
                <input type="url" id="modalLinkUrl" placeholder="URL" class="w-full p-2 border rounded-lg" value="${item ? escapeAttr(item.url) : ''}">
                ${categorySelector}
                ${visibilityToggle}
                <button id="modalSaveBtn" class="w-full bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 mt-2">Guardar</button>`;
        } else if (type === 'note') {
            addEditModalContent.classList.add('note-editor-modal');
            addEditModalBody.classList.add('note-editor-body');
            addEditModalTitle.textContent = item ? 'Editar Nota' : 'Agregar Nueva Nota';
            saveButtonHandler = item ? handleUpdateNote : handleAddNote;
            
            addEditModalBody.innerHTML = `
                ${hiddenIdInput}
                <input type="text" id="modalNoteTitle" placeholder="Título de la nota" class="w-full p-2 border rounded-lg mb-2" value="${item ? escapeAttr(item.title) : ''}">
                <div class="flex-shrink-0">${categorySelector}${visibilityToggle}</div>
                <div id="quill-editor-container" class="mt-2"></div>
                <button id="modalSaveBtn" class="w-full bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 mt-4 flex-shrink-0">Guardar Nota</button>`;

            // Initialize Quill
            if (window.ImageResize && !Quill.imports['modules/imageResize']) {
                Quill.register('modules/imageResize', window.ImageResize.default || window.ImageResize);
            }
            const quill = new Quill('#quill-editor-container', {
                modules: {
                    toolbar: [
                        [{ 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'link'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        [{ 'color': [] }, { 'background': [] }],
                        ['clean']
                    ],
                    imageResize: {}
                },
                placeholder: 'Escribe tu nota aquí...',
                theme: 'snow'
            });
            if (item && item.content) {
                quill.root.innerHTML = item.content;
            }
            currentQuillInstance = quill;
            quill.root.addEventListener('paste', (e) => handleQuillImagePaste(e, quill));

        } else if (type === 'query') {
            addEditModalTitle.textContent = item ? 'Editar Query' : 'Agregar Nueva Query';
            saveButtonHandler = item ? handleUpdateQuery : handleAddQuery;
            addEditModalBody.innerHTML = `
                ${hiddenIdInput}
                <input type="text" id="modalQueryTitle" placeholder="Título" class="w-full p-2 border rounded-lg" value="${item ? escapeAttr(item.title) : ''}">
                <textarea id="modalQueryContent" rows="8" class="w-full p-2 border rounded-lg font-mono">${item ? item.queryContent : ''}</textarea>
                ${categorySelector}
                ${visibilityToggle}
                <button id="modalSaveBtn" class="w-full bg-purple-600 text-white p-2 rounded-lg hover:bg-purple-700 mt-2">Guardar Query</button>`;
        }
        document.getElementById('modalSaveBtn').addEventListener('click', saveButtonHandler);
    }

    async function handleAddLink() {
        const data = { name: document.getElementById('modalLinkName').value.trim(), url: document.getElementById('modalLinkUrl').value.trim(), category: document.getElementById('modalCategory').value, visibility: document.querySelector('input[name="visibility"]:checked').value, ownerId: currentUserId };
        if (!data.name || !data.url) return showMessage("Nombre y URL son requeridos.", true);
        try { await electronAPI.addLink(data); showMessage("Enlace agregado."); closeModal(addEditModal); } catch (e) { showMessage(`Error: ${e}.`, true); }
    }
    async function handleUpdateLink() {
        const id = document.getElementById('modalItemId').value;
        const data = { id, name: document.getElementById('modalLinkName').value.trim(), url: document.getElementById('modalLinkUrl').value.trim(), category: document.getElementById('modalCategory').value, visibility: document.querySelector('input[name="visibility"]:checked').value, ownerId: currentUserId };
        if (!data.name || !data.url) return showMessage("Nombre y URL son requeridos.", true);
        try { await electronAPI.updateLink(data); showMessage("Enlace actualizado."); closeModal(addEditModal); } catch (e) { showMessage(`Error: ${e}.`, true); }
    }
    async function handleAddNote() {
        const data = { title: document.getElementById('modalNoteTitle').value.trim(), content: currentQuillInstance.root.innerHTML.trim(), category: document.getElementById('modalCategory').value, visibility: document.querySelector('input[name="visibility"]:checked').value, ownerId: currentUserId };
        if (!data.title || !data.content) return showMessage("Título y contenido son requeridos.", true);
        try { await electronAPI.addNote(data); showMessage("Nota guardada."); closeModal(addEditModal); } catch (e) { showMessage(`Error: ${e}.`, true); }
    }
    async function handleUpdateNote() {
        const id = document.getElementById('modalItemId').value;
        const current = allNotes.find(note => note.id == id);
        const data = { id, title: document.getElementById('modalNoteTitle').value.trim(), content: currentQuillInstance.root.innerHTML.trim(), category: document.getElementById('modalCategory').value, visibility: document.querySelector('input[name="visibility"]:checked').value, imagePath: current?.imagePath || null, ownerId: currentUserId };
        if (!data.title || !data.content) return showMessage("Título y contenido son requeridos.", true);
        try { await electronAPI.updateNote(data); showMessage("Nota actualizada."); closeModal(addEditModal); } catch (e) { showMessage(`Error: ${e}.`, true); }
    }
    async function handleAddQuery() {
        const data = { title: document.getElementById('modalQueryTitle').value.trim(), queryContent: document.getElementById('modalQueryContent').value.trim(), category: document.getElementById('modalCategory').value, visibility: document.querySelector('input[name="visibility"]:checked').value, ownerId: currentUserId };
        if (!data.title || !data.queryContent) return showMessage("Título y contenido son requeridos.", true);
        try { await electronAPI.addQuery(data); showMessage("Query guardada."); closeModal(addEditModal); } catch (e) { showMessage(`Error: ${e}.`, true); }
    }
    async function handleUpdateQuery() {
        const id = document.getElementById('modalItemId').value;
        const data = { id, title: document.getElementById('modalQueryTitle').value.trim(), queryContent: document.getElementById('modalQueryContent').value.trim(), category: document.getElementById('modalCategory').value, visibility: document.querySelector('input[name="visibility"]:checked').value, ownerId: currentUserId };
        if (!data.title || !data.queryContent) return showMessage("Título y contenido son requeridos.", true);
        try { await electronAPI.updateQuery(data); showMessage("Query actualizada."); closeModal(addEditModal); } catch (e) { showMessage(`Error: ${e}.`, true); }
    }

    openAddLinkModalBtn.addEventListener('click', () => openEditModal('link'));
    openAddNoteModalBtn.addEventListener('click', () => openEditModal('note'));
    openAddQueryModalBtn.addEventListener('click', () => openEditModal('query'));

    async function handleManualSync() {
        showMessage("Sincronización manual en curso...", false);
        await electronAPI.manualSync();
    }
    syncBtn.addEventListener('click', handleManualSync);

    // Muestra en pantalla los mensajes de sincronización y de actualización (antes se enviaban
    // desde main.js pero nada los escuchaba en la interfaz).
    electronAPI.onSyncStatus((status) => {
        syncStatusContainer.innerHTML = `<div class="p-2 rounded-lg text-center text-xs ${status.success ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">${status.message}</div>`;
        clearTimeout(syncStatusContainer._clearTimer);
        syncStatusContainer._clearTimer = setTimeout(() => { syncStatusContainer.innerHTML = ''; }, 6000);
    });

    // Bind section buttons
    linksBtn.addEventListener('click', () => showSection('linksSection'));
    notesBtn.addEventListener('click', () => showSection('notesSection'));
    queriesBtn.addEventListener('click', () => showSection('queriesSection'));
    globalBtn.addEventListener('click', () => showSection('globalSection'));
    groupsBtn.addEventListener('click', () => showSection('groupsSection'));
    agendaBtn.addEventListener('click', () => showSection('agendaSection'));
    favoritesBtn.addEventListener('click', () => showSection('favoritesSection'));
    usersBtn.addEventListener('click', () => showSection('usersSection'));

    // --- Chat Logic ---

    function playNotificationSound() {
        if (isMuted) return;
        const notificationSound = new Audio('./assets/new-notification-09-352705.mp3');
        notificationSound.volume = 0.5; 
        notificationSound.play().catch(error => {
            console.error("Error al reproducir el sonido de notificación:", error);
        });
    }
    
    function getUserColor(userId) {
        if (userColors.has(userId)) {
            return userColors.get(userId);
        }
        const hue = Math.floor(Math.random() * 360);
        const color = `hsl(${hue}, 70%, 45%)`;
        userColors.set(userId, color);
        return color;
    }

    function scrollChatToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
        newMessagesIndicator.classList.add('hidden');
        newMessagesIndicator.classList.remove('flex');
    }

    function renderChatMessages(messages) {
        // Si ya estabas cerca del final, seguimos bajando solos como antes.
        // Si estabas leyendo mensajes anteriores (scrolleado hacia arriba), NO te movemos:
        // conservamos tu posición y solo avisamos con un botón si de verdad llegó algo nuevo.
        const wasNearBottom = (chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight) < 100;
        const hasNewMessages = messages.length > lastRenderedMessageCount;
        const previousScrollTop = chatMessages.scrollTop;

        chatMessages.innerHTML = '';
        messages.forEach(msg => {
            chatMessages.appendChild(renderChatMessage(msg));
        });

        if (wasNearBottom || lastRenderedMessageCount === 0) {
            scrollChatToBottom();
        } else {
            chatMessages.scrollTop = previousScrollTop;
            if (hasNewMessages) {
                newMessagesIndicator.classList.remove('hidden');
                newMessagesIndicator.classList.add('flex');
            }
        }
        lastRenderedMessageCount = messages.length;
    }

    newMessagesIndicator.addEventListener('click', scrollChatToBottom);
    
    function renderChatMessage(msg) {
        const mentionRegex = /@\[(Enlace|Nota|Query): (.*?)\]/g;
        const formattedMessage = msg.message.replace(mentionRegex, (match, type, name) => {
            return `<span class="chat-mention" data-mention-name="${escapeAttr(name)}">${type}: ${name}</span>`;
        });

        if (msg.isGemini) {
            const wrapper = document.createElement('div');
            wrapper.className = 'flex justify-start';
            wrapper.innerHTML = `
                <div class="max-w-[75%] p-2 rounded-lg bg-gray-200 text-gray-800">
                    <p class="text-xs font-bold mb-1 text-purple-600 flex items-center">
                        <i class="fas fa-robot mr-2"></i> Gemini
                    </p>
                    <p class="text-sm break-words">${formattedMessage}</p>
                </div>`;
            return wrapper;
        }

        const isMe = msg.userId === currentUserId;
        const messageWrapper = document.createElement('div');
        messageWrapper.className = `flex ${isMe ? 'justify-end' : 'justify-start'}`;
        
        const messageBubble = document.createElement('div');
        messageBubble.className = `max-w-[75%] p-2 rounded-lg ${isMe ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`;
        
        const usernameP = document.createElement('p');
        usernameP.className = 'text-xs font-bold mb-1';
        usernameP.textContent = isMe ? 'Yo' : msg.username;
        
        if (!isMe) {
            usernameP.style.color = getUserColor(msg.userId);
        }

        const messageP = document.createElement('p');
        messageP.className = 'text-sm break-words';
        messageP.innerHTML = formattedMessage;

        messageBubble.appendChild(usernameP);
        messageBubble.appendChild(messageP);
        messageWrapper.appendChild(messageBubble);
        return messageWrapper;
    }

    async function handleChatInputSend() {
        const message = chatInput.value.trim();
        if (!message) return;

        if (chatMode === 'general') {
            await electronAPI.sendChatMessageToFirebase({ userId: currentUserId, username: currentUsername, message });
        } else if (chatMode === 'gemini') {
            const userMessage = { userId: currentUserId, username: currentUsername, message };
            geminiChatHistory.push(userMessage);
            renderChatMessages(geminiChatHistory);
            
            const loadingMessage = { isGemini: true, message: '<i class="fas fa-spinner fa-spin"></i> Pensando...' };
            geminiChatHistory.push(loadingMessage);
            renderChatMessages(geminiChatHistory);

            const mode = document.querySelector('input[name="geminiMode"]:checked').value;
            const response = await electronAPI.askGemini({ prompt: message, mode });
            
            geminiChatHistory.pop();
            const geminiResponse = { isGemini: true, message: response.success ? response.text : `Error: ${response.message}` };
            geminiChatHistory.push(geminiResponse);
            renderChatMessages(geminiChatHistory);
        }

        chatInput.value = '';
        mentionSuggestions.classList.add('hidden');
        emojiPickerContainer.classList.add('hidden');
    }

    function setChatMode(mode) {
        chatMode = mode;
        if (mode === 'general') {
            chatModeGeneralBtn.classList.add('bg-blue-500', 'text-white');
            chatModeGeneralBtn.classList.remove('text-gray-300', 'hover:bg-gray-600');
            chatModeGeminiBtn.classList.remove('bg-blue-500', 'text-white');
            chatModeGeminiBtn.classList.add('text-gray-300', 'hover:bg-gray-600');
            
            geminiOptionsContainer.classList.add('hidden');
            mentionSuggestions.classList.remove('hidden');
            emojiBtn.classList.remove('hidden');
            chatInput.placeholder = "Escribe un mensaje...";
            renderChatMessages(generalChatHistory);
        } else { // gemini mode
            chatModeGeminiBtn.classList.add('bg-blue-500', 'text-white');
            chatModeGeminiBtn.classList.remove('text-gray-300', 'hover:bg-gray-600');
            chatModeGeneralBtn.classList.remove('bg-blue-500', 'text-white');
            chatModeGeneralBtn.classList.add('text-gray-300', 'hover:bg-gray-600');

            geminiOptionsContainer.classList.remove('hidden');
            mentionSuggestions.classList.add('hidden');
            emojiBtn.classList.add('hidden');
            chatInput.placeholder = "Pregúntale a Gemini...";
            renderChatMessages(geminiChatHistory);
        }
    }

    chatModeGeneralBtn.addEventListener('click', () => setChatMode('general'));
    chatModeGeminiBtn.addEventListener('click', () => setChatMode('gemini'));

    chatToggleButton.addEventListener('click', () => {
        chatWindow.classList.toggle('hidden');
        if (!chatWindow.classList.contains('hidden')) {
            chatNotification.classList.add('hidden');
            chatInput.focus();
            setTimeout(scrollChatToBottom, 0);
        }
    });
    closeChatBtn.addEventListener('click', () => chatWindow.classList.add('hidden'));
    sendChatBtn.addEventListener('click', handleChatInputSend);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleChatInputSend();
        }
    });

    muteChatBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        const icon = muteChatBtn.querySelector('i');
        icon.classList.toggle('fa-volume-up', !isMuted);
        icon.classList.toggle('fa-volume-mute', isMuted);
        muteChatBtn.title = isMuted ? "Activar notificaciones" : "Silenciar notificaciones";
    });

    electronAPI.onChatMessagesUpdate((messages) => {
        generalChatHistory = messages;
        if (chatMode === 'general') {
            renderChatMessages(generalChatHistory);
        }

        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.userId !== currentUserId) {
                if (chatWindow.classList.contains('hidden')) {
                    chatNotification.classList.remove('hidden');
                    playNotificationSound();
                }
            }
        }
    });
    
    chatInput.addEventListener('input', () => {
        if (chatMode !== 'general') return;
        const match = chatInput.value.match(/@([\w\s]*)$/);
        if (match) {
            const searchTerm = match[1].toLowerCase();
            const allItems = [
                ...allLinks.map(i => ({...i, type: 'Enlace', name: i.name})),
                ...allNotes.map(i => ({...i, type: 'Nota', name: i.title})),
                ...allQueries.map(i => ({...i, type: 'Query', name: i.title}))
            ];
            const filteredItems = allItems.filter(i => i.name.toLowerCase().includes(searchTerm)).slice(0, 10);
            
            if (filteredItems.length > 0) {
                mentionSuggestions.innerHTML = filteredItems.map(item => `
                    <div class="mention-item" data-type="${item.type}" data-name="${escapeAttr(item.name)}">
                        <i class="fas ${item.type === 'Enlace' ? 'fa-link' : (item.type === 'Nota' ? 'fa-clipboard-list' : 'fa-database')} mr-2 text-gray-500"></i>
                        <span class="truncate">${item.name}</span>
                    </div>
                `).join('');
                mentionSuggestions.classList.remove('hidden');
                emojiPickerContainer.classList.add('hidden');
            } else {
                mentionSuggestions.classList.add('hidden');
            }
        } else {
            mentionSuggestions.classList.add('hidden');
        }
    });

    mentionSuggestions.addEventListener('click', (e) => {
        const item = e.target.closest('.mention-item');
        if (item) {
            const type = item.dataset.type;
            const name = item.dataset.name;
            const currentValue = chatInput.value;
            const newValue = currentValue.replace(/@[\w\s]*$/, `@[${type}: ${name}] `);
            chatInput.value = newValue;
            mentionSuggestions.classList.add('hidden');
            chatInput.focus();
        }
    });

    chatMessages.addEventListener('click', (e) => {
        const mention = e.target.closest('.chat-mention');
        if (mention) {
            const name = mention.dataset.mentionName;
            showSection('globalSection');
            searchGlobalBar.value = name;
            filterGlobal();
        }
    });

    // Event delegation for copy link button in the note preview
    viewNoteModal.addEventListener('click', async (e) => {
        const copyBtn = e.target.closest('.copy-link-btn');
        if (copyBtn) {
            e.preventDefault();
            e.stopPropagation();
            const link = copyBtn.previousElementSibling;
            if (link && link.tagName === 'A') {
                // THIS IS THE FINAL FIX: Use innerText to get the visible URL/path
                copyToClipboard(link.innerText);
            }
            return;
        }
        const copyImgBtn = e.target.closest('.copy-image-btn');
        if (copyImgBtn) {
            e.preventDefault();
            e.stopPropagation();
            const img = copyImgBtn.parentElement.querySelector('img');
            if (!img || !img.src) return;
            const result = await electronAPI.copyImageToClipboard(img.src);
            if (result && result.success) {
                showMessage('Imagen copiada al portapapeles.');
            } else {
                showMessage((result && result.message) || 'No se pudo copiar la imagen.', true);
            }
        }
    });

    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPickerContainer.classList.toggle('hidden');
        mentionSuggestions.classList.add('hidden');
    });

    emojiPicker.addEventListener('emoji-click', event => {
        chatInput.value += event.detail.unicode;
        chatInput.focus();
    });

    document.addEventListener('click', (e) => {
        if (!emojiPickerContainer.classList.contains('hidden') && !emojiPickerContainer.contains(e.target) && !emojiBtn.contains(e.target)) {
            emojiPickerContainer.classList.add('hidden');
        }
        if (!mentionSuggestions.classList.contains('hidden') && !mentionSuggestions.contains(e.target) && e.target !== chatInput) {
            mentionSuggestions.classList.add('hidden');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === "Escape") {
            if (!emojiPickerContainer.classList.contains('hidden') || !mentionSuggestions.classList.contains('hidden')) {
                emojiPickerContainer.classList.add('hidden');
                mentionSuggestions.classList.add('hidden');
            } 
            else if (!viewNoteModal.classList.contains('hidden')) {
                closeModal(viewNoteModal);
            }
        }
    });

    // --- Initial Load ---
    loadSettings().then(checkSavedSession);
});
