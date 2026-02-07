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
RUN git config --global user.email "optimizer@code-stories" && \
    git config --global user.name "Optimizer" && \
    git config --system --add safe.directory /app && \
    git config --system --add safe.directory '*' && \
    git init && git add -A && git commit -m "init" --allow-empty

# Create stories output directory
# Make /app and /tmp writable for --user runtime mapping (non-root user needs write access)
RUN mkdir -p stories && chmod -R 777 /app /tmp

ENTRYPOINT ["node", "optimization/optimize.mjs"]
