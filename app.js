// ===== IMPORTS =====
import { auth, db } from './firebase-config.js';
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence,
    createUserWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import {
    collection,
    addDoc,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    getDoc,
    doc,
    setDoc,
    updateDoc,
    Timestamp,
    onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// ===== ESTADO GLOBAL =====
const state = {
    currentUser: null,
    currentUserData: null,
    currentRole: null,
    currentLocation: null,
    listeners: []
};

// ===== CONFIGURACIÓN =====
const BATHROOMS = [
    'Planta Baja - Sanitario Hombres',
    'Planta Baja - Sanitario Mujeres',
    'Piso 1 - Sanitario Hombres',
    'Piso 1 - Sanitario Mujeres',
    'Piso 2 - Sanitario Hombres',
    'Piso 2 - Sanitario Mujeres'
];

// ===== UTILIDADES =====
const showToast = (message, type = 'success') => {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => toast.classList.remove('show'), 3000);
};

const formatDate = (timestamp) => {
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
};

const formatTime = (timestamp) => {
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit'
    });
};

const getTimeElapsed = (timestamp) => {
    const now = new Date();
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    const hours = Math.floor((now - date) / (1000 * 60 * 60));

    if (hours < 2) return 'success';
    if (hours < 4) return 'warning';
    return 'danger';
};

const switchScreen = (screenId) => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
};

// ===== ESCÁNER QR =====
let html5QrcodeScanner = null;

const startQRScanner = () => {
    const qrReaderDiv = document.getElementById('qr-reader');
    const scanBtn = document.getElementById('scanBtn');
    const stopBtn = document.getElementById('stopScanBtn');

    // Mostrar el área del escáner
    qrReaderDiv.style.display = 'block';
    scanBtn.style.display = 'none';
    stopBtn.style.display = 'block';

    html5QrcodeScanner = new Html5Qrcode("qr-reader");

    const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
    };

    html5QrcodeScanner.start(
        { facingMode: "environment" },
        config,
        (decodedText, decodedResult) => {
            // QR detectado
            console.log(`QR detectado: ${decodedText}`);
            stopQRScanner();
            handleQRScan(decodedText);
        },
        (errorMessage) => {
            // Error de escaneo (puede ser ignorado)
        }
    ).catch(err => {
        console.error('Error al iniciar escáner:', err);
        showToast('Error al acceder a la cámara', 'error');
        stopQRScanner();
    });
};

const stopQRScanner = () => {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            html5QrcodeScanner.clear();
            html5QrcodeScanner = null;
        }).catch(err => {
            console.error('Error al detener escáner:', err);
        });
    }

    const qrReaderDiv = document.getElementById('qr-reader');
    const scanBtn = document.getElementById('scanBtn');
    const stopBtn = document.getElementById('stopScanBtn');

    qrReaderDiv.style.display = 'none';
    scanBtn.style.display = 'block';
    stopBtn.style.display = 'none';
};

// ===== GESTIÓN DE USUARIOS =====
const getUserFromFirestore = async (uid) => {
    try {
        const userDoc = await getDoc(doc(db, 'usuarios', uid));
        return userDoc.exists() ? userDoc.data() : null;
    } catch (error) {
        console.error('Error al obtener usuario:', error);
        return null;
    }
};

const createOrUpdateUser = async (user) => {
    try {
        const userRef = doc(db, 'usuarios', user.uid);
        const userDoc = await getDoc(userRef);

        if (!userDoc.exists()) {
            // Crear nuevo usuario con rol por defecto
            const defaultRole = user.email.includes('admin') ? 'administrador' : 'limpieza';
            await setDoc(userRef, {
                email: user.email,
                nombre: user.email.split('@')[0],
                rol: defaultRole,
                activo: true,
                fechaCreacion: Timestamp.now(),
                ultimoAcceso: Timestamp.now()
            });
            return defaultRole;
        } else {
            // Actualizar último acceso
            await updateDoc(userRef, {
                ultimoAcceso: Timestamp.now()
            });
            return userDoc.data().rol;
        }
    } catch (error) {
        console.error('Error al crear/actualizar usuario:', error);
        throw error;
    }
};

