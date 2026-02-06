import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/code-stories/',  // Subpath for GitHub Pages at charleslow.github.io/code-stories/
  plugins: [react()],
})
