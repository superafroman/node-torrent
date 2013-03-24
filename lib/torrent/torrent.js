
var bencode = require('../util/bencode'),
    util = require('util');

var DHT = require('../dht'),
    DefaultRequestManager = require('../requestmanager/default'),
    EventEmitter = require('events').EventEmitter,
    Message = require('../message'),
    Metadata = require('../metadata'),
    MetadataRequestManager = require('../requestmanager/metadata'),
    Peer = require('../peer'),
    Piece = require('../piece'),
    ProcessUtils = require('../util/processutils'),
    TorrentData = require('../torrentdata'),
    Tracker = require('../tracker'),
    createFiles = require('./createfiles'),
    createPieces = require('./createpieces')
    ;

var LOGGER = require('log4js').getLogger('torrent.js');

function Torrent(clientId, clientPort, downloadPath, dataUrl) {
  EventEmitter.call(this);

  this.clientId = clientId;
  this.clientPort = clientPort;

  this.infoHash = null;
  this.name = null;
  
  this.stats = {
    downloaded: 0,
    uploaded: 0
  };

  this.peers = {};
  this.trackers = [];
  this.bitfield = null;

  this._setStatus(Torrent.LOADING);
  this._metadata = null;
  this._requestManager = null;
  this._files = [];
  this._pieces = [];
  this._downloadPath = downloadPath;

  var torrent = this;
  TorrentData.load(dataUrl, function(error, metadata, trackers) {
    if (error) {
      LOGGER.warn('Error loading torrent data. error = %j', error);
      torrent._setStatus(Torrent.ERROR, error);
    } else {
      LOGGER.debug('Torrent data loaded.'); 
      torrent.infoHash = metadata.infoHash;
      torrent._metadata = metadata;
      trackers.forEach(function(tracker) {
        torrent.addTracker(tracker);
      });
      torrent._initialise();
    }
  });
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
    peer.once(Peer.CONNECT, function() {
      LOGGER.debug('CONNECT to ' + peer.getIdentifier());
      if (peer.supportsExtension) {
        // TODO: delegate to extension manager or..?
        peer.sendExtendedMessage(Message.EXTENDED_HANDSHAKE, {
          m: {
            'ut_metadata': 1
          },
          port: torrent.clientPort
        });
      }
      if (torrent.bitfield) {
        peer.sendMessage(new Message(Message.BITFIELD, torrent.bitfield.toBuffer()));
      }
    });
    peer.once(Peer.DISCONNECT, function() {
      LOGGER.debug('DISCONNECT from ' + peer.getIdentifier());
      torrent._requestManager.peerDisconnected(peer);
      peer.removeAllListeners(Peer.CHOKED);
      peer.removeAllListeners(Peer.CONNECT);
      peer.removeAllListeners(Peer.DISCONNECT);
      peer.removeAllListeners(Peer.READY);
      peer.removeAllListeners(Peer.UPDATED);
      delete torrent.peers[peer.getIdentifier()];
    });
    peer.on(Peer.READY, function() {
      LOGGER.debug('READY from ' + peer.getIdentifier());
      torrent._requestManager.peerReady(peer);
    });
    peer.on(Peer.UPDATED, function() {
      var interested = !torrent.bitfield || (peer.bitfield.xor(peer.bitfield.and(torrent.bitfield)).setIndices().length > 0);
      LOGGER.debug('UPDATED: ' + (interested ? 'interested' : 'not interested') + ' in ' + peer.getIdentifier());
      peer.setAmInterested(interested);
    });
  }
};

Torrent.prototype.addTracker = function(tracker) {
  this.trackers.push(tracker);
  tracker.setTorrent(this);
  // tracker.on(Tracker.PEER, this.addPeer.bind(this));
};

Torrent.prototype.isComplete = function() {
  return this.bitfield.cardinality() === this.bitfield.length;
};

Torrent.prototype._initialise = function() {

  this.name = this._metadata.name;
  this.infoHash = this._metadata.infoHash;
  
  if (this._metadata.isComplete()) {
    LOGGER.debug('Metadata is complete, starting download.');
    
    var torrent = this;
    createFiles(this._downloadPath, this._metadata, function(error, _files, _size) {
      if (error) {
        torrent._setStatus(Torrent.ERROR, error);
      } else {         
        torrent.files = _files;
        torrent.size = _size;

        createPieces(torrent._metadata.pieces, _files, torrent._metadata['piece length'],
            _size, function(error, _pieces) {
          if (error) {
            torrent._setStatus(Torrent.ERROR, error);
          } else {
            torrent._pieces = _pieces;
            torrent.bitfield = new BitField(_pieces.length);
            var completeHandler = torrent._pieceComplete.bind(torrent);
            _pieces.forEach(function(piece) {
              if (piece.isComplete) {
                torrent.bitfield.set(piece.index);
              } else {
                piece.once(Piece.COMPLETE, completeHandler);
              }
            });
            torrent._requestManager = new DefaultRequestManager(torrent.bitfield, _pieces);
          }
        });
      }
    });
  } else {
    this._requestManager = new MetadataRequestManager(this._metadata);
    this._metadata.once(Metadata.COMPLETE, function() {
      torrent._initialise();
    });
  }
  var torrent = this;
  ProcessUtils.nextTick(function() {
    torrent.emit(Torrent.READY);
  });
};

Torrent.prototype._pieceComplete = function(piece) {
  
  LOGGER.debug('Piece complete, piece index = ' + piece.index);

  this.bitfield.set(piece.index);
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
  this._requestManager.pieceComplete(piece);
};

Torrent.prototype._setStatus = function(status, data) {
  this.emit(status, data);
  this.status = status;
  if (status === Torrent.ERROR) {
    this.stop();
  }
};

Torrent.COMPLETE = 'torrent:complete';
Torrent.ERROR = 'torrent:error';
Torrent.LOADING = 'torrent:loading';
Torrent.PROGRESS = 'torrent:progress';
Torrent.READY = 'torrent:ready';

module.exports = exports = Torrent;
