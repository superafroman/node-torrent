
var net = require('net');
var util = require('util');
var bencode = require('./util/bencode');

var ProcessUtils = require('./util/processutils');
var BitField = require('./util/bitfield');
var BufferUtils = require('./util/bufferutils');
var EventEmitter = require('events').EventEmitter;
var Message = require('./message');
var Piece = require('./piece');

var BITTORRENT_HEADER = new Buffer("\x13BitTorrent protocol\x00\x00\x00\x00\x00\x10\x00\x00", "binary");
var KEEPALIVE_PERIOD = 30000;
var MAX_REQUESTS = 50;

var LOGGER = require('log4js').getLogger('peer.js');

var Peer = function(/* stream */ /* or */ /* peer_id, address, port, torrent */) {
  EventEmitter.call(this);

  this.choked = true;
  this.data = new Buffer(0);
  this.drained = true;
  this.initialised = false;
  this.interested = false;
  this.messages = [];
  this.toSend = [];
  this.pieces = {};
  this.numRequests = 0;
  this.requests = {};
  this.requestsCount = {};
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

  this.running = false;
  this.processing = false;
  this.extensions = {};
  this.extensions[Message.EXTENDED_HANDSHAKE] = 0;

  if (arguments.length === 1) {
    this.stream = arguments[0];
    this.address = this.stream.remoteAddress;
    this.port = this.stream.remotePort;
  } else {
    this.peerId = arguments[0];
    this.address = arguments[1];
    this.port = arguments[2];
    this.setTorrent(arguments[3]);
  }

  this.connect();

  var self = this;
  setTimeout(function() { forceUpdateRates(self) }, 1000);
};
util.inherits(Peer, EventEmitter);

