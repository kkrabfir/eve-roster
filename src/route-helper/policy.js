const _ = require('underscore');

const moment = require('moment');
const CONFIG = require('../config-loader').load();


const MODIFY_MAIN_WINDOW_DURATION =
    moment.duration(7, 'days').asMilliseconds();

module.exports = {
  canDesignateMain(accountCreated) {
    return Date.now() < accountCreated + MODIFY_MAIN_WINDOW_DURATION;
  },

  TIMEZONE_LABELS: ['US West', 'US East', 'EU West', 'EU East', 'Aus', 'Other'],
};
