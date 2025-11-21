// ===== IMPORTS =====
import { auth, db } from './firebase-config.js';
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
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
    'Planta Baja - Baño Hombres',
    'Planta Baja - Baño Mujeres',
    'Piso 1 - Baño Hombres',
    'Piso 1 - Baño Mujeres',
    'Piso 2 - Baño Hombres',
    'Piso 2 - Baño Mujeres'
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
        console.error('Error al cargar estado de baños:', error);
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
            const card = document.createElement('div');
            card.className = 'reporte-card';
            card.innerHTML = `
                <div class="reporte-header">
                    <div class="reporte-ubicacion">${data.ubicacion}</div>
                    <div class="reporte-fecha">${formatDate(data.fecha)} ${formatTime(data.fecha)}</div>
                </div>
                <div class="reporte-descripcion">${data.reporte}</div>
                <div style="margin-top: 8px; font-size: 12px; opacity: 0.8;">
                    <i class="fas fa-user"></i> ${data.usuario.split('@')[0]}
                </div>
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
    filterBano.innerHTML = '<option value="all">Todos los baños</option>';
    BATHROOMS.forEach(bano => {
        const option = document.createElement('option');
        option.value = bano;
        option.textContent = bano;
        filterBano.appendChild(option);
    });
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

    const nombre = document.getElementById('usuarioNombre').value;
    const rol = document.getElementById('usuarioRol').value;
    const activo = document.getElementById('usuarioActivo').value === 'true';

    try {
        if (currentEditingUserId) {
            // Actualizar usuario existente
            await updateDoc(doc(db, 'usuarios', currentEditingUserId), {
                nombre,
                rol,
                activo
            });
            showToast('Usuario actualizado correctamente', 'success');
        } else {
            // Crear nuevo usuario (nota: solo actualiza Firestore, debe crear en Auth manualmente)
            showToast('Para crear usuarios, primero créalos en Firebase Authentication. Al iniciar sesión se registrarán automáticamente.', 'error');
            document.getElementById('usuarioModal').classList.remove('active');
            return;
        }

        document.getElementById('usuarioModal').classList.remove('active');
        document.getElementById('usuarioForm').reset();
        currentEditingUserId = null;
        loadUsuarios();
    } catch (error) {
        console.error('Error al guardar usuario:', error);
        showToast('Error al guardar el usuario', 'error');
    }
};

// Hacer funciones globales para onclick
window.editUsuario = editUsuario;
window.toggleUsuarioActivo = toggleUsuarioActivo;

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

    document.getElementById('scanBtn').addEventListener('click', () => {
        document.getElementById('qrInput').click();
    });

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
        document.getElementById('usuarioModal').classList.add('active');
    });

    document.getElementById('closeUsuarioModal').addEventListener('click', () => {
        document.getElementById('usuarioModal').classList.remove('active');
    });

    document.getElementById('cancelUsuarioBtn').addEventListener('click', () => {
        document.getElementById('usuarioModal').classList.remove('active');
    });

    document.getElementById('usuarioForm').addEventListener('submit', handleUsuarioFormSubmit);

    setupNavigation();

    onAuthStateChanged(auth, (user) => {
        if (user) {
            state.currentUser = user;
        } else {
            switchScreen('loginScreen');
        }
    });
});
