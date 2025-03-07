import sqlite3 from "sqlite3";

import { Tnex, val, DEFAULT_NUM } from "../../db/tnex/index.js";
import {
  sdeImport,
  sdeType,
  sdeAttribute,
  sdeTypeAttribute,
} from "../../db/tables.js";

import { JobLogger } from "../../infra/taskrunner/Job.js";
import { checkNotNil } from "../../../shared/util/assert.js";
import { normalizeSearchStr } from "../../eve/sde/normalizeSearchStr.js";
import { computeMd5 } from "./computeMd5.js";
import { fixupImport } from "./fixupImport.js";
import { verifyImport } from "./verifyImport.js";
import {
  TYPE_CAPSULE,
  TYPE_CAPSULE_GENOLUTION,
} from "../../eve/constants/types.js";
import { errorMessage, fullStackTrace } from "../../util/error.js";
import { LogLevel } from "../../infra/logging/Logger.js";

const IMPORTER_VERSION = 0;
const IMPORT_LABEL = "Importing new SDE data...";

/**
 * Imports the SDE data from a Fuzzworks sqlite database.
 */
export async function ingestSde(
  job: JobLogger,
  db: Tnex,
  zipPath: string,
  sqlPath: string
) {
  job.setProgress(undefined, IMPORT_LABEL);

  const sdeDb = await openSqliteDb(sqlPath);
  const md5 = await computeMd5(zipPath);

  job.info(`SDE MD5: ${md5}`);

  return db.transaction((db) => {
    return Promise.resolve(ingestInternal(job, db, sdeDb, md5));
  });
}

export async function ingestSdeDryRun(
  job: JobLogger,
  db: Tnex,
  sqlPath: string
) {
  job.setProgress(undefined, IMPORT_LABEL);
  const sdeDb = await openSqliteDb(sqlPath);

  try {
    await db.transaction(async (db) => {
      await ingestInternal(job, db, sdeDb, "fake_md5");
      throw new Error("Dry run complete");
    });
  } catch (e) {
    const message = errorMessage(e);
    if (message == "Error: Dry run complete") {
      job.log(LogLevel.INFO, "Dry run complete");
    } else {
      job.error(fullStackTrace(e));
      throw e;
    }
  }
}

async function ingestInternal(
  job: JobLogger,
  db: Tnex,
  sde: sqlite3.Database,
  md5: string
) {
  const importId = await createNewImport(db, md5);
  job.info(`Import ID for this task is "${importId}".`);

  const totalSteps = CATEGORIES_TO_IMPORT.length + 1;

  for (let i = 0; i < CATEGORIES_TO_IMPORT.length; i++) {
    const [categoryId, categoryName] = CATEGORIES_TO_IMPORT[i];
    await importItems(job, db, sde, importId, categoryName, categoryId);
    job.setProgress((i + 1) / totalSteps, IMPORT_LABEL);
  }
  await importAttributes(job, db, sde, importId);

  job.setProgress(undefined, "Verifying healthy import...");
  await fixupImport(db);
  await verifyImport(db, job);
}

function createNewImport(db: Tnex, md5: string) {
  return db.insert(
    sdeImport,
    {
      simp_id: DEFAULT_NUM,
      simp_md5: md5,
      simp_importerVersion: IMPORTER_VERSION,
      simp_timestamp: Date.now(),
    },
    "simp_id"
  );
}

