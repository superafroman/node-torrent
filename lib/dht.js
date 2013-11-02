var dht = require('dht.js');

var LOGGER = require('log4js').getLogger('dht.js');

var bootstrapNodes = [
  { address: 'router.bittorrent.com', port: 6881 },
  { address: 'router.utorrent.com', port: 6881 }
];

var node = null,
    hashes = {};

var DHT = {

  init: function(callback) {

    node = dht.node.create();

    node.on('peer:new', handleNewPeer);
    
    node.on('error', function(error) {
      LOGGER.error('Error recieved from DHT node. error = ' + error);
      console.log(error);
    });

    node.once('listening', function() {
      LOGGER.debug('Initialised DHT node on port %j', node.port);
      bootstrapNodes.forEach(function(bootstrapNode) {
        LOGGER.debug('Connecting to node at ' + bootstrapNode.address + ':' + bootstrapNode.port);
        node.connect(bootstrapNode);
      });
      if (callback) {
        callback();
      }
    });
  },

  advertise: function(infohash, callback) {
    hashes[infohash] = callback;
    node.advertise(infohash);
  }
};

function handleNewPeer(infohash, peer, isAdvertised) {
  LOGGER.debug('Handling peer connection over DHT');
  if (!isAdvertised) {
    LOGGER.debug('Incoming peer connection not advertised, ignoring.');
    return;
  }
  if (peer.port <= 0 || peer.port >= 65536) {
    LOGGER.debug('Invalid peer socket %s:%s, ignoring.', peer.address, peer.port);
    return;
  }
  if (hashes[infohash]) {
    hashes[infohash](null, peer.address, peer.port);
  }
}

module.exports = exports = DHT;
