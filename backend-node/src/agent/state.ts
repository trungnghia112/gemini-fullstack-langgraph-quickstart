import { BaseMessage } from "@langchain/core/messages";

export interface OverallState {
  messages: BaseMessage[];
  search_query: string[];
  web_research_result: any[];
  sources_gathered: any[];
  initial_search_query_count: number;
  max_research_loops: number;
  research_loop_count: number;
  reasoning_model?: string;
  running_summary?: string;
}

export interface QueryGenerationState {
  messages: BaseMessage[];
  initial_search_query_count: number;
  research_topic: string;
}

export interface ReflectionState {
  running_summary: string;
  research_topic: string;
  research_loop_count: number;
  max_research_loops: number;
}

export interface WebSearchState {
  search_query: string;
  research_loop_count: number;
}
