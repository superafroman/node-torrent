
var bencode = require('../util/bencode'),
    util = require('util');

var BitField = require('../util/bitfield'),
    DHT = require('../dht'),
    RequestManager = require('./requestmanager'),
    EventEmitter = require('events').EventEmitter,
    Message = require('../message'),
    Metadata = require('../metadata'),
    Peer = require('../peer'),
    Piece = require('../piece'),
    ProcessUtils = require('../util/processutils'),
    TorrentData = require('../torrentdata'),
    Tracker = require('../tracker'),
    createFiles = require('./createfiles'),
    createPieces = require('./createpieces')
    ;

var LOGGER = require('log4js').getLogger('torrent.js');

function Torrent(clientId, clientPort, downloadPath, dataUrl, extensions, persistData) {
  EventEmitter.call(this);

  this.clientId = clientId;
  this.clientPort = clientPort;

  this.infoHash = null;
  this.name = null;
  
  this.stats = {
    downloaded: 0,
    downloadRate: 0,
    uploaded: 0,
    uploadRate: 0
  };

  this.peers = {};
  this.trackers = [];
  this.bitfield = null;
  this.status = null;

  this._setStatus(Torrent.LOADING);
  this._metadata = null;
  this._requestManager = new RequestManager(this);
  this._files = [];
  this._pieces = [];
  this._extensions = extensions;
  this._extensionMap = null;

  var torrent = this;

  // load torrent data
  if (persistData) {
    LOGGER.debug('Loading persisted torrent data');
    
    this._downloadPath = persistData.downloadPath;
    this._metadata = Metadata.fromPersistData(persistData.metadata);

    Tracker.createTrackers(null, persistData.trackers).forEach(function(tracker) {
      torrent.addTracker(tracker);
    });
    torrent._initialise(persistData.bitfield, persistData.pieces);
  } else {
    this._downloadPath = downloadPath;

    TorrentData.load(dataUrl, function(error, metadata, trackers) {
      if (error) {
        LOGGER.warn('Error loading torrent data. error = %j', error);
        torrent._setStatus(Torrent.ERROR, error);
      } else {
        LOGGER.debug('Torrent data loaded.');
        torrent._metadata = metadata;
        trackers.forEach(function(tracker) {
          torrent.addTracker(tracker);
        });
        torrent._initialise();
      }
    });
  }
}
util.inherits(Torrent, EventEmitter);

Torrent.prototype.start = function() {
  LOGGER.debug('Starting torrent.');
  var callback = this.addPeer.bind(this);
  // TODO: treat as tracker
  DHT.advertise(this.infoHash, callback);

  this.trackers.forEach(function(tracker) {
    tracker.start(callback);
  });
};
    
Torrent.prototype.stop = function() {
  if (this.status === Torrent.READY) {
    for (var i = 0; i < this.trackers.length; i++) {
      this.trackers[i].stop();
    }
    for (var id in this.peers) {
      var peer = this.peers[id];
      peer.disconnect('Torrent stopped.');
    }
  }
};

Torrent.prototype.addPeer = function(/* peer | id, address, port */) {
  
  var peer = null,
      torrent = this;

  if (arguments.length === 1) {
    peer = arguments[0];
  } else {
    var id = arguments[0],
        address = arguments[1],
        port = arguments[2];
    
    peer = new Peer(id, address, port, this);
  }
  
  LOGGER.debug('Adding peer, id = ' + peer.getIdentifier());

  if (!(peer.getIdentifier() in this.peers)) {
    this.peers[peer.getIdentifier()] = peer;

    function onConnect() {
      LOGGER.debug('CONNECT from %s', peer.getIdentifier());
      if (peer.supportsExtension()) {
        LOGGER.debug('Sending extended handshake.  extension map = %j', torrent._extensionMap);
        peer.sendExtendedMessage(Message.EXTENDED_HANDSHAKE, {
          m: torrent._extensionMap,
          port: torrent.clientPort
        });
      }
      if (torrent.bitfield) {
        peer.sendMessage(new Message(Message.BITFIELD, torrent.bitfield.toBuffer()));
      }
    }
    peer.on(Peer.RATE_UPDATE, function(rate) {
      if (rate.type === 'upload') {
        torrent.stats.uploadRate -= rate.previous;
        torrent.stats.uploadRate += rate.current;
      } else {
        torrent.stats.downloadRate -= rate.previous;
        torrent.stats.downloadRate += rate.current;
      }
    });
    peer.once(Peer.DISCONNECT, function() {
      LOGGER.debug('DISCONNECT from %s', peer.getIdentifier());
      peer.removeAllListeners(Peer.CONNECT);
      peer.removeAllListeners(Peer.DISCONNECT);
      peer.removeAllListeners(Peer.EXTENDED);
      peer.removeAllListeners(Peer.UPDATED);
      delete torrent.peers[peer.getIdentifier()];
    });
    peer.on(Peer.EXTENDED, function(peer, code, message) {
      LOGGER.debug('EXTENDED from %s, code = %d', peer.getIdentifier(), code);
      var extensionKey;
      Object.keys(torrent._extensionMap).some(function(key) {
        if (torrent._extensionMap[key] === code) {
          extensionKey = key;
          return true;
        }
      });
      if (torrent._extensionMap[extensionKey]) {
        torrent._extensions[torrent._extensionMap[extensionKey] - 1].handleMessage(peer, message);
      }
    });
    peer.on(Peer.UPDATED, function() {
      var interested = !torrent.bitfield || (peer.bitfield.xor(peer.bitfield.and(torrent.bitfield)).setIndices().length > 0);
      LOGGER.debug('UPDATED: ' + (interested ? 'interested' : 'not interested') + ' in ' + peer.getIdentifier());
      peer.setAmInterested(interested);
    });
    this.emit(Torrent.PEER, peer);

    if (peer.connected) {
      onConnect()
    } else {
      peer.once(Peer.CONNECT, onConnect);
    }
  }
};

