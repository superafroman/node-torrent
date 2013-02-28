
var LOGGER = require('log4js').getLogger('processutils.js');

var callCount = 0;

function nextTick(callback) {
  setTimeout(callback, 1);
}

exports.nextTick = nextTick;