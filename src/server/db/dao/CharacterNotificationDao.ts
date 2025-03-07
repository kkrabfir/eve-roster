import moment from "moment";
import _ from "underscore";

import { Dao } from "../dao.js";
import { EsiNotification } from "../../data-source/esi/EsiNotification.js";
import { fetchEveNames } from "../../data-source/esi/names.js";
import {
  characterNotification,
  characterNotificationUpdate,
} from "../tables.js";
import { Tnex, val } from "../tnex/index.js";

export default class CharacterNotificationDao {
  constructor(private _parent: Dao) {}

  getRecentStructurePings(db: Tnex, since: moment.Moment, types: string[]) {
    return db
      .select(characterNotification)
      .where("characterNotification_timestamp", ">=", val(+since))
      .whereIn("characterNotification_type", types)
      .columns("characterNotification_text")
      .columns("characterNotification_type")
      .groupBy("characterNotification_text")
      .groupBy("characterNotification_type")
      .run()
      .then((rows) =>
        _.map(rows, async function (row) {
          const sol = row.characterNotification_text.match(
            /solarSystemID: (?<id>\d+)/
          );
          return {
            type: row.characterNotification_type,
            text: row.characterNotification_text,
            system: sol?.groups
              ? (await fetchEveNames([+sol.groups.id]))[+sol.groups.id]
              : "n/a",
          };
        })
      );
  }

  async setCharacterNotifications(
    db: Tnex,
    characterId: number,
    notifications: EsiNotification[]
  ): Promise<void> {
    const items = notifications.map((n) => {
      return {
        characterNotification_character: characterId,
        characterNotification_id: n.notification_id,
        characterNotification_senderId: n.sender_id,
        characterNotification_senderType: n.sender_type,
        characterNotification_text: n.text?.substr(0, 2400) || "",
        characterNotification_timestamp: +moment(n.timestamp),
        characterNotification_type: n.type,
      };
    });

    return db.transaction(async (db) => {
      await db.upsert(
        characterNotificationUpdate,
        {
          characterNotificationUpdate_character: characterId,
          characterNotificationUpdate_timestamp: +moment(),
        },
        "characterNotificationUpdate_character"
      );
      await db.upsertAll(
        characterNotification,
        items,
        "characterNotification_id"
      );
    });
  }

  async getLastUpdateTimestamp(
    db: Tnex,
    characterId: number
  ): Promise<moment.Moment> {
    const timestamp = await db
      .select(characterNotificationUpdate)
      .where("characterNotificationUpdate_character", "=", val(characterId))
      .columns("characterNotificationUpdate_timestamp")
      .fetchFirst();
    return moment(timestamp?.characterNotificationUpdate_timestamp || 0);
  }
}
