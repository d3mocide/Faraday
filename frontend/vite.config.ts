import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(
      process.env.VITE_APP_VERSION || (process.env.npm_package_version ? `v${process.env.npm_package_version}` : 'v0.1.0-beta.1')
    ),
  },
})
