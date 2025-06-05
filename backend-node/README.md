# LangGraph Agent Backend (Node.js)

This is a Node.js/TypeScript implementation of the LangGraph agent backend, converted from the original Python version. It provides an AI-powered research agent that can perform web searches and generate comprehensive answers using Google's Gemini AI models.

## Features

- **Multi-step Research**: Automatically generates search queries, performs web research, and synthesizes findings
- **Reflection Loop**: Analyzes research gaps and generates follow-up queries for comprehensive coverage
- **Citation Support**: Automatically includes citations and sources in the final answer
- **Streaming API**: Real-time updates during the research process
- **TypeScript**: Full type safety and excellent developer experience
- **Express Server**: RESTful API with CORS support
- **Error Handling**: Robust error handling with fallback responses

## Architecture

The agent follows a graph-based workflow:

1. **Query Generation**: Converts user questions into targeted search queries
2. **Web Research**: Performs searches using Google's native search API
3. **Reflection**: Analyzes results and identifies knowledge gaps
4. **Iteration**: Generates follow-up queries if needed
5. **Finalization**: Synthesizes all findings into a comprehensive answer

## Prerequisites

- Node.js 18+ 
- npm or yarn
- Google Gemini API key

## Installation

1. Clone the repository and navigate to the backend-node directory:
```bash
cd backend-node
```

2. Install dependencies:
```bash
npm install
# or
make install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

4. Edit `.env` and add your API keys:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=8000
NODE_ENV=development
```

## Development

### Quick Start

```bash
# Setup development environment
make setup

# Run in development mode
make dev
# or
npm run dev
```

### Build and Production

```bash
# Build the project
make build
# or
npm run build

# Start production server
make start
# or
npm start
```

### Testing and Linting

```bash
# Run tests
make test
# or
npm test

# Run linting
make lint
# or
npm run lint

# Fix linting issues
make lint-fix
# or
npm run lint:fix
```

## API Endpoints

### Research Endpoint
```http
POST /research
Content-Type: application/json

{
  "message": "Who won the Euro 2024?",
  "max_research_loops": 2,
  "initial_search_query_count": 3,
  "reasoning_model": "gemini-2.5-pro-preview-05-06"
}
```

Response:
```json
{
  "answer": "Spain won Euro 2024...",
  "sources": [
    {
      "title": "Euro 2024 Final Results",
      "url": "https://example.com/euro-2024-results"
    }
  ],
  "research_loops_completed": 2,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Streaming Research Endpoint
```http
POST /research/stream
Content-Type: application/json

{
  "message": "Who won the Euro 2024?"
}
```

Returns Server-Sent Events with real-time updates.

### Health Check
```http
GET /health
```

### Frontend
```http
GET /app
```

Serves the React frontend (if built).

## Configuration

Environment variables:

- `GEMINI_API_KEY` - Required. Your Google Gemini API key
- `PORT` - Server port (default: 8000)
- `NODE_ENV` - Environment (development/production)
- `QUERY_GENERATOR_MODEL` - Model for query generation (default: gemini-2.0-flash)
- `REFLECTION_MODEL` - Model for reflection (default: gemini-2.5-flash-preview-04-17)
- `ANSWER_MODEL` - Model for final answers (default: gemini-2.5-pro-preview-05-06)
- `NUMBER_OF_INITIAL_QUERIES` - Initial search queries count (default: 3)
- `MAX_RESEARCH_LOOPS` - Maximum research iterations (default: 2)

## Project Structure

```
backend-node/
├── src/
│   ├── agent/
│   │   ├── app.ts              # Express server setup
│   │   ├── configuration.ts    # Configuration management
│   │   ├── graph.ts           # LangGraph workflow
│   │   ├── prompts.ts         # AI prompts and templates
│   │   ├── state.ts           # State type definitions
│   │   ├── tools-and-schemas.ts # Zod schemas and types
│   │   ├── utils.ts           # Utility functions
│   │   └── index.ts           # Agent exports
│   └── index.ts               # Application entry point
├── dist/                      # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
├── .eslintrc.js
├── Makefile
└── README.md
```

## Differences from Python Version

- **Language**: TypeScript instead of Python
- **Framework**: Express.js instead of FastAPI
- **Validation**: Zod instead of Pydantic
- **Package Manager**: npm instead of pip/uv
- **Build System**: TypeScript compiler instead of Python packaging

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting: `make test && make lint`
5. Build the project: `make build`
6. Submit a pull request

## License

MIT License - see the original project for details.
