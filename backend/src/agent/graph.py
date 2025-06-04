import os
import time
import logging
from typing import Dict, Any

from agent.tools_and_schemas import SearchQueryList, Reflection
from dotenv import load_dotenv
from langchain_core.messages import AIMessage
from langgraph.types import Send
from langgraph.graph import StateGraph
from langgraph.graph import START, END
from langchain_core.runnables import RunnableConfig
from google.genai import Client
from google.api_core.exceptions import ResourceExhausted, GoogleAPIError

from agent.state import (
    OverallState,
    QueryGenerationState,
    ReflectionState,
    WebSearchState,
)
from agent.configuration import Configuration
from agent.prompts import (
    get_current_date,
    query_writer_instructions,
    web_searcher_instructions,
    reflection_instructions,
    answer_instructions,
)
from langchain_google_genai import ChatGoogleGenerativeAI
from agent.utils import (
    get_citations,
    get_research_topic,
    insert_citation_markers,
    resolve_urls,
)

load_dotenv()

if os.getenv("GEMINI_API_KEY") is None:
    raise ValueError("GEMINI_API_KEY is not set")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Used for Google Search API
genai_client = Client(api_key=os.getenv("GEMINI_API_KEY"))


def handle_api_error(error: Exception, search_query: str) -> Dict[str, Any]:
    """Handle API errors gracefully and return fallback response.

    Args:
        error: The exception that occurred
        search_query: The search query that failed

    Returns:
        Dictionary with fallback response data
    """
    if isinstance(error, ResourceExhausted):
        logger.warning(f"Google API quota exhausted for query: {search_query}")
        fallback_message = (
            f"⚠️ **API Quota Exhausted**\n\n"
            f"The Google Search API quota has been exceeded while researching: '{search_query}'\n\n"
            f"**What this means:**\n"
            f"- The research system has reached its daily/hourly API usage limit\n"
            f"- This is a temporary limitation that will reset automatically\n"
            f"- The research will continue with available information from other queries\n\n"
            f"**Recommendations:**\n"
            f"- Try again later when the quota resets\n"
            f"- Consider using fewer search queries or reducing research depth\n"
            f"- Contact the administrator if this issue persists"
        )
    elif isinstance(error, GoogleAPIError):
        logger.error(f"Google API error for query '{search_query}': {error}")
        fallback_message = (
            f"⚠️ **Search API Error**\n\n"
            f"An error occurred while searching for: '{search_query}'\n\n"
            f"Error details: {str(error)}\n\n"
            f"The research will continue with available information from other queries."
        )
    else:
        logger.error(f"Unexpected error during web research for query '{search_query}': {error}")
        fallback_message = (
            f"⚠️ **Research Error**\n\n"
            f"An unexpected error occurred while researching: '{search_query}'\n\n"
            f"The research will continue with available information from other queries."
        )

    return {
        "sources_gathered": [],
        "search_query": [search_query],
        "web_research_result": [fallback_message],
    }


# Nodes
def generate_query(state: OverallState, config: RunnableConfig) -> QueryGenerationState:
    """LangGraph node that generates a search queries based on the User's question.

    Uses Gemini 2.0 Flash to create an optimized search query for web research based on
    the User's question. Includes error handling for API failures.

    Args:
        state: Current graph state containing the User's question
        config: Configuration for the runnable, including LLM provider settings

    Returns:
        Dictionary with state update, including search_query key containing the generated query
    """
    configurable = Configuration.from_runnable_config(config)
    research_topic = get_research_topic(state["messages"])
    logger.info(f"Generating search queries for topic: {research_topic[:100]}...")

    # check for custom initial search query count
    if state.get("initial_search_query_count") is None:
        state["initial_search_query_count"] = configurable.number_of_initial_queries

    try:
        # init Gemini 2.0 Flash
        llm = ChatGoogleGenerativeAI(
            model=configurable.query_generator_model,
            temperature=1.0,
            max_retries=2,
            api_key=os.getenv("GEMINI_API_KEY"),
        )
        structured_llm = llm.with_structured_output(SearchQueryList)

        # Format the prompt
        current_date = get_current_date()
        formatted_prompt = query_writer_instructions.format(
            current_date=current_date,
            research_topic=research_topic,
            number_queries=state["initial_search_query_count"],
        )
        # Generate the search queries
        result = structured_llm.invoke(formatted_prompt)
        logger.info(f"Successfully generated {len(result.query)} search queries")
        return {"query_list": result.query}

    except (ResourceExhausted, GoogleAPIError) as e:
        logger.error(f"Google API error during query generation: {e}")
        # Fallback to basic queries derived from the research topic
        fallback_queries = [research_topic[:100]]  # Use first 100 chars as basic query
        logger.info(f"Using fallback query: {fallback_queries[0]}")
        return {"query_list": fallback_queries}
    except Exception as e:
        logger.error(f"Unexpected error during query generation: {e}")
        # Fallback to basic queries derived from the research topic
        fallback_queries = [research_topic[:100]]  # Use first 100 chars as basic query
        logger.info(f"Using fallback query: {fallback_queries[0]}")
        return {"query_list": fallback_queries}


