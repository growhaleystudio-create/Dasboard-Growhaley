FROM node:20-slim

WORKDIR /app

# Salin berkas package.json monorepo dan dependensi
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY backend/package*.json ./backend/

# Instal semua dependensi
RUN npm ci

# Salin seluruh kode sumber proyek
COPY . .

# Compile TypeScript ke JavaScript
RUN npm run build

# Hugging Face secara default mengarahkan traffic ke port 7860
EXPOSE 7860
ENV PORT=7860
ENV NODE_ENV=production

# Jalankan API server + worker di dalam satu container
CMD ["npm", "run", "start", "--workspace", "backend"]
