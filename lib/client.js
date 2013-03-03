
var log4js = require("log4js")
  , net = require("net")
  , dht = require("./dht")
  , Peer = require("./peer")
  , Torrent = require("./torrent")
  ;

var Client = function(options) {
  options = options || {};

  log4js.setGlobalLogLevel(log4js.levels[options.logLevel || 'WARN']);

  var clientId = options.clientId || '-NT0001-';
  this.clientId = (typeof(clientId) === 'string') ? padClientId(clientId) : clientId;

  this.torrents = {};
  
  var client = this;
  this.server = net.createServer(function(stream) {
    client.handleConnection(stream);
  });

  this.downloadPath = options.downloadPath || '.';

  this.port = listen(this.server, 
    options.portRangeStart || 6881, 
    options.portRangeEnd || 6889);

  dht.init();
};

// TODO: passing around clientId and port..?
// TODO: don't pass in file, or handle multiple types, e.g. urls
Client.prototype.addTorrent = function(url) {
  var torrent = new Torrent(this.clientId, this.port, url, this.downloadPath);
  var client = this;
  torrent.once('ready', function() {
    if (!client.torrents[torrent.infoHash]) {
      client.torrents[torrent.infoHash] = torrent;
    }
    torrent.start();
  });
  return torrent;
};

Client.prototype.removeTorrent = function(torrent) {
  if (this.torrents[torrent.infoHash]) {
    this.torrents[torrent.infoHash] = null;
  }
}

Client.prototype.findTorrent = function(infoHash) {
  return this.torrents[infoHash];
};

Client.prototype.handleConnection = function(stream) {
  var peer = new Peer(stream);
  var self = this;
  peer.once(Peer.CONNECT, function(infoHash) {
    var torrent = self.findTorrent(infoHash);
    if (torrent) {
      peer.setTorrent(torrent);
    } else {
      peer.disconnect('Peer attempting to download unknown torrent.');
    }
  });
};

Client.prototype.listTorrents = function() {
  var info = [];
  for (var hash in this.torrents) {
    var torrent = this.torrents[hash];
    info.push({
      name: torrent.name,
      downloaded: (torrent.downloaded / torrent.size) * 100,
      downloadRate: torrent.calculateDownloadRate(),
      uploaded: (torrent.uploaded / torrent.size) * 100,
      uploadRate: torrent.calculateUploadRate(),
      seeders: torrent.seeders,
      leechers: torrent.leechers,
      peers: torrent.listPeers(),
      trackers: torrent.listTrackers(),
      size: torrent.size,
      pieces: torrent.pieces.length,
      pieceLength: torrent.pieceLength,
      createdBy: torrent.createdBy,
      creationDate: torrent.creationDate,
      files: torrent.files
    });
  }
  return info;
};

function listen(server, startPort, endPort) {
  var connected = false;
  var port = startPort;
  
  do {
    try {
      server.listen(port);
      connected = true;
      console.log('Listening for connections on %j', server.address());
    } catch(err) { 
    }
  }
  while (!connected && port++ != endPort);
  
  if (!connected) {
    throw new Error('Could not listen on any ports in range ' + startPort + ' - ' + endPort);
  }
  return port;
}

function padClientId(clientId) {
  
  var id = new Buffer(20);
  id.write(clientId, 0, 'ascii');
  
  var start = clientId.length;
  for (var i = start; i < 20; i++) {
    id[i] = Math.floor(Math.random() * 255);
  }
  return id;
}

module.exports = exports = Client;