def continue_to_web_research(state: QueryGenerationState):
    """LangGraph node that sends the search queries to the web research node.

    This is used to spawn n number of web research nodes, one for each search query.
    """
    return [
        Send("web_research", {"search_query": search_query, "id": int(idx)})
        for idx, search_query in enumerate(state["query_list"])
    ]


def web_research(state: WebSearchState, config: RunnableConfig) -> OverallState:
    """LangGraph node that performs web research using the native Google Search API tool.

    Executes a web search using the native Google Search API tool in combination with Gemini 2.0 Flash.
    Includes robust error handling for quota exhaustion and other API errors.

    Args:
        state: Current graph state containing the search query and research loop count
        config: Configuration for the runnable, including search API settings

    Returns:
        Dictionary with state update, including sources_gathered, research_loop_count, and web_research_results
    """
    search_query = state["search_query"]
    logger.info(f"Starting web research for query: {search_query}")

    # Configure
    configurable = Configuration.from_runnable_config(config)
    formatted_prompt = web_searcher_instructions.format(
        current_date=get_current_date(),
        research_topic=search_query,
    )

    try:
        # Uses the google genai client as the langchain client doesn't return grounding metadata
        response = genai_client.models.generate_content(
            model=configurable.query_generator_model,
            contents=formatted_prompt,
            config={
                "tools": [{"google_search": {}}],
                "temperature": 0,
            },
        )

        # Check if response has the expected structure
        if not response or not response.candidates:
            logger.warning(f"Empty response received for query: {search_query}")
            return handle_api_error(Exception("Empty response from API"), search_query)

        candidate = response.candidates[0]
        if not hasattr(candidate, 'grounding_metadata') or not candidate.grounding_metadata:
            logger.warning(f"No grounding metadata in response for query: {search_query}")
            # Return the text without citations if no grounding metadata
            return {
                "sources_gathered": [],
                "search_query": [search_query],
                "web_research_result": [response.text or "No search results available."],
            }

        # resolve the urls to short urls for saving tokens and time
        resolved_urls = resolve_urls(
            candidate.grounding_metadata.grounding_chunks, state["id"]
        )
        # Gets the citations and adds them to the generated text
        citations = get_citations(response, resolved_urls)
        modified_text = insert_citation_markers(response.text, citations)
        sources_gathered = [item for citation in citations for item in citation["segments"]]

        logger.info(f"Successfully completed web research for query: {search_query}")
        return {
            "sources_gathered": sources_gathered,
            "search_query": [search_query],
            "web_research_result": [modified_text],
        }

    except (ResourceExhausted, GoogleAPIError) as e:
        logger.error(f"Google API error during web research: {e}")
        return handle_api_error(e, search_query)
    except Exception as e:
        logger.error(f"Unexpected error during web research: {e}")
        return handle_api_error(e, search_query)


def reflection(state: OverallState, config: RunnableConfig) -> ReflectionState:
    """LangGraph node that identifies knowledge gaps and generates potential follow-up queries.

    Analyzes the current summary to identify areas for further research and generates
    potential follow-up queries. Uses structured output to extract
    the follow-up query in JSON format. Includes error handling for API failures.

    Args:
        state: Current graph state containing the running summary and research topic
        config: Configuration for the runnable, including LLM provider settings

    Returns:
        Dictionary with state update, including search_query key containing the generated follow-up query
    """
    configurable = Configuration.from_runnable_config(config)
    # Increment the research loop count and get the reasoning model
    state["research_loop_count"] = state.get("research_loop_count", 0) + 1
    reasoning_model = state.get("reasoning_model") or configurable.reasoning_model

    logger.info(f"Starting reflection phase (loop {state['research_loop_count']})")

    try:
        # Format the prompt
        current_date = get_current_date()
        formatted_prompt = reflection_instructions.format(
            current_date=current_date,
            research_topic=get_research_topic(state["messages"]),
            summaries="\n\n---\n\n".join(state["web_research_result"]),
        )
        # init Reasoning Model
        llm = ChatGoogleGenerativeAI(
            model=reasoning_model,
            temperature=1.0,
            max_retries=2,
            api_key=os.getenv("GEMINI_API_KEY"),
        )
        result = llm.with_structured_output(Reflection).invoke(formatted_prompt)

        logger.info(f"Reflection completed - sufficient: {result.is_sufficient}")
        return {
            "is_sufficient": result.is_sufficient,
            "knowledge_gap": result.knowledge_gap,
            "follow_up_queries": result.follow_up_queries,
            "research_loop_count": state["research_loop_count"],
            "number_of_ran_queries": len(state["search_query"]),
        }

    except (ResourceExhausted, GoogleAPIError) as e:
        logger.error(f"Google API error during reflection: {e}")
        # Fallback: assume research is sufficient to avoid infinite loops
        return {
            "is_sufficient": True,
            "knowledge_gap": f"Unable to perform reflection due to API error: {str(e)}",
            "follow_up_queries": [],
            "research_loop_count": state["research_loop_count"],
            "number_of_ran_queries": len(state["search_query"]),
        }
    except Exception as e:
        logger.error(f"Unexpected error during reflection: {e}")
        # Fallback: assume research is sufficient to avoid infinite loops
        return {
            "is_sufficient": True,
            "knowledge_gap": f"Unable to perform reflection due to unexpected error: {str(e)}",
            "follow_up_queries": [],
            "research_loop_count": state["research_loop_count"],
            "number_of_ran_queries": len(state["search_query"]),
        }


