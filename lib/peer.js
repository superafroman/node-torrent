
var net = require('net');
var util = require('util');

var ProcessUtils = require('./util/processutils');
var BitField = require('./util/bitfield');
var BufferUtils = require('./util/bufferutils');
var EventEmitter = require('events').EventEmitter;
var Message = require('./message');
var OverflowList = require('./util/overflowlist');
var Piece = require('./piece');

var BITTORRENT_HEADER = new Buffer("\x13BitTorrent protocol\x00\x00\x00\x00\x00\x00\x00\x00", "binary");
var KEEPALIVE_PERIOD = 10000;
var MAX_REQUESTS = 25;

var LOGGER = require('log4js').getLogger('peer.js');

var Peer = function(/* stream */ /* or */ /* address, port, torrent */) {
  EventEmitter.call(this);

  this.choked = true;
  this.data = new Buffer(0);
  this.drained = true;
  this.initialised = false;
  this.interested = false;
  this.messages = [];
  this.pieces = {};
  this.numRequests = 0;
  this.requests = {};
  this.stream = null;
  this.handshake = false;

  this.downloaded = 0;
  this.uploaded = 0;
  this.downloadedHistory = [];
  this.downloadRates = [];
  this.currentDownloadRate = 0;
  this.uploadedHistory = [];
  this.uploadRates = [];
  this.currentUploadRate = 0;

  if (arguments.length === 1) {
    this.stream = arguments[0];
    this.address = this.stream.remoteAddress;
    this.port = this.stream.remotePort;
  } else {
    this.address = arguments[0];
    this.port = arguments[1];
    this.setTorrent(arguments[2]);
  }

  this.connect();

  var self = this;
  setTimeout(function() { forceUpdateRates(self) }, 1000);
};
util.inherits(Peer, EventEmitter);

Peer.prototype.connect = function() {
  
  var self = this;

  if (this.stream === null) {
    LOGGER.debug('Connecting to peer at ' + this.address + ' on ' + this.port);
    this.stream = net.createConnection(this.port, this.address);
    this.stream.on('connect', function() {onConnect(self);});
  }

  this.stream.on('data', function(data) {onData(self, data);});
  this.stream.on('drain', function() {onDrain(self);});
  this.stream.on('end', function() {onEnd(self);});
  this.stream.on('error', function(e) {onError(self, e);});
};

function forceUpdateRates(self) {

  updateRates(self, 'down');
  updateRates(self, 'up');

  if (!self.disconnected) {
    setTimeout(function() { forceUpdateRates(self) }, 1000);
  }
}

Peer.prototype.disconnect = function(message, reconnectTimeout) {
  LOGGER.info('Peer.disconnect [' + this.getIdentifier() + '] message =', message);
  this.disconnected = true;
  this.stream = null;
  if (this.keepAliveId) {
    clearInterval(this.keepAliveId);
    delete this.keepAliveId;
  }
  for (var index in this.pieces) {
    var piece = this.pieces[index];
    var requests = this.requests[index];
    if (requests) {
      for (var i = 0; i < requests.length; i++) {
        piece.cancelRequest(requests[i]);
      }
    }
  }
  this.emit(Peer.DISCONNECT);

  if (reconnectTimeout) {
    var self = this;
    setTimeout(function() {self.connect();}, reconnectTimeout);
  }
};

Peer.prototype.getIdentifier = function() {
  return Peer.getIdentifier(this);
}

Peer.prototype.requestPiece = function(piece) {
  if (this.numRequests < MAX_REQUESTS) {
    var nextChunk = piece && piece.nextChunk();
    if (nextChunk) {
      LOGGER.debug('Peer.requestPiece [' + this.getIdentifier() + '] requesting piece ' + piece.index + ', begin ' + nextChunk.begin + ', length ' + nextChunk.length);
      if (!this.pieces[piece.index]) {
        var self = this;
        self.pieces[piece.index] = piece;
        self.requests[piece.index] = {};
        piece.once(Piece.COMPLETE, function() {
          delete self.pieces[piece.index];
        });
      }
      this.requests[piece.index][nextChunk.begin] = new Date();
      var payload = BufferUtils.fromInt(piece.index);
      payload = BufferUtils.concat(payload, BufferUtils.fromInt(nextChunk.begin));
      payload = BufferUtils.concat(payload, BufferUtils.fromInt(nextChunk.length));
      var message = new Message(Message.REQUEST, payload);
      this.sendMessage(message);
      this.numRequests++;
    }
    this.emit(Peer.READY);
  }
};

Peer.prototype.sendMessage = function(message) {
  this.messages.push(message);
  if (!this.running) {
    nextMessage(this);
  }
};

