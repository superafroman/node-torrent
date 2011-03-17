
var util = require('util');

var BitField = require('./bitfield');
var BufferUtils = require('./bufferutils');
var EventEmitter = require('events').EventEmitter;
var Message = require('./message');
var Piece = require('./piece');

var BITTORRENT_HEADER = new Buffer("\x13BitTorrent protocol\x00\x00\x00\x00\x00\x00\x00\x00", "binary");

var Peer = function(stream, client, torrent) {
  EventEmitter.call(this);

  this.stream = stream;
  this.client = client;
  this.torrent = torrent;

  this.choked = true;
  this.data = new Buffer(0);
  this.downloadRate = 0;
  this.drained = true;
  this.messages = [];
  this.initialised = false;
  this.interested = false;

  var self = this;
  stream.on('connect', function() {onConnect(self);});
  stream.on('data', function(data) {onData(self, data);});
  stream.on('drain', function() {onDrain(self);});
  stream.on('end', function() {onEnd(self);});
  stream.on('error', function(e) {onError(self, e);});
};
util.inherits(Peer, EventEmitter);

Peer.prototype.disconnect = function(message) {
  console.log('Peer.disconnect, message =', message);
  this.emit(Peer.DISCONNECT);
};

Peer.prototype.requestPiece = function(piece) {
  if (!this.active) {
    this.sendMessage(new Message(Message.INTERESTED));
    this.active = true;
  }

  this.piece = piece;
  var nextChunkBegin = piece.nextChunkBegin();

  if (nextChunkBegin > -1) {
    var payload = BufferUtils.fromInt(piece.index);
    payload = BufferUtils.concat(payload, BufferUtils.fromInt(nextChunkBegin));
    payload = BufferUtils.concat(payload, BufferUtils.fromInt(Piece.CHUNK_LENGTH));
    this.downloadStart = new Date();
    var message = new Message(Message.REQUEST, payload);
    this.sendMessage(message);
  } else {
    this.piece = null;
    this.emit(Peer.READY);
  }
};

Peer.prototype.sendMessage = function(message) {
  this.messages.push(message);
  if (!this.running) {
    nextMessage(this);
  }
};

Peer.prototype.stop = function() {
  if (this.active) {
    this.active = false;
    if (!this.choked) {
      this.sendMessage(new Message(Message.UNINTERESTED));
    }
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
    scope.disconnect('Invalid handshake. data = ' + data.toString('binary'));
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
  if (self.messages.length === 0) {
    self.running = false;
  } else {
    self.running = true;
    var message = self.messages.shift();
    message.writeTo(self.stream);
    process.nextTick(function() {
      nextMessage(self);
    });
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
//  self.handleRequest();
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
        break;
      case Message.BITFIELD:
        self.bitfield = new BitField(message.payload);
        break;
      case Message.REQUEST:
        break;
      case Message.PIECE:
        var index = BufferUtils.readInt(message.payload);
        var begin = BufferUtils.readInt(message.payload, 4);
        var data = message.payload.slice(8);
        var downloadTime = new Date() - self.downloadStart;
        self.downloadRate = data.length / (downloadTime / 1000);
        self.piece.addChunk(begin, data);
        self.requestPiece(self.piece);
        break;
      case Message.CANCEL:
        break;
      case Message.PORT:
        break;
      default:
        self.disconnect('Unknown message received.');
    }
    processData(self);
  }
}

Peer.READY = 'ready';
Peer.CHOKED = 'choked';
Peer.CONNECT = 'connect';
Peer.DISCONNECT = 'disconnect';

module.exports = Peer;
