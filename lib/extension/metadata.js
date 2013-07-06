
var bencode = require('../util/bencode')
  , BitField = require('../util/bitfield')
  , Message = require('../message')
  , Metadata = require('../metadata')
  , Peer = require('../peer')
  , Torrent = require('../torrent')
  ;

var LOGGER = require('log4js').getLogger('extension/metadata.js');

var EXTENSION_KEY = 'ut_metadata';

var MessageCode = {
  REQUEST: 0,
  DATA: 1,
  REJECT: 2
};

function MetadataExtension(torrent) {
  this._metadata = new Metadata(torrent.infoHash);
  this._torrent = torrent;
  this._activePeers = {};
  this._activePieces = null;
  this._peers = [];

  this.__addPeer_event = this._addPeer.bind(this);
  torrent.on(Torrent.PEER, this.__addPeer_event);
}

MetadataExtension.prototype.handleMessage = function(peer, payload) {

  LOGGER.debug('Peer [%s] notified of metadata message.', peer.getIdentifier());

  var decodedPayload = bencode.decode(payload.toString('binary'), true),
      messageDetail = decodedPayload[0],
      messageType = messageDetail['msg_type'],
      activePieces = this._activePieces,
      requestedPieces = this._activePeers[peer.getIdentifier()];

  switch (messageType) {
    case MessageCode.REQUEST:
      LOGGER.debug('Peer [%s] ignoring REQUEST message.', peer.getIdentifier());
      break;

    case MessageCode.DATA:
      LOGGER.debug('Peer [%s] recieved DATA message.', peer.getIdentifier());

      if (this._metadata.isComplete()) {
        LOGGER.debug('Metadata already complete, ignoring data.');
        return;
      }

      var piece = messageDetail['piece'];
      this._cleanupPieceRequest(peer, piece);
      this._activePieces.set(piece);
      this._metadata.setPiece(piece, payload.slice(decodedPayload[1]));

      if (this._metadata.isComplete()) {
        this._torrent.setMetadata(this._metadata);
        this._torrent.removeListener(Torrent.PEER, this.__addPeer_event);
        var peer;
        while (peer = this._peers.shift()) {
          peer.removeListener(Peer.DISCONNECT, this.__peerDisconnect_event);
          peer.removeListener(Peer.READY, this.__peerReady_event);
        }
      }
      break;

    case MessageCode.REJECT:
      LOGGER.debug('Peer [%s] recieved REJECT message.', peer.getIdentifier());
      var piece = messageDetail['piece'];
      this._cleanupPieceRequest(peer, piece);
      activePieces.unset(piece);
      break;

    default:
      LOGGER.warn('Peer [%s] sent unknown metadata message.  messageType = %j', 
        peer.getIdentifier(), messageType);
  }
};

MetadataExtension.prototype._addPeer = function(peer) {
  LOGGER.debug('addPeer, hasMetadata: %j, supportsExtension: %j', this._torrent.hasMetadata(),
    peer.supportsExtension(EXTENSION_KEY));
  if (!this._torrent.hasMetadata()) {
    if (peer.supportsExtension(EXTENSION_KEY)) {
      this._peers.push(peer);
      this.__peerDisconnect_event = this._peerDisconnect.bind(this);
      this.__peerReady_event = this._peerReady.bind(this);
      peer.on(Peer.DISCONNECT, this.__peerDisconnect_event);
      peer.on(Peer.READY, this.__peerReady_event);
      if (peer.isReady()) {
        this._peerReady(peer);
      }
    } else {
      var self = this;
      peer.once(Peer.EXTENSIONS_UPDATED, function() {
        self._addPeer(peer);
      });
    }
  }
};

MetadataExtension.prototype._cleanupPieceRequest = function(peer, piece) {
  var requestedPieces = this._activePeers[peer.getIdentifier()];
  var pieceIndex = requestedPieces.indexOf(piece);
  if (pieceIndex > -1) {
    requestedPieces = requestedPieces.slice(0, pieceIndex).concat(requestedPieces.slice(pieceIndex + 1));
    this._activePeers[peer.getIdentifier()] = requestedPieces;
  }
};

MetadataExtension.prototype._peerDisconnect = function(peer) {

  // TODO: not cleaning up peer from _peers

  var requestedPieces = this._activePeers[peer.getIdentifier()],
      activePieces = this._activePieces;

  if (requestedPieces) {
    requestedPieces.forEach(function(index) {
      activePieces.unset(index);
    });
  }
  peer.removeListener(Peer.DISCONNECT, this.__peerDisconnect_event);
  peer.removeListener(Peer.READY, this.__peerReady_event);
};

MetadataExtension.prototype._peerReady = function(peer) {

  LOGGER.debug('Peer [%s] ready.  metadata complete: %j ', peer.getIdentifier(), 
    this._metadata.isComplete());

  if (!this._metadata.isComplete()) {

    var metadata = this._metadata,
        activePeers = this._activePeers,
        activePieces = this._activePieces,
        availableBlocks = activePieces && activePieces.unsetIndices(),
        pieceToRequest = -1;

    if (!metadata.hasLength()) {
      metadata.setLength(peer._extensionData['metadata_size']);
      this._activePieces = activePieces = new BitField(metadata.bitfield.length);
      availableBlocks = activePieces.unsetIndices();
    }

    pieceToRequest = availableBlocks[Math.round(Math.random() * (availableBlocks.length - 1))];

    LOGGER.debug('Peer [%s] requesting piece %j', peer.getIdentifier(), pieceToRequest);

    if (!activePeers[peer.getIdentifier()]) {
      activePeers[peer.getIdentifier()] = [];
    }
    activePeers[peer.getIdentifier()].push(pieceToRequest);
    
    peer.sendExtendedMessage(EXTENSION_KEY, {
      msg_type: MessageCode.REQUEST,
      piece: pieceToRequest
    });
  }
};

MetadataExtension.EXTENSION_KEY = EXTENSION_KEY;

module.exports = exports = MetadataExtension;