// ===== AUTENTICACIÓN =====
const handleLogin = async (e) => {
    e.preventDefault();
    const email = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const loginError = document.getElementById('loginError');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');

    try {
        btnText.classList.add('hidden');
        btnLoader.classList.remove('hidden');
        submitBtn.disabled = true;
        loginError.textContent = '';

        // Habilitar persistencia de sesión
        await setPersistence(auth, browserLocalPersistence);

        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Obtener o crear usuario en Firestore
        const role = await createOrUpdateUser(user);
        const userData = await getUserFromFirestore(user.uid);

        if (!userData || !userData.activo) {
            throw new Error('Usuario inactivo o no encontrado');
        }

        state.currentUser = user;
        state.currentUserData = userData;
        state.currentRole = role;

        if (role === 'administrador') {
            document.getElementById('adminNameDisplay').textContent = userData.nombre || user.email.split('@')[0];
            switchScreen('adminScreen');
            loadAdminData();
        } else {
            document.getElementById('userNameDisplay').textContent = userData.nombre || user.email.split('@')[0];
            switchScreen('limpiezaScreen');
            loadHistorial();
        }

        showToast('Sesión iniciada correctamente', 'success');
    } catch (error) {
        console.error('Error login:', error);
        if (error.message.includes('inactivo')) {
            loginError.textContent = 'Usuario inactivo. Contacta al administrador.';
        } else {
            loginError.textContent = 'Credenciales incorrectas. Intenta de nuevo.';
        }
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
        submitBtn.disabled = false;
    }
};

const handleLogout = async () => {
    try {
        state.listeners.forEach(unsubscribe => unsubscribe());
        state.listeners = [];

        await signOut(auth);
        state.currentUser = null;
        state.currentUserData = null;
        state.currentRole = null;
        switchScreen('loginScreen');
        document.getElementById('loginForm').reset();
        document.getElementById('loginError').textContent = '';
        showToast('Sesión cerrada', 'success');
    } catch (error) {
        console.error('Error logout:', error);
        showToast('Error al cerrar sesión', 'error');
    }
};

// ===== ESCANEO QR =====
const handleQRScan = (location) => {
    if (!location) {
        showToast('Selecciona una ubicación', 'error');
        return;
    }

    state.currentLocation = location;
    document.getElementById('modalLocation').textContent = location;
    document.getElementById('reporteModal').classList.add('active');
    document.getElementById('reporteForm').classList.add('hidden');
    document.getElementById('reporteDescripcion').value = '';
};

const handleNoReporte = async () => {
    try {
        await addDoc(collection(db, 'registros'), {
            ubicacion: state.currentLocation,
            fecha: Timestamp.now(),
            usuario: state.currentUser.email,
            tieneReporte: false,
            reporte: null
        });

        document.getElementById('reporteModal').classList.remove('active');
        showToast('Registro guardado correctamente', 'success');
        loadHistorial();
    } catch (error) {
        console.error('Error al guardar:', error);
        showToast('Error al guardar el registro', 'error');
    }
};

const handleSiReporte = () => {
    document.getElementById('reporteForm').classList.remove('hidden');
};

const handleSubmitReporte = async () => {
    const descripcion = document.getElementById('reporteDescripcion').value.trim();

    if (!descripcion) {
        showToast('Describe el problema', 'error');
        return;
    }

    try {
        await addDoc(collection(db, 'registros'), {
            ubicacion: state.currentLocation,
            fecha: Timestamp.now(),
            usuario: state.currentUser.email,
            tieneReporte: true,
            reporte: descripcion
        });

        document.getElementById('reporteModal').classList.remove('active');
        showToast('Reporte registrado correctamente', 'success');
        loadHistorial();
    } catch (error) {
        console.error('Error al guardar reporte:', error);
        showToast('Error al guardar el reporte', 'error');
    }
};

// ===== HISTORIAL =====
const loadHistorial = async () => {
    const historialList = document.getElementById('historialList');
    historialList.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando...</p></div>';

    try {
        const q = query(
            collection(db, 'registros'),
            where('usuario', '==', state.currentUser.email),
            orderBy('fecha', 'desc'),
            limit(50)
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            historialList.innerHTML = '<div class="empty-state"><i class="fas fa-clipboard"></i><p>No hay registros todavía</p></div>';
            return;
        }

        historialList.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            historialList.appendChild(createHistorialItem(data));
        });
    } catch (error) {
        console.error('Error al cargar historial:', error);
        historialList.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Error al cargar el historial</p></div>';
    }
};

