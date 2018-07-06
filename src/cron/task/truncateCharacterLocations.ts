import moment = require('moment');

import { Tnex } from '../../tnex';
import { dao } from '../../dao';
import { JobLogger } from '../Job';


export async function truncateCharacterLocations(db: Tnex, job: JobLogger) {
  let cutoff = moment().subtract(120, 'days').valueOf();

  await dao.characterLocation.deleteOldLocations(db, cutoff)
};
