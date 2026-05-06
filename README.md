# Rolmix - Gestor de Sesiones de Rol

![Rolmix](./assets/icon.png)

Una aplicación móvil completa para gestionar sesiones de Dungeons & Dragons y otras campañas de rol. Rolmix ofrece herramientas intuitivas para dirección de juego, gestión de personajes, combate táctico y mapas interactivos.

## 🎮 Características Principales

### 📊 Gestión de Sesiones
- Crear y administrar múltiples sesiones de campaña
- Chat en tiempo real entre jugadores y el director
- Sincronización en tiempo real de eventos de sesión
- Historial completo de sesiones y eventos
- Gestión de participantes y roles

### 👥 Gestión de Personajes
- Editor visual completo de personajes
- Seguimiento de atributos, habilidades y competencias
- Historial de experiencia y progresión
- Sincronización multiusuario en tiempo real
- Soporte para múltiples sistemas de reglas

### ⚔️ Sistema de Combate
- Rastreador de combate en tiempo real con sincronización instantánea
- Seguimiento de iniciativa actualizado en vivo
- Daño y resolución de acciones inmediatas
- Modal de acciones de combate sincronizado
- Historial de tiradas compartido en tiempo real

### 🗺️ Mapas Interactivos
- Canvas de mapa personalizable con actualizaciones en tiempo real
- Carga de imágenes de fondo
- Soporte para múltiples capas
- Integración con sistema de mapas sincronizado

### 🎲 Generador de Encuentros
- Constructor visual de encuentros con cambios en vivo
- Selector de monstruos
- Gestión de dificultad
- Importación de bestiarios

### 🎭 Multilenguaje de Reglas
Soporte completo para:
- **D&D 3.5** - Sistema clásico completo
- **D&D 5e** - Edición más reciente
- **Pathfinder** - Sistema compatible

## 📋 Requisitos Previos

### Software Necesario
- **Node.js** v18+ o superior
- **npm** o **yarn**
- **Expo CLI** (`npm install -g expo-cli`)
- **Git**

### Para Desarrollo Móvil
- **Android Studio** (para desarrollo en Android)
- **Xcode** (para desarrollo en iOS - Mac solamente)
- **Java Development Kit (JDK)** 11+

### Cuentas Externas
- Cuenta en **Supabase** para backend (autenticación y base de datos)

## 🚀 Instalación

### 1. Clonar el Repositorio
```bash
git clone https://github.com/tuusuario/rolmix.git
cd rolmix
```

### 2. Instalar Dependencias
```bash
npm install
# o
yarn install
```

### 3. Configurar Variables de Entorno
Crear archivo `.env.local` en la raíz del proyecto:
```env
EXPO_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=tu-clave-anonima-aqui
```

Obtener estas credenciales de tu proyecto Supabase (Settings > API).

### 4. Iniciar la Aplicación

#### En Desarrollo Web
```bash
npm run web
```
Abrirá http://localhost:8081 automáticamente.

#### En Android (Emulador)
```bash
npm run android
```
Asegúrate de tener Android Studio y un emulador corriendo.

#### En iOS (Mac solamente)
```bash
npm run ios
```

#### Build con EAS (Recomendado para Dispositivos Reales)
```bash
# Instalar EAS CLI
npm install -g eas-cli

# Iniciar sesión
eas login

# Build para Android
eas build --platform android

# Build para iOS
eas build --platform ios

# Build para ambas plataformas
eas build --platform all
```

EAS Build compila la aplicación en la nube y proporciona archivos APK/IPA descargables.

## 📁 Estructura del Proyecto

