cd apps/electron-app

# Start esbuild dev server in background
npx esbuild src/renderer/main.ts --bundle --outfile=dist/renderer/main.js --sourcemap --serve --port=3000 > esbuild.log 2>&1 &
ESBUILD_PID=$!

# Wait for esbuild to start
sleep 2

# Start electron
npx electron dist/main/index.js 2>&1

# Cleanup
kill $ESBUILD_PID 2>/dev/null
