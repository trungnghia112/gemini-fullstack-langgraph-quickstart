import { config } from 'dotenv';
import app from './agent/app';

// Load environment variables
config();

const PORT = process.env.PORT || 8000;

// Validate required environment variables
if (!process.env.GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY environment variable is required');
  process.exit(1);
}

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 LangGraph Agent Backend (Node.js) is running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Research API: http://localhost:${PORT}/research`);
  console.log(`🌐 Frontend: http://localhost:${PORT}/app`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
