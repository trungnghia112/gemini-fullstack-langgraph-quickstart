import { z } from 'zod';

export const SearchQueryListSchema = z.object({
  query: z.array(z.string()).describe('A list of search queries to be used for web research.'),
  rationale: z.string().describe('A brief explanation of why these queries are relevant to the research topic.'),
});

export type SearchQueryList = z.infer<typeof SearchQueryListSchema>;

export const ReflectionSchema = z.object({
  is_sufficient: z.boolean().describe('Whether the provided summaries are sufficient to answer the user\'s question.'),
  knowledge_gap: z.string().describe('A description of what information is missing or needs clarification.'),
  follow_up_queries: z.array(z.string()).describe('A list of follow-up queries to address the knowledge gap.'),
});

export type Reflection = z.infer<typeof ReflectionSchema>;

// Additional types for web search results
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string;
}

export interface CitationSegment {
  label: string;
  short_url: string;
  value: string;
}

export interface Citation {
  start_index: number;
  end_index: number;
  segments: CitationSegment[];
  segment_string: string;
}
