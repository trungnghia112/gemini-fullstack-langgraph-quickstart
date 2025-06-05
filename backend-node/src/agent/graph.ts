import { config } from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { AIMessage } from '@langchain/core/messages';
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { RunnableConfig } from '@langchain/core/runnables';

import { 
  OverallState, 
  QueryGenerationState, 
  ReflectionState, 
  WebSearchState 
} from './state';
import { ConfigurationManager } from './configuration';
import { 
  SearchQueryListSchema, 
  ReflectionSchema, 
  SearchQueryList, 
  Reflection 
} from './tools-and-schemas';
import {
  getCurrentDate,
  formatQueryWriterPrompt,
  formatWebSearcherPrompt,
  formatReflectionPrompt,
  formatAnswerPrompt
} from './prompts';
import {
  getCitations,
  getResearchTopic,
  insertCitationMarkers,
  resolveUrls
} from './utils';

// Load environment variables
config();

if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is not set');
}

// Configure logging
const logger = {
  info: (message: string) => console.log(`[INFO] ${message}`),
  warn: (message: string) => console.warn(`[WARN] ${message}`),
  error: (message: string) => console.error(`[ERROR] ${message}`)
};

// Used for Google Search API
const genaiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

interface ApiError extends Error {
  code?: string;
  status?: number;
}

function handleApiError(error: ApiError, searchQuery: string): Record<string, any> {
  /**
   * Handle API errors gracefully and return fallback response.
   */
  logger.error(`API Error for query "${searchQuery}": ${error.message}`);
  
  if (error.code === 'RESOURCE_EXHAUSTED' || error.status === 429) {
    logger.warn('API quota exhausted, implementing exponential backoff');
    return {
      web_research_result: [{
        title: 'API Quota Exhausted',
        url: '',
        snippet: `Unable to complete search for "${searchQuery}" due to API quota limits. Please try again later.`,
        content: 'API quota exhausted - search temporarily unavailable.'
      }],
      sources_gathered: []
    };
  }
  
  return {
    web_research_result: [{
      title: 'Search Error',
      url: '',
      snippet: `Error occurred while searching for "${searchQuery}": ${error.message}`,
      content: 'Search temporarily unavailable due to technical issues.'
    }],
    sources_gathered: []
  };
}

function continueToWebResearch(state: any): string[] {
  /**
   * Conditional edge function to determine if we should continue to web research.
   */
  if (state.search_query && state.search_query.length > 0) {
    return state.search_query.map(() => 'web_research');
  }
  return [];
}

function shouldContinueResearch(state: any): string {
  /**
   * Conditional edge function to determine if we should continue research or finalize.
   */
  const maxLoops = state.max_research_loops || 2;
  const currentLoop = state.research_loop_count || 0;

  if (currentLoop >= maxLoops) {
    logger.info(`Reached maximum research loops (${maxLoops}), finalizing answer`);
    return 'finalize_answer';
  }

  return 'reflection';
}

function shouldGenerateMoreQueries(state: any): string {
  /**
   * Conditional edge function to determine if we should generate more queries or finalize.
   */
  const maxLoops = state.max_research_loops || 2;
  const currentLoop = state.research_loop_count || 0;

  if (currentLoop >= maxLoops) {
    logger.info(`Reached maximum research loops (${maxLoops}), finalizing answer`);
    return 'finalize_answer';
  }

  return 'generate_query';
}

