# Stage 1: Build Frontend
FROM node:18-alpine as frontend-builder
WORKDIR /app/frontend

# Copy package.json first for better cache utilization
COPY frontend/package.json ./
RUN npm install

# Copy frontend source code
COPY frontend/public ./public
COPY frontend/src ./src

# Build the frontend
RUN npm run build

# Stage 2: Build Backend
FROM python:3.10-slim

WORKDIR /app

# Install dependencies first (for better caching)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ /app/backend/

# Copy built frontend from the first stage
COPY --from=frontend-builder /app/frontend/build /app/frontend/build

# Create data directory
RUN mkdir -p /app/data

# Set environment variables
ENV PYTHONPATH=/app
ENV DATABASE_URL=sqlite:///./data/app.db

# Create volume for persistent data
VOLUME /app/data

# Expose the port
EXPOSE 8000

# Fix the command to properly run the app
CMD ["python", "/app/backend/app/main.py"]
