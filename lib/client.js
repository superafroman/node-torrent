var log4js = require("log4js")
  , net = require("net")
  , dht = require("./dht")
  , Peer = require("./peer")
  , Torrent = require("./torrent")
  , TorrentData = require("./torrentdata")
  ;

var LOGGER = log4js.getLogger('client.js');

Client()

/**
 * Create a new torrent client.  
 * @param { Object } options
 * @param { '-NT0000-' | Buffer} options.id
 * @param { String } options.downloadPath Defaults to '.'
 * @param { Object } options.portRange
 * @param { number } options.portRange.start Defaults to 6881
 * @param { number } options.portRange.end Defaults to 6889
 * @param { 'TRACE' | 'DEBUG' | 'INFO'} options.logLevel Not used
 */
var Client = function(options) {

  options = options || {};

  log4js.getLogger().level = 'warn'

  var id = options.id || '-NT0010-';
  if (id instanceof Buffer) {
    if (id.length !== 20) {
      throw new Error('Client ID must be 20 bytes');
    }
    this.id = id;
  } else {
    this.id = padId(id);
  }

  /**
   * @type { Object.<String, Torrent> }
   */
  this.torrents = {};
  /**
   * @type { String }
   */
  this.downloadPath = options.downloadPath || '.';
  this._server = net.createServer(this._handleConnection.bind(this));
  /**
   * @type { number }
   */
  this.port = listen(this._server, options.portRange);

  this._extensions = [
    require('./extension/metadata')
  ];

  dht.init();
};

/**
 * @param { function(Torrent) } ExtensionClass 
 */
Client.prototype.addExtension = function(ExtensionClass) {
  this._extensions.push(ExtensionClass);
};

/**
 * 
 * @param { String } url Torrent file path or Magnet URL / link
 * @returns { Torrent } The added torrent
 */
Client.prototype.addTorrent = function(url) {
  var torrent = new Torrent(this.id, this.port, this.downloadPath, url, this._extensions.slice(0));
  var client = this;

  torrent.once(Torrent.INFO_HASH, function(infoHash) {
    LOGGER.debug('Received info hash event from torrent, starting.');
    if (!client.torrents[infoHash]) {
      client.torrents[infoHash] = torrent;
    }
    torrent.start();
  });
  return torrent;
};

/**
 * 
 * @param { Torrent } torrent 
 */
Client.prototype.removeTorrent = function(torrent) {
  if (this.torrents[torrent.infoHash]) {
    this.torrents[torrent.infoHash].stop();
    delete this.torrents[torrent.infoHash];
  }
};

Client.prototype._handleConnection = function(stream) {
  var peer = new Peer(stream),
      client = this;
  peer.once(Peer.CONNECT, function(infoHash) {
    var torrent = self.torrents[infoHash];
    if (torrent) {
      peer.setTorrent(torrent);
    } else {
      peer.disconnect('Peer attempting to download unknown torrent.');
    }
  });
};

function listen(server, portRange) {
  
  portRange = portRange || {};

  var connected = false,
      port = portRange.start || 6881,
      endPort = portRange.end || port + 8;

  do {
      // Handling error
      server.on('error', function(err) {
          LOGGER.error(err.message);
      });

      server.listen(port);
      connected = true;
      LOGGER.info('Listening for connections on %j', server.address());
  }
  while (!connected && port++ != endPort);
  
  if (!connected) {
    throw new Error('Could not listen on any ports in range ' + startPort + ' - ' + endPort);
  }
  return port;
}

function padId(id) {
  
  var newId = Buffer.alloc(20);
  newId.write(id, 0, 'ascii');
  
  var start = id.length;
  for (var i = start; i < 20; i++) {
    newId[i] = Math.floor(Math.random() * 255);
  }
  return newId;
}

module.exports = exports = Client;
