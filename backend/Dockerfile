# Build frontend
FROM node:18-alpine as frontend-builder
WORKDIR /app
COPY frontend/package.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Main application
FROM ubuntu:22.04

# Install Node.js and other dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    fuse \
    git \
    build-essential \
    python3 \
    make \
    g++ \
    kmod \
    util-linux \
    dmsetup \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Install cryptsetup for LUKS encryption (Docker-friendly alternative to VeraCrypt)
RUN apt-get update && apt-get install -y cryptsetup-bin

# Install Docker CLI for container management
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get install -y docker-ce-cli

WORKDIR /app

# Copy package files and install dependencies
COPY backend/package.json ./
RUN npm install --production

# Copy application code
COPY backend/ .

# Copy frontend build files
COPY --from=frontend-builder /app/build ./public

# Create necessary directories
RUN mkdir -p /app/data /app/containers /mnt/encrypted

# Set permissions for FUSE
RUN chmod 4755 /bin/fusermount

EXPOSE 3001

CMD ["npm", "start"]