def evaluate_research(
    state: ReflectionState,
    config: RunnableConfig,
) -> OverallState:
    """LangGraph routing function that determines the next step in the research flow.

    Controls the research loop by deciding whether to continue gathering information
    or to finalize the summary based on the configured maximum number of research loops.

    Args:
        state: Current graph state containing the research loop count
        config: Configuration for the runnable, including max_research_loops setting

    Returns:
        String literal indicating the next node to visit ("web_research" or "finalize_summary")
    """
    configurable = Configuration.from_runnable_config(config)
    max_research_loops = (
        state.get("max_research_loops")
        if state.get("max_research_loops") is not None
        else configurable.max_research_loops
    )
    if state["is_sufficient"] or state["research_loop_count"] >= max_research_loops:
        return "finalize_answer"
    else:
        return [
            Send(
                "web_research",
                {
                    "search_query": follow_up_query,
                    "id": state["number_of_ran_queries"] + int(idx),
                },
            )
            for idx, follow_up_query in enumerate(state["follow_up_queries"])
        ]


def finalize_answer(state: OverallState, config: RunnableConfig):
    """LangGraph node that finalizes the research summary.

    Prepares the final output by deduplicating and formatting sources, then
    combining them with the running summary to create a well-structured
    research report with proper citations. Includes error handling for API failures.

    Args:
        state: Current graph state containing the running summary and sources gathered

    Returns:
        Dictionary with state update, including running_summary key containing the formatted final summary with sources
    """
    configurable = Configuration.from_runnable_config(config)
    reasoning_model = state.get("reasoning_model") or configurable.reasoning_model

    logger.info("Finalizing research answer")

    try:
        # Format the prompt
        current_date = get_current_date()
        formatted_prompt = answer_instructions.format(
            current_date=current_date,
            research_topic=get_research_topic(state["messages"]),
            summaries="\n---\n\n".join(state["web_research_result"]),
        )

        # init Reasoning Model, default to Gemini 2.5 Flash
        llm = ChatGoogleGenerativeAI(
            model=reasoning_model,
            temperature=0,
            max_retries=2,
            api_key=os.getenv("GEMINI_API_KEY"),
        )
        result = llm.invoke(formatted_prompt)

        # Replace the short urls with the original urls and add all used urls to the sources_gathered
        unique_sources = []
        for source in state["sources_gathered"]:
            if source["short_url"] in result.content:
                result.content = result.content.replace(
                    source["short_url"], source["value"]
                )
                unique_sources.append(source)

        logger.info("Successfully finalized research answer")
        return {
            "messages": [AIMessage(content=result.content)],
            "sources_gathered": unique_sources,
        }

    except (ResourceExhausted, GoogleAPIError) as e:
        logger.error(f"Google API error during answer finalization: {e}")
        # Fallback: create a basic summary from available research results
        fallback_content = "# Research Summary\n\n"
        fallback_content += "⚠️ **Note**: Unable to generate final summary due to API quota exhaustion.\n\n"
        fallback_content += "## Available Research Results:\n\n"

        for i, result in enumerate(state["web_research_result"], 1):
            fallback_content += f"### Research Result {i}\n{result}\n\n"

        return {
            "messages": [AIMessage(content=fallback_content)],
            "sources_gathered": state.get("sources_gathered", []),
        }
    except Exception as e:
        logger.error(f"Unexpected error during answer finalization: {e}")
        # Fallback: create a basic summary from available research results
        fallback_content = "# Research Summary\n\n"
        fallback_content += f"⚠️ **Note**: Unable to generate final summary due to an error: {str(e)}\n\n"
        fallback_content += "## Available Research Results:\n\n"

        for i, result in enumerate(state["web_research_result"], 1):
            fallback_content += f"### Research Result {i}\n{result}\n\n"

        return {
            "messages": [AIMessage(content=fallback_content)],
            "sources_gathered": state.get("sources_gathered", []),
        }


# Create our Agent Graph
builder = StateGraph(OverallState, config_schema=Configuration)

# Define the nodes we will cycle between
builder.add_node("generate_query", generate_query)
builder.add_node("web_research", web_research)
builder.add_node("reflection", reflection)
builder.add_node("finalize_answer", finalize_answer)

# Set the entrypoint as `generate_query`
# This means that this node is the first one called
builder.add_edge(START, "generate_query")
# Add conditional edge to continue with search queries in a parallel branch
builder.add_conditional_edges(
    "generate_query", continue_to_web_research, ["web_research"]
)
# Reflect on the web research
builder.add_edge("web_research", "reflection")
# Evaluate the research
builder.add_conditional_edges(
    "reflection", evaluate_research, ["web_research", "finalize_answer"]
)
# Finalize the answer
builder.add_edge("finalize_answer", END)

graph = builder.compile(name="pro-search-agent")
