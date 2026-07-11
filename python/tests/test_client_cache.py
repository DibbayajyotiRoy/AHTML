"""TASKS.md T2.3/roadmap — AHTMLClient honors ETag: the second fetch of an
unchanged snapshot issues a conditional request (If-None-Match) and returns
the cached parse on 304. Driven through httpx.MockTransport — no sockets.
"""
from pathlib import Path

import httpx

from ahtml import AHTMLClient

FIXTURES = Path(__file__).parent / "fixtures"
BODY = (FIXTURES / "product_full.json").read_text()
ETAG = 'W/"f4c2"'
URL = "https://shop.example.com/p/mbp-14-m3"


class Server:
    """Counts requests; answers 200 first, 304 on a matching If-None-Match."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.headers.get("if-none-match") == ETAG:
            return httpx.Response(304, headers={"etag": ETAG})
        return httpx.Response(
            200,
            content=BODY,
            headers={"content-type": "application/ahtml+json", "etag": ETAG},
        )


def make_client(server: Server) -> AHTMLClient:
    return AHTMLClient(http=httpx.Client(transport=httpx.MockTransport(server.handler)))


def test_second_fetch_is_conditional_and_returns_cached_parse() -> None:
    server = Server()
    client = make_client(server)

    first = client.fetch(URL)
    # Expire the TTL (fixture ttl=300s) so the next fetch must revalidate
    # rather than serve from the fresh cache. fetched_at is a monotonic clock.
    client._cache[URL].fetched_at -= 10_000

    second = client.fetch(URL)

    assert len(server.requests) == 2
    assert "if-none-match" not in server.requests[0].headers
    assert server.requests[1].headers.get("if-none-match") == ETAG, (
        "second fetch must revalidate with If-None-Match"
    )
    assert second == first, "304 must return the cached parse"
    assert second["url"] == URL


def test_fresh_ttl_avoids_the_wire_entirely() -> None:
    server = Server()
    client = make_client(server)
    client.fetch(URL)
    client.fetch(URL)  # within TTL → served from cache, no request
    assert len(server.requests) == 1


def test_accept_negotiation_defaults_to_compact_preference() -> None:
    server = Server()
    client = make_client(server)
    client.fetch(URL)
    accept = server.requests[0].headers.get("accept", "")
    assert "ahtml" in accept, f"client must negotiate AHTML media types, sent: {accept!r}"


def test_invalidate_forces_a_full_refetch() -> None:
    server = Server()
    client = make_client(server)
    client.fetch(URL)
    client.invalidate(URL)
    client.fetch(URL)
    assert len(server.requests) == 2
    assert "if-none-match" not in server.requests[1].headers, (
        "invalidate() must drop the stored ETag"
    )