```
rolmix/
├── App.tsx                          # Componente raíz
├── package.json                     # Dependencias del proyecto
├── tsconfig.json                    # Configuración TypeScript
├── app.json                         # Configuración Expo
├── eas.json                         # Configuración EAS Build
│
├── assets/                          # Recursos estáticos
│   ├── icon.png                     # Icono de la app
│   ├── splash-icon.png              # Pantalla de carga
│   └── adaptive-icon.png            # Icono adaptativo Android
│
├── screens/                         # Pantallas principales
│   ├── AuthScreen.tsx               # Autenticación
│   ├── RoomsScreen.tsx              # Gestión de sesiones
│   ├── ChatScreen.tsx               # Chat de sesión
│   ├── CharactersScreen.tsx         # Listado de personajes
│   └── CharacterEditorScreen.tsx    # Editor de personajes
│
├── components/                      # Componentes reutilizables
│   ├── MessageBubble.tsx            # Burbuja de chat
│   ├── MessageInput.tsx             # Entrada de mensajes
│   ├── chat/                        # Componentes de chat
│   │   ├── CharacterPickerModal.tsx
│   │   ├── CombatActionModal.tsx
│   │   ├── CombatTrackerPanel.tsx
│   │   ├── DamageResolutionModal.tsx
│   │   ├── EncounterBuilderModal.tsx
│   │   ├── MonsterPickerModal.tsx
│   │   ├── RollList.tsx
│   │   ├── RollPanelModal.tsx
│   │   ├── SessionDrawer.tsx
│   │   └── chatStyles.ts
│   └── map/                         # Componentes de mapas
│       └── MapCanvas.tsx
│
├── hooks/                           # Hooks personalizados
│   ├── useAuth.ts                   # Gestión de autenticación
│   ├── useCombat.ts                 # Lógica de combate
│   ├── useMap.ts                    # Gestión de mapas
│   ├── useSessionChat.ts            # Chat de sesión
│   ├── useSessionEncounters.ts      # Encuentros
│   ├── useSessionRoster.ts          # Participantes
│   └── useRoster.ts                 # Gestión de participantes
│
├── lib/                             # Utilidades y helpers
│   ├── supabase.ts                  # Cliente de Supabase
│   ├── mapStorage.ts                # Almacenamiento de mapas
│   ├── types.ts                     # Tipos globales
│   ├── actions/                     # Acciones de servidor
│   ├── catalog/                     # Catálogo de contenido
│   └── systems/                     # Sistemas de reglas
│       ├── index.ts
│       ├── dnd35.ts                 # D&D 3.5
│       ├── dnd5e.ts                 # D&D 5e
│       ├── pathfinder.ts            # Pathfinder
│       ├── aggregate.ts
│       └── types.ts
│
├── data/                            # Datos de contenido
│   ├── dnd35/                       # Sistema D&D 3.5
│   │   ├── classes.json
│   │   ├── equipment.json
│   │   ├── feats.json
│   │   ├── languages.json
│   │   ├── magic-items.json
│   │   ├── monsters.json
│   │   ├── mundane-items.json
│   │   ├── races.json
│   │   ├── skills.json
│   │   └── spells.json
│   ├── dnd5e/                       # Sistema D&D 5e
│   │   ├── equipment.json
│   │   └── spells.json
│   ├── pathfinder/                  # Sistema Pathfinder
│   │   ├── equipment.json
│   │   └── spells.json
│   └── raw/                         # Datos sin procesar
│
├── supabase/                        # Esquemas y migraciones
│   ├── schema.sql
│   ├── characters.sql
│   ├── combat.sql
│   ├── maps.sql
│   └── session_characters.sql
│
├── scripts/                         # Scripts de utilidad
│   ├── import-complete-db.mjs
│   ├── import-dd35-raw.mjs
│   ├── import-monsters.mjs
│   ├── import-phb-all.mjs
│   └── import-phb-spells.mjs
│
└── android/                         # Configuración Android
    ├── build.gradle
    ├── gradle.properties
    └── app/
        ├── build.gradle
        └── src/
            ├── main/
            ├── debug/
            └── debugOptimized/
```

## 🎯 Uso de la Aplicación

### 1. **Autenticación**
- Inicia sesión o crea una cuenta nueva
- Validación mediante email a través de Supabase
- Gestión segura de sesiones

### 2. **Crear una Sesión**
- Ve a la pantalla de Sesiones
- Selecciona sistema de reglas (D&D 3.5, D&D 5e, Pathfinder)
- Configura los participantes
- Establece el nombre y descripción

### 3. **Crear Personajes**
- Accede a la pantalla de Personajes
- Usa el Editor Visual
- Selecciona raza, clase, y otros atributos según el sistema
- Asigna el personaje a una sesión

### 4. **Gestionar Combate**
- Abre el panel de combate en la sesión
- Crea un encuentro con enemigos
- Registra iniciativa de combatientes
- Resuelve acciones y daño en tiempo real
- Usa tiradas para resoluciones

### 5. **Gestionar Mapas**
- Carga una imagen de fondo
- Usa el canvas para marcar posiciones
- Sincroniza cambios entre jugadores
- Soporta múltiples capas

### 6. **Chat de Sesión**
- Comunícate con otros jugadores
- Incluye información de personajes en mensajes
- Registro completo de la sesión
- Integración con tiradas de combate

## 📊 Sistemas de Reglas Soportados

### D&D 3.5
**Contenido Completo:**
- 13 Clases disponibles
- 11 Razas
- 680+ Hechizos
- 650+ Talentos
- 2000+ Monstruos
- Equipamiento completo (mágico y mundano)
- Idiomas de campaña

