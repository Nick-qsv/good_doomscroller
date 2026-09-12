import postgres from "postgres";

const firstValue = (...values) =>
  values.find((candidate) => candidate !== undefined && candidate !== "");

function parseSecret(environment) {
  const raw =
    environment.DATABASE_SECRET_JSON ?? environment.DB_SECRET_JSON;
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("secret is not an object");
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `DATABASE_SECRET_JSON/DB_SECRET_JSON must be a valid JSON object: ${error.message}`,
    );
  }
}

export function databaseOptions(environment = process.env) {
  const sslSetting = firstValue(
    environment.DATABASE_SSL,
    environment.DB_SSL,
  );
  if (sslSetting && sslSetting !== "require" && sslSetting !== "disable") {
    throw new Error("DATABASE_SSL/DB_SSL must be 'require' or 'disable'");
  }

  if (environment.DATABASE_URL) {
    return {
      url: environment.DATABASE_URL,
      options: {
        max: 1,
        ...(sslSetting === "require" ? { ssl: "require" } : {}),
        ...(sslSetting === "disable" ? { ssl: false } : {}),
      },
    };
  }

  const secret = parseSecret(environment);
  const host = firstValue(
    environment.DATABASE_HOST,
    environment.DB_HOST,
    secret.host,
  );
  const database = firstValue(
    environment.DATABASE_NAME,
    environment.DB_NAME,
    secret.dbname,
    secret.database,
  );
  const username = firstValue(
    environment.DATABASE_USER,
    environment.DB_USER,
    secret.username,
    secret.user,
  );
  const password = firstValue(
    environment.DATABASE_PASSWORD,
    environment.DB_PASSWORD,
    secret.password,
  );

  if (!host || !database || !username || !password) {
    throw new Error(
      "Set DATABASE_URL or DB_HOST, DB_NAME, and database credentials before continuing",
    );
  }

  const portValue = firstValue(
    environment.DATABASE_PORT,
    environment.DB_PORT,
    secret.port?.toString(),
  );
  const port = Number(portValue ?? 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DATABASE_PORT/DB_PORT must be a valid TCP port");
  }

  return {
    options: {
      max: 1,
      ssl: sslSetting === "disable" ? false : "require",
      host,
      port,
      database,
      username,
      password,
    },
  };
}

export function createDatabaseClient(environment = process.env) {
  const configuration = databaseOptions(environment);
  return configuration.url
    ? postgres(configuration.url, configuration.options)
    : postgres(configuration.options);
}