async function importItems(
  job: JobLogger,
  db: Tnex,
  sde: sqlite3.Database,
  importId: number,
  categoryName: string,
  categoryId: number
) {
  job.info(`Importing items in category "${categoryName}"...`);

  let processedCount = 0;
  let skippedCount = 0;

  const rows = await queryAll(sde, SELECT_INV_TYPES, [categoryId]);
  for (const row of rows) {
    const typeId = checkNotNil(row.typeID as number);

    if (
      !row.published &&
      // The capsules are not marked as published for...some reason
      typeId != TYPE_CAPSULE &&
      typeId != TYPE_CAPSULE_GENOLUTION
    ) {
      skippedCount++;
      continue;
    }

    if (!row.description) {
      // Avoid occasional Fuzzwork SDE quirks due to changed items etc
      skippedCount++;
      continue;
    }

    processedCount++;

    // Step 1: Upsert item
    await db.upsert(
      sdeType,
      {
        styp_import: importId,
        styp_id: typeId,
        styp_name: row.typeName,
        styp_searchName: normalizeSearchStr(row.typeName),
        styp_group: row.groupID,
        styp_category: row.categoryID,
        styp_description: row.description,
        styp_mass: row.mass,
        styp_volume: row.volume,
        styp_capacity: row.capacity,
        styp_portionSize: row.portionSize,
        styp_race: row.raceID,
        styp_basePrice: row.basePrice,
        styp_marketGroup: row.marketGroupID,
      },
      "styp_id"
    );

    // Step 2: Set itemAttrs
    await db.del(sdeTypeAttribute).where("sta_type", "=", val(typeId)).run();

    const attrRows = await queryAll(sde, SELECT_TYPE_ATTRS, [row.typeID]);
    await db.insertAll(
      sdeTypeAttribute,
      attrRows.map((attr) => {
        return {
          sta_type: typeId,
          sta_attribute: attr.attributeID,
          sta_valueInt: attr.valueInt,
          sta_valueFloat: attr.valueFloat,
        };
      })
    );
  }
  job.info(`  Inserted ${processedCount} records (skipped ${skippedCount}).`);
}

async function importAttributes(
  job: JobLogger,
  db: Tnex,
  sde: sqlite3.Database,
  importId: number
) {
  job.info(`Importing attributes...`);

  let processedCount = 0;
  let skippedCount = 0;

  const rows = await queryAll(sde, SELECT_ATTRIBUTES, []);
  for (const row of rows) {
    if (!row.attributeName && !row.description) {
      // Avoid Fuzzwork SDE quirks due to changes etc
      skippedCount++;
      continue;
    }
    const name = row.attributeName || `attr_${row.attributeID}`;
    const description = row.description || "(none)";
    processedCount++;
    await db.upsert(
      sdeAttribute,
      {
        sattr_import: importId,
        sattr_id: row.attributeID,
        sattr_name: name,
        sattr_description: description,
        sattr_defaultValue: row.defaultValue,
        sattr_icon: row.iconID,
        sattr_displayName: row.displayName,
        sattr_unit: row.unitID,
        sattr_category: row.categoryID,
        sattr_published: !!row.published,
      },
      "sattr_id"
    );
  }

  job.info(`  Inserted ${processedCount} records (skipped ${skippedCount}).`);
}

function queryAll(db: sqlite3.Database, sql: string, params: any[]) {
  return new Promise<any[]>((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

function openSqliteDb(filepath: string): Promise<sqlite3.Database> {
  return new Promise<sqlite3.Database>((resolve, reject) => {
    const db = new sqlite3.Database(filepath, sqlite3.OPEN_READONLY, (e) => {
      if (e == null) {
        resolve(db);
      } else {
        reject(e);
      }
    });
  });
}

const CATEGORIES_TO_IMPORT = [
  [6, "Ship"],
  [7, "Module"],
  [8, "Charge"],
  // [9, 'Blueprint'],
  [16, "Skill"],
  [18, "Drone"],
  [20, "Implant"],
  [22, "Deployables"],
  [32, "Subsystem"],
  [87, "Fighter"],
] as [number, string][];

const SELECT_INV_TYPES = `
SELECT invCategories.categoryID, typeID, invTypes.groupID, typeName,
  description, mass, volume, capacity, portionSize, raceID, basePrice,
  invTypes.published, marketGroupID, invTypes.iconID, soundID, graphicID
FROM invCategories
JOIN invGroups ON invGroups.categoryID = invCategories.categoryID
JOIN invTypes ON invTypes.groupID = invGroups.groupID
WHERE invCategories.categoryID  = ?
`;

const SELECT_TYPE_ATTRS = `
SELECT typeID, attributeID, valueInt, valueFloat
FROM dgmTypeAttributes
WHERE typeId = ?
`;

const SELECT_ATTRIBUTES = `
SELECT attributeID, attributeName, description, iconID, defaultValue, published,
  displayName, unitID, stackable, highIsGood, categoryID
FROM dgmAttributeTypes
`;