**Basado en:**
- Player's Handbook
- Monster Manual
- Complete series books

### D&D 5ª Edición
**Contenido:**
- Clases y razas oficiales
- Hechizos según SRD 5.1
- Equipamiento oficial
- Compatibilidad con UA (Unearthed Arcana)

### Pathfinder
**Contenido:**
- Compatible con Pathfinder 1e
- Hechizos expandidos
- Equipo especializado

## 🔧 Configuración Avanzada

### Base de Datos (Supabase)

#### Crear la Base de Datos
```bash
# 1. En Supabase console, ejecutar los scripts en orden:
# - supabase/schema.sql (tablas principales)
# - supabase/characters.sql (personajes)
# - supabase/combat.sql (combate)
# - supabase/maps.sql (mapas)
# - supabase/session_characters.sql (asociaciones)
```

#### Importar Datos de Contenido
```bash
# Importar D&D 3.5 completo
node scripts/import-complete-db.mjs

# Importar monstruos
node scripts/import-monsters.mjs

# Importar hechizos PHB
node scripts/import-phb-spells.mjs

# Importar todo de PHB
node scripts/import-phb-all.mjs
```

### Compilación para Distribución

#### EAS Build (Recomendado)
```bash
# Construcción en la nube para iOS/Android
npm install -g eas-cli
eas login
eas build --platform ios
eas build --platform android
```

#### Build Local (Android)
```bash
npm run android
# Seguir instrucciones de compilación de Gradle
```

## 📚 Documentación Técnica

### Tipos de Datos Principales
Ver [lib/types.ts](./lib/types.ts) para:
- Esquema de personajes
- Estructura de combate
- Datos de sesión
- Tipos de hechizos

### Hooks Personalizados
- `useAuth()` - Gestión de autenticación
- `useCombat()` - Lógica de combate
- `useSessionChat()` - Chat y eventos
- `useSessionEncounters()` - Encuentros
- `useMap()` - Mapas interactivos

### Catálogo de Contenido
Ver [lib/catalog/index.ts](./lib/catalog/index.ts) para acceder a:
- Clases disponibles
- Razas
- Hechizos
- Monstruos
- Equipo

## 🐛 Solución de Problemas

### Error de Conexión a Supabase
```
Verifica que EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY
sean correctas en .env.local
```

### Problemas en Android
```bash
# Limpiar caché de Gradle
./gradlew clean

# Reconstruir
npm run android
```

### Problemas en desarrollo web
```bash
# Limpiar caché de Expo
npm start -- -c

# Reconstruir
npm run web
```

### Base de datos vacía
```bash
# Ejecutar scripts de importación
node scripts/import-complete-db.mjs
```

## 🔐 Seguridad

### Autenticación
- Usando Supabase Auth (OAuth2)
- Tokens JWT manejados automáticamente
- Row Level Security (RLS) en base de datos

### Datos Sensibles
- Nunca commitear `.env.local`
- Usar variables de entorno para credenciales
- RLS policies restringen acceso a datos del usuario

### Rate Limiting
- Implementar en próximas versiones
- Actualmente: límites de Supabase

## 📈 Próximos Pasos y Roadmap

### v1.1 (En Desarrollo)
- [ ] Mejoras en la UI del combate
- [ ] Añadir más sistemas de reglas
- [ ] Soporte offline mejorado
- [ ] Integración con Discord

### v1.2
- [ ] Importar contenido desde D&D Beyond
- [ ] Compartir campaña por código de invitación
- [ ] Estadísticas de sesión
- [ ] Grabación de sesiones

### v1.3+
- [ ] Integración con Roll20
- [ ] Soporte para streaming
- [ ] API pública para extensiones
- [ ] Aplicación de escritorio
- [ ] Sincronización de Google Drive
- [ ] Editor visual de mapas avanzado
- [ ] Animaciones 3D de combate

### Características Solicitadas
- [ ] Hojas de personaje personalizables por usuario
- [ ] Sistema de experiencia automático
- [ ] Generador procedural de dungeon
- [ ] Integración de música de fondo
- [ ] Traducción a múltiples idiomas

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📝 Licencia

Este proyecto está bajo licencia MIT - ver archivo [LICENSE](./LICENSE) para detalles.

## 📞 Soporte y Contacto

- 📧 Email: grmoralesp@gmail.app 

## 🙏 Agradecimientos

- Datos de D&D 3.5 de [d20SRD](http://d20srd.org/)
- Iconos de [Expo Icons](https://icons.expo.fyi/)
- Comunidad de React Native

---

**Rolmix** - Donde la magia del rol ocurre. 🎲✨

Última actualización: Mayo 2026
