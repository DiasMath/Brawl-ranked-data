import io

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq
import psycopg
import sqlglot
from sqlglot import exp
from sqlglot.errors import SqlglotError


FIELDS = {
    "battles": "id player_tag played_at event_id map_name mode api_type ranked result duration_seconds "
               "player_brawler_id player_brawler rank_label rank_score season bans",
    "battle_players": "battle_id team_index slot player_tag player_name brawler_id brawler power side",
    "battle_evidence": "battle_id rank_label rank_score season bans rank_reference score_reference "
                       "season_reference bans_reference recorded_at",
    "meta_observations": "id player_tag source_name source_url period_start period_end map_name mode rank_label "
                         "season brawler wins games pick_count pick_total ban_count ban_total recorded_at",
    "update_log": "id player_tag started_at finished_at status received added message",
}
TABLES = frozenset(FIELDS)
NUMBERS = set("event_id duration_seconds player_brawler_id rank_score team_index slot brawler_id power "
              "wins games pick_count pick_total ban_count ban_total received added".split())
TIMESTAMPS = {"played_at", "recorded_at", "started_at", "finished_at"}
DATES = {"period_start", "period_end"}
FUNCTIONS = {
    "ABS", "AVG", "CAST", "CEIL", "CEILING", "COALESCE", "CONCAT", "COUNT", "COUNT_IF", "DATE",
    "DATE_TRUNC", "DENSE_RANK", "EXTRACT", "FLOOR", "GREATEST", "IF", "IFNULL", "LAG", "LEAD",
    "LEAST", "LENGTH", "LOWER", "MAX", "MIN", "NULLIF", "RANK", "ROUND", "ROW_NUMBER", "SUBSTRING",
    "SUM", "TRIM", "UPPER", "CASE", "CURRENT_DATE", "TIMESTAMP_TRUNC", "YEAR", "MONTH", "DAY", "TIME_TO_STR",
}
ROW_LIMIT = 1000


def checked_sql(raw, dialect):
    try:
        statements = sqlglot.parse(raw, read=dialect)
        if len(statements) != 1 or not isinstance(statements[0], (exp.Select, exp.Union)):
            raise ValueError("Envie uma única consulta SELECT de leitura.")
        statement = statements[0]
        aliases = {cte.alias.lower() for cte in statement.find_all(exp.CTE)}
        blocked = (exp.Command, exp.DDL, exp.DML, exp.Into, exp.Lock, exp.Parameter)
        for node in statement.walk():
            node.comments = None
            if isinstance(node, blocked):
                raise ValueError("A consulta contém uma operação indisponível.")
            if isinstance(node, exp.Var) and not isinstance(node.parent, (exp.Extract, exp.TimestampTrunc, exp.DateTrunc)):
                raise ValueError("Variável SQL indisponível no explorador.")
            if isinstance(node, exp.Table):
                if (node.db or node.catalog or not isinstance(node.this, exp.Identifier)
                        or node.name.lower() not in TABLES | aliases):
                    raise ValueError("Use apenas as tabelas listadas no explorador.")
            if isinstance(node, exp.Func):
                name = node.name.upper() if isinstance(node, exp.Anonymous) else node.sql_name()
                if name not in FUNCTIONS:
                    raise ValueError(f"Função indisponível no explorador: {name}.")
        limit = statement.args.get("limit")
        if limit is not None:
            size = limit.expression
            if not isinstance(size, exp.Literal) or not size.is_int or int(size.this) < 0:
                raise ValueError("Use um limite de linhas inteiro.")
            if int(size.this) <= ROW_LIMIT + 1:
                return statement.sql(dialect=dialect)
        return statement.limit(ROW_LIMIT + 1).sql(dialect=dialect)
    except SqlglotError as exc:
        raise ValueError("Sintaxe SQL inválida para o motor selecionado.") from exc


def arrow_table(cursor, table):
    fields = FIELDS[table].split()
    cursor.execute(f"SELECT {', '.join(fields)} FROM {table}")
    rows = cursor.fetchall()
    arrays = []
    for column in fields:
        values = [row[column] for row in rows]
        if column == "ranked":
            arrays.append(pa.array([bool(value) for value in values], type=pa.bool_()))
        elif column in NUMBERS or (column == "id" and table in {"update_log", "meta_observations"}):
            arrays.append(pa.array(values, type=pa.int64()))
        elif column in TIMESTAMPS:
            arrays.append(pa.array(values, type=pa.timestamp("ms")))
        elif column in DATES:
            arrays.append(pa.array(values, type=pa.date32()))
        else:
            arrays.append(pa.array(values, type=pa.string()))
    return pa.Table.from_arrays(arrays, names=fields)


def parquet(cursor, table):
    output = io.BytesIO()
    pq.write_table(arrow_table(cursor, table), output, compression="zstd")
    return output.getvalue()


def explore(cursor, raw, engine):
    sql = checked_sql(raw, engine)
    try:
        if engine == "postgres":
            cursor.execute("SET TRANSACTION READ ONLY")
            cursor.execute("SET LOCAL statement_timeout=5000")
            cursor.execute(sql)
            columns = [desc[0] for desc in cursor.description]
            records = cursor.fetchall()
            if records:
                columns = list(records[0])
            rows = [list(record.values()) for record in records]
        else:
            with duckdb.connect(":memory:", config={"memory_limit": "256MB", "threads": 2}) as db:
                for table in sorted(TABLES):
                    db.register("_source", pq.read_table(io.BytesIO(parquet(cursor, table))))
                    db.execute(f"CREATE TABLE {table} AS SELECT * FROM _source")
                    db.unregister("_source")
                db.execute("SET enable_external_access=false")
                db.execute("SET lock_configuration=true")
                result = db.execute(sql)
                columns = [desc[0] for desc in result.description]
                rows = result.fetchall()
    except (psycopg.Error, duckdb.Error) as exc:
        raise ValueError(f"O motor recusou a consulta: {str(exc)[:240]}") from exc
    return {"columns": columns, "rows": rows[:ROW_LIMIT], "truncated": len(rows) > ROW_LIMIT}