Peer.prototype.connect = function() {
  
  var self = this;

  if (this.stream === null) {
    LOGGER.info('Connecting to peer at ' + this.address + ' on ' + this.port);
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
  if (this.stream) {
    this.stream.removeAllListeners();
    this.stream = null;
  }
  if (this.keepAliveId) {
    clearInterval(this.keepAliveId);
    delete this.keepAliveId;
  }
  for (var index in this.pieces) {
    var piece = this.pieces[index];
    var requests = this.requests[index];
    if (requests) {
      for (var reqIndex in requests) {
        piece.cancelRequest(requests[reqIndex]);
      }
    }
  }
  this.requests = {};
  this.requestsCount = {};

  this.messages = [];
  this.toSend = [];

  this.emit(Peer.DISCONNECT);

  if (reconnectTimeout) {
    var self = this;
    setTimeout(function() {self.connect();}, reconnectTimeout);
  }
};

Peer.prototype.getIdentifier = function() {
  return Peer.getIdentifier(this);
};

Peer.prototype.requestPiece = function(piece) {
  var self = this;

  if (!piece) {
    return;
  }

  if (!self.pieces[piece.index]) {
    self.pieces[piece.index] = piece;
    self.requests[piece.index] = {};
    piece.once(Piece.COMPLETE, function() {
      delete self.pieces[piece.index];
    });
  }

  var nextChunk;
  while (self.numRequests < MAX_REQUESTS && (nextChunk=piece.nextChunk()))
  {
    //LOGGER.debug('Peer.requestPiece [' + self.getIdentifier() + '] requesting piece ' + piece.index + ', begin ' + nextChunk.begin + ', length ' + nextChunk.length);
    self.requests[piece.index][nextChunk.begin] = new Date();
    var msgBuffer = new Buffer(12);
    msgBuffer.writeInt32BE(piece.index, 0, true);
    msgBuffer.writeInt32BE(nextChunk.begin, 4, true);
    msgBuffer.writeInt32BE(nextChunk.length, 8, true);
    var message = new Message(Message.REQUEST, msgBuffer);
    self.sendMessage(message);
    self.requestsCount[piece.index] = (self.requestsCount[piece.index] || 0) + 1;
    self.numRequests++;
  }
  if (self.numRequests < MAX_REQUESTS) {
    self.emit(Peer.READY);
  }
};

Peer.prototype.sendMessage = function(message) {
  var self = this;
  self.messages.push(message);
  if (!self.running) {
    self.running = true;
    ProcessUtils.nextTick(function(){nextMessage(self)});
  }
};

Peer.prototype.sendExtendedMessage = function(type, data) {

  LOGGER.debug('Peer [%s] sending extended message of type %j', this.getIdentifier(), type);

  if (this.extensions[type] !== undefined) {
    
    var codeAsBuffer = new Buffer(1);
    codeAsBuffer[0] = this.extensions[type];

    LOGGER.debug('Peer [%s] extended request code = %j', this.getIdentifier(), codeAsBuffer[0]);

    var payload = new Buffer(bencode.encode(data));

    var message = new Message(Message.EXTENDED, BufferUtils.concat(codeAsBuffer, payload));

    this.sendMessage(message);
  } else {
    throw new Error("Peer doesn't support extended request of type " + type);
  }
};

Peer.prototype.setAmInterested = function(interested) {
  var self = this;
  if (interested && !self.amInterested) {
    self.sendMessage(new Message(Message.INTERESTED));
    LOGGER.info('Sent INTERESTED to ' + self.stream.remoteAddress + ':' + self.stream.remotePort);
    self.amInterested = true;
    if (!self.choked) {
      self.emit(Peer.READY);
    }
  } else if (!interested && self.amInterested) {
    self.sendMessage(new Message(Message.UNINTERESTED));
    LOGGER.info('Sent UNINTERESTED to ' + self.stream.remoteAddress + ':' + self.stream.remotePort);
    self.amInterested = false;
  }
};

Peer.prototype.setTorrent = function(torrent) {
  var self = this;
  var stream = self.stream;
  this.torrent = torrent;
  this.torrent.addPeer(this);
  this.bitfield = new BitField(torrent.bitfield ? torrent.bitfield.length : 0);
  if (this.stream && !this.initialised) {
    doHandshake(this);
    this.initialised = true;
    this.sendMessage(new Message(Message.BITFIELD, this.torrent.bitfield.toBuffer()));
    LOGGER.info('Sent BITFIELD to ' + stream.remoteAddress + ':' + stream.remotePort);
  }
};

function doHandshake(self) {
  var stream = self.stream;
  stream.write(BITTORRENT_HEADER);
  stream.write(self.torrent.infoHash);
  stream.write(self.torrent.clientId);
  this.handshake = true;
  LOGGER.info('Sent HANDSHAKE to ' + stream.remoteAddress + ':' + stream.remotePort);
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
    LOGGER.info('Received HANDSHAKE from ' + self.stream.remoteAddress + ':' + self.stream.remotePort);
    self.data = BufferUtils.slice(data, 68);

    self.supportsExtension = (data[25] & 0x10) > 0;

    if (self.torrent) {
      self.initialised = true;
      self.running = true;
      nextMessage(self);
      processData(self);
      self.emit(Peer.CONNECT);
    } else {
      self.emit(Peer.CONNECT, infoHash);
    }
  }
}

function nextMessage(self) {
  if (!self.disconnected && self.initialised) {
    (function next() {
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
          while (self.messages.length > 0) {
            var message = self.messages.shift();
            message.writeTo(self.stream);
          }
          next();
        }
      }
    })();
  }
}

function onConnect(self) {
  self.disconnected = false;
  if (self.torrent) {
    if (!self.handshake) {
      doHandshake(self);
    } else {
      self.running = true;
      nextMessage(self);
    }
  }
}

