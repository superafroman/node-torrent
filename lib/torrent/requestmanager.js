var BitField = require('../util/bitfield')
  , Peer = require('../peer')
  , Piece = require('../piece')
  , Torrent = null
  ;

var LOGGER = require('log4js').getLogger('torrent/requestmanager.js');

function RequestManager(torrent) {
  this._activePeers = {};
  this._activePieces = null;
  this._bitfield = null;
  this._peers = [];
  this._pieces = null;
  this._torrent = torrent;

  // lazily require Torrent so it's initialised.. shouldn't really need to do this.
  // TODO: think of another way...
  Torrent = require('./torrent');

  torrent.once(Torrent.READY, this._torrentReady.bind(this));

  this.__addPeer_event = this._addPeer.bind(this);
  torrent.on(Torrent.PEER, this.__addPeer_event);
}

RequestManager.prototype._addPeer = function(peer) {
  LOGGER.debug('adding peer %s', peer.getIdentifier());
  this._peers.push(peer);
  this.__peerDisconnect_event = this._peerDisconnect.bind(this);
  this.__peerReady_event = this._peerReady.bind(this);
  peer.on(Peer.DISCONNECT, this.__peerDisconnect_event);
  peer.on(Peer.READY, this.__peerReady_event);
};

RequestManager.prototype._peerDisconnect = function(peer) {
  LOGGER.debug('_peerDisconnect: ' + peer.getIdentifier());

  // TODO: review...

  var activePieces = this._activePieces;

  Object.keys(peer.pieces).forEach(function(key) {
    activePieces.unset(peer.pieces[key]);
  });
  peer.pieces = {};
  peer.removeListener(Peer.DISCONNECT, this.__peerDisconnect_event);
  peer.removeListener(Peer.READY, this.__peerReady_event);
};

RequestManager.prototype._peerReady = function(peer) {
  LOGGER.debug('_peerReady: ' + peer.getIdentifier());

  if (!this._torrent.hasMetadata()) {
    LOGGER.debug('Peer [%s] has no metadata, ignoring for now.', peer.getIdentifier());
    return;
  }
  if (!this._bitfield) {
    LOGGER.debug('RequestManager not initialised, ignoring peer for now.');
    return;
  }

  var activePieces = this._activePieces.setIndices()
    , nextPiece = null
    , requestManager = this
    ;

  // find an active piece for the peer
  activePieces.some(function(pieceIndex) {
    var piece = requestManager._pieces[pieceIndex];
    if (!piece.hasRequestedAllChunks() && peer.bitfield.isSet(piece.index)) {
      nextPiece = piece;
      return piece;
    }
  });

  if (!nextPiece) {
    // if no active piece found, pick a new piece and activate it

    // available = peerhas ^ (peerhas & (active | completed))
    var available = peer.bitfield.xor(
      peer.bitfield.and(this._activePieces.or(this._bitfield)));

    // pick a random piece out of the available ones
    var set = available.setIndices();
    var index = set[Math.round(Math.random() * (set.length - 1))];
    if (index !== undefined) {
      nextPiece = this._pieces[index];
      this._activePieces.set(index);
    }
  }
  if (nextPiece) {
    LOGGER.debug('Peer [%s] ready, requesting piece %d', peer.getIdentifier(), nextPiece.index);
    peer.requestPiece(nextPiece);
  } else if (peer.numRequests === 0) {
    LOGGER.debug('No available pieces for peer %s', peer.getIdentifier());
    peer.setAmInterested(false);
  }
};

RequestManager.prototype._pieceComplete = function(piece) {
  LOGGER.debug('pieceComplete: ' + piece.index);
  this._bitfield.set(piece.index);
};

RequestManager.prototype._torrentReady = function() {
  var torrent = this._torrent;
  LOGGER.debug('_torrentReady');
  this._bitfield = torrent.bitfield;
  this._activePieces = new BitField(this._bitfield.length);
  this._pieces = torrent._pieces;

  var requestManager = this;
  this._pieces.forEach(function(piece) {
    piece.once(Piece.COMPLETE, requestManager._pieceComplete.bind(requestManager, piece));
  });

  this._peers.forEach(function(peer) {
    if (peer.isReady()) {
      requestManager._peerReady(peer);
    }
  });
};

module.exports = exports = RequestManager;