Torrent.prototype.addTracker = function(tracker) {
  this.trackers.push(tracker);
  tracker.setTorrent(this);
  // tracker.on(Tracker.PEER, this.addPeer.bind(this));
};

Torrent.prototype.hasMetadata = function() {
  return this._metadata.isComplete();
};

Torrent.prototype.isComplete = function() {
  return this.bitfield.cardinality() === this.bitfield.length;
};

Torrent.prototype.setMetadata = function(metadata) {
  this._metadata = metadata;
  this._initialise();
};

Torrent.prototype._initialise = function(persistBitfield, persistPieces) {

  LOGGER.debug('Initialising torrent.');
  if (this.status === Torrent.READY) {
    LOGGER.debug('Already initialised, skipping.');
    return;
  }

  var torrent = this;

  this.name = this._metadata.name;

  if (!this._extensionMap) {
    this._extensionMap = {};
    for (var i = 0; i < this._extensions.length; i++) {
      var ExtensionClass = this._extensions[i]
        , extension = new ExtensionClass(this)
        , extensionCode = i + 1
        ;
      this._extensions[i] = extension;
      this._extensionMap[ExtensionClass.EXTENSION_KEY] = extensionCode;
    }
  }

  if (!this.infoHash) {
    this.infoHash = this._metadata.infoHash; 
    ProcessUtils.nextTick(function() {
      torrent.emit(Torrent.INFO_HASH, torrent.infoHash);
    });
  }

  if (this.hasMetadata()) {
    LOGGER.debug('Metadata is complete, initialising files and pieces.');
    
    createFiles(this._downloadPath, this._metadata, function(error, _files, _size) {
      if (error) {
        torrent._setStatus(Torrent.ERROR, error);
      } else {         
        torrent.files = _files;
        torrent.size = _size;

        createPieces(torrent._metadata.pieces, _files, torrent._metadata['piece length'],
            _size, persistPieces, function(error, _pieces) {
          if (error) {
            torrent._setStatus(Torrent.ERROR, error);
          } else {
            torrent._pieces = _pieces;

            if (persistBitfield) {
              torrent.bitfield = new BitField(persistBitfield.buffer, persistBitfield.length);
            } else {
              torrent.bitfield = new BitField(_pieces.length);
            }

            var completeHandler = torrent._pieceComplete.bind(torrent);
            _pieces.forEach(function(piece) {
              if (piece.isComplete()) {
                torrent.bitfield.set(piece.index);
              } else {
                piece.once(Piece.COMPLETE, completeHandler);
              }
            });
            ProcessUtils.nextTick(function() {
              torrent._setStatus(Torrent.READY);
            });
          }
        });
      }
    });
  }
};

Torrent.prototype._pieceComplete = function(piece) {
  LOGGER.debug('Piece complete, piece index = ' + piece.index);
  this.stats.downloaded += piece.length;

  this.emit(Torrent.PROGRESS, this.stats.downloaded / this.size);

  if (this.isComplete()) {
    LOGGER.info('torrent download complete');
    this._setStatus(Torrent.COMPLETE);
  }

  var have = new Message(Message.HAVE, BufferUtils.fromInt(piece.index));
  for (var i in this.peers) {
    var peer = this.peers[i];
    if (peer.initialised) {
      peer.sendMessage(have);
    }
  }
};

Torrent.prototype._setStatus = function(status, data) {
  LOGGER.debug('Status updated to %s', status);
  this.emit(status, data);
  this.status = status;
  if (status === Torrent.ERROR) {
    this.stop();
  }
};

Torrent.prototype.getPersistData = function() {
  if (!this._metadata || this.trackers.length === 0) {
    throw new Error('Cannot persist torrent without metadata or trackers');
  }

  return {
    downloadPath: this._downloadPath,
    metadata: this._metadata.getPersistData() : null,
    trackers: this.trackers.map(function(tracker) {
      return tracker.getPersistData();
    },
    bitfield: this.bitfield ? { buffer: this.bitfield.toBuffer(), length: this.bitfield.length } : null,
    pieces: this.pieces.map(function(piece) {
      return piece.getPersistData();
    })
  };
};

Torrent.fromPersistData = function(clientId, clientPort, extensions, data) {
  return new Torrent(clientId, clientPort, null, null, extensions, data);
};

Torrent.COMPLETE = 'torrent:complete';
Torrent.ERROR = 'torrent:error';
Torrent.INFO_HASH = 'torrent:info_hash';
Torrent.LOADING = 'torrent:loading';
Torrent.PEER = 'torrent:peer';
Torrent.PROGRESS = 'torrent:progress';
Torrent.READY = 'torrent:ready';

module.exports = exports = Torrent;
