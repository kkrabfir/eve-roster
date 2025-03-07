import _ from "underscore";

import { Tnex, val } from "../../db/tnex/index.js";
import { Dao } from "../dao.js";
import {
  accountGroup,
  groupExplicit,
  groupPriv,
  groupTitle,
  privilege,
} from "../tables.js";
import { MEMBER_GROUP } from "../../domain/account/specialGroups.js";

export default class GroupsDao {
  constructor(private _parent: Dao) {}

  getExplicitGroups(db: Tnex, accountId: number) {
    return db
      .select(groupExplicit)
      .columns("groupExplicit_group")
      .where("groupExplicit_account", "=", val(accountId))
      .run()
      .then((rows) => {
        return _.pluck(rows, "groupExplicit_group");
      });
  }

  getTitleDerivedGroups(db: Tnex, corporationId: number, titles: string[]) {
    return db
      .select(groupTitle)
      .columns("groupTitle_group")
      .whereIn("groupTitle_title", titles)
      .andWhere("groupTitle_corporation", "=", val(corporationId))
      .run()
      .then((rows) => {
        return _.pluck(rows, "groupTitle_group");
      });
  }

  getAccountGroups(db: Tnex, accountId: number) {
    return db
      .select(accountGroup)
      .columns("accountGroup_group")
      .where("accountGroup_account", "=", val(accountId))
      .run()
      .then((rows) => {
        return _.pluck(rows, "accountGroup_group");
      });
  }

  getAllGroupsByAccount(db: Tnex) {
    return db
      .select(accountGroup)
      .columns("accountGroup_group", "accountGroup_account")
      .run()
      .then((rows) => {
        return rows.reduce((ret, row) => {
          const prev = ret.get(row.accountGroup_account) ?? [];
          prev.push(row.accountGroup_group);
          ret.set(row.accountGroup_account, prev);
          return ret;
        }, new Map<number, string[]>());
      });
  }

  setAccountGroups(db: Tnex, accountId: number, groups: string[]) {
    return db.transaction((db) => {
      let oldGroups: string[];

      return this.getAccountGroups(db, accountId)
        .then((_oldGroups) => {
          oldGroups = _oldGroups;

          const rows = groups.map((group) => {
            return {
              accountGroup_account: accountId,
              accountGroup_group: group,
            };
          });

          return db.replace(
            accountGroup,
            "accountGroup_account",
            accountId,
            rows
          );
        })
        .then(() => {
          groups.sort((a, b) => a.localeCompare(b));
          oldGroups.sort((a, b) => a.localeCompare(b));
          if (!_.isEqual(oldGroups, groups)) {
            return this._parent.log.logEvent(
              db,
              accountId,
              "MODIFY_GROUPS",
              null,
              {
                old: oldGroups,
                new: groups,
              }
            );
          }
          return null;
        })
        .then(() => {
          if (
            !oldGroups.includes(MEMBER_GROUP) &&
            groups.includes(MEMBER_GROUP)
          ) {
            return this._parent.log.logEvent(db, accountId, "GAIN_MEMBERSHIP");
          } else if (
            oldGroups.includes(MEMBER_GROUP) &&
            !groups.includes(MEMBER_GROUP)
          ) {
            return this._parent.log.logEvent(db, accountId, "LOSE_MEMBERSHIP");
          } else {
            return null;
          }
        });
    });
  }

  getPrivilegesForGroups(db: Tnex, groups: string[]) {
    // This query has an odd structure because we need to select all privileges,
    // not just those that have been granted to this account. This is because
    // some privileges are inherently granted to the owner of the resource even
    // if the owner doesn't have that privilege in general. Thus, we need to
    // know the owner level for every privilege in order to know whether the
    // account has access.
    return db
      .select(privilege)
      .leftJoin(
        // Subquery: all the privileges these groups have been granted
        db
          .subselect(groupPriv, "granted")
          .max("gp_level", "granted_level")
          .columnAs("gp_privilege", "granted_privilege")
          .whereIn("gp_group", groups)
          .groupBy("gp_privilege"),
        "granted_privilege",
        "=",
        "priv_name"
      )
      .columns(
        "priv_name",
        "granted_level",
        "priv_ownerLevel",
        "priv_requiresMembership"
      )
      .run();
  }
}
