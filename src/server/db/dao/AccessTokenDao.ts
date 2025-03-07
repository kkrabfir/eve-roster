import { Tnex, val } from "../../db/tnex/index.js";
import { Dao } from "../dao.js";
import { accessToken, AccessToken } from "../tables.js";

export default class AccessTokenDao {
  constructor(private _parent: Dao) {}

  getForCharacter(db: Tnex, characterId: number) {
    return db
      .select(accessToken)
      .where("accessToken_character", "=", val(characterId))
      .columns(
        "accessToken_character",
        "accessToken_refreshToken",
        "accessToken_accessToken",
        "accessToken_accessTokenExpires",
        "accessToken_needsUpdate"
      )
      .fetchFirst();
  }

  getAll(db: Tnex, characterIds: number[]) {
    return db
      .select(accessToken)
      .whereIn("accessToken_character", characterIds)
      .columns(
        "accessToken_character",
        "accessToken_refreshToken",
        "accessToken_accessToken",
        "accessToken_accessTokenExpires",
        "accessToken_needsUpdate"
      )
      .run();
  }

  updateAll(
    db: Tnex,
    rows: Pick<
      AccessToken,
      | "accessToken_character"
      | "accessToken_refreshToken"
      | "accessToken_accessToken"
      | "accessToken_accessTokenExpires"
      | "accessToken_needsUpdate"
    >[]
  ) {
    return db.updateAll(accessToken, "accessToken_character", rows);
  }

  updateForCharacter(db: Tnex, characterId: number, row: Partial<AccessToken>) {
    return db
      .update(accessToken, row)
      .where("accessToken_character", "=", val(characterId))
      .run();
  }

  markAsExpired(db: Tnex, characterId: number) {
    return db
      .update(accessToken, {
        accessToken_needsUpdate: true,
      })
      .where("accessToken_character", "=", val(characterId))
      .run()
      .then((updateCount) => {
        if (updateCount != 1) {
          throw new Error(`No token to update for character ${characterId}.`);
        }
      });
  }

  /**
   * Stronger than markAsExpired - this indicates that not only is the access
   * token expired, but the underlying refresh token is in some way flawed (e.g.
   * doesn't have the correct scopes). Wipes out the existing refresh token so
   * we won't try to use it again until a user re-authenticates the character
   * with the roster app again.
   */
  markAsInvalid(db: Tnex, characterId: number) {
    return db
      .update(accessToken, {
        accessToken_accessToken: "",
        accessToken_accessTokenExpires: 0,
        accessToken_refreshToken: "",
        accessToken_needsUpdate: true,
      })
      .where("accessToken_character", "=", val(characterId))
      .run()
      .then((updateCount) => {
        if (updateCount != 1) {
          throw new Error(`No token to update for character ${characterId}.`);
        }
      });
  }

  upsert(
    db: Tnex,
    characterId: number,
    refreshToken: string,
    scopes: string[],
    accessTokenVal: string,
    accessTokenExpires: number
  ) {
    return db.upsert(
      accessToken,
      {
        accessToken_character: characterId,
        accessToken_refreshToken: refreshToken,
        accessToken_accessToken: accessTokenVal,
        accessToken_accessTokenExpires: accessTokenExpires,
        accessToken_needsUpdate: false,
        accessToken_scopes: scopes,
      },
      "accessToken_character"
    );
  }
}