function onData(self, data) {
  self.data = BufferUtils.concat(self.data, data);
  if (!self.initialised) {
    handleHandshake(self);
  } else {
    if (!self.processing) {
        processData(self);
    }
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

function sendData(self) {
  var retry = false;
  (function next() {
    if (self.toSend.length > 0) {
      var message = self.toSend.shift();
      var index = message.payload.readInt32BE(0, true);
      var begin = message.payload.readInt32BE(4, true);
      var length = message.payload.readInt32BE(8, true);

      self.torrent.requestChunk(index, begin, length, function(err, data) {
        if (err) {
            if (err.code===Piece.ERR_FILEBUSY) {
              LOGGER.warn('Peer [' + self.getIdentifier() + '] sendData file busy');
              retry = true;
              self.toSend.push(message);
            }
            else {
              LOGGER.error('Failed to read file chunk: ' + err);
              throw err;
            }
        }
        else {
          if (data) {
            var msgBuffer = new Buffer(8+data.length);
            msgBuffer.writeInt32BE(index, 0, true);
            msgBuffer.writeInt32BE(begin, 4, true);
            data.copy(msgBuffer, 8);
            self.sendMessage(new Message(Message.PIECE, msgBuffer));
            self.uploaded += data.length;
            updateRates(self, 'up');
          } else {
            LOGGER.debug('No data found for request, index = ' + index + ', begin = ' + begin);
          }
          ProcessUtils.nextTick(next);
        }
      });
    }
    else {
      self.sending = false;
      if (retry) {
        setTimeout(function() {
          if (!self.sending) {
            self.sending = true;
            sendData(self);
          }
        }, 10);
      }
    }
  })();
}

function processData(self) {

    var offset = 0;
    self.processing = true;

    //console.log('processing...');

    function done() {
        if (offset > 0) {
          self.data = self.data.slice(offset);
        }
        self.processing = false;
    }

    do {
      //console.log('offset is ' + offset);
      if (self.data.length-offset >= 4)
      {
          //console.log('have at least 4 bytes, getting message length');
          var messageLength = self.data.readInt32BE(offset, true);
          offset += 4;
          //console.log('message length is ' + messageLength);
          if (messageLength === 0)
          {
              // Keep alive
              LOGGER.debug('Peer [' + self.getIdentifier() + '] received keep alive');
          }
          else if (self.data.length-offset >= messageLength)
          {
              // Have everything we need to process a message
              var code = self.data[offset];
              var payload = messageLength > 1 ? self.data.slice(offset+1, offset+messageLength) : null;
              offset += messageLength;

              var message = new Message(code, payload);
              switch (message.code) {

                case Message.CHOKE:
                  LOGGER.debug('Received CHOKE from ' + Peer.getIdentifier(self));
                  self.choked = true;
                  self.emit(Peer.CHOKED);
                  break;

                case Message.UNCHOKE:
                  LOGGER.debug('Received UNCHOKE from ' + Peer.getIdentifier(self) + ' interested = ' + self.amInterested);
                  self.choked = false;
                  if (self.amInterested) {
                    self.emit(Peer.READY);
                  }
                  break;

                case Message.INTERESTED:
                  LOGGER.debug('Received INTERESTED from ' + Peer.getIdentifier(self));
                  self.interested = true;
                  // TODO: choke/unchoke handling
                  // self.sendMessage(new Message(Message.UNCHOKE));
                  // LOGGER.info('Sent UNCHOKE to ' + stream.remoteAddress + ':' + stream.remotePort);
                  break;

                case Message.UNINTERESTED:
                  LOGGER.debug('Received UNINTERESTED from ' + Peer.getIdentifier(self));
                  self.interested = false;
                  break;

                case Message.HAVE:
                  LOGGER.debug('Received HAVE from ' + Peer.getIdentifier(self));
                  var piece = message.payload.readInt32BE(0, true);
                  self.bitfield.set(piece);
                  self.emit(Peer.UPDATED);
                  break;

                case Message.BITFIELD:
                  LOGGER.debug('Received BITFIELD from ' + Peer.getIdentifier(self));
                  self.bitfield = new BitField(message.payload, message.payload.length); // TODO: figure out nicer way of handling bitfield lengths
                  self.emit(Peer.UPDATED);
                  break;

                case Message.REQUEST:
                  LOGGER.debug('Received REQUEST from ' + Peer.getIdentifier(self));
                  self.toSend.push(message);
                  if (!self.sending) {
                    self.sending = true;
                    setTimeout(function() {sendData(self)}, 10);
                  }
                  break;

                case Message.PIECE:
                  LOGGER.debug('Received PIECE from ' + Peer.getIdentifier(self));

                  self.numRequests--;
                  var index = message.payload.readInt32BE(0, true);
                  var begin = message.payload.readInt32BE(4, true);
                  var data = message.payload.slice(8);

                  var piece = self.pieces[index];
                  if (piece) {
                      piece.setData(data, begin);
                  } else {
                    LOGGER.info('chunk received for inactive piece');
                  }

                  if (self.requests[index] && self.requests[index][begin]) {
                    var requestTime = new Date() - self.requests[index][begin];
                    self.downloaded += data.length;
                    delete self.requests[index][begin];
                    self.requestsCount[index]--;
                    updateRates(self, 'down');
                    //LOGGER.debug('Downloading piece: ' + Peer.getIdentifier(self) + ', download rate = ' + (self.currentDownloadRate / 1024) + 'Kb/s');
                  }

                  if (piece && !piece.isComplete && self.requests[index]) {
                    if ((self.requestsCount[index] < 1) || (MAX_REQUESTS - self.numRequests > 5)) {
                      self.requestPiece(piece);
                    }
                  }

                  if (piece && piece.isComplete) {
                    self.emit(Peer.READY);
                  }

                  break;

                case Message.CANCEL:
                  LOGGER.debug('Ignoring CANCEL');
                  break;

                case Message.PORT:
                  LOGGER.debug('Ignoring PORT');
                  break;

                case Message.EXTENDED:
                  LOGGER.debug('Received EXTENDED from ' + Peer.getIdentifier(self));

                  var extendedCode = message.payload[0]
                    , data = message.payload.slice(1)
                    , payload = null
                    ;

                  if (extendedCode === 0) {
                    payload = bencode.decode(data.toString('binary'));
                    // handshake
                    // TODO: don't merge, peer should only hold extension info about itself
                    Object.keys(payload.m).forEach(function(key) {
                      self.extensions[key] = payload.m[key];
                    });
                    // TODO: store details differently
                    if (payload.m['ut_metadata']) {
                      self.hasMetadata = true;
                      self.metadataSize = +payload['metadata_size'];
                    }
                    LOGGER.debug('Peer [%s] supports extensions %j', self.getIdentifier(), payload);
                  } else {
                    LOGGER.debug('Peer [%s] received extended code %d', self.getIdentifier(), extendedCode);
                    self.emit(Peer.EXTENDED, self, extendedCode, data);
                  }
                  break;

                default:
                  LOGGER.warn('Peer [' + self.getIdentifier() + '] received unknown message, disconnecting. ');
                  self.disconnect('Unknown message received.');
                  // stop processing
                  done();
                  return;
              }
          }
          else {
            // not enough data, stop processing until more data arrives
            offset -= 4;
            done();
            return;
          }
      }
      else {
        // not enough data to read the message length, stop processing until more data arrives
        done();
        if (!self.running) {
          self.running = true;
          ProcessUtils.nextTick(function(){nextMessage(self)});
        }
        return;
      }
    } while (true);
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

  // take the last recorded rate
//  var rate = (rates.length > 0) ? rates[rates.length-1].value : 0

  // calculate weighted average rate
  //var decayFactor = 0.13863;
  var rateSum = 0, weightSum = 0;
  for (var idx=0; idx<rates.length; idx++) {
    //var age = rates[idx].ts-rates[0].ts;
    var weight = 1; //Math.exp(-decayFactor*age/1000);
    rateSum += rates[idx].value * weight;
    weightSum += weight;
  }
  var rate = (rates.length>0) ? (rateSum/weightSum) : 0;

  if (rate > 0) {
    LOGGER.info('Peer [' + self.getIdentifier() + '] ' + kind + 'loading at ' + rate);
  }

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
      var rate = (bytes-history.shift().value)/(now-start)*1000;
      rates.push({ts: now, value: rate});
      // throw out any rates that are too old to be of interest
      while((rates.length>1) && (now-rates[0].ts>3*1000)) {
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
Peer.EXTENDED = 'extended';

Peer.getIdentifier = function(peer) {
  return (peer.address || peer.ip) + ':' + peer.port;
}

module.exports = Peer;