const createHistorialItem = (data) => {
    const item = document.createElement('div');
    item.className = `historial-item ${data.tieneReporte ? 'con-reporte' : ''}`;

    item.innerHTML = `
        <div class="historial-header">
            <div class="historial-ubicacion">${data.ubicacion}</div>
            <div class="historial-fecha">${formatDate(data.fecha)}</div>
        </div>
        <div class="historial-info">
            <span><i class="fas fa-clock"></i> ${formatTime(data.fecha)}</span>
            <span><i class="fas fa-user"></i> ${data.usuario.split('@')[0]}</span>
        </div>
        ${data.tieneReporte ? `<div class="historial-reporte"><strong>Reporte:</strong> ${data.reporte}</div>` : ''}
    `;

    return item;
};

// ===== PANEL ADMIN =====
const loadAdminData = () => {
    loadAdminStats();
    loadBanosStatus();
    loadReportes();
    loadUsuarios();
    loadAdminHistorial();
    setupAdminFilters();
};

const loadAdminStats = async () => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const q = query(
            collection(db, 'registros'),
            where('fecha', '>=', Timestamp.fromDate(today))
        );

        const snapshot = await getDocs(q);
        const registros = snapshot.docs.map(doc => doc.data());

        document.getElementById('totalLimpiezas').textContent = registros.length;
        document.getElementById('totalReportes').textContent = registros.filter(r => r.tieneReporte).length;
    } catch (error) {
        console.error('Error al cargar estadísticas:', error);
    }
};

const loadBanosStatus = async () => {
    const banosStatus = document.getElementById('banosStatus');
    banosStatus.innerHTML = '';

    try {
        for (const bano of BATHROOMS) {
            const q = query(
                collection(db, 'registros'),
                where('ubicacion', '==', bano),
                orderBy('fecha', 'desc'),
                limit(1)
            );

            const snapshot = await getDocs(q);
            let statusClass = 'danger';
            let statusText = 'Sin registros';

            if (!snapshot.empty) {
                const lastRecord = snapshot.docs[0].data();
                statusClass = getTimeElapsed(lastRecord.fecha);
                statusText = `Última limpieza: ${formatDate(lastRecord.fecha)} - ${formatTime(lastRecord.fecha)}`;
            }

            const card = document.createElement('div');
            card.className = `bano-card ${statusClass}`;
            card.innerHTML = `
                <div class="bano-nombre">${bano}</div>
                <div class="bano-status">${statusText}</div>
            `;
            banosStatus.appendChild(card);
        }
    } catch (error) {
        console.error('Error al cargar estado de sanitarios:', error);
    }
};

const loadReportes = async () => {
    const reportesList = document.getElementById('reportesList');
    reportesList.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i></div>';

    try {
        const q = query(
            collection(db, 'registros'),
            where('tieneReporte', '==', true),
            orderBy('fecha', 'desc'),
            limit(10)
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            reportesList.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><p>No hay reportes pendientes</p></div>';
            return;
        }

        reportesList.innerHTML = '';
        snapshot.forEach((doc) => {
            const data = doc.data();
            const docId = doc.id;
            const card = document.createElement('div');
            card.className = `reporte-card ${data.revisado ? 'revisado' : ''}`;

            card.innerHTML = `
                <div class="reporte-header">
                    <div class="reporte-ubicacion">${data.ubicacion}</div>
                    <div class="reporte-fecha">${formatDate(data.fecha)} ${formatTime(data.fecha)}</div>
                </div>
                <div class="reporte-descripcion">${data.reporte}</div>
                <div style="margin-top: 8px; font-size: 12px; opacity: 0.8;">
                    <i class="fas fa-user"></i> ${data.usuario.split('@')[0]}
                </div>
                ${data.revisado ? `
                    <div style="margin-top: 8px; padding: 8px; background: #d1fae5; border-radius: 6px; font-size: 12px; color: #065f46;">
                        <i class="fas fa-check-circle"></i> Revisado por: ${data.revisadoPor} el ${formatDate(data.fechaRevision)} a las ${formatTime(data.fechaRevision)}
                    </div>
                ` : `
                    <button class="btn-revisar" onclick="marcarComoRevisado('${docId}')">
                        <i class="fas fa-check"></i> Marcar como Revisado
                    </button>
                `}
            `;
            reportesList.appendChild(card);
        });
    } catch (error) {
        console.error('Error al cargar reportes:', error);
    }
};

