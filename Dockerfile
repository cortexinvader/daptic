# Use Python image
FROM python:3.11-slim

# Set working directory inside container
WORKDIR /app

# Copy only necessary files
COPY DAPTIC/ /app/

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Expose your app port (adjust if needed)
EXPOSE 5000

# Start your app
CMD ["python", "app.py"]
