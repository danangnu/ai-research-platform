from app.core.config import normalize_database_url


def test_neon_postgresql_url_is_normalized():
    original = (
        "postgresql://demo:secret@example.neon.tech/research"
        "?sslmode=require"
    )

    result = normalize_database_url(original)

    assert result.startswith("postgresql+psycopg://")
    assert "sslmode=require" in result


def test_legacy_postgres_url_is_normalized():
    original = "postgres://demo:secret@example.test/research"

    assert normalize_database_url(original) == (
        "postgresql+psycopg://demo:secret@example.test/research"
    )


def test_explicit_psycopg_url_is_preserved():
    original = (
        "postgresql+psycopg://demo:secret@example.test/research"
    )

    assert normalize_database_url(original) == original


def test_readiness_endpoint(client):
    response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert response.json()["database"] == "ok"
