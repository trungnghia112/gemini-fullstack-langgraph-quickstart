import { BaseMessage, AIMessage, HumanMessage } from "@langchain/core/messages";
import { Citation, CitationSegment } from "./tools-and-schemas";

export function getResearchTopic(messages: BaseMessage[]): string {
  // Check if request has a history and combine the messages into a single string
  if (messages.length === 1) {
    return messages[messages.length - 1].content as string;
  } else {
    let researchTopic = "";
    for (const message of messages) {
      if (message instanceof HumanMessage) {
        researchTopic += `User: ${message.content}\n`;
      } else if (message instanceof AIMessage) {
        researchTopic += `Assistant: ${message.content}\n`;
      }
    }
    return researchTopic;
  }
}

export function resolveUrls(urlsToResolve: any[], id: number): Record<string, string> {
  /**
   * Create a map of the vertex ai search urls (very long) to a short url with a unique id for each url.
   * Ensures each original URL gets a consistent shortened form while maintaining uniqueness.
   */
  const prefix = "https://vertexaisearch.cloud.google.com/id/";
  const urls = urlsToResolve.map(site => site.web?.uri).filter(Boolean);

  // Create a dictionary that maps each unique URL to its first occurrence index
  const resolvedMap: Record<string, string> = {};
  urls.forEach((url, idx) => {
    if (!(url in resolvedMap)) {
      resolvedMap[url] = `${prefix}${id}-${idx}`;
    }
  });

  return resolvedMap;
}

export function insertCitationMarkers(text: string, citations: Citation[]): string {
  /**
   * Inserts citation markers into the text at the specified positions.
   * 
   * Args:
   *     text: The original text to insert citations into
   *     citations: List of citation objects with start_index, end_index, and segments
   * 
   * Returns:
   *     The text with citation markers inserted
   */
  
  // Sort citations by end_index in descending order to avoid index shifting issues
  const sortedCitations = [...citations].sort((a, b) => b.end_index - a.end_index);

  let modifiedText = text;
  for (const citationInfo of sortedCitations) {
    // These indices refer to positions in the *original* text,
    // but since we iterate from the end, they remain valid for insertion
    // relative to the parts of the string already processed.
    const endIdx = citationInfo.end_index;
    let markerToInsert = "";
    for (const segment of citationInfo.segments) {
      markerToInsert += ` [${segment.label}](${segment.short_url})`;
    }
    // Insert the citation marker at the original end_idx position
    modifiedText = modifiedText.slice(0, endIdx) + markerToInsert + modifiedText.slice(endIdx);
  }

  return modifiedText;
}

export function getCitations(response: any, resolvedUrlsMap: Record<string, string>): Citation[] {
  /**
   * Extracts and formats citation information from a Gemini model's response.
   *
   * This function processes the grounding metadata provided in the response to
   * construct a list of citation objects. Each citation object includes the
   * start and end indices of the text segment it refers to, and a string
   * containing formatted markdown links to the supporting web chunks.
   *
   * Args:
   *     response: The response object from the Gemini model, expected to have
   *               a structure including `candidates[0].grounding_metadata`.
   *     resolvedUrlsMap: Map of chunk URIs to resolved URLs
   *
   * Returns:
   *     Array of citation objects with start_index, end_index, and segments
   */
  const citations: Citation[] = [];

  try {
    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) {
      return citations;
    }

    const candidate = candidates[0];
    if (!candidate.grounding_metadata?.grounding_supports) {
      return citations;
    }

    for (const support of candidate.grounding_metadata.grounding_supports) {
      if (!support.segment) {
        continue;
      }

      const citation: Citation = {
        start_index: support.segment.start_index || 0,
        end_index: support.segment.end_index || 0,
        segments: [],
        segment_string: ""
      };

      if (support.grounding_chunk_indices) {
        for (const ind of support.grounding_chunk_indices) {
          try {
            const chunk = candidate.grounding_metadata.grounding_chunks[ind];
            const resolvedUrl = resolvedUrlsMap[chunk.web.uri] || null;
            if (resolvedUrl) {
              const segment: CitationSegment = {
                label: chunk.web.title.split(".").slice(0, -1)[0] || "Source",
                short_url: resolvedUrl,
                value: chunk.web.uri
              };
              citation.segments.push(segment);
            }
          } catch (error) {
            // Handle cases where chunk, web, uri, or resolved_map might be problematic
            // For simplicity, we'll just skip adding this particular segment link
            console.warn("Error processing citation segment:", error);
            continue;
          }
        }
      }

      // Create the segment_string from all segments
      citation.segment_string = citation.segments
        .map(segment => `[${segment.label}](${segment.short_url})`)
        .join(" ");

      if (citation.segments.length > 0) {
        citations.push(citation);
      }
    }
  } catch (error) {
    console.error("Error extracting citations:", error);
  }

  return citations;
}
