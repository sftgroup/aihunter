FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY src/ ./src/
# 同时启动 EVM Worker 和 SOL Worker
COPY start.sh ./start.sh
RUN chmod +x start.sh
CMD ["./start.sh"]
