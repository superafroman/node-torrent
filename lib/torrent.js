var bencode = require('./bencode');
var crypto = require("crypto");
var fs = require('fs');
var net = require('net');
var util = require('util');

var BitField = require('./bitfield');
var EventEmitter = require('events').EventEmitter;
var File = require('./file');
var Message = require('./message');
var Peer = require('./peer');
var Piece = require('./piece');
var Tracker = require('./tracker');

const LOAD_ERROR = 'TORRENT_LOAD_ERROR';

var Torrent = function(clientId, port, file) {
  EventEmitter.call(this);

  this.clientId = clientId;
  this.port = port;
  this.downloaded = 0;
  this.downloadTime = 0;

  this.seeders = 0;
  this.leechers = 0;

  this.peers = {};

  var self = this;
  fs.readFile(file, 'binary', function(err, data) {
    if (err) {
      self.status = LOAD_ERROR;
    } else {
      parse(self, data);
    }
  });
}
util.inherits(Torrent, EventEmitter);

Torrent.prototype.addPeer = function(peer) {
  var self = this;
  peer.once(Peer.CONNECT, function() {
    if (self.peers[peer.peerId]) {
      peer.disconnect('Already connected.');
    } else {
      self.peers[peer.peerId] = peer;
      peer.sendMessage(new Message(Message.BITFIELD, self.bitfield.toBuffer()));
    }
  });
  peer.once(Peer.DISCONNECT, function() {
    self.removePeer(peer);
  });
  peer.on(Peer.READY, function() {
    peerReady(self, peer);
  });
  peer.on(Peer.COMPLETE, function(piece) {
    peerComplete(self, peer, piece);
  });
};

Torrent.prototype.removePeer = function(peer) {
  peer.removeAllListeners(Peer.CONNECT);
  peer.removeAllListeners(Peer.DISCONNECT);
  peer.removeAllListeners(Peer.READY);
  delete this.peers[peer.peerId];
};

Torrent.prototype.start = function() {
  var self = this;
  for (var i = 0; i < this.trackers.length; i++) {
    this.trackers[i].start((function(tracker) {
      return function(data) {
        trackerUpdated(self, tracker, data);
      };
    })(this.trackers[i]));
  }
  this.timeoutId = setTimeout(function() {
    run(self);
  }, 500);
};

Torrent.prototype.stop = function() {
  clearTimeout(this.timeoutId);
  for (var i = 0; i < this.trackers.length; i++) {
    this.trackers[i].stop();
  }
};

Torrent.prototype.trackerInfo = function() {
  return {
    info_hash: this.infoHash,
    peer_id: this.clientId,
    port: this.port,
    uploaded: 0,
    downloaded: this.downloaded,
    left: this.size
  };
};

function parse(self, data) {

  var rawTorrent = bencode.decode(data);

  self.name = rawTorrent.info.name;
  self.createdBy = rawTorrent['created by'];
  self.creationDate = rawTorrent['creation date'];

  var announceList = rawTorrent['announce-list'];
  var announceMap = {};

  // filter out duplicates with a map
  if (announceList) {
    for (var i = 0; i < announceList.length; i++) {
      announceMap[announceList[i][0]] = 0;
    }
  }
  announceMap[rawTorrent.announce] = 0;

  self.trackers = [];
  var url = require('url');
  for (var i in announceMap) {
    self.trackers.push(new Tracker(i, self));
  }

  self.infoHash = new Buffer(crypto.createHash("sha1")
    .update(bencode.encode(rawTorrent.info))
    .digest(), "binary");

  self.files = [];
  if (rawTorrent.info.length) {
      var length = rawTorrent.info.length;
      var path = this.name;
      self.files.push(new File(path, length));
      self.size = length;
  } else {
    var files = rawTorrent.info.files;
    self.size = 0;
    for (var i = 0; i < files.length; i++) {
      self.files.push(new File(files[i].path, files[i].length));
      self.size += files[i].length;
    }
  }

  self.pieceLength = rawTorrent.info['piece length'];
  self.pieces = rawTorrent.info.pieces;

  var bitfieldLength = Math.ceil(self.size / self.pieceLength);
  self.bitfield = new BitField(bitfieldLength);

  self.emit('ready');
};

function peerComplete(self, peer, piece) {
  // validate piece
  // add to file
  peerReady(self, peer);
}

function peerReady(self, peer) {
  var available = peer.bitfield.xor(peer.bitfield.and(self.bitfield));
  var set = available.setIndexes();
  var index = set[Math.round(Math.random() * set.length)];
  peer.requestPiece(new Piece(index, self.pieceLength));
}

function trackerUpdated(self, tracker, data) {
  
  var seeders = data['complete'];
  if (tracker.seeders) {
    self.seeders -= tracker.seeders;
  }
  tracker.seeders = seeders;
  if (tracker.seeders) {
    self.seeders += tracker.seeders;
  }
  
  var leechers = data['incomplete'];
  if (tracker.leechers) {
    self.leechers -= tracker.leechers;
  }
  tracker.leechers = leechers;
  if (tracker.leechers) {
    self.leechers += tracker.leechers;
  }

  if (data['peers']) {
    var peers = new Buffer(data['peers'], 'binary');
    for (var i = 0; i < peers.length; i += 6) {
      var ip = peers[i] + '.' + peers[i + 1] + '.' + peers[i + 2] + '.' + peers[i + 3];
      var port = peers[i + 4] << 8 | peers[i + 5]
      if (!self.peers[ip]) {
        var stream = net.createConnection(port, ip);
        var peer = new Peer(stream, null, self);
        self.addPeer(peer);
      }
    }
  }
  self.emit('updated');
}

module.exports = Torrent;
