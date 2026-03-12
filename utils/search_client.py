"""
utils/search_client.py — Tavily web search wrapper.
"""
from tavily import TavilyClient
from config import cfg

_client = TavilyClient(api_key=cfg.TAVILY_API_KEY)


def search(query: str, max_results: int = 5) -> list[dict]:
    """Run a web search and return a list of {title, url, content} dicts."""
    response = _client.search(query=query, max_results=max_results)
    return [
        {"title": r.get("title", ""), "url": r.get("url", ""), "content": r.get("content", "")}
        for r in response.get("results", [])
    ]


def search_text(query: str, max_results: int = 5) -> str:
    """Return search results as a formatted string."""
    results = search(query, max_results)
    if not results:
        return "No results found."
    lines = []
    for i, r in enumerate(results, 1):
        lines.append(f"{i}. {r['title']}\n   {r['url']}\n   {r['content'][:200]}...")
    return "\n\n".join(lines)
