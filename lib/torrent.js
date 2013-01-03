var bencode = require('./util/bencode');
var crypto = require("crypto");
var fs = require('fs');
var path = require('path');
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

var LOGGER = require('log4js').getLogger('torrent.js');

var Torrent = function(clientId, port, file) {
  EventEmitter.call(this);
  
  this.clientId = clientId;
  this.port = port;

  this.downloaded = 0;
  this.leechers = 0;
  this.peers = {};
  this.pieces = {};
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
  if (!(peer.getIdentifier() in this.peers)) {
    this.peers[peer.getIdentifier()] = peer;
    var self = this;
    peer.once(Peer.CONNECT, function() {
      LOGGER.debug('Torrent.addPeer [CONNECT]');
      peer.sendMessage(new Message(Message.BITFIELD, self.bitfield.toBuffer()));
    });
    peer.once(Peer.DISCONNECT, function() {
      LOGGER.debug('Torrent.addPeer [DISCONNECT]');
      // self.removePeer(peer);
    });
    peer.on(Peer.CHOKED, function() {
      LOGGER.debug('Torrent.addPeer [CHOKED]');
    });
    peer.on(Peer.READY, function() {
      peerReady(self, peer);
    });
    peer.on(Peer.UPDATED, function() {
      var interested = peer.bitfield.xor(peer.bitfield.and(self.bitfield)).setIndices().length > 0;
      LOGGER.debug('Torrent.addPeer [UPDATED] interested = ' + interested);
      peer.setAmInterested(interested);
    });
  }
};

Torrent.prototype.calculateDownloadRate = function() {
  var rate = 0;
  for (var id in this.peers) {
    rate += this.peers[id].calculateDownloadRate();
  }
  return rate;
};

