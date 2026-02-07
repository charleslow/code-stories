FROM node:22-slim

# Install git (needed for commit hash and repo cloning)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Install Claude CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Set up working directory
WORKDIR /app

# Copy the CLI package
COPY package.json ./
RUN npm install

COPY index.js ./
RUN chmod +x index.js

# Copy optimization files
COPY optimization/ ./optimization/

# Initialize a git repo so the CLI can get a commit hash
RUN git init && git add -A && git commit -m "init" --allow-empty

# Create stories output directory
RUN mkdir -p stories

ENTRYPOINT ["node", "optimization/optimize.mjs"]
