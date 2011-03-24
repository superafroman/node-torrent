
var net = require('net');
var util = require('util');

var BitField = require('./util/bitfield');
var BufferUtils = require('./util/bufferutils');
var EventEmitter = require('events').EventEmitter;
var Message = require('./message');
var Piece = require('./piece');

var BITTORRENT_HEADER = new Buffer("\x13BitTorrent protocol\x00\x00\x00\x00\x00\x00\x00\x00", "binary");
var KEEPALIVE_PERIOD = 60000;
var MAX_REQUESTS = 5;

var Peer = function(address, port, torrent) {
  EventEmitter.call(this);

  this.address = address;
  this.port = port;
  this.torrent = torrent;

  this.choked = true;
  this.data = new Buffer(0);
  this.downloadRate = 0;
  this.drained = true;
  this.initialised = false;
  this.interested = false;
  this.messages = [];
  this.pieces = {};
  this.numRequests = 0;
  this.requests = {};

  var self = this;
  this.stream = net.createConnection(port, address);
  this.stream.on('connect', function() {onConnect(self);});
  this.stream.on('data', function(data) {onData(self, data);});
  this.stream.on('drain', function() {onDrain(self);});
  this.stream.on('end', function() {onEnd(self);});
  this.stream.on('error', function(e) {onError(self, e);});
};
util.inherits(Peer, EventEmitter);

Peer.prototype.disconnect = function(message) {
  console.log('Peer.disconnect, message =', message);
  this.disconnected = true;
  if (this.keepAliveId) {
    clearTimeout(this.keepAliveId);
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
};

Peer.prototype.requestPiece = function(piece) {
  if (this.numRequests < MAX_REQUESTS) {
    var nextChunkBegin = piece ? piece.nextChunkBegin() : -1;
    if (nextChunkBegin > -1) {
      if (!this.pieces[piece.index]) {
        var self = this;
        self.pieces[piece.index] = piece;
        self.requests[piece.index] = {};
        piece.once(Piece.COMPLETE, function() {
          delete self.pieces[piece.index];
        });
      }
      this.requests[piece.index][nextChunkBegin] = true;
      var payload = BufferUtils.fromInt(piece.index);
      payload = BufferUtils.concat(payload, BufferUtils.fromInt(nextChunkBegin));
      payload = BufferUtils.concat(payload, BufferUtils.fromInt(Piece.CHUNK_LENGTH));
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
  } else if (!interested && self.amInterested) {
    self.sendMessage(new Message(Message.UNINTERESTED));
    self.amInterested = false;
  }
};

function doHandshake(self) {
  var stream = self.stream;
  stream.write(BITTORRENT_HEADER);
  stream.write(self.torrent.infoHash);
  stream.write(self.torrent.clientId);
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
    if (!self.torrent) {
      self.disconnect('Incoming connection, currently unimplemented.');
//        doHandshake(scope);
    } else {
      self.peerId = data.toString('binary', 48, 68);
      self.data = self.data.slice(68);
      self.initialised = true;

      var bitfieldLength = self.torrent.bitfield.length;
      self.bitfield = new BitField(bitfieldLength);
      self.emit(Peer.CONNECT);
    }
  }
}

function nextMessage(self) {
  if (!self.disconnected && self.initialised) {
    if (self.messages.length === 0) {
      self.running = false;
      setKeepAlive(self);
    } else {
      if (self.keepAliveId) {
        clearTimeout(self.keepAliveId);
        delete self.keepAliveId;
      }
      self.running = true;
      var message = self.messages.shift();
      message.writeTo(self.stream);
      process.nextTick(function() {
        nextMessage(self);
      });
    }
  }
}

function onConnect(self) {
  self.stream.setKeepAlive(true);
  if (self.torrent) {
    doHandshake(self);
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
  self.disconnect('stream ended');
}

function onError(self, e) {
  self.disconnect(e.message);
}

function processData(self) {
  if (self.data.length < 4) {
    // Not enough data to do anything
    return;
  }
  var messageLength = BufferUtils.readInt(self.data);
  if (messageLength === 0) {
    // Keep alive
    self.data = self.data.slice(4);
    processData(self);
  } else if (self.data.length >= (4 + messageLength)) {
    // Have everything we need to process a message
    var code = self.data[4];
    var payload = messageLength > 1 ? self.data.slice(5, messageLength + 4) : null;
    var message = new Message(code, payload);

    self.data = self.data.slice(messageLength + 4);

    switch (message.code) {
      case Message.CHOKE:
        self.choked = true;
        self.emit(Peer.CHOKED);
        break;
      case Message.UNCHOKE:
        self.choked = false;
        self.emit(Peer.READY);
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
        self.bitfield = new BitField(message.payload);
        self.emit(Peer.UPDATED);
        break;
      case Message.REQUEST:
        console.log('Ignoring REQUEST');
        break;
      case Message.PIECE:
        self.numRequests--;
        var index = BufferUtils.readInt(message.payload);
        var begin = BufferUtils.readInt(message.payload, 4);
        delete self.requests[index][begin];
        var data = message.payload.slice(8);
        if (self.downloadStart) {
          var downloadTime = new Date() - self.downloadStart;
          self.downloadRate = data.length / (downloadTime / 1000);
        }
        self.downloadStart = new Date();
        var piece = self.pieces[index];
        if (piece) {
          piece.addChunk(begin, data);
          self.requestPiece(piece);
        } else {
          console.log('chunk received for inactive piece');
        }
        break;
      case Message.CANCEL:
        console.log('Ignoring CANCEL');
        break;
      case Message.PORT:
        console.log('Ignoring PORT');
        break;
      default:
        self.disconnect('Unknown message received.');
    }
    processData(self);
  }
}

function setKeepAlive(self) {
  self.keepAliveId = setTimeout(function() {
    console.log('keepAlive, address:', self.address);
    self.sendMessage(new Message(Message.KEEPALIVE));
  }, KEEPALIVE_PERIOD);
}

Peer.CHOKED = 'choked';
Peer.CONNECT = 'connect';
Peer.DISCONNECT = 'disconnect';
Peer.READY = 'ready';
Peer.UPDATED = 'updated';

module.exports = Peer;