const loadAdminHistorial = async () => {
    const historialList = document.getElementById('adminHistorialList');
    historialList.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i></div>';

    try {
        const q = query(
            collection(db, 'registros'),
            orderBy('fecha', 'desc'),
            limit(50)
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            historialList.innerHTML = '<div class="empty-state"><i class="fas fa-clipboard"></i><p>No hay registros</p></div>';
            return;
        }

        historialList.innerHTML = '';
        snapshot.forEach((doc) => {
            historialList.appendChild(createHistorialItem(doc.data()));
        });
    } catch (error) {
        console.error('Error al cargar historial admin:', error);
    }
};

const setupAdminFilters = () => {
    const filterBano = document.getElementById('filterBano');
    filterBano.innerHTML = '<option value="all">Todos los sanitarios</option>';
    BATHROOMS.forEach(bano => {
        const option = document.createElement('option');
        option.value = bano;
        option.textContent = bano;
        filterBano.appendChild(option);
    });
};

const marcarComoRevisado = async (docId) => {
    try {
        if (!state.currentUserData) {
            showToast('Error: Usuario no identificado', 'error');
            return;
        }

        await updateDoc(doc(db, 'registros', docId), {
            revisado: true,
            revisadoPor: state.currentUserData.nombre || state.currentUser.email.split('@')[0],
            fechaRevision: Timestamp.now()
        });

        showToast('Reporte marcado como revisado', 'success');
        loadReportes();
    } catch (error) {
        console.error('Error al marcar reporte:', error);
        showToast('Error al actualizar el reporte', 'error');
    }
};

// Hacer función global para onclick
window.marcarComoRevisado = marcarComoRevisado;

const exportToExcel = async () => {
    try {
        showToast('Generando archivo Excel...', 'success');

        // Obtener todos los registros
        const qRegistros = query(
            collection(db, 'registros'),
            orderBy('fecha', 'desc')
        );

        const snapshot = await getDocs(qRegistros);

        if (snapshot.empty) {
            showToast('No hay datos para exportar', 'error');
            return;
        }

        // Obtener todos los usuarios para mapear email -> nombre
        const qUsuarios = query(collection(db, 'usuarios'));
        const usuariosSnapshot = await getDocs(qUsuarios);

        const usuariosMap = {};
        usuariosSnapshot.forEach((doc) => {
            const userData = doc.data();
            usuariosMap[userData.email] = userData.nombre;
        });

        // Preparar datos para Excel
        const data = [];
        snapshot.forEach((doc) => {
            const registro = doc.data();

            // Obtener nombre del usuario, si no existe usar el email
            const nombreUsuario = usuariosMap[registro.usuario] || registro.usuario.split('@')[0];

            data.push({
                'Fecha': formatDate(registro.fecha),
                'Hora': formatTime(registro.fecha),
                'Ubicación': registro.ubicacion,
                'Usuario': nombreUsuario,
                'Tiene Reporte': registro.tieneReporte ? 'Sí' : 'No',
                'Reporte': registro.reporte || 'N/A',
                'Estado': registro.revisado ? 'Revisado' : 'Pendiente',
                'Revisado Por': registro.revisadoPor || 'N/A'
            });
        });

        // Crear libro de Excel
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);

        // Ajustar ancho de columnas
        ws['!cols'] = [
            { wch: 12 }, // Fecha
            { wch: 8 },  // Hora
            { wch: 30 }, // Ubicación
            { wch: 25 }, // Usuario
            { wch: 14 }, // Tiene Reporte
            { wch: 40 }, // Reporte
            { wch: 12 }, // Estado
            { wch: 25 }  // Revisado Por
        ];

        XLSX.utils.book_append_sheet(wb, ws, "Registros");

        // Generar nombre de archivo con fecha
        const fecha = new Date().toISOString().split('T')[0];
        const fileName = `Registros_Limpieza_${fecha}.xlsx`;

        // Descargar archivo
        XLSX.writeFile(wb, fileName);

        showToast('Archivo Excel descargado correctamente', 'success');
    } catch (error) {
        console.error('Error al exportar a Excel:', error);
        showToast('Error al generar archivo Excel', 'error');
    }
};

