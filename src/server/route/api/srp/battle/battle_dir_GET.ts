import { jsonEndpoint } from "../../../../infra/express/protectedEndpoint.js";
import { ResultOrder } from "../../../../db/tnex/index.js";
import { BattleColumn, BoundCmp } from "../../../../db/dao/BattleDao.js";
import { dao } from "../../../../db/dao.js";
import {
  optional,
  array,
  stringEnum,
  number,
  boolean,
  object,
  verify,
} from "../../../../util/express/schemaVerifier.js";
import {
  jsonQuery,
  boolQuery,
} from "../../../../util/express/paramVerifier.js";
import {
  BattleOutput,
  battlesToJson,
} from "../../../../domain/battle/battlesToJson.js";

const FILTER_SCHEMA = {
  id: optional(number()),
  orderBy: optional(
    array({
      key: stringEnum<BattleColumn>(BattleColumn),
      order: stringEnum<ResultOrder>(ResultOrder),
    })
  ),
  limit: optional(number()),
  offset: optional(number()),
  untriaged: optional(boolean()),
  bound: optional(
    object({
      col: stringEnum<BattleColumn>(BattleColumn),
      cmp: stringEnum<BoundCmp>(BoundCmp),
      value: number(),
    })
  ),
};

export default jsonEndpoint(
  async (req, res, db, _account, _privs): Promise<BattleOutput> => {
    const includeSrps = boolQuery(req, "includeSrp") || false;
    const filter = verify(jsonQuery(req, "filter") || {}, FILTER_SCHEMA);

    if (filter.limit == undefined) {
      filter.limit = 30;
    }
    filter.limit = Math.min(100, Math.max(1, filter.limit));

    if (filter.offset != undefined) {
      filter.offset = Math.max(0, filter.offset);
    }

    const battles = await dao.battle.listBattles(db, filter);

    return battlesToJson(db, battles, includeSrps);
  }
);
