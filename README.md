# Sistema de Control de Limpieza - Empresarial

Sistema web modular para gestión de limpieza de baños con escaneo QR, reportes y panel administrativo.

## 🚀 Características

### Rol Limpieza
- ✅ Login con Firebase Authentication
- ✅ Escaneo de códigos QR por ubicación
- ✅ Registro automático (fecha, hora, ubicación, usuario)
- ✅ Sistema de reportes de problemas
- ✅ Historial personal ordenado por fecha
- ✅ Filtros de búsqueda

### Rol Administrador
- ✅ Panel de control con estadísticas en tiempo real
- ✅ Vista de estado de todos los baños
- ✅ Indicadores visuales por tiempo transcurrido
- ✅ Panel de reportes activos
- ✅ **Gestión de usuarios** (ver, editar roles, activar/desactivar)
- ✅ Historial general completo
- ✅ Filtros por fecha y ubicación

## 📋 Requisitos Previos

1. **Cuenta Firebase:**
   - Proyecto creado en [Firebase Console](https://console.firebase.google.com/)
   - Authentication habilitado (Email/Password)
   - Firestore Database habilitado

2. **Servidor Web:**
   - Node.js con `http-server` o similar
   - Live Server (VS Code Extension)
   - O cualquier servidor web local

## 🔧 Configuración

### 1. Configurar Firebase

La configuración ya está en `firebase-config.js` con tus credenciales.

### 2. Configurar Firestore

En Firebase Console:
1. Ve a **Firestore Database**
2. Crea la base de datos en modo **producción**
3. Ve a **Reglas** y pega el contenido de `firestore.rules`:

```javascript
// Copia el contenido del archivo firestore.rules
```

### 3. Crear Usuarios

**IMPORTANTE:** Los usuarios se registran automáticamente en Firestore al iniciar sesión por primera vez.

En Firebase Console > Authentication > Users, crea:

**Usuario de Limpieza:**
- Email: `limpieza1@empresa.com`
- Password: `tu_contraseña_segura`

**Usuario Administrador:**
- Email: `admin@empresa.com` (debe contener "admin" para auto-asignar rol)
- Password: `tu_contraseña_segura`

**Puedes crear múltiples usuarios de limpieza:**
- `limpieza1@empresa.com`, `limpieza2@empresa.com`, etc.
- Cada uno tendrá su propio acceso y historial

📖 **Ver [GUIA_USUARIOS.md](GUIA_USUARIOS.md) para más detalles sobre gestión de usuarios**

### 4. Estructura Firestore

La app creará automáticamente dos colecciones:

**Colección `usuarios`:**
```javascript
{
  email: "limpieza1@empresa.com",
  nombre: "limpieza1",
  rol: "limpieza", // o "administrador"
  activo: true,
  fechaCreacion: Timestamp,
  ultimoAcceso: Timestamp
}
```

**Colección `registros`:**
```javascript
{
  ubicacion: "Piso 2 - Baño Hombres",
  fecha: Timestamp,
  usuario: "limpieza1@empresa.com",
  tieneReporte: false,
  reporte: null // o string con descripción
}
```

## 🚀 Ejecución

### Opción 1: Live Server (VS Code)
1. Instala la extensión "Live Server"
2. Click derecho en `index.html` > "Open with Live Server"

### Opción 2: http-server (Node.js)
```bash
npx http-server -p 8080
```

### Opción 3: Python
```bash
python -m http.server 8080
```

Luego abre: `http://localhost:8080`

## 📱 Uso de la Aplicación

### Para Personal de Limpieza:

1. **Login:**
   - Ingresa con tu correo y contraseña
   - Ejemplo: `limpieza@empresa.com`

2. **Escanear QR:**
   - Presiona "Escanear QR" (o usa el simulador para testing)
   - Selecciona la ubicación del baño

3. **Registrar:**
   - **¿Algo que reportar? NO** → Guarda automáticamente
   - **¿Algo que reportar? SÍ** → Describe el problema y registra

4. **Historial:**
   - Ve tus registros ordenados por fecha
   - Filtra por tipo o busca por ubicación

### Para Administradores:

1. **Login:**
   - Ingresa con correo que contenga "admin"
   - Ejemplo: `admin@empresa.com`

2. **Dashboard:**
   - Visualiza estadísticas del día
   - Revisa estado de cada baño (código de colores)
   - Consulta reportes pendientes
   - **Gestiona usuarios:** Ver, editar roles, activar/desactivar
   - Analiza historial completo

## 🎨 Código de Colores (Estado Baños)

- 🟢 **Verde:** Limpieza reciente (< 2 horas)
- 🟡 **Amarillo:** Atención (2-4 horas)
- 🔴 **Rojo:** Requiere limpieza (> 4 horas)

## 📁 Estructura de Archivos

```
RH BAÑOS/
├── index.html           # Estructura HTML (252 líneas)
├── styles.css           # Estilos empresariales (730 líneas)
├── app.js              # Lógica con Firebase (645 líneas)
├── firebase-config.js  # Configuración Firebase
├── firestore.rules     # Reglas de seguridad
├── README.md           # Guía general
└── GUIA_USUARIOS.md    # Guía de gestión de usuarios
```

## 🔒 Seguridad

- ✅ Autenticación requerida para todas las operaciones
- ✅ Sistema de roles desde Firestore (limpieza/administrador)
- ✅ Solo usuarios activos pueden registrar limpiezas
- ✅ Reglas Firestore: usuarios solo leen/escriben sus registros
- ✅ Solo admins pueden modificar/eliminar registros y gestionar usuarios
- ✅ Validación de datos en cliente y servidor

## 🐛 Solución de Problemas

### Error: "CORS policy"
- **Solución:** Usa un servidor web (no abras el HTML directamente)

### Error: "Firebase not initialized"
- **Solución:** Verifica que `firebase-config.js` tenga las credenciales correctas

### No puedo iniciar sesión
- **Solución:** Verifica que el usuario exista en Firebase Authentication

### Los datos no se guardan
- **Solución:** Revisa las reglas de Firestore en Firebase Console

## 📞 Soporte

Para dudas o problemas:
1. Revisa la consola del navegador (F12)
2. Verifica la configuración de Firebase
3. Revisa las reglas de Firestore

## 📄 Licencia

Uso interno empresarial - Turismo y Convenciones SA de CV
