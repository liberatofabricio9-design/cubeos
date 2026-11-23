#!/usr/bin/env bash
set -e
echo "==> Atualizando sistema"
sudo apt update && sudo apt upgrade -y
echo "==> Instalando Docker, Nginx, Certbot, Git"
sudo apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx git
sudo systemctl enable --now docker
echo "==> Clonando repositorio"
cd /opt
sudo git clone https://github.com/liberatofabricio9-design/cubeos.git
cd cubeos
echo "==> Gerando JWT_SECRET"
JWT=$(openssl rand -hex 32)
sudo sed -i "s|troque-por-um-segredo-longo|$JWT|" docker-compose.yml
echo "==> Subindo containers"
sudo docker compose up -d --build
echo "==> Configurando Nginx"
sudo cp /opt/cubeos/nginx.conf /etc/nginx/sites-available/cubeos
sudo ln -sf /etc/nginx/sites-available/cubeos /etc/nginx/sites-enabled/cubeos
sudo nginx -t && sudo systemctl reload nginx
echo "==> Pronto! Acesse http://$(curl -s ifconfig.me)"
echo "Staff: admin / admin123 / CUBO-STAFF-2026"
echo "Para HTTPS: sudo certbot --nginx -d SEU_DOMINIO"
