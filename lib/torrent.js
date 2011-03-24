var bencode = require('./util/bencode');
var crypto = require("crypto");
var fs = require('fs');
var util = require('util');

var BitField = require('./util/bitfield');
var BufferUtils = require('./util/bufferutils');
var EventEmitter = require('events').EventEmitter;
var File = require('./file');
var Message = require('./message');
var Peer = require('./peer');
var Piece = require('./piece');
var Tracker = require('./tracker');

var LOAD_ERROR = 'load_error';

var Torrent = function(clientId, port, file) {
  EventEmitter.call(this);

  this.clientId = clientId;
  this.port = port;

  this.activePieces = {};
  this.downloaded = 0;
  this.leechers = 0;
  this.peers = {};
  this.seeders = 0;

  var self = this;
  fs.readFile(file, 'binary', function(err, data) {
    if (err) {
      self.status = LOAD_ERROR;
    } else {
      parse(self, data);
    }
  });
};
util.inherits(Torrent, EventEmitter);

Torrent.prototype.addPeer = function(peer) {
  if (!(peer.address in this.peers)) {
    this.peers[peer.address] = peer;
    var self = this;
    peer.once(Peer.CONNECT, function() {
      peer.sendMessage(new Message(Message.BITFIELD, self.bitfield.toBuffer()));
    });
    peer.once(Peer.DISCONNECT, function() {
      self.removePeer(peer);
    });
    peer.on(Peer.CHOKED, function() {
    });
    peer.on(Peer.READY, function() {
      peerReady(self, peer);
    });
    peer.on(Peer.UPDATED, function() {
      var interested = peer.bitfield.xor(peer.bitfield.and(self.bitfield)).setIndexes().length > 0;
      peer.setAmInterested(interested);
    });
  }
};

Torrent.prototype.listPeers = function() {
  var peers = [];
  for (var id in this.peers) {
    var peer = this.peers[id];
    peers.push({
      choked: peer.choked,
      interested: peer.interested,
      requests: peer.numRequests,
      downloadRate: peer.downloadRate
    });
  }
  return peers;
};

Torrent.prototype.listTrackers = function() {
  var trackers = [];
  for (var i = 0; i < this.trackers.length; i++) {
    var tracker = this.trackers[i];
    trackers.push({
      state: tracker.state,
      error: tracker.errorMessage
    });
  }
  return trackers;
};

Torrent.prototype.removePeer = function(peer) {
  peer.removeAllListeners(Peer.CHOKED);
  peer.removeAllListeners(Peer.CONNECT);
  peer.removeAllListeners(Peer.DISCONNECT);
  peer.removeAllListeners(Peer.READY);
  peer.removeAllListeners(Peer.UPDATED);
  delete this.peers[peer.address];
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
};

Torrent.prototype.stop = function() {
  for (var i = 0; i < this.trackers.length; i++) {
    this.trackers[i].stop();
  }
  for (var address in this.peers) {
    var peer = this.peers[address];
    peer.disconnect('Torrent stopped.');
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

function addToFile(self, piece, index, partialComplete) {
  if (index < self.files.length) {
    var file = self.files[index++];
    var state = file.appendPiece(piece, function(state) {
      if (state === File.PARTIAL) {
        addToFile(self, piece, index, true);
      } else if (state === File.NONE && !partialComplete) {
        addToFile(self, piece, index, false);
      }
    });
  }
}

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
  for (var j in announceMap) {
    self.trackers.push(new Tracker(j, self));
  }

  self.infoHash = new Buffer(crypto.createHash("sha1")
    .update(bencode.encode(rawTorrent.info))
    .digest(), "binary");

  self.files = [];

  self.pieceLength = rawTorrent.info['piece length'];
  self.pieces = rawTorrent.info.pieces;

  var filesCreated = function() {
    var bitfieldLength = Math.ceil(self.size / self.pieceLength);
    self.bitfield = new BitField(bitfieldLength);
    self.requested = new BitField(bitfieldLength);
    self.emit('ready');
  };
  
  if (rawTorrent.info.length) {
      var length = rawTorrent.info.length;
      var path = self.name;
      self.files.push(new File(path, length));
      self.size = length;
      filesCreated();
  } else {
    // TODO: assumes dir doesn't already exist
    fs.mkdir(self.name, 0777, function(err) {
      if (err) {
        throw new Error("Couldn't create directory. err = " + err);
      }
      var files = rawTorrent.info.files;
      self.size = 0;
      var offset = 0;
      for (var k = 0; k < files.length; k++) {
        self.files.push(new File(self.name + '/' + files[k].path[0], files[k].length, offset));
        self.size += files[k].length;
        offset += files[k].length;
      }
      filesCreated();
    });
  }
}

function peerReady(self, peer) {
  var piece;
  for (var i in self.activePieces) {
    if (typeof i === 'number') {
      if (peer.bitfield.isSet(i)) {
        piece = self.activePieces[i];
      }
    }
  }
  if (!piece) {
    var available = peer.bitfield.xor(peer.bitfield.and(self.requested));
    var set = available.setIndexes();
    var index = set[Math.round(Math.random() * set.length)];
    if (index) {
      var hash = self.pieces.substr(index * 20, 20);
      piece = new Piece(index, self.pieceLength, hash);
      piece.once(Piece.COMPLETE, function() {
        pieceComplete(self, piece);
      });
      self.activePieces[index] = piece;
      self.requested.set(index);
    }
  }
  if (piece) {
    peer.requestPiece(piece);
  }
}

function pieceComplete(self, piece) {
  var data = piece.data;
  var validHash = piece.hash;
  var hash = crypto.createHash('sha1').update(data).digest();
  if (hash === validHash) {
    if (self.bitfield.isSet(piece.index)) {
      console.log('piece already downloaded!');
    } else {
      addToFile(self, piece, 0, false);
      self.bitfield.set(piece.index);
      self.downloaded += data.length;
      var have = new Message(Message.HAVE, BufferUtils.fromInt(piece.index));
      for (var i in self.peers) {
        var peer = self.peers[i];
        peer.sendMessage(have);
      }
    }
  }
  delete self.activePieces[piece.index];
}

function trackerUpdated(self, tracker, data) {

  var seeders = data.complete;
  if (tracker.seeders) {
    self.seeders -= tracker.seeders;
  }
  tracker.seeders = seeders;
  if (tracker.seeders) {
    self.seeders += tracker.seeders;
  }

  var leechers = data.incomplete;
  if (tracker.leechers) {
    self.leechers -= tracker.leechers;
  }
  tracker.leechers = leechers;
  if (tracker.leechers) {
    self.leechers += tracker.leechers;
  }

  if (data.peers) {
    var peers = new Buffer(data.peers, 'binary');
    for (var i = 0; i < peers.length; i += 6) {
      var ip = peers[i] + '.' + peers[i + 1] + '.' + peers[i + 2] + '.' + peers[i + 3];
      var port = peers[i + 4] << 8 | peers[i + 5];
      if (!self.peers[ip]) {
        var peer = new Peer(ip, port, self);
        self.addPeer(peer);
      }
    }
  }
  self.emit('updated');
}

module.exports = Torrent;
