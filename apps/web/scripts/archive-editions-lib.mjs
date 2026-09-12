import { basename } from "node:path";

const RETIREMENT_MARKER_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.retired$/i;

export function validateRetirementMarker(path, contents) {
  const match = RETIREMENT_MARKER_PATTERN.exec(basename(path));
  if (!match) {
    throw new Error(
      `${path}: retirement marker must be named <edition-uuid>.retired`,
    );
  }

  const byteLength = Buffer.isBuffer(contents)
    ? contents.length
    : Buffer.byteLength(String(contents));
  if (byteLength !== 0) {
    throw new Error(`${path}: retirement marker must be an empty file`);
  }
  return match[1].toLowerCase();
}

export function parseRetirementArguments(arguments_) {
  let help = false;
  const paths = [];
  for (const argument of arguments_) {
    if (argument === "--help" || argument === "-h") {
      help = true;
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    } else {
      paths.push(argument);
    }
  }
  if (!help && paths.length === 0) {
    throw new Error("Provide at least one <edition-uuid>.retired marker");
  }
  return { help, paths };
}

export async function archiveEditionIds(sql, editionIds) {
  const uniqueIds = [...new Set(editionIds)];
  const totals = { markers: uniqueIds.length, editionsMarked: 0, passagesArchived: 0 };

  await sql.begin(async (transaction) => {
    for (const editionId of uniqueIds) {
      if (!RETIREMENT_MARKER_PATTERN.test(`${editionId}.retired`)) {
        throw new Error(`Invalid edition UUID: ${editionId}`);
      }

      const existingEdition = await transaction`
        SELECT id
        FROM editions
        WHERE id = ${editionId}::uuid
        FOR UPDATE
      `;
      if (existingEdition.length !== 1) {
        throw new Error(
          `Retirement marker ${editionId}.retired does not match an existing edition`,
        );
      }

      const archived = await transaction`
        UPDATE passages
        SET status = 'archived', published_at = NULL
        WHERE edition_id = ${editionId}::uuid
          AND (status <> 'archived' OR published_at IS NOT NULL)
        RETURNING id
      `;
      totals.passagesArchived += archived.length;

      const editions = await transaction`
        UPDATE editions
        SET metadata = metadata || jsonb_build_object(
          'retired', true,
          'retiredAt', now()
        )
        WHERE id = ${editionId}::uuid
          AND metadata ->> 'retired' IS DISTINCT FROM 'true'
        RETURNING id
      `;
      totals.editionsMarked += editions.length;
    }
  });

  return totals;
}