Torrent.prototype.listPeers = function() {
  var peers = [];
  for (var id in this.peers) {
    var peer = this.peers[id];
    peers.push({
      address: peer.address,
      choked: peer.choked,
      requests: peer.numRequests,
      downloadRate: peer.calculateDownloadRate()
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
  delete this.peers[peer.getIdentifier()];
};

Torrent.prototype.requestChunk = function(index, begin, length, cb) {
  var piece = this.pieces[index];
  if (piece) {
    piece.getData(begin, length, function(data) {
      cb(data);      
    });
  } else {
    cb();
  }
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
  for (var id in this.peers) {
    var peer = this.peers[id];
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

function createFiles(self, rawTorrent, cb) {
  self.files = [];
  if (rawTorrent.info.length) {
      var length = rawTorrent.info.length;
      self.files.push(new File(self.name, length, null, function(err) {
        if (err) {
          throw new Error('Error creating file, err = ' + err);
        }
        self.size = length;
        cb();
      }));
  } else {
    fs.exists(self.name, function(exists) {  
      function doCreate() {
        var files = rawTorrent.info.files;
        self.size = 0;
        var offset = 0;
        (function nextFile() {
          if (files.length === 0) {
            cb();
          } else {
            var file = files.shift();
            self.files.push(new File(path.join(self.name, file.path[0]),
              file.length, offset, function(err) {
                if (err) {
                  throw new Error('Error creating file, err = ' + err);
                }
                self.size += file.length;
                offset += file.length;
                setTimeout(nextFile, 0);
              }));
          }
        })();
      }
      if (!exists) {
        fs.mkdir(self.name, 0777, function(err) {
          if (err) {
            throw new Error("Couldn't create directory. err = " + err);
          }
          doCreate();
        });
      } else {
        doCreate();
      }
    });
  }
}

function createPieces(self, hashes, cb) {
  self.pieces = [];
  var numPieces = hashes.length / 20;
  var index = 0;
  (function create() {
    if (index === numPieces) {
      LOGGER.debug('Finished validating pieces.  Number of valid pieces = ' 
        + self.bitfield.cardinality() 
        + ' out of a total of ' 
        + self.bitfield.length);
      cb(self.bitfield.cardinality() === self.bitfield.length);
    } else {
      var hash = hashes.substr(index * 20, 20);
      var pieceLength = self.pieceLength;
      if (index == numPieces - 1) {
        pieceLength = self.size % self.pieceLength;
      }
      var piece = new Piece(index, index * self.pieceLength, pieceLength, hash, 
        self.files, function() {
        if (piece.isComplete()) {
          self.bitfield.set(piece.index);
        } else {
          piece.once(Piece.COMPLETE, function() {
            pieceComplete(self, piece);
          });
        }
        index++;
        create();
      });
      self.pieces[index] = piece;
    }
  })();
}

function createTrackers(self, announce, announceList) {
  self.trackers = [];
  var announceMap = {};
  if (announceList) {
    for (var i = 0; i < announceList.length; i++) {
      announceMap[announceList[i][0]] = 0;
    }
  }
  announceMap[announce] = 0;

  var url = require('url');
  for (var j in announceMap) {
    self.trackers.push(new Tracker(j, self));
  }
}

function parse(self, data) {

  var rawTorrent = bencode.decode(data);

  self.createdBy = rawTorrent['created by'];
  self.creationDate = rawTorrent['creation date'];
  self.name = rawTorrent.info.name;
  self.pieceLength = rawTorrent.info['piece length'];

  self.infoHash = new Buffer(crypto.createHash('sha1')
    .update(bencode.encode(rawTorrent.info))
    .digest(), 'binary');
  
  var pieceHashes = rawTorrent.info.pieces;
  self.bitfield = new BitField(pieceHashes.length / 20);
  self.activePieces = new BitField(self.bitfield.length);
  
  createTrackers(self, rawTorrent.announce, rawTorrent['announce-list']);

  createFiles(self, rawTorrent, function() {
    createPieces(self, pieceHashes, function(complete) {
      if (!complete) {
      } else {
        LOGGER.info('torrent already complete');
      }
      self.emit('ready');
    });
  });
}

function peerReady(self, peer) {
  var activePieces = self.activePieces.setIndices();
  var piece;
  for (var i = 0; i < activePieces.length; i++) {
    var index = activePieces[i];
    var p = self.pieces[index];
    if (peer.bitfield.isSet(index) &&
        !p.hasRequestedAllChunks()) {
      piece = p;
      break;
    }
  }
  if (!piece) {
    var available = peer.bitfield.xor(
      peer.bitfield.and(
        self.activePieces.or(self.bitfield)));
        
    var set = available.setIndices();
    var index = set[Math.round(Math.random() * (set.length - 1))];
    if (index !== undefined) {
      piece = self.pieces[index];
      self.activePieces.set(index);
    }
  }
  if (piece) {
    peer.requestPiece(piece);
  } else if (peer.numRequests === 0) {
    LOGGER.debug('No available pieces for peer ' + peer.getIdentifier());
    peer.setAmInterested(false);
  }
}

function pieceComplete(self, piece) {
  LOGGER.debug('Piece complete, piece index = ' + piece.index);
  piece.isValid(function(valid) {
    if (valid) {
      self.bitfield.set(piece.index);
      self.downloaded += piece.length;

      if (self.bitfield.cardinality() === self.bitfield.length) {
        LOGGER.info('torrent download complete');
        self.emit('complete');
      }

      var have = new Message(Message.HAVE, BufferUtils.fromInt(piece.index));
      for (var i in self.peers) {
        var peer = self.peers[i];
        if (peer.initialised) {
          peer.sendMessage(have);
        }
      }
    } else {
    	LOGGER.info('Invalid piece received.');
    }
    self.activePieces.unset(piece.index);
  });
}

function trackerUpdated(self, tracker, data) {

  var seeders = data.seeders;
  if (tracker.seeders) {
    self.seeders -= tracker.seeders;
  }
  tracker.seeders = seeders;
  if (tracker.seeders) {
    self.seeders += tracker.seeders;
  }

  var leechers = data.leechers;
  if (tracker.leechers) {
    self.leechers -= tracker.leechers;
  }
  tracker.leechers = leechers;
  if (tracker.leechers) {
    self.leechers += tracker.leechers;
  }

  if (data.peers) {
    for (var i = 0; i < data.peers.length; i++) {
      var peer = data.peers[i];
      if (!self.peers[Peer.getIdentifier(peer)]) {
        new Peer(peer.ip, peer.port, self);
        // self.addPeer(peer); // TODO: stop passing full torrent through to peer
      }
    }
  }
  self.emit('updated');
}

module.exports = Torrent;
