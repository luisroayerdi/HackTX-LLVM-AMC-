# HackTX-LLVM-AMC+

LLVM MCA++ Analyzer with Professional React IDE Interface

## Features

- 🎨 Professional code editor with C++ syntax highlighting
- 📝 Line numbers and auto-indentation
- 🔄 Auto-closing brackets and quotes
- 🚀 Model selector (Cortex-A Family Pipeline / Ethos NPU)
- ▶️ Run button for code execution
- 📤 Output display panel

## Getting Started

### Frontend (React IDE)

```bash
npm start
```

Runs the React app in development mode at [http://localhost:3000](http://localhost:3000)

### Backend Server

```bash
npm run server
```

Runs the Express backend server

### Development with Auto-Reload

```bash
npm run dev
```

Runs the backend with nodemon for auto-reload on changes

## Available Scripts

- `npm start` - Run React frontend
- `npm run build` - Build React app for production  
- `npm run server` - Run backend server
- `npm run dev` - Run backend with nodemon
- `npm test` - Run tests

## Project Structure

- `/src` - React frontend code
- `/public` - Static files
- `server.js` - Express backend server
- `analyzer_main.py` - Python LLVM analyzer

## Learn More

- [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started)
- [React documentation](https://reactjs.org/)