// ===== GESTIÓN DE USUARIOS =====
let currentEditingUserId = null;

const loadUsuarios = async () => {
    const usuariosList = document.getElementById('usuariosList');
    usuariosList.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i></div>';

    try {
        const q = query(collection(db, 'usuarios'), orderBy('fechaCreacion', 'desc'));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            usuariosList.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>No hay usuarios registrados</p></div>';
            return;
        }

        usuariosList.innerHTML = '';
        snapshot.forEach((doc) => {
            const userData = doc.data();
            usuariosList.appendChild(createUsuarioCard(doc.id, userData));
        });
    } catch (error) {
        console.error('Error al cargar usuarios:', error);
        usuariosList.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Error al cargar usuarios</p></div>';
    }
};

const createUsuarioCard = (userId, userData) => {
    const card = document.createElement('div');
    card.className = `usuario-card ${!userData.activo ? 'inactivo' : ''}`;

    const ultimoAcceso = userData.ultimoAcceso ? formatDate(userData.ultimoAcceso) + ' ' + formatTime(userData.ultimoAcceso) : 'Nunca';

    card.innerHTML = `
        <div class="usuario-header">
            <div class="usuario-info">
                <h4>${userData.nombre}</h4>
                <p>${userData.email}</p>
            </div>
            <span class="usuario-badge ${userData.rol}">${userData.rol === 'administrador' ? 'Admin' : 'Limpieza'}</span>
        </div>
        <div class="usuario-meta">
            <span><i class="fas fa-calendar"></i> Creado: ${formatDate(userData.fechaCreacion)}</span>
            <span><i class="fas fa-clock"></i> Último acceso: ${ultimoAcceso}</span>
        </div>
        <div class="usuario-actions">
            <button class="btn-icon-text" onclick="editUsuario('${userId}', ${JSON.stringify(userData).replace(/"/g, '&quot;')})">
                <i class="fas fa-edit"></i> Editar
            </button>
            <button class="btn-icon-text" onclick="toggleUsuarioActivo('${userId}', ${!userData.activo})">
                <i class="fas fa-${userData.activo ? 'ban' : 'check'}"></i> ${userData.activo ? 'Desactivar' : 'Activar'}
            </button>
        </div>
    `;

    return card;
};

const editUsuario = (userId, userData) => {
    currentEditingUserId = userId;
    document.getElementById('usuarioModalTitle').textContent = 'Editar Usuario';
    document.getElementById('usuarioEmail').value = userData.email;
    document.getElementById('usuarioEmail').disabled = true;
    document.getElementById('usuarioNombre').value = userData.nombre;
    document.getElementById('usuarioRol').value = userData.rol;
    document.getElementById('usuarioActivo').value = userData.activo.toString();

    // Ocultar campo de contraseña al editar
    const passwordGroup = document.getElementById('passwordGroup');
    const passwordInput = document.getElementById('usuarioPassword');
    passwordGroup.style.display = 'none';
    passwordInput.removeAttribute('required');

    document.getElementById('usuarioModal').classList.add('active');
};

const toggleUsuarioActivo = async (userId, nuevoEstado) => {
    try {
        await updateDoc(doc(db, 'usuarios', userId), {
            activo: nuevoEstado
        });
        showToast(`Usuario ${nuevoEstado ? 'activado' : 'desactivado'} correctamente`, 'success');
        loadUsuarios();
    } catch (error) {
        console.error('Error al actualizar usuario:', error);
        showToast('Error al actualizar el usuario', 'error');
    }
};

