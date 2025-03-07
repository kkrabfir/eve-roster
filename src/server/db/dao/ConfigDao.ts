import Bluebird from "bluebird";

import { Tnex, val } from "../../db/tnex/index.js";
import { Dao } from "../dao.js";
import {
  config,
  groupTitle,
  GroupTitle,
  memberCorporation,
  MemberCorporation,
} from "../tables.js";
import { serialize } from "../../util/asyncUtil.js";
import { UserVisibleError } from "../../error/UserVisibleError.js";
import { Nullable } from "../../../shared/util/simpleTypes.js";

export interface ConfigEntries {
  siggyUsername: string;
  siggyPassword: string;
  srpJurisdiction: { start: number; end: number | undefined };
  killmailSyncRanges: { [key: number]: { start: number; end: number } };
}

export default class ConfigDao {
  constructor(private _parent: Dao) {}

  get<K extends keyof ConfigEntries>(db: Tnex, ...names: K[]) {
    return db
      .select(config)
      .whereIn("config_key", names)
      .columns("config_key", "config_value")
      .run()
      .then((rows) => {
        const config = {} as Nullable<Pick<ConfigEntries, K>>;
        for (const row of rows) {
          config[row.config_key as K] = row.config_value as any;
        }
        return config;
      });
  }

  set(db: Tnex, values: Nullable<Partial<ConfigEntries>>) {
    return serialize(Object.keys(values), (key) => {
      const value = (values as any)[key];
      return db
        .update(config, { config_value: value })
        .where("config_key", "=", val(key))
        .run()
        .then((updated) => {
          if (updated != 1) {
            throw new Error(
              `Cannot write to nonexistent config value "${key}"`
            );
          }
        });
    }).then((_results) => {});
  }

  getSiggyCredentials(db: Tnex) {
    return this.get(db, "siggyUsername", "siggyPassword").then((config) => {
      return {
        username: config.siggyUsername,
        password: config.siggyPassword,
      };
    });
  }

  setSiggyCredentials(
    db: Tnex,
    username: string | null,
    password: string | null
  ) {
    return this.set(db, {
      siggyUsername: username,
      siggyPassword: password,
    });
  }

  getMemberCorporations(db: Tnex): Promise<MemberCorporation[]> {
    return db
      .select(memberCorporation)
      .columns(
        "mcorp_corporationId",
        "mcorp_membership",
        "mcorp_name",
        "mcorp_ticker"
      )
      .run();
  }

  setMemberCorpConfigs(
    db: Tnex,
    corpConfigs: MemberCorporation[],
    titleMappings: GroupTitle[]
  ) {
    return db.transaction((db) => {
      return Promise.resolve()
        .then(() => {
          return db.del(groupTitle).run();
        })
        .then(() => {
          return db.del(memberCorporation).run();
        })
        .then(() => {
          if (corpConfigs.length > 0) {
            return db.insertAll(memberCorporation, corpConfigs);
          }
          return null;
        })
        .then(() => {
          return Bluebird.map(titleMappings, (link) => {
            return db.insert(groupTitle, link).catch((_e) => {
              throw new UserVisibleError(
                `Invalid title mapping "${link.groupTitle_title}" ->` +
                  ` "${link.groupTitle_group}".` +
                  ` Did you forget to create the group first?`
              );
            });
          });
        });
    });
  }

  getCorpTitleToGroupMapping(db: Tnex, corporationId: number) {
    return db
      .select(groupTitle)
      .where("groupTitle_corporation", "=", val(corporationId))
      .columns("groupTitle_title", "groupTitle_group")
      .run();
  }

  getSrpMemberCorporations(db: Tnex) {
    return db
      .select(memberCorporation)
      .where("mcorp_membership", "=", val("full"))
      .columns(
        "mcorp_corporationId",
        "mcorp_membership",
        "mcorp_name",
        "mcorp_ticker"
      )
      .run();
  }
}
