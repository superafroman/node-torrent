
var log4js = require("log4js");
var net = require("net");

var Peer = require("./peer");
var Torrent = require("./torrent");

var Client = function(options) {
  options = options || {};

  log4js.setGlobalLogLevel(log4js.levels[options.logLevel || 'WARN']);

  this.clientId = padClientId(options.clientId || '-NT0001-');
  this.torrents = {};
  
  var self = this;
  this.server = net.createServer(function(stream) {
    self.handleConnection(stream);
  });

  this.downloadPath = options.downloadPath || '.';

  this.port = listen(this.server, 
    options.portRangeStart || 6881, 
    options.portRangeEnd || 6889);
};

// TODO: passing around clientId and port..?
// TODO: don't pass in file, or handle multiple types, e.g. urls
Client.prototype.addTorrent = function(file) {
  var torrent = new Torrent(this.clientId, this.port, file, this.downloadPath);
  var self = this;
  torrent.on('ready', function() {
    if (!self.torrents[torrent.infoHash]) {
      self.torrents[torrent.infoHash] = torrent;
    }
    torrent.start();
  });
  return torrent;
};

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

module.exports = Client;