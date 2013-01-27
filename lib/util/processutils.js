
var LOGGER = require('log4js').getLogger('processutils.js');

var callCount = 0;

function nextTick(callback) {
  process.nextTick(callback);
  //setTimeout(callback, 0);

  //callCount++;
  //LOGGER.debug('nextTick call ' + callCount);
}

exports.nextTick = nextTick;