const handleUsuarioFormSubmit = async (e) => {
    e.preventDefault();

    const email = document.getElementById('usuarioEmail').value;
    const password = document.getElementById('usuarioPassword').value;
    const nombre = document.getElementById('usuarioNombre').value;
    const rol = document.getElementById('usuarioRol').value;
    const activo = document.getElementById('usuarioActivo').value === 'true';

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;

    try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Guardando...';

        if (currentEditingUserId) {
            // Actualizar usuario existente
            await updateDoc(doc(db, 'usuarios', currentEditingUserId), {
                nombre,
                rol,
                activo
            });
            showToast('Usuario actualizado correctamente', 'success');
        } else {
            // Crear nuevo usuario en Firebase Authentication
            if (!password || password.length < 6) {
                showToast('La contraseña debe tener al menos 6 caracteres', 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                return;
            }

            // Guardar credenciales del admin actual ANTES de crear el nuevo usuario
            const adminEmail = state.currentUser.email;

            // Solicitar contraseña del admin para re-autenticarlo después
            const adminPassword = await new Promise((resolve, reject) => {
                const adminPasswordModal = document.createElement('div');
                adminPasswordModal.className = 'modal active';
                adminPasswordModal.innerHTML = `
                    <div class="modal-content" style="max-width: 400px;">
                        <div class="modal-header">
                            <h3>Confirmar Identidad</h3>
                        </div>
                        <div class="modal-body">
                            <p style="margin-bottom: 16px; color: var(--text-secondary);">
                                Para crear un usuario, confirma tu contraseña de administrador:
                            </p>
                            <div class="form-group">
                                <label>Tu Contraseña</label>
                                <div class="password-input-wrapper">
                                    <input type="password" id="adminPasswordConfirm" placeholder="Contraseña de administrador" required>
                                    <button type="button" class="toggle-password-inline" onclick="togglePassword('adminPasswordConfirm')">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="modal-actions">
                                <button type="button" id="cancelAdminPassword" class="btn-secondary">Cancelar</button>
                                <button type="button" id="confirmAdminPassword" class="btn-primary">Confirmar</button>
                            </div>
                        </div>
                    </div>
                `;

                document.body.appendChild(adminPasswordModal);

                document.getElementById('confirmAdminPassword').onclick = () => {
                    const pwd = document.getElementById('adminPasswordConfirm').value;
                    if (pwd) {
                        document.body.removeChild(adminPasswordModal);
                        resolve(pwd);
                    } else {
                        showToast('Debes ingresar tu contraseña', 'error');
                    }
                };

                document.getElementById('cancelAdminPassword').onclick = () => {
                    document.body.removeChild(adminPasswordModal);
                    reject(new Error('Cancelado por el usuario'));
                };
            });

            // Crear usuario nuevo (esto cambiará temporalmente la sesión)
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const newUser = userCredential.user;

            // Crear documento en Firestore para el nuevo usuario
            await setDoc(doc(db, 'usuarios', newUser.uid), {
                email: email,
                nombre: nombre,
                rol: rol,
                activo: activo,
                fechaCreacion: Timestamp.now(),
                ultimoAcceso: null
            });

            // Cerrar sesión del usuario recién creado
            await signOut(auth);

            // Re-autenticar al administrador con su contraseña
            await signInWithEmailAndPassword(auth, adminEmail, adminPassword);

            showToast('Usuario creado correctamente', 'success');

            // Recargar lista de usuarios
            loadUsuarios();
        }

        document.getElementById('usuarioModal').classList.remove('active');
        document.getElementById('usuarioForm').reset();
        currentEditingUserId = null;
    } catch (error) {
        console.error('Error al guardar usuario:', error);

        // Mensajes de error específicos
        let errorMessage = 'Error al guardar el usuario';
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Este email ya está registrado';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Email inválido';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'La contraseña es muy débil';
        }

        showToast(errorMessage, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
};

// Hacer funciones globales para onclick
window.editUsuario = editUsuario;
window.toggleUsuarioActivo = toggleUsuarioActivo;

// ===== TOGGLE PASSWORD =====
const togglePassword = (inputId) => {
    const input = document.getElementById(inputId);
    const button = input.nextElementSibling;

    if (!button || !button.classList.contains('toggle-password') && !button.classList.contains('toggle-password-inline')) {
        // Si no hay botón adyacente, buscar en el wrapper
        const wrapper = input.parentElement;
        const btn = wrapper.querySelector('.toggle-password-inline');
        if (btn) {
            togglePasswordLogic(input, btn);
        }
    } else {
        togglePasswordLogic(input, button);
    }
};

const togglePasswordLogic = (input, button) => {
    const icon = button.querySelector('i');

    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
};

// Hacer función global
window.togglePassword = togglePassword;

// ===== NAVEGACIÓN =====
const setupNavigation = () => {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const tab = e.currentTarget.dataset.tab;

            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            e.currentTarget.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.getElementById(`${tab}Tab`).classList.add('active');

            if (tab === 'historial') {
                loadHistorial();
            }
        });
    });
};

