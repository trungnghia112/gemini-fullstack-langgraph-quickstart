import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { existsSync } from 'fs';
import { graph } from './graph';
import { HumanMessage } from '@langchain/core/messages';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Research endpoint
app.post('/research', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      message,
      max_research_loops = 2,
      initial_search_query_count = 3,
      reasoning_model
    } = req.body;

    if (!message) {
      res.status(400).json({
        error: 'Message is required'
      });
      return;
    }

    console.log(`Starting research for: "${message}"`);

    // Create initial state
    const initialState: any = {
      messages: [new HumanMessage({ content: message })],
      search_query: [],
      web_research_result: [],
      sources_gathered: [],
      initial_search_query_count,
      max_research_loops,
      research_loop_count: 0,
      reasoning_model
    };

    // Execute the graph
    const result = await graph.invoke(initialState);

    // Extract the final answer
    const finalMessage = result.messages[result.messages.length - 1];
    
    res.json({
      answer: finalMessage.content,
      sources: finalMessage.additional_kwargs?.sources || result.sources_gathered || [],
      research_loops_completed: result.research_loop_count || 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in research endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Stream research endpoint (for real-time updates)
app.post('/research/stream', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      message,
      max_research_loops = 2,
      initial_search_query_count = 3,
      reasoning_model
    } = req.body;

    if (!message) {
      res.status(400).json({
        error: 'Message is required'
      });
      return;
    }

    // Set up Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent('start', { message: 'Research started' });

    // Create initial state
    const initialState: any = {
      messages: [new HumanMessage({ content: message })],
      search_query: [],
      web_research_result: [],
      sources_gathered: [],
      initial_search_query_count,
      max_research_loops,
      research_loop_count: 0,
      reasoning_model
    };

    // Execute the graph with streaming
    const result = await graph.invoke(initialState);

    // Send final result
    const finalMessage = result.messages[result.messages.length - 1];
    sendEvent('complete', {
      answer: finalMessage.content,
      sources: finalMessage.additional_kwargs?.sources || result.sources_gathered || [],
      research_loops_completed: result.research_loop_count || 0
    });

    res.end();

  } catch (error) {
    console.error('Error in stream research endpoint:', error);
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })}\n\n`);
    res.end();
  }
});

// Serve frontend static files
function createFrontendRouter(buildDir = '../frontend/dist') {
  const buildPath = path.resolve(__dirname, '../../..', buildDir);
  const staticFilesPath = path.join(buildPath, 'assets');

  if (!existsSync(buildPath) || !existsSync(path.join(buildPath, 'index.html'))) {
    console.warn(`Frontend build directory not found at ${buildPath}. Serving frontend will likely fail.`);
    
    return (req: Request, res: Response) => {
      res.status(503).send('Frontend not built. Run "npm run build" in the frontend directory.');
    };
  }

  // Serve static assets
  app.use('/app/assets', express.static(staticFilesPath));

  // Catch-all handler for SPA routing
  return (req: Request, res: Response) => {
    const filePath = path.join(buildPath, req.path);
    if (existsSync(filePath) && !require('fs').statSync(filePath).isDirectory()) {
      res.sendFile(filePath);
    } else {
      res.sendFile(path.join(buildPath, 'index.html'));
    }
  };
}

// Mount the frontend under /app to not conflict with API routes
app.use('/app', createFrontendRouter());

// Default route
app.get('/', (req: Request, res: Response) => {
  res.json({ 
    message: 'LangGraph Agent Backend (Node.js)',
    version: '0.0.1',
    endpoints: {
      health: '/health',
      research: 'POST /research',
      stream: 'POST /research/stream',
      frontend: '/app'
    }
  });
});

// Error handling middleware
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message 
  });
});

export default app;
