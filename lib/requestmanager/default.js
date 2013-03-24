var BitField = require('../util/bitfield')
  , Peer = require('../peer')
  , Piece = require('../piece')
  ;

var LOGGER = require('log4js').getLogger('requestmanager/default.js');

function DefaultRequestManager(bitfield, pieces) {
  this._bitfield = bitfield;
  this._pieces = pieces;
  this._activePeers = {};
  this._activePieces = new BitField(pieces.length);
  pieces.forEach(function(piece) {
    piece.on(Piece.COMPLETE, this._pieceComplete.bind(this, piece));
  });
}

DefaultRequestManager.prototype.peerDisconnected = function(peer) {
  LOGGER.debug('peerDisconnected: ' + peer.getIdentifier());

  // TODO: review...

  var activePieces = this._activePieces;

  peer.pieces.forEach(function(pieceIndex) {
    activePieces.unset(pieceIndex);
  });
  peer.pieces = {};
};

DefaultRequestManager.prototype.peerReady = function(peer) {
  LOGGER.debug('peerReady: ' + peer.getIdentifier());

  var activePieces = this._activePieces.setIndices()
    , nextPiece = null
    ;

  // find an active piece for the peer
  activePieces.some(function(piece) {
    if (!piece.hasRequestedAllChunks()) {
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
    LOGGER.debug('peer [%s] ready, requesting piece %d', peer.getIdentifier(), piece.index);
    peer.requestPiece(piece);
  } else if (peer.numRequests === 0) {
    LOGGER.debug('No available pieces for peer %s', peer.getIdentifier());
    peer.setAmInterested(false);
  }
};

DefaultRequestManager.prototype._pieceComplete = function(piece) {
  LOGGER.debug('_pieceComplete: ' + piece.index);
  // TODO: currently done in torrent, review.
  // this._bitfield.set(piece.index);
};

module.exports = exports = DefaultRequestManager;