// ===== INICIALIZACIÓN =====
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('logoutAdminBtn').addEventListener('click', handleLogout);

    document.getElementById('scanBtn').addEventListener('click', startQRScanner);

    document.getElementById('stopScanBtn').addEventListener('click', stopQRScanner);

    document.getElementById('closeModal').addEventListener('click', () => {
        document.getElementById('reporteModal').classList.remove('active');
    });

    document.getElementById('noReporteBtn').addEventListener('click', handleNoReporte);
    document.getElementById('siReporteBtn').addEventListener('click', handleSiReporte);
    document.getElementById('submitReporteBtn').addEventListener('click', handleSubmitReporte);

    // Gestión de usuarios
    document.getElementById('btnAgregarUsuario').addEventListener('click', () => {
        currentEditingUserId = null;
        document.getElementById('usuarioModalTitle').textContent = 'Agregar Usuario';
        document.getElementById('usuarioEmail').disabled = false;
        document.getElementById('usuarioForm').reset();

        // Mostrar y requerir campo de contraseña al crear nuevo usuario
        const passwordGroup = document.getElementById('passwordGroup');
        const passwordInput = document.getElementById('usuarioPassword');
        passwordGroup.style.display = 'flex';
        passwordInput.setAttribute('required', '');

        document.getElementById('usuarioModal').classList.add('active');
    });

    document.getElementById('closeUsuarioModal').addEventListener('click', () => {
        document.getElementById('usuarioModal').classList.remove('active');
    });

    document.getElementById('cancelUsuarioBtn').addEventListener('click', () => {
        document.getElementById('usuarioModal').classList.remove('active');
    });

    document.getElementById('usuarioForm').addEventListener('submit', handleUsuarioFormSubmit);

    document.getElementById('exportExcelBtn').addEventListener('click', exportToExcel);

    setupNavigation();

    // Manejar persistencia de sesión
    const loadingScreen = document.getElementById('loadingScreen');

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                // Usuario autenticado, cargar sus datos
                const userData = await getUserFromFirestore(user.uid);

                if (!userData || !userData.activo) {
                    // Usuario inactivo, cerrar sesión
                    await signOut(auth);
                    showToast('Usuario inactivo. Contacta al administrador.', 'error');
                    switchScreen('loginScreen');
                    loadingScreen.classList.add('hidden');
                    return;
                }

                state.currentUser = user;
                state.currentUserData = userData;
                state.currentRole = userData.rol;

                // Actualizar último acceso
                await updateDoc(doc(db, 'usuarios', user.uid), {
                    ultimoAcceso: Timestamp.now()
                });

                // Redirigir a la pantalla correcta según el rol
                if (userData.rol === 'administrador') {
                    document.getElementById('adminNameDisplay').textContent = userData.nombre || user.email.split('@')[0];
                    switchScreen('adminScreen');
                    loadAdminData();
                } else {
                    document.getElementById('userNameDisplay').textContent = userData.nombre || user.email.split('@')[0];
                    switchScreen('limpiezaScreen');
                    loadHistorial();
                }

                // Ocultar pantalla de carga
                loadingScreen.classList.add('hidden');
            } catch (error) {
                console.error('Error al restaurar sesión:', error);
                switchScreen('loginScreen');
                loadingScreen.classList.add('hidden');
            }
        } else {
            // No hay usuario autenticado
            switchScreen('loginScreen');
            loadingScreen.classList.add('hidden');
        }
    });
});
