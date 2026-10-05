"""Use X-Forwarded-For / X-Forwarded-Proto only when a proxy we trust sent them.

uvicorn ran with ``--forwarded-allow-ips "*"``: anyone reaching the backend
directly (port 8000 is published) could claim any IP in X-Forwarded-For and
dodge the per-IP login limit. Proxies here sit on private addresses (Docker
networks, the host, the LAN), so those are trusted; anything else is a
direct client and its headers are ignored.
"""
import ipaddress
import os
from functools import lru_cache

# Where reverse proxies live: Docker networks, the host, the LAN. Explicit list:
# ipaddress' is_private also covers documentation and other reserved ranges.
_PRIVATE_NETWORKS = tuple(
    ipaddress.ip_network(n)
    for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "::1/128", "fc00::/7")
)


@lru_cache(maxsize=1)
def _extra_trusted() -> tuple:
    """TRUSTED_PROXIES: extra comma-separated IPs/CIDRs (e.g. a public proxy)."""
    nets = []
    for item in os.environ.get("TRUSTED_PROXIES", "").split(","):
        item = item.strip()
        if item:
            try:
                nets.append(ipaddress.ip_network(item, strict=False))
            except ValueError:
                pass
    return tuple(nets)


def is_trusted_proxy(host: str) -> bool:
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    if getattr(ip, "ipv4_mapped", None):
        ip = ip.ipv4_mapped
    return any(ip in net for net in (*_PRIVATE_NETWORKS, *_extra_trusted()) if ip.version == net.version)


class TrustedProxyMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            client = scope.get("client")
            if client and is_trusted_proxy(client[0]):
                headers = {k.lower(): v for k, v in scope.get("headers", [])}
                scope = dict(scope)
                forwarded_for = headers.get(b"x-forwarded-for")
                if forwarded_for:
                    hops = [h.strip() for h in forwarded_for.decode("latin-1").split(",") if h.strip()]
                    # Walk back from the closest hop, skipping our own proxies:
                    # the first untrusted address is the real client (entries
                    # further left could have been written by that client).
                    real = next((h for h in reversed(hops) if not is_trusted_proxy(h)), hops[0] if hops else None)
                    if real:
                        scope["client"] = (real, 0)
                forwarded_proto = headers.get(b"x-forwarded-proto")
                if forwarded_proto:
                    proto = forwarded_proto.decode("latin-1").split(",")[0].strip().lower()
                    if scope["type"] == "websocket":
                        scope["scheme"] = "wss" if proto == "https" else "ws"
                    elif proto in ("http", "https"):
                        scope["scheme"] = proto
        await self.app(scope, receive, send)
