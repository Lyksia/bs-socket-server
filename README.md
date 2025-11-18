# Socket.IO Server - Brainstorm

Serveur Socket.IO standalone pour le jeu Brainstorm. Peut être déployé indépendamment du projet Next.js.

## Architecture

```
Next.js (Vercel)          Socket.IO Server (VPS)
├── Frontend              ├── WebSocket Server (port 3001)
├── API Routes            ├── Game Logic
└── SSR/SSG               └── Real-time Events
         ↓                         ↓
         └─────── PostgreSQL ──────┘
              (Base de données partagée)
```

## Installation

### 1. Copier les fichiers

Le dossier `socket-server/` contient tout le nécessaire pour fonctionner de manière autonome.

### 2. Installer les dépendances

```bash
cd socket-server
npm install
```

### 3. Configurer l'environnement

Copier `.env.example` vers `.env` :

```bash
cp .env.example .env
```

Éditer `.env` avec vos valeurs :

```env
# IMPORTANT: Même DATABASE_URL que le projet Next.js
DATABASE_URL="postgresql://user:password@host:5432/database"

# Port du serveur
PORT=3001

# URLs autorisées (CORS)
FRONTEND_URL="https://votre-app.vercel.app"
NEXT_PUBLIC_APP_URL="https://votre-app.vercel.app"

# Environnement
NODE_ENV="production"
```

### 4. Générer le client Prisma

```bash
npm run build
```

**Note** : Les migrations sont gérées par le projet Next.js. Le socket-server utilise uniquement `prisma generate`.

## Utilisation

### Développement

```bash
npm run dev
```

Le serveur démarre sur `http://localhost:3001` avec hot-reload.

### Production

```bash
npm start
```

## Déploiement sur VPS

### Option 1 : PM2 (Recommandé)

```bash
# Installer PM2
npm install -g pm2

# Démarrer le serveur
pm2 start server.ts --name brainstorm-socket --interpreter tsx

# Sauvegarder la configuration
pm2 save

# Démarrage automatique au boot
pm2 startup
```

### Option 2 : SystemD

Créer `/etc/systemd/system/brainstorm-socket.service` :

```ini
[Unit]
Description=Brainstorm Socket.IO Server
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/socket-server
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Activer et démarrer :

```bash
sudo systemctl enable brainstorm-socket
sudo systemctl start brainstorm-socket
```

### Option 3 : Docker

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npx prisma generate

EXPOSE 3001

CMD ["npm", "start"]
```

## Mise à jour du schéma Prisma

Quand le schéma Prisma est modifié dans le projet Next.js :

1. **Next.js** : Exécuter les migrations
   ```bash
   npx prisma migrate dev --name update_schema
   ```

2. **Socket-server** : Copier le nouveau schema et régénérer
   ```bash
   # Sur le VPS
   cp ../prisma/schema.prisma ./prisma/schema.prisma
   npx prisma generate
   pm2 restart brainstorm-socket
   ```

## Endpoints

### WebSocket
- `ws://localhost:3001/socket.io/`

### HTTP (Health check)
- `GET /health` - Vérifie que le serveur est en ligne

### HTTP (Emit events - usage interne)
- `POST /emit` - Permet à l'API Next.js d'émettre des événements Socket.IO

## Variables d'environnement

| Variable | Description | Exemple |
|----------|-------------|---------|
| `DATABASE_URL` | URL PostgreSQL (même que Next.js) | `postgresql://...` |
| `PORT` | Port du serveur | `3001` |
| `FRONTEND_URL` | URL du frontend (CORS) | `https://app.vercel.app` |
| `NEXT_PUBLIC_APP_URL` | URL publique (CORS) | `https://app.vercel.app` |
| `NODE_ENV` | Environnement | `production` |

## Structure

```
socket-server/
├── server.ts              # Point d'entrée
├── init.ts                # Initialisation Socket.IO
├── types.ts               # Types TypeScript partagés
├── package.json           # Dépendances
├── tsconfig.json          # Config TypeScript
├── .env.example           # Variables d'environnement
├── handlers/              # Gestionnaires d'événements
│   ├── game-handler.ts    # Logique de jeu
│   └── session-handler.ts # Gestion des sessions
├── lib/                   # Logique métier
│   ├── prisma.ts          # Client Prisma
│   └── game/              # GameSessionManager
└── prisma/
    └── schema.prisma      # Schéma de base de données

```

## Logs

Les logs sont écrits sur stdout/stderr. En production avec PM2 :

```bash
# Voir les logs en temps réel
pm2 logs brainstorm-socket

# Voir les derniers logs
pm2 logs brainstorm-socket --lines 100
```

## Troubleshooting

### Le serveur ne démarre pas

Vérifier que :
- `DATABASE_URL` est correctement configuré
- Le port 3001 n'est pas déjà utilisé
- Les dépendances sont installées (`npm install`)
- Prisma client est généré (`npm run build`)

### Erreurs de connexion depuis Next.js

Vérifier que :
- Les CORS sont correctement configurés (FRONTEND_URL)
- Le firewall autorise le port 3001
- Le client Socket.IO pointe vers la bonne URL

### Erreurs Prisma

```bash
# Régénérer le client
npx prisma generate

# Vérifier la connexion à la base
npx prisma db pull
```

## Support

Pour plus d'informations, consulter la documentation du projet principal.
