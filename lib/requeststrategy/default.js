
var LOGGER = require('log4js').getLogger('requeststrategy/default.js');

function DefaultRequestStrategy() {
}

DefaultRequestStrategy.prototype.peerDisconnected = function(peer) {
  LOGGER.debug('peerDisconnected: ' + peer.getIdentifier());
};

DefaultRequestStrategy.prototype.peerReady = function(peer) {
  LOGGER.debug('peerReady: ' + peer.getIdentifier());
};

module.exports = exports = DefaultRequestStrategy;