export async function generateQuery(
  state: any,
  config?: RunnableConfig
): Promise<any> {
  /**
   * LangGraph node that generates search queries based on the research topic.
   */
  const configManager = ConfigurationManager.getInstance();
  const configuration = configManager.getConfig();
  const researchTopic = getResearchTopic(state.messages);

  logger.info(`Generating search queries for topic: ${researchTopic}`);

  try {
    // Initialize Gemini 2.0 Flash
    const llm = new ChatGoogleGenerativeAI({
      model: configuration.query_generator_model,
      temperature: 1.0,
      maxRetries: 2,
      apiKey: process.env.GEMINI_API_KEY,
    });

    // Format the prompt
    const currentDate = getCurrentDate();
    const formattedPrompt = formatQueryWriterPrompt({
      current_date: currentDate,
      research_topic: researchTopic,
      number_queries: state.initial_search_query_count
    });

    // Generate the search queries using structured output
    const response = await llm.invoke(formattedPrompt);

    // Parse the JSON response
    let result: SearchQueryList;
    try {
      const jsonMatch = response.content.toString().match(/```json\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : response.content.toString();
      const parsed = JSON.parse(jsonStr);
      result = SearchQueryListSchema.parse(parsed);
    } catch (parseError) {
      logger.error(`Failed to parse query generation response: ${parseError}`);
      // Fallback to a simple query
      result = {
        query: [researchTopic],
        rationale: "Fallback query due to parsing error"
      };
    }

    logger.info(`Successfully generated ${result.query.length} search queries`);
    return { search_query: result.query };

  } catch (error) {
    logger.error(`Error in generateQuery: ${error}`);
    return handleApiError(error as ApiError, researchTopic);
  }
}

export async function webResearch(
  state: any,
  config?: RunnableConfig
): Promise<any> {
  /**
   * LangGraph node that performs web research using the native Google Search API tool.
   */
  const configManager = ConfigurationManager.getInstance();
  const configuration = configManager.getConfig();
  const searchQuery = state.search_query;
  const researchLoopCount = state.research_loop_count || 0;

  logger.info(`Performing web research for query: "${searchQuery}" (Loop ${researchLoopCount + 1})`);

  try {
    // Initialize Gemini model with search tool
    const model = genaiClient.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      tools: [{ googleSearchRetrieval: {} }]
    });

    const currentDate = getCurrentDate();
    const prompt = formatWebSearcherPrompt({
      current_date: currentDate,
      research_topic: searchQuery
    });

    // Execute search with retry logic
    let response;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        response = await model.generateContent(prompt);
        break;
      } catch (error) {
        retryCount++;
        if (retryCount >= maxRetries) {
          throw error;
        }

        const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff
        logger.warn(`Search attempt ${retryCount} failed, retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    if (!response) {
      throw new Error('Failed to get response after all retries');
    }

    // Process the response and extract citations
    const responseText = response.response.text();
    const resolvedUrlsMap = resolveUrls(
      response.response.candidates?.[0]?.groundingMetadata?.groundingChuncks || [],
      researchLoopCount
    );

    const citations = getCitations(response.response, resolvedUrlsMap);
    const textWithCitations = insertCitationMarkers(responseText, citations);

    // Extract sources for tracking
    const sources = citations.flatMap(citation =>
      citation.segments.map(segment => ({
        title: segment.label,
        url: segment.value,
        short_url: segment.short_url
      }))
    );

    logger.info(`Web research completed for "${searchQuery}". Found ${sources.length} sources.`);

    return {
      web_research_result: [{
        title: `Research Results for: ${searchQuery}`,
        url: '',
        snippet: textWithCitations.substring(0, 200) + '...',
        content: textWithCitations
      }],
      sources_gathered: sources,
      running_summary: textWithCitations
    };

  } catch (error) {
    logger.error(`Error in webResearch for query "${searchQuery}": ${error}`);
    return handleApiError(error as ApiError, searchQuery);
  }
}

export async function reflection(
  state: any,
  config?: RunnableConfig
): Promise<any> {
  /**
   * LangGraph node that identifies knowledge gaps and generates potential follow-up queries.
   */
  const configManager = ConfigurationManager.getInstance();
  const configuration = configManager.getConfig();
  const researchTopic = getResearchTopic(state.messages);
  const runningSummary = state.running_summary || '';
  const researchLoopCount = state.research_loop_count || 0;

  logger.info(`Performing reflection analysis (Loop ${researchLoopCount + 1})`);

  try {
    // Initialize Gemini model for reflection
    const llm = new ChatGoogleGenerativeAI({
      model: configuration.reflection_model,
      temperature: 0.7,
      maxRetries: 2,
      apiKey: process.env.GEMINI_API_KEY,
    });

    // Format the reflection prompt
    const formattedPrompt = formatReflectionPrompt({
      research_topic: researchTopic,
      summaries: runningSummary
    });

    // Generate reflection analysis
    const response = await llm.invoke(formattedPrompt);

    // Parse the JSON response
    let result: Reflection;
    try {
      const jsonMatch = response.content.toString().match(/```json\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : response.content.toString();
      const parsed = JSON.parse(jsonStr);
      result = ReflectionSchema.parse(parsed);
    } catch (parseError) {
      logger.error(`Failed to parse reflection response: ${parseError}`);
      // Fallback to sufficient analysis
      result = {
        is_sufficient: true,
        knowledge_gap: "",
        follow_up_queries: []
      };
    }

    if (result.is_sufficient) {
      logger.info('Reflection analysis indicates sufficient information gathered');
      return {
        research_loop_count: researchLoopCount + 1,
        running_summary: runningSummary,
        max_research_loops: state.max_research_loops || 2
      };
    } else {
      logger.info(`Knowledge gap identified: ${result.knowledge_gap}`);
      logger.info(`Generated ${result.follow_up_queries.length} follow-up queries`);

      return {
        search_query: result.follow_up_queries,
        research_loop_count: researchLoopCount + 1,
        running_summary: runningSummary,
        max_research_loops: state.max_research_loops || 2
      };
    }

  } catch (error) {
    logger.error(`Error in reflection: ${error}`);
    // On error, assume sufficient information and proceed to finalization
    return {
      research_loop_count: researchLoopCount + 1,
      running_summary: runningSummary,
      max_research_loops: state.max_research_loops || 2
    };
  }
}

export async function finalizeAnswer(
  state: any,
  config?: RunnableConfig
): Promise<any> {
  /**
   * LangGraph node that finalizes the research summary.
   */
  const configManager = ConfigurationManager.getInstance();
  const configuration = configManager.getConfig();
  const researchTopic = getResearchTopic(state.messages);
  const runningSummary = state.running_summary || '';
  const reasoningModel = state.reasoning_model || configuration.answer_model;

  logger.info('Finalizing research answer');

  try {
    // Deduplicate and format sources
    const uniqueSources = new Map();
    (state.sources_gathered || []).forEach((source: any) => {
      if (source.url && !uniqueSources.has(source.url)) {
        uniqueSources.set(source.url, source);
      }
    });

    const formattedSources = Array.from(uniqueSources.values())
      .map((source, index) => `${index + 1}. [${source.title}](${source.url})`)
      .join('\n');

    // Initialize Gemini model for final answer
    const llm = new ChatGoogleGenerativeAI({
      model: reasoningModel,
      temperature: 0.3,
      maxRetries: 2,
      apiKey: process.env.GEMINI_API_KEY,
    });

    // Format the final answer prompt
    const currentDate = getCurrentDate();
    const summariesWithSources = `${runningSummary}\n\n## Sources:\n${formattedSources}`;

    const formattedPrompt = formatAnswerPrompt({
      current_date: currentDate,
      research_topic: researchTopic,
      summaries: summariesWithSources
    });

    // Generate the final answer
    const response = await llm.invoke(formattedPrompt);
    const finalAnswer = response.content.toString();

    logger.info('Research answer finalized successfully');

    // Create final AI message
    const finalMessage = new AIMessage({
      content: finalAnswer,
      additional_kwargs: {
        sources: Array.from(uniqueSources.values()),
        research_loops_completed: state.research_loop_count || 0
      }
    });

    return {
      messages: [finalMessage],
      running_summary: finalAnswer
    };

  } catch (error) {
    logger.error(`Error in finalizeAnswer: ${error}`);

    // Fallback response
    const fallbackMessage = new AIMessage({
      content: `I encountered an error while finalizing the research on "${researchTopic}". However, based on the information gathered: ${runningSummary}`,
      additional_kwargs: {
        error: true,
        sources: state.sources_gathered || []
      }
    });

    return {
      messages: [fallbackMessage],
      running_summary: runningSummary
    };
  }
}

// Simple graph implementation without complex LangGraph setup
class SimpleGraph {
  async invoke(initialState: any): Promise<any> {
    let state = { ...initialState };

    try {
      // Step 1: Generate queries
      logger.info('Step 1: Generating search queries');
      const queryResult = await generateQuery(state);
      state = { ...state, ...queryResult };

      // Step 2: Web research for each query
      if (state.search_query && state.search_query.length > 0) {
        logger.info('Step 2: Performing web research');
        for (const query of state.search_query) {
          const searchState = { ...state, search_query: query };
          const researchResult = await webResearch(searchState);

          // Merge results
          state.web_research_result = [...(state.web_research_result || []), ...(researchResult.web_research_result || [])];
          state.sources_gathered = [...(state.sources_gathered || []), ...(researchResult.sources_gathered || [])];
          if (researchResult.running_summary) {
            state.running_summary = (state.running_summary || '') + '\n\n' + researchResult.running_summary;
          }
        }
      }

      // Step 3: Reflection (simplified - just check if we have enough info)
      logger.info('Step 3: Performing reflection');
      const reflectionResult = await reflection(state);
      state = { ...state, ...reflectionResult };

      // Step 4: Finalize answer
      logger.info('Step 4: Finalizing answer');
      const finalResult = await finalizeAnswer(state);
      state = { ...state, ...finalResult };

      return state;

    } catch (error) {
      logger.error(`Error in graph execution: ${error}`);

      // Return error state with fallback message
      const errorMessage = new AIMessage({
        content: `I encountered an error while researching your question. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        additional_kwargs: { error: true }
      });

      return {
        ...state,
        messages: [...state.messages, errorMessage]
      };
    }
  }
}

// Export the simple graph instance
export const graph = new SimpleGraph();