Peer.prototype.setAmInterested = function(interested) {
  var self = this;
  if (interested && !self.amInterested) {
    self.sendMessage(new Message(Message.INTERESTED));
    self.amInterested = true;
    if (!self.choked) {
      self.emit(Peer.READY);
    }
  } else if (!interested && self.amInterested) {
    self.sendMessage(new Message(Message.UNINTERESTED));
    self.amInterested = false;
  }
};

Peer.prototype.setTorrent = function(torrent) {
  this.torrent = torrent;
  this.torrent.addPeer(this);
  this.bitfield = new BitField(torrent.bitfield.length);
  if (this.stream && !this.initialised) {
    doHandshake(this);
    this.initialised = true;
    this.sendMessage(new Message(Message.BITFIELD, this.torrent.bitfield.toBuffer()));
    this.sendMessage(new Message(Message.UNCHOKE));
  }
};

function doHandshake(self) {
  var stream = self.stream;
  stream.write(BITTORRENT_HEADER);
  stream.write(self.torrent.infoHash);
  stream.write(self.torrent.clientId);
  this.handshake = true;
}

function handleHandshake(self) {
  var data = self.data;
  if (data.length < 68) {
    // Not enough data.
    return;
  }
  if (!BufferUtils.equal(BITTORRENT_HEADER.slice(0, 20), data.slice(0, 20))) {
    self.disconnect('Invalid handshake. data = ' + data.toString('binary'));
  } else {
    var infoHash = data.slice(28, 48);
    self.peerId = data.toString('binary', 48, 68);
    self.data = BufferUtils.slice(data, 68);
    
    if (self.torrent) {
      self.initialised = true;
      nextMessage(self);
      self.emit(Peer.CONNECT);
    } else {
      self.emit(Peer.CONNECT, infoHash);
    }
  }
}

function nextMessage(self) {
  if (!self.disconnected && self.initialised) {
    if (self.messages.length === 0) {
      self.running = false;
      setKeepAlive(self);
    } else {
      if (!self.stream) {
        self.connect();
      } else {
        if (self.keepAliveId) {
          clearInterval(self.keepAliveId);
          delete self.keepAliveId;
        }
        self.running = true;
        var message = self.messages.shift();
        message.writeTo(self.stream);
        //LOGGER.debug("nextMessage: nextTick nextMessage(self)");
        ProcessUtils.nextTick(function() {
          nextMessage(self);
        });
      }
    }
  }
}

function onConnect(self) {
  self.disconnected = false;
  if (self.torrent) {
    if (!self.handshake) {
      doHandshake(self);
    } else {
      nextMessage(self);
    }
  }
}

function onData(self, data) {
  self.data = BufferUtils.concat(self.data, data);
  if (!self.initialised) {
    handleHandshake(self);
  } else {
    processData(self);
  }
}

function onDrain(self) {
  self.drained = true;
}

function onEnd(self) {
  LOGGER.debug('Peer [' + self.getIdentifier() + '] received end');
  self.stream = null;
  if (self.amInterested) {
    // LOGGER.debug('Peer [' + self.getIdentifier() + '] after end continuing');
    // self.choked = false;
    // self.emit(Peer.READY);
    self.disconnect('after end, reconnect', 5000);
  } else {
    self.disconnect('stream ended and no interest');
  }
}

function onError(self, e) {
  self.disconnect(e.message);
}

