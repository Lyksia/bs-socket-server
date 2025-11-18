# Déploiement sur VPS Ubuntu avec Nginx

Guide complet pour déployer le serveur Socket.IO sur un VPS Ubuntu avec Nginx et SSL.

## Prérequis

- VPS Ubuntu 20.04+ avec accès root/sudo
- Node.js 20+ installé
- Nginx installé
- Domaine `bs-socket.lyksia.com` pointant vers l'IP du VPS (A record)

## 1. Configuration DNS

Avant de commencer, configure ton enregistrement DNS :

```
Type: A
Nom: bs-socket
Valeur: [IP_DE_TON_VPS]
TTL: 3600
```

Vérifie la propagation DNS :
```bash
dig bs-socket.lyksia.com
# ou
nslookup bs-socket.lyksia.com
```

## 2. Installation sur le VPS

### Se connecter au VPS
```bash
ssh user@your-vps-ip
```

### Installer les dépendances système
```bash
# Mettre à jour le système
sudo apt update && sudo apt upgrade -y

# Installer Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Vérifier l'installation
node --version  # v20.x.x
npm --version   # 10.x.x

# Installer Nginx
sudo apt install -y nginx

# Installer Certbot pour SSL
sudo apt install -y certbot python3-certbot-nginx

# Installer PM2 globalement
sudo npm install -g pm2 tsx
```

### Créer un utilisateur dédié (recommandé)
```bash
# Créer l'utilisateur
sudo useradd -m -s /bin/bash brainstorm
sudo usermod -aG sudo brainstorm

# Basculer vers l'utilisateur
sudo su - brainstorm
```

## 3. Déployer l'application

### Cloner le repository
```bash
cd ~
git clone https://github.com/Lyksia/bs-socket-server.git
cd bs-socket-server
```

### Installer les dépendances
```bash
npm install
```

### Configurer l'environnement
```bash
cp .env.example .env
nano .env
```

Éditer avec tes valeurs :
```env
# Base de données PostgreSQL (même URL que Next.js)
DATABASE_URL="postgresql://user:password@host:5432/database"

# Port local (Nginx fera le proxy)
PORT=3001

# URLs autorisées pour CORS
FRONTEND_URL="https://brainstorm.vercel.app"
NEXT_PUBLIC_APP_URL="https://brainstorm.vercel.app"

# Environnement
NODE_ENV="production"
```

### Générer le client Prisma
```bash
npm run build
```

### Tester le serveur
```bash
npm start
```

Vérifier que le serveur démarre correctement, puis arrêter avec `Ctrl+C`.

## 4. Configuration PM2

### Démarrer le serveur avec PM2
```bash
pm2 start server.ts --name brainstorm-socket --interpreter tsx
```

### Configurer le démarrage automatique
```bash
# Sauvegarder la configuration PM2
pm2 save

# Configurer le démarrage au boot
pm2 startup
# Exécuter la commande affichée (commençant par sudo env...)
```

### Vérifier le statut
```bash
pm2 status
pm2 logs brainstorm-socket
```

## 5. Configuration Nginx

### Copier la configuration Nginx
```bash
sudo cp nginx-config.conf /etc/nginx/sites-available/bs-socket.lyksia.com
```

### Activer le site (sans SSL d'abord)
```bash
# Créer un fichier temporaire sans SSL
sudo nano /etc/nginx/sites-available/bs-socket.lyksia.com
```

Configuration initiale (sans SSL) :
```nginx
upstream socket_backend {
    server 127.0.0.1:3001;
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name bs-socket.lyksia.com;

    location / {
        proxy_pass http://socket_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Activer le site
```bash
# Créer le lien symbolique
sudo ln -s /etc/nginx/sites-available/bs-socket.lyksia.com /etc/nginx/sites-enabled/

# Tester la configuration
sudo nginx -t

# Recharger Nginx
sudo systemctl reload nginx
```

## 6. Configuration SSL avec Certbot

### Obtenir le certificat SSL
```bash
sudo certbot --nginx -d bs-socket.lyksia.com
```

Certbot va :
1. Vérifier que le domaine pointe vers le serveur
2. Obtenir le certificat SSL
3. Modifier automatiquement la config Nginx
4. Configurer le renouvellement automatique

Répondre aux questions :
- Email : ton email pour les notifications
- Accepter les conditions : Yes
- Partager l'email : No (optionnel)
- Rediriger HTTP vers HTTPS : Yes (recommandé)

### Vérifier le certificat
```bash
sudo certbot certificates
```

### Tester le renouvellement automatique
```bash
sudo certbot renew --dry-run
```

### Remplacer par la configuration complète
```bash
sudo cp nginx-config.conf /etc/nginx/sites-available/bs-socket.lyksia.com
sudo nginx -t
sudo systemctl reload nginx
```

## 7. Configuration du Firewall

### Configurer UFW
```bash
# Autoriser SSH
sudo ufw allow OpenSSH

