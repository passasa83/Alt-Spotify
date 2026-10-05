from httpx import AsyncClient


async def _report(client, headers, **overrides):
    body = {
        "category": "playback",
        "description": "Nothing plays after clicking an artist",
        "page_url": "/artist/123",
        "context": {"track": {"id": "t1", "title": "Song"}, "errors": ["HTTP 404 GET /api/v1/tracks/x/stream"]},
        **overrides,
    }
    return await client.post("/api/v1/bug-reports", headers=headers, json=body)


async def test_user_reports_and_admin_lists(client: AsyncClient, auth_headers, admin_headers):
    response = await _report(client, {**auth_headers, "User-Agent": "TestBrowser/1.0"})
    assert response.status_code == 201

    data = (await client.get("/api/v1/admin/bug-reports", headers=admin_headers)).json()
    assert data["total"] == 1
    assert data["counts"]["new"] == 1
    report = data["items"][0]
    assert report["description"] == "Nothing plays after clicking an artist"
    assert report["category"] == "playback"
    assert report["status"] == "new"
    assert report["user_agent"] == "TestBrowser/1.0"
    assert report["context"]["track"]["title"] == "Song"
    assert report["reporter"]["pseudo"] == "testuser"


async def test_admin_updates_status_and_note(client: AsyncClient, auth_headers, admin_headers):
    report_id = (await _report(client, auth_headers)).json()["id"]

    response = await client.patch(
        f"/api/v1/admin/bug-reports/{report_id}",
        headers=admin_headers,
        json={"status": "resolved", "admin_note": "Fixed in 7cfcbeb"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "resolved"
    assert response.json()["admin_note"] == "Fixed in 7cfcbeb"

    resolved = (await client.get("/api/v1/admin/bug-reports?status=resolved", headers=admin_headers)).json()
    assert resolved["total"] == 1
    assert (await client.get("/api/v1/admin/bug-reports?status=new", headers=admin_headers)).json()["total"] == 0


async def test_only_admins_see_and_handle_reports(client: AsyncClient, auth_headers):
    report_id = (await _report(client, auth_headers)).json()["id"]
    assert (await client.get("/api/v1/admin/bug-reports", headers=auth_headers)).status_code == 403
    response = await client.patch(f"/api/v1/admin/bug-reports/{report_id}", headers=auth_headers, json={"status": "resolved"})
    assert response.status_code == 403
    assert (await client.delete(f"/api/v1/admin/bug-reports/{report_id}", headers=auth_headers)).status_code == 403


async def test_admin_deletes_a_report(client: AsyncClient, auth_headers, admin_headers):
    report_id = (await _report(client, auth_headers)).json()["id"]

    response = await client.delete(f"/api/v1/admin/bug-reports/{report_id}", headers=admin_headers)
    assert response.status_code == 200
    assert response.json() == {"deleted": True}

    listing = (await client.get("/api/v1/admin/bug-reports", headers=admin_headers)).json()
    assert listing["total"] == 0
    assert listing["counts"]["new"] == 0

    # Gone for good: a second delete reports 404 instead of crashing.
    assert (await client.delete(f"/api/v1/admin/bug-reports/{report_id}", headers=admin_headers)).status_code == 404


async def test_report_requires_login_and_a_description(client: AsyncClient, auth_headers):
    assert (await client.post("/api/v1/bug-reports", json={"description": "Broken player"})).status_code == 401
    assert (await _report(client, auth_headers, description="   ")).status_code == 422
    assert (await _report(client, auth_headers, category="nonsense")).status_code == 422
    assert (await _report(client, auth_headers, context={"blob": "x" * 20000})).status_code == 422


async def test_reports_are_rate_limited_per_user(client: AsyncClient, auth_headers):
    for _ in range(10):
        assert (await _report(client, auth_headers)).status_code == 201
    assert (await _report(client, auth_headers)).status_code == 429