function processData(self) {
  //do {
  (function next() {
    if (self.data.length < 4) {
      LOGGER.debug('Peer [' + self.getIdentifier() + '] not enough data to process');
      // Not enough data to do anything
      nextMessage(self);
      return;
    }
    var messageLength = BufferUtils.readInt(self.data);
    if (messageLength === 0) {
      // Keep alive
      LOGGER.debug('Peer [' + self.getIdentifier() + '] received keep alive');
      self.data = BufferUtils.slice(self.data, 4);
      ProcessUtils.nextTick(next);
    } else if (self.data.length >= (4 + messageLength)) {
      // Have everything we need to process a message
      var code = self.data[4];
      var payload = messageLength > 1 ? self.data.slice(5, messageLength + 4) : null;
      var message = new Message(code, payload);

      self.data = BufferUtils.slice(self.data, messageLength + 4);

      switch (message.code) {
        case Message.CHOKE:
          self.choked = true;
          self.emit(Peer.CHOKED);
          break;
        case Message.UNCHOKE:
          LOGGER.debug('Peer [' + Peer.getIdentifier(self) + '] received UNCHOKE message.');
          self.choked = false;
          if (self.amInterested) {
            self.emit(Peer.READY);
          }
          break;
        case Message.INTERESTED:
          self.interested = true;
          break;
        case Message.UNINTERESTED:
          self.interested = false;
          break;
        case Message.HAVE:
          var piece = BufferUtils.readInt(message.payload);
          self.bitfield.set(piece);
          self.emit(Peer.UPDATED);
          break;
        case Message.BITFIELD:
          self.bitfield = new BitField(message.payload, self.torrent.bitfield.length); // TODO: figure out nicer way of handling bitfield lengths
          self.emit(Peer.UPDATED);
          break;
        case Message.REQUEST:
          var index = BufferUtils.readInt(message.payload);
          var begin = BufferUtils.readInt(message.payload, 4);
          var length = BufferUtils.readInt(message.payload, 8);
          LOGGER.debug('Chunk requested at index = ' + index + ', begin = ' + begin + ', length = ' + length);
          self.torrent.requestChunk(index, begin, length, function(data) {
            if (data) {
              self.sendMessage(new Message(Message.PIECE, BufferUtils.concat(
                BufferUtils.fromInt(index),
                BufferUtils.fromInt(begin),
                data
              )));
              self.uploaded += data.length;
              updateRates(self, 'up');
            } else {
              LOGGER.debug('No data found for request, index = ' + index + ', begin = ' + begin);
            }
          });
          break;
        case Message.PIECE:
          self.numRequests--;
          var index = BufferUtils.readInt(message.payload);
          var begin = BufferUtils.readInt(message.payload, 4);
          var data = message.payload.slice(8);

          if (self.requests[index]
              && self.requests[index][begin]) {
            var requestTime = new Date() - self.requests[index][begin];
            self.downloaded += data.length;
            delete self.requests[index][begin];
            updateRates(self, 'down');
            LOGGER.debug('Peer [' + Peer.getIdentifier(self) + '] download rate = ' + (self.currentDownloadRate / 1024) + 'Kb/s');
          }

          var piece = self.pieces[index];
          if (piece) {
            piece.setData(data, begin, function() {
              self.requestPiece(piece);
            });
          } else {
            LOGGER.info('chunk received for inactive piece');
          }
          break;
        case Message.CANCEL:
        LOGGER.info('Ignoring CANCEL');
          break;
        case Message.PORT:
        LOGGER.info('Ignoring PORT');
          break;
        default:
          self.disconnect('Unknown message received.');
      }
      ProcessUtils.nextTick(next);
    }
  })();
  //  else {
  //    break;
  //  }
  //} while (self.data.length > 0);
}

function setKeepAlive(self) {
  if (!self.keepAliveId) {
    self.keepAliveId = setInterval(function() {
  	  LOGGER.debug('keepAlive tick');
      if (self.stream && self.stream.writable) {
        var message = new Message(Message.KEEPALIVE);
        message.writeTo(self.stream);
      } else {
        clearInterval(self.keepAliveId);
      }
    }, KEEPALIVE_PERIOD);
  }
}

// calculate weighted average upload/download rate
function calculateRate(self, kind) {
  var isUpload = (kind=='up');

  var rates = isUpload ? self.uploadRates : self.downloadRates;

  // calculate weighted average rate
  var decayFactor = 0.13863;
  var rateSum = 0, weightSum = 0;
  for (var idx=0; idx<rates.length; idx++) {
    var age = rates[idx].ts-rates[0].ts;
    var weight = Math.exp(-decayFactor*age/1000);
    rateSum += rates[idx].value * weight;
    weightSum += weight;
  }
  var rate = (rates.length>0) ? (rateSum/weightSum) : 0;

  if (isUpload) {
    self.currentUploadRate = rate;
  }
  else {
    self.currentDownloadRate = rate;
  }
}

function updateRates(self, kind) {
  var isUpload = (kind=='up');

  var history = isUpload ? self.uploadedHistory : self.downloadedHistory;
  var rates = isUpload ? self.uploadRates : self.downloadRates;

  var now = Date.now();
  var bytes = isUpload ? self.uploaded : self.downloaded;
  history.push({ts: now, value: bytes});

  if (history.length > 1) {
    var start = history[0].ts;
    if (now-start > 1*1000) {
      // calculate a new rate and remove first entry from history
      rates.push({ts: now, value: (bytes-history.shift().value)/(now-start)*1000});
      // throw out any rates that are too old to be of interest
      while(now-rates[0].ts>10*1000) {
        rates.shift();
      }
      // re-calculate current upload/download rate
      calculateRate(self, kind);
    }
    else {
      // just want to keep the first and the last entry in history
      history.splice(1,1);
    }
  }
}

Peer.CHOKED = 'choked';
Peer.CONNECT = 'connect';
Peer.DISCONNECT = 'disconnect';
Peer.READY = 'ready';
Peer.UPDATED = 'updated';

Peer.getIdentifier = function(peer) {
  return (peer.address || peer.ip) + ':' + peer.port;
}

module.exports = Peer;
