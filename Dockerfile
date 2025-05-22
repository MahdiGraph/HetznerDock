FROM python:3.10-slim

# Set working directory to match your local setup
WORKDIR /app/backend

# Copy requirements first for better caching
COPY backend/requirements.txt .
RUN pip install -r requirements.txt

# Copy backend code
COPY backend/ .

# Copy frontend build
COPY frontend/build/ /app/frontend/build/

# Create data directory
RUN mkdir -p /app/data && chmod 777 /app/data

# Create startup script that matches your working solution
RUN echo '#!/bin/bash\n\
cd /app/backend\n\
echo "Starting HetznerDock..."\n\
echo "Admin user: $ADMIN_USERNAME"\n\
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000\n' > /app/start.sh

RUN chmod +x /app/start.sh

# Set environment variables
ENV DATABASE_URL=sqlite:///../../data/app.db

# Expose the port
EXPOSE 8000

# Run the application
CMD ["/app/start.sh"]