# Autoriser HTTP et HTTPS
sudo ufw allow 'Nginx Full'

# Activer le firewall
sudo ufw enable

# Vérifier le statut
sudo ufw status
```

## 8. Vérification

### Tester le serveur
```bash
# Health check HTTP
curl http://bs-socket.lyksia.com/health

# Health check HTTPS
curl https://bs-socket.lyksia.com/health
```

Réponse attendue :
```json
{"status":"ok","timestamp":"2024-..."}
```

### Tester WebSocket depuis le navigateur
Ouvrir la console du navigateur sur `https://brainstorm.vercel.app` et tester :

```javascript
const socket = io("https://bs-socket.lyksia.com");
socket.on("connect", () => console.log("Connected!"));
```

## 9. Commandes utiles

### PM2
```bash
# Voir les logs en temps réel
pm2 logs brainstorm-socket

# Redémarrer le serveur
pm2 restart brainstorm-socket

# Arrêter le serveur
pm2 stop brainstorm-socket

# Supprimer le processus
pm2 delete brainstorm-socket

# Voir les métriques
pm2 monit
```

### Nginx
```bash
# Tester la configuration
sudo nginx -t

# Recharger la configuration
sudo systemctl reload nginx

# Redémarrer Nginx
sudo systemctl restart nginx

# Voir les logs
sudo tail -f /var/log/nginx/bs-socket.access.log
sudo tail -f /var/log/nginx/bs-socket.error.log
```

### Certbot
```bash
# Lister les certificats
sudo certbot certificates

# Renouveler manuellement
sudo certbot renew

# Révoquer un certificat
sudo certbot revoke --cert-name bs-socket.lyksia.com
```

## 10. Mise à jour du code

### Déployer une nouvelle version
```bash
cd ~/bs-socket-server

# Récupérer les dernières modifications
git pull origin main

# Installer les nouvelles dépendances
npm install

# Régénérer Prisma si le schema a changé
npm run build

# Redémarrer le serveur
pm2 restart brainstorm-socket

# Vérifier les logs
pm2 logs brainstorm-socket --lines 50
```

### Script de déploiement automatique
Créer `deploy.sh` :

```bash
#!/bin/bash
cd ~/bs-socket-server
git pull origin main
npm install
npm run build
pm2 restart brainstorm-socket
pm2 logs brainstorm-socket --lines 20
```

Rendre exécutable :
```bash
chmod +x deploy.sh
./deploy.sh
```

## 11. Monitoring et logs

### Configurer la rotation des logs PM2
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### Monitoring avec PM2 Plus (optionnel)
```bash
pm2 link [public_key] [private_key]
```

## 12. Sécurité

### Désactiver l'authentification par mot de passe SSH
```bash
sudo nano /etc/ssh/sshd_config
```

Modifier :
```
PasswordAuthentication no
PubkeyAuthentication yes
```

Redémarrer SSH :
```bash
sudo systemctl restart sshd
```

### Fail2ban pour protéger contre les attaques
```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

## Troubleshooting

### Le serveur ne démarre pas
```bash
# Vérifier les logs
pm2 logs brainstorm-socket

# Vérifier que le port 3001 est libre
sudo netstat -tlnp | grep 3001

# Vérifier la connexion à la base de données
cd ~/bs-socket-server
npm run build  # Test Prisma
```

### Erreur 502 Bad Gateway
```bash
# Vérifier que PM2 tourne
pm2 status

# Vérifier les logs Nginx
sudo tail -f /var/log/nginx/bs-socket.error.log

# Vérifier la config Nginx
sudo nginx -t
```

### WebSocket ne se connecte pas
```bash
# Vérifier les CORS dans .env
cat .env | grep URL

# Vérifier les logs du serveur
pm2 logs brainstorm-socket
```

### Problèmes SSL
```bash
# Vérifier le certificat
sudo certbot certificates

# Renouveler le certificat
sudo certbot renew --force-renewal
```

## Support

Pour plus d'aide :
- GitHub Issues : https://github.com/Lyksia/bs-socket-server/issues
- Logs PM2 : `pm2 logs brainstorm-socket`
- Logs Nginx : `/var/log/nginx/bs-socket.error.log`
