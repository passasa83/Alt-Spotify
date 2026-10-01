from httpx import AsyncClient

from app.core.config import settings

METRICS = "/api/v1/monitoring/metrics"


async def test_metrics_not_public(client: AsyncClient):
    assert (await client.get(METRICS)).status_code == 401


async def test_metrics_forbidden_for_users(client: AsyncClient, auth_headers):
    assert (await client.get(METRICS, headers=auth_headers)).status_code == 403


async def test_metrics_for_admins(client: AsyncClient, admin_headers):
    response = await client.get(METRICS, headers=admin_headers)
    assert response.status_code == 200
    assert "python_info" in response.text


async def test_metrics_with_scrape_token(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "METRICS_TOKEN", "scrape-secret-for-tests")
    ok = await client.get(METRICS, headers={"Authorization": "Bearer scrape-secret-for-tests"})
    assert ok.status_code == 200
    bad = await client.get(METRICS, headers={"Authorization": "Bearer wrong"})
    assert bad.status_code == 401
