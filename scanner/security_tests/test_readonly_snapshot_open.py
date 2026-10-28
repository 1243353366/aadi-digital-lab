"""Read-only connection-time enforcement using disposable SQLite fixtures."""
import sqlite3
import pytest
from zbtriage.localpaths import open_evidence_db


def test_missing_copy_does_not_create_database(tmp_path):
    missing = tmp_path / "vanished.db"
    with pytest.raises(sqlite3.Error):
        open_evidence_db(str(missing))
    assert not missing.exists()


def test_connection_cannot_write_to_existing_database(tmp_path):
    path = tmp_path / "fixture.db"
    with sqlite3.connect(str(path)) as con:
        con.execute("CREATE TABLE evidence(value)")
        con.execute("INSERT INTO evidence VALUES ('original')")
    before = path.read_bytes()
    con = open_evidence_db(str(path))
    try:
        assert con.execute("SELECT value FROM evidence").fetchone()[0] == "original"
        with pytest.raises(sqlite3.Error):
            con.execute("UPDATE evidence SET value = 'changed'")
    finally:
        con.close()
    assert path.read_bytes() == before


def test_filename_characters_cannot_inject_sqlite_uri_options(tmp_path):
    path = tmp_path / "fixture?mode=rwc#fragment.db"
    with sqlite3.connect(str(path)) as con:
        con.execute("CREATE TABLE evidence(value)")
    con = open_evidence_db(str(path))
    try:
        assert con.execute("SELECT count(*) FROM evidence").fetchone()[0] == 0
    finally:
        con.close()
