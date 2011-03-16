
var util = require('util');

var BitField = require('./bitfield');
var BufferUtils = require('./bufferutils');
var EventEmitter = require('events').EventEmitter;
var Message = require('./message');
var Piece = require('./piece');

const BITTORRENT_HEADER = new Buffer("\x13BitTorrent protocol\x00\x00\x00\x00\x00\x00\x00\x00", "binary");

const COMPLETE = 'complete';
const CONNECT = 'connect';
const DISCONNECT = 'disconnect';
const READY = 'ready';

var Peer = function(stream, client, torrent) {
  EventEmitter.call(this);

  this.stream = stream;
  this.client = client;
  this.torrent = torrent;
  
  this.choked = true;
  this.drained = true;
  this.messages = [];
  this.initialised = false;
  this.interested = false;
  this.data = new Buffer(0);

  var self = this;
  stream.on('connect', function() {onConnect(self)});
  stream.on('data', function(data) {onData(self, data)});
  stream.on('drain', function() {onDrain(self)});
  stream.on('end', function() {onEnd(self)});
  stream.on('error', function(e) {onError(self, e)});
  // on timeout
};
util.inherits(Peer, EventEmitter);

Peer.prototype.disconnect = function(message) {
  console.log('Peer.disconnect, message =', message);
  this.emit(DISCONNECT);
};

Peer.prototype.requestPiece = function(piece) {
  if (!this.downloading) {
    // send interested
  }

  this.downloading = true;
  this.piece = piece;

  if (!piece.isComplete()) {
    var payload = BufferUtils.fromInt(piece.index);
    payload = BufferUtils.concat(payload, BufferUtils.fromInt(piece.nextChunkBegin()));
    payload = BufferUtils.concat(payload, BufferUtils.fromInt(Piece.CHUNK_LENGTH));
    console.log('piece incomplete, requesting next chunk, begin =', piece.nextChunkBegin());
    var message = new Message(Message.REQUEST, payload);
    this.sendMessage(message);
  } else {
    console.log('piece complete');
    this.emit(COMPLETE, this.piece);
    this.piece = null;
  }
};

Peer.prototype.sendMessage = function(message) {
  this.messages.push(message);
  if (!this.running) {
    nextMessage(this);
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
      self.emit(CONNECT);
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
        break;
      case Message.UNCHOKE:
        self.choked = false;
        self.emit(READY);
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
        if (!self.downloading) {
          self.emit(READY);
        }
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
        console.log('got piece, index =', index, ' begin =', begin, ' data length =', data.length);
        self.piece.updateChunk(data);
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

Peer.COMPLETE = COMPLETE;
Peer.CONNECT = CONNECT;
Peer.DISCONNECT = DISCONNECT;
Peer.READY = READY;

module.exports = Peer;
