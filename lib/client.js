
var net = require("net");
var Torrent = require("./torrent");

var Client = function(options) {
  options = options || {};
  this.clientId = padClientId(options.clientId || '-NT0001-');
  this.torrents = {};
  this.server = net.createServer(this.handleConnection);
  this.port = listen(this.server, 
    options.portRangeStart || 6881, 
    options.portRangeEnd || 6889);
};

// TODO: passing around clientId and port..?
// TODO: don't pass in file, or handle multiple types, e.g. urls
Client.prototype.addTorrent = function(file) {
  var torrent = new Torrent(this.clientId, this.port, file);
  var self = this;
  torrent.on('ready', function() {
    if (!self.torrents[torrent.infoHash]) {
      self.torrents[torrent.infoHash] = torrent;
    }
    torrent.start();
  });
};

Client.prototype.findTorrent = function(infoHash) {
  return this.torrents[infoHash];
}

Client.prototype.handleConnection = function(stream) {
  console.log('handleConnection: ' + stream);
  // dns.reverse - http://nodejs.org/docs/v0.3.1/api/dns.html
};

Client.prototype.listTorrents = function() {
  var info = [];
  for (var hash in this.torrents) {
    var torrent = this.torrents[hash];
    info.push({
      name: torrent.name,
      downloaded: (torrent.downloaded / torrent.size) * 100,
      downloadRate: torrent.calculateDownloadRate(),
      seeders: torrent.seeders,
      leechers: torrent.leechers,
      peers: torrent.listPeers(),
      trackers: torrent.listTrackers()
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