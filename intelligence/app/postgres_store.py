"""Read-only PostgreSQL adapter using the same normalisation as MySQL.

Each request reads one consistent database snapshot. No fixture fallback and
no prepared statements (compatible with Supabase's transaction pooler).
"""

from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlparse

from .mysql_store import MySQLDataSource, DatabaseUnavailableError


def postgres_connector(settings):
    @contextmanager
    def connect():
        import psycopg
        from psycopg.rows import dict_row

        hostname = urlparse(settings.database_url).hostname or ""
        tls = {"sslmode": "verify-full"}
        if hostname.endswith((".supabase.co", ".pooler.supabase.com")):
            tls["sslrootcert"] = str(Path(__file__).resolve().parent.parent / "certs" / "supabase-ca.crt")

        try:
            with psycopg.connect(
                settings.database_url,
                connect_timeout=settings.database_connect_timeout_seconds,
                row_factory=dict_row,
                prepare_threshold=None,
                **tls,
            ) as connection:
                connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
                connection.execute("SET LOCAL statement_timeout = '10000ms'")

                def run(sql, params):
                    return list(connection.execute(sql, tuple(params)).fetchall())

                yield run
        except (psycopg.Error, OSError) as error:
            # Driver messages can contain connection details; do not expose them.
            raise DatabaseUnavailableError("The PostgreSQL database could not be queried.") from error

    return connect


class PostgreSQLDataSource(MySQLDataSource):
    name = "POSTGRES"

    def __init__(self, settings, connector=None):
        super().__init__(settings, connector or postgres_connector(settings))
        self.data_source_name = "POSTGRES"
        self.description = "MEDRIPPLE PostgreSQL database (repository simulated dataset